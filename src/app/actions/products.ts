"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { currentUserId } from "@/lib/context";
import { guardCreateProduct, guardManageDodCriteria } from "@/lib/scrum-guards";

export type ProductsActionState = { message?: string; error?: string } | undefined;

/**
 * Schéma de création Produit.
 * - name : nom du produit (Product.name)
 * - description : pas de colonne dédiée dans le schéma Prisma validé → stockée
 *   comme ProductGoal initial (traçabilité produit).
 * - teamName : nom de l'équipe initiale (le champ "teamId" de la maquette
 *   correspond à l'équipe rattachée au produit ; à la création il n'existe pas
 *   encore, on crée donc la Team fille de Product).
 */
const CreateProductSchema = z.object({
  name: z.string().trim().min(3, "Nom de produit : 3 caractères minimum.").max(200),
  description: z.string().trim().max(2000).optional(),
  teamName: z.string().trim().min(2, "Nom d'équipe : 2 caractères minimum.").max(200),
});

export async function createProductWithTeam(
  _state: ProductsActionState,
  formData: FormData,
): Promise<ProductsActionState> {
  const userId = await currentUserId();
  // Création réservée à l'Admin/PO et au Scrum Master (Developer exclu).
  const allowed = await guardCreateProduct(userId);
  if (!allowed.ok) return { error: allowed.message };
  const parsed = CreateProductSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    // La maquette demande "teamId" : on accepte `teamId` (nom libre) et `teamName`.
    teamName: formData.get("teamName") ?? formData.get("teamId") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const product = await prisma.product.create({
    data: { name: parsed.data.name, productOwnerId: userId },
  });
  const team = await prisma.team.create({
    data: { name: parsed.data.teamName, productId: product.id },
  });
  await prisma.teamMembership.create({
    data: { userId, teamId: team.id, role: "PRODUCT_OWNER" },
  });
  // Description → ProductGoal initial (le modèle Product n'a pas de colonne description).
  const description = parsed.data.description?.trim();
  if (description) {
    await prisma.productGoal.create({
      data: { productId: product.id, description },
    });
  }
  revalidatePath("/products");
  revalidatePath("/backlog");
  revalidatePath("/planning");
  return { message: `Produit « ${parsed.data.name} » créé avec l'équipe « ${team.name} » (vous êtes Product Owner).` };
}

/**
 * Déclare une NOUVELLE équipe autorisée sur un produit existant (multi-équipes).
 * Champ texte libre : le produit accepte une liste d'équipes (Team.productId).
 * Accès : Product Owner du produit, Admin global, ou Scrum Master membre du produit.
 * Doublon de nom (insensible à la casse) refusé pour garder des tags lisibles.
 */
export async function addTeamToProduct(
  productId: string,
  _state: ProductsActionState,
  formData: FormData,
): Promise<ProductsActionState> {
  const userId = await currentUserId();
  const name = String(formData.get("name") ?? formData.get("teamName") ?? "").trim();
  if (name.length < 2) return { error: "Nom d'équipe : 2 caractères minimum." };
  if (name.length > 200) return { error: "Nom d'équipe : 200 caractères maximum." };
  const [product, user] = await Promise.all([
    prisma.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        name: true,
        productOwnerId: true,
        teams: { select: { name: true } },
      },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { globalRole: true },
    }),
  ]);
  if (!product) return { error: "Produit introuvable." };
  const smMembership = await prisma.teamMembership.findFirst({
    where: { userId, role: "SCRUM_MASTER", team: { productId } },
    select: { id: true },
  });
  const allowed =
    product.productOwnerId === userId ||
    user?.globalRole === "ADMIN" ||
    smMembership != null;
  if (!allowed) {
    return { error: "Déclaration d'équipe réservée au Product Owner, à l'Admin ou au Scrum Master du produit." };
  }
  const duplicate = product.teams.some(
    (t) => t.name.trim().toLowerCase() === name.toLowerCase(),
  );
  if (duplicate) return { error: `L'équipe « ${name} » est déjà déclarée sur ce produit.` };
  const team = await prisma.team.create({
    data: { name, productId: product.id },
  });
  revalidatePath("/products");
  revalidatePath("/planning");
  revalidatePath("/sprint");
  return { message: `Équipe « ${team.name} » déclarée sur le produit « ${product.name} ».` };
}

/**
 * Suppression définitive d'un critère DoD global du produit.
 * Garde métier : Admin/PO + Scrum Master (guardManageDodCriteria, Developer exclu).
 * Les DoneCheck déjà cochés sont supprimés en cascade via deleteMany explicite
 * (sécurité FK avant delete du critère).
 */
export async function deleteCriterion(productId: string, criterionId: string): Promise<void> {
  const userId = await currentUserId();
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
