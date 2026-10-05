"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertProductWorkspace, requireWorkspace } from "@/lib/context";
import { guardCreateProduct, guardManageDodCriteria } from "@/lib/scrum-guards";
import {
  MAX_DEVELOPERS_PER_TEAM,
  TEAM_LIMIT_MESSAGE,
  getProductLeadership,
  normalizeDeveloperEntry,
  validateDevelopersList,
  validateSingleDeveloper,
  type ProductLeadership,
} from "@/lib/scrum-rules";

export type ProductsActionState = { message?: string; error?: string } | undefined;

/**
 * Schéma de création Produit (multi-tenant).
 * - name : nom du produit.
 * - description : stockée comme ProductGoal initial.
 * - teamName : équipe initiale (Team fille du Product).
 * - productOwnerEmail / scrumMasterEmail : gouvernance PROPRE au produit,
 *   saisie obligatoire à la création (par département). Les équipes héritent
 *   de ce binôme, de manière non modifiable.
 */
const CreateProductSchema = z.object({
  name: z.string().trim().min(3, "Nom de produit : 3 caractères minimum.").max(200),
  description: z.string().trim().max(2000).optional(),
  teamName: z.string().trim().min(2, "Nom d'équipe : 2 caractères minimum.").max(200),
  productOwnerEmail: z.string().trim().toLowerCase().email("Email du Product Owner invalide.").max(200),
  scrumMasterEmail: z.string().trim().toLowerCase().email("Email du Scrum Master invalide.").max(200),
});

/** Extrait la liste des développeurs depuis le FormData (multi-formats). */
function parseDevelopersFromFormData(formData: FormData): string[] {
  const collected: string[] = [];
  const jsonRaw = formData.get("developersJson");
  if (typeof jsonRaw === "string" && jsonRaw.trim().length > 0) {
    try {
      const parsed: unknown = JSON.parse(jsonRaw);
      if (Array.isArray(parsed)) {
        for (const entry of parsed) {
          if (typeof entry === "string") collected.push(entry);
        }
      }
    } catch {
      // JSON invalide : on retombe sur les autres champs ci-dessous.
    }
  }
  for (const value of formData.getAll("developers")) {
    if (typeof value === "string") collected.push(value);
  }
  const freeText = formData.get("developers");
  if (typeof freeText === "string" && !formData.get("developersJson")) {
    for (const part of freeText.split(/[\n,;]+/)) collected.push(part);
  }
  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const raw of collected) {
    const entry = normalizeDeveloperEntry(String(raw));
    if (!entry) continue;
    const key = entry.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(entry);
  }
  return normalized;
}

async function canManageProductTeams(
  userId: string,
  workspaceId: string,
  product: { id: string; productOwnerId: string; workspaceId: string },
): Promise<boolean> {
  if (product.workspaceId !== workspaceId) return false;
  const [user, smMembership] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { globalRole: true },
    }),
    prisma.teamMembership.findFirst({
      where: { userId, role: "SCRUM_MASTER", team: { productId: product.id } },
      select: { id: true },
    }),
  ]);
  return (
    product.productOwnerId === userId ||
    user?.globalRole === "ADMIN" ||
    smMembership != null
  );
}

/**
 * Rattache la gouvernance du produit à une équipe (memberships) :
 * - créateur → PRODUCT_OWNER ;
 * - compte espace dont l'email = PO du produit → PRODUCT_OWNER ;
 * - compte espace dont l'email = SM du produit → SCRUM_MASTER.
 * Avec `includePack` (première équipe) : tous les DEVELOPER/STAKEHOLDER de
 * l'espace deviennent membres, et les emails dev pré-remplissent `members`.
 */
async function attachGovernance(
  teamId: string,
  workspaceId: string,
  ownerId: string,
  leadership: ProductLeadership,
  includePack: boolean,
): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: { workspaceId },
    select: { id: true, email: true, spaceRole: true },
  });
  const byEmail = new Map(users.map((u) => [u.email.toLowerCase(), u]));
  const memberships: { userId: string; role: string }[] = [
    { userId: ownerId, role: "PRODUCT_OWNER" },
  ];
  const poUser = byEmail.get(leadership.productOwnerEmail.toLowerCase());
  if (poUser && poUser.id !== ownerId) {
    memberships.push({ userId: poUser.id, role: "PRODUCT_OWNER" });
  }
  const smUser = byEmail.get(leadership.scrumMasterEmail.toLowerCase());
  if (smUser) memberships.push({ userId: smUser.id, role: "SCRUM_MASTER" });

  const devEmails: string[] = [];
  if (includePack) {
    for (const u of users) {
      if (u.spaceRole === "DEVELOPER") {
        memberships.push({ userId: u.id, role: "DEVELOPER" });
        if (devEmails.length < MAX_DEVELOPERS_PER_TEAM) devEmails.push(u.email);
      } else if (u.spaceRole === "STAKEHOLDER") {
        memberships.push({ userId: u.id, role: "STAKEHOLDER" });
      }
    }
  }
  for (const m of memberships) {
    await prisma.teamMembership.upsert({
      where: { userId_teamId: { userId: m.userId, teamId } },
      create: { userId: m.userId, teamId, role: m.role },
      update: { role: m.role },
    });
  }
  return devEmails;
}

export async function createProductWithTeam(
  _state: ProductsActionState,
  formData: FormData,
): Promise<ProductsActionState> {
  const { userId, workspaceId } = await requireWorkspace();
  // Création réservée à l'Admin/PO et au Scrum Master (Developer exclu).
  const allowed = await guardCreateProduct(userId);
  if (!allowed.ok) return { error: allowed.message };
  const parsed = CreateProductSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    // La maquette demande "teamId" : on accepte `teamId` (nom libre) et `teamName`.
    teamName: formData.get("teamName") ?? formData.get("teamId") ?? "",
    productOwnerEmail: formData.get("productOwnerEmail"),
    scrumMasterEmail: formData.get("scrumMasterEmail"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const leadership: ProductLeadership = {
    productOwnerEmail: parsed.data.productOwnerEmail,
    scrumMasterEmail: parsed.data.scrumMasterEmail,
  };
  const product = await prisma.product.create({
    data: {
      name: parsed.data.name,
      productOwnerId: userId,
      productOwnerEmail: leadership.productOwnerEmail,
      scrumMasterEmail: leadership.scrumMasterEmail,
      workspaceId,
    },
  });
  const team = await prisma.team.create({
    data: { name: parsed.data.teamName, productId: product.id, members: [], workspaceId },
  });
  // Équipe de base de l'espace rattachée avec les bons rôles ; les emails
  // des développeurs pré-remplissent la composition exclusive DEVELOPER.
  const devEmails = await attachGovernance(team.id, workspaceId, userId, leadership, true);
  if (devEmails.length > 0) {
    await prisma.team.update({ where: { id: team.id }, data: { members: devEmails } });
  }
  // Description → ProductGoal initial.
  const description = parsed.data.description?.trim();
  if (description) {
    await prisma.productGoal.create({
      data: { productId: product.id, description },
    });
  }
  revalidatePath("/products");
  revalidatePath("/backlog");
  revalidatePath("/planning");
  return { message: `Produit « ${parsed.data.name} » créé avec l'équipe « ${team.name} » (PO ${leadership.productOwnerEmail} · SM ${leadership.scrumMasterEmail}).` };
}

/**
 * Déclare une NOUVELLE équipe sur un produit existant (multi-équipes).
 * Héritage : PO/SM du produit, non modifiables. Seuls des Développeurs
 * (rôle exclusif) sont stockés dans `Team.members` : max 8 → total 10 (Scrum Guide).
 */
export async function addTeamToProduct(
  productId: string,
  _state: ProductsActionState,
  formData: FormData,
): Promise<ProductsActionState> {
  const { userId, workspaceId } = await requireWorkspace();
  await assertProductWorkspace(productId, workspaceId);
  const name = String(formData.get("name") ?? formData.get("teamName") ?? "").trim();
  if (name.length < 2) return { error: "Nom d'équipe : 2 caractères minimum." };
  if (name.length > 200) return { error: "Nom d'équipe : 200 caractères maximum." };

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      name: true,
      productOwnerId: true,
      workspaceId: true,
      productOwnerEmail: true,
      scrumMasterEmail: true,
      teams: { select: { name: true } },
    },
  });
  if (!product || product.workspaceId !== workspaceId) {
    return { error: "Produit introuvable dans votre espace." };
  }
  const developers = parseDevelopersFromFormData(formData);
  const leadership = getProductLeadership(product);
  const listGuard = validateDevelopersList(developers, leadership);
  if (!listGuard.ok) return { error: listGuard.message };

  const allowed = await canManageProductTeams(userId, workspaceId, product);
  if (!allowed) {
    return { error: "Déclaration d'équipe réservée au Product Owner, à l'Admin ou au Scrum Master du produit." };
  }
  const duplicate = product.teams.some(
    (t) => t.name.trim().toLowerCase() === name.toLowerCase(),
  );
  if (duplicate) return { error: `L'équipe « ${name} » est déjà déclarée sur ce produit.` };
  const team = await prisma.team.create({
    data: { name, productId: product.id, members: developers, workspaceId },
  });
  await attachGovernance(team.id, workspaceId, userId, leadership, false);
  revalidatePath("/products");
  revalidatePath("/planning");
  revalidatePath("/sprint");
  const total = 2 + developers.length;
  return { message: `Équipe « ${team.name} » déclarée sur « ${product.name} » : ${developers.length} développeur(s), ${total}/10 membres (PO + SM inclus).` };
}

/**
 * Ajoute UN développeur à une équipe existante (nom ou email).
 * Blocage strict : au-delà de 8 développeurs → message limite Scrum Guide.
 */
export async function addDeveloperToTeam(
  teamId: string,
  _state: ProductsActionState,
  formData: FormData,
): Promise<ProductsActionState> {
  const { userId, workspaceId } = await requireWorkspace();
  const raw = String(
    formData.get("developer") ?? formData.get("email") ?? formData.get("name") ?? "",
  );
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: {
      id: true,
      name: true,
      members: true,
      workspaceId: true,
      product: {
        select: {
          id: true,
          productOwnerId: true,
          workspaceId: true,
          productOwnerEmail: true,
          scrumMasterEmail: true,
        },
      },
    },
  });
  if (!team || team.workspaceId !== workspaceId) {
    return { error: "Équipe introuvable dans votre espace." };
  }
  const allowed = await canManageProductTeams(userId, workspaceId, team.product);
  if (!allowed) {
    return { error: "Ajout de développeur réservé au Product Owner, à l'Admin ou au Scrum Master du produit." };
  }
  const checked = validateSingleDeveloper(raw, team.members, getProductLeadership(team.product));
  if (!checked.ok) {
    if (checked.code === "TEAM_SIZE_LIMIT") return { error: TEAM_LIMIT_MESSAGE };
    return { error: checked.message };
  }
  await prisma.team.update({
    where: { id: teamId },
    data: { members: [...team.members, checked.normalized] },
  });
  revalidatePath("/products");
  revalidatePath("/planning");
  revalidatePath("/sprint");
  return { message: `« ${checked.normalized} » ajouté comme Développeur à l'équipe « ${team.name} ».` };
}

/**
 * Retire un développeur d'une équipe existante.
 * Le PO et le SM ne sont jamais retirables ici (hérités du produit).
 */
export async function removeDeveloperFromTeam(
  teamId: string,
  developer: string,
): Promise<void> {
  const { userId, workspaceId } = await requireWorkspace();
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: {
      id: true,
      members: true,
      workspaceId: true,
      product: { select: { id: true, productOwnerId: true, workspaceId: true } },
    },
  });
  if (!team || team.workspaceId !== workspaceId) {
    throw new Error("Équipe introuvable dans votre espace.");
  }
  const allowed = await canManageProductTeams(userId, workspaceId, team.product);
  if (!allowed) {
    throw new Error("Retrait réservé au Product Owner, à l'Admin ou au Scrum Master du produit.");
  }
  const target = developer.trim().toLowerCase();
  await prisma.team.update({
    where: { id: teamId },
    data: { members: team.members.filter((m) => m.trim().toLowerCase() !== target) },
  });
  revalidatePath("/products");
  revalidatePath("/planning");
  revalidatePath("/sprint");
}

/**
 * Suppression définitive d'un critère DoD global du produit.
 */
export async function deleteCriterion(productId: string, criterionId: string): Promise<void> {
  const { userId, workspaceId } = await requireWorkspace();
  await assertProductWorkspace(productId, workspaceId);
  const guard = await guardManageDodCriteria(userId, productId);
  if (!guard.ok) throw new Error(guard.message);
  const criterion = await prisma.doneCriterion.findUnique({ where: { id: criterionId } });
  if (!criterion || criterion.productId !== productId) throw new Error("Critère introuvable.");
  await prisma.doneCheck.deleteMany({ where: { criterionId } });
  await prisma.doneCriterion.delete({ where: { id: criterionId } });
  revalidatePath("/products");
  revalidatePath("/dod");
  revalidatePath("/sprint");
}
