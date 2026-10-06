"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/context";
import { guardCreateProduct } from "@/lib/scrum-guards";

export type RequestsActionState = { message?: string; error?: string } | undefined;

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 1000;

/** Normalise un titre pour l'anti-doublon (casse + espaces). */
function normalizeTitle(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

/** Détecte le délimiteur CSV dominant sur la première ligne non vide. */
function detectDelimiter(headerLine: string): string {
  const candidates = [",", ";", "\t", "|"];
  let best = ",";
  let bestCount = 0;
  for (const d of candidates) {
    const count = headerLine.split(d).length - 1;
    if (count > bestCount) {
      bestCount = count;
      best = d;
    }
  }
  return best;
}

/** Découpe une ligne CSV en respectant les champs entre guillemets. */
function splitLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      cells.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells.map((c) => c.replace(/^"|"$/g, "").trim());
}

type InitiativeRow = {
  title: string;
  description: string;
  nature: string;
  urgency: string;
  impact: string;
  // Champs AGL d'origine (optionnels — colonnes reconnues si présentes).
  requesterFirstName: string;
  requesterLastName: string;
  requesterFunction: string;
  department: string;
  beneficiaries: string;
  sourceElements: string;
};

/** Normalise un en-tête : minuscules, sans accents, ponctuation → espaces. */
function normalizeHeader(header: string): string {
  return header
    .replace(/^\uFEFF/, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Test de mot complet (évite les faux positifs sur "nom", "type", "desc"…). */
function hasHeaderWord(h: string, word: string): boolean {
  return h.split(" ").includes(word);
}

/**
 * Mappe un en-tête vers un champ initiative — par MOTS-CLÉS (tolérant aux
 * intitulés longs du formulaire AGL : « Présentation succincte du besoin ou
 * de l'idée », « Impact attendu pour AGL », « Niveau d'urgence »…).
 * Ordre : champs précis d'abord, description large en dernier.
 */
function headerToField(header: string): keyof InitiativeRow | null {
  const h = normalizeHeader(header);
  if (!h) return null;

  // 1. Demandeur / porteur / contact explicite (prioritaire sur « nom » = titre).
  if (
    h.includes("demandeur") ||
    h.includes("porteur") ||
    h.includes("contact") ||
    h.includes("responsable") ||
    h.includes("chef")
  ) {
    if (h.includes("prenom") || h.includes("first")) return "requesterFirstName";
    if (
      h.includes("fonction") ||
      h.includes("poste") ||
      h.includes("qualite") ||
      hasHeaderWord(h, "role")
    )
      return "requesterFunction";
    if (h.includes("nom") || h.includes("last")) return "requesterLastName";
    return "requesterLastName";
  }
  // 2. Prénom.
  if (h.includes("prenom") || h.includes("first")) return "requesterFirstName";
  // 3. Fonction.
  if (
    h.includes("fonction") ||
    h.includes("poste") ||
    h.includes("qualite") ||
    hasHeaderWord(h, "role") ||
    h.includes("function")
  )
    return "requesterFunction";
  // 4. Titre / intitulé.
  if (
    h.includes("intitule") ||
    h.includes("titre") ||
    h.includes("title") ||
    h.includes("libelle") ||
    h.includes("projet") ||
    h.includes("initiative") ||
    h.includes("objet") ||
    hasHeaderWord(h, "nom") ||
    hasHeaderWord(h, "name")
  )
    return "title";
  // 5. Nature.
  if (
    h.includes("nature") ||
    h.includes("soumission") ||
    h.includes("categorie") ||
    h.includes("category") ||
    h.includes("domaine") ||
    hasHeaderWord(h, "type")
  )
    return "nature";
  // 6. Urgence.
  if (
    h.includes("urgenc") ||
    h.includes("priorite") ||
    h.includes("priority") ||
    h.includes("criticite")
  )
    return "urgency";
  // 7. Impact.
  if (
    h.includes("impact") ||
    h.includes("enjeu") ||
    h.includes("benefice") ||
    h.includes("gain") ||
    h.includes("valeur") ||
    h.includes("attendu") ||
    h.includes("retombe")
  )
    return "impact";
  // 8. Direction / département.
  if (
    h.includes("direction") ||
    h.includes("departement") ||
    h.includes("department") ||
    h.includes("service") ||
    h.includes("entite") ||
    h.includes("division")
  )
    return "department";
  // 9. Bénéficiaires.
  if (
    h.includes("beneficiaire") ||
    h.includes("beneficiary") ||
    h.includes("beneficiaries") ||
    h.includes("cible") ||
    h.includes("usager")
  )
    return "beneficiaries";
  // 10. Éléments sources.
  if (
    h.includes("fichier") ||
    h.includes("piece") ||
    h.includes("document") ||
    (h.includes("element") && h.includes("source"))
  )
    return "sourceElements";
  // 11. Description (large, en dernier — capte les intitulés longs AGL).
  if (
    h.includes("description") ||
    h.includes("descriptif") ||
    h.includes("presentation") ||
    h.includes("resume") ||
    h.includes("besoin") ||
    h.includes("idee") ||
    h.includes("idea") ||
    h.includes("contexte") ||
    h.includes("constat") ||
    h.includes("probleme") ||
    h.includes("objectif") ||
    h.includes("motif") ||
    h.includes("justification") ||
    h.includes("commentaire") ||
    h.includes("detail") ||
    hasHeaderWord(h, "desc")
  )
    return "description";
  return null;
}

/** Parse un CSV/TSV en lignes typées (lance une Error lisible si format invalide). */
function parseExtraction(text: string): InitiativeRow[] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) throw new Error("Fichier vide : aucune ligne à importer.");
  if (lines.length === 1) throw new Error("En-tête seule détectée : ajoutez au moins une ligne de demande.");
  const delimiter = detectDelimiter(lines[0]!);
  const headers = splitLine(lines[0]!, delimiter);
  const mapping = headers.map(headerToField);
  if (!mapping.includes("title")) {
    throw new Error(
      "Colonne titre introuvable : nommez une colonne « title » (ou titre / intitulé / nom / projet).",
    );
  }
  const rows: InitiativeRow[] = [];
  for (const line of lines.slice(1)) {
    const cells = splitLine(line, delimiter);
    const row: InitiativeRow = {
      title: "",
      description: "",
      nature: "",
      urgency: "",
      impact: "",
      requesterFirstName: "",
      requesterLastName: "",
      requesterFunction: "",
      department: "",
      beneficiaries: "",
      sourceElements: "",
    };
    mapping.forEach((field, idx) => {
      if (!field) return;
      row[field] = (cells[idx] ?? "").trim();
    });
    row.title = normalizeTitle(row.title);
    if (!row.title) continue;
    rows.push(row);
  }
  if (rows.length === 0) throw new Error("Aucune ligne exploitable : renseignez au moins un titre.");
  if (rows.length > MAX_ROWS)
    throw new Error(`Fichier trop volumineux : ${rows.length} lignes (max ${MAX_ROWS}).`);
  return rows;
}

/**
 * Import d'une extraction du formulaire InitiatIV' (CSV/Excel exporté en CSV).
 * ALGORITHME ANTI-CONFLIT — pour chaque ligne :
 * - le `title` existe déjà dans [InitiativeRequest] (espace) → mise à jour (anti-doublon) ;
 * - sinon le `title` existe dans [Product] (espace) → saut (déjà scrummé) ;
 * - sinon création dans [InitiativeRequest] (statut PENDING).
 */
export async function importInitiatives(
  _state: RequestsActionState,
  formData: FormData,
): Promise<RequestsActionState> {
  const { userId, workspaceId } = await requireWorkspace();
  const allowed = await guardCreateProduct(userId);
  if (!allowed.ok) return { error: allowed.message };

  const currentUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  const importedByEmail = currentUser?.email ?? null;

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Sélectionnez un fichier d'extraction (CSV/Excel) à importer." };
  }
  if (file.size > MAX_FILE_BYTES) {
    return { error: "Fichier trop lourd : 5 Mo maximum." };
  }
  const fileName = file.name || "extraction";
  const lowerName = fileName.toLowerCase();
  const isExcel = lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls");

  let text: string;
  try {
    text = await file.text();
  } catch {
    return { error: "Lecture du fichier impossible : réessayez." };
  }
  // Binaire Excel brut (ZIP OOXML) : guider vers un export CSV.
  if (text.startsWith("PK\x03\x04") || (isExcel && !text.includes(",") && !text.includes(";") && !text.includes("\t"))) {
    return {
      error:
        "Format Excel natif détecté : exportez votre fichier en CSV UTF-8 (Fichier > Enregistrer sous > CSV), puis réimportez-le ici.",
    };
  }

  let rows: InitiativeRow[];
  try {
    rows = parseExtraction(text);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Fichier illisible." };
  }

  let created = 0;
  let updated = 0;
  let skippedProducts = 0;
  for (const row of rows) {
    const existingRequest = await prisma.initiativeRequest.findFirst({
      where: { workspaceId, title: { equals: row.title, mode: "insensitive" } },
      select: { id: true, duplicateHits: true },
    });
    if (existingRequest) {
      await prisma.initiativeRequest.update({
        where: { id: existingRequest.id },
        data: {
          description: row.description || undefined,
          nature: row.nature || undefined,
          urgency: row.urgency || undefined,
          impact: row.impact || undefined,
          sourceFile: fileName,
          status: "PENDING",
          importedByEmail,
          requesterFirstName: row.requesterFirstName || undefined,
          requesterLastName: row.requesterLastName || undefined,
          requesterFunction: row.requesterFunction || undefined,
          department: row.department || undefined,
          beneficiaries: row.beneficiaries || undefined,
          sourceElements: row.sourceElements || undefined,
          duplicateHits: { increment: 1 },
        },
      });
      updated++;
      continue;
    }
    const existingProduct = await prisma.product.findFirst({
      where: { workspaceId, name: { equals: row.title, mode: "insensitive" } },
      select: { id: true },
    });
    if (existingProduct) {
      skippedProducts++;
      continue;
    }
    try {
      await prisma.initiativeRequest.create({
        data: {
          workspaceId,
          title: row.title,
          description: row.description || null,
          nature: row.nature || "",
          urgency: row.urgency || "MEDIUM",
          impact: row.impact || null,
          sourceFile: fileName,
          status: "PENDING",
          importedByEmail,
          requesterFirstName: row.requesterFirstName || null,
          requesterLastName: row.requesterLastName || null,
          requesterFunction: row.requesterFunction || null,
          department: row.department || null,
          beneficiaries: row.beneficiaries || null,
          sourceElements: row.sourceElements || null,
        },
      });
      created++;
    } catch {
      // Conflit d'unicité inter-espaces (title UNIQUE global) : compté comme doublon.
      skippedProducts++;
    }
  }

  // Journal d'audit SAS — alimente le compteur « doublons interceptés ».
  try {
    await prisma.ingestionLog.create({
      data: {
        workspaceId,
        fileName,
        importedByEmail,
        created,
        updated,
        skipped: skippedProducts,
        totalRows: rows.length,
      },
    });
  } catch {
    // Le journal ne doit jamais faire échouer un import réussi.
  }

  revalidatePath("/requests");
  const parts = [`${created} créée(s)`, `${updated} mise(s) à jour`, `${skippedProducts} doublon(s) ignoré(s)`];
  return { message: `Import « ${fileName} » : ${parts.join(" · ")} (${rows.length} ligne(s) traitée(s)).` };
}

const ConvertSchema = z.object({
  productOwnerEmail: z.string().trim().toLowerCase().email("Email du Product Owner invalide.").max(200),
  scrumMasterEmail: z.string().trim().toLowerCase().email("Email du Scrum Master invalide.").max(200),
  teamName: z.string().trim().min(2, "Nom d'équipe : 2 caractères minimum.").max(200),
});

/**
 * Conversion d'une initiative en produit Scrum actif :
 * - l'initiative passe au statut ARCHIVED dans le SAS ;
 * - un enregistrement officiel est créé dans [Product] avec PO / SM / équipe dédiée.
 */
export async function convertInitiativeToProduct(
  requestId: string,
  _state: RequestsActionState,
  formData: FormData,
): Promise<RequestsActionState> {
  const { userId, workspaceId } = await requireWorkspace();
  const allowed = await guardCreateProduct(userId);
  if (!allowed.ok) return { error: allowed.message };

  const parsed = ConvertSchema.safeParse({
    productOwnerEmail: formData.get("productOwnerEmail"),
    scrumMasterEmail: formData.get("scrumMasterEmail"),
    teamName: formData.get("teamName"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const initiative = await prisma.initiativeRequest.findFirst({
    where: { id: requestId, workspaceId },
  });
  if (!initiative) return { error: "Initiative introuvable dans votre espace." };
  if (initiative.status === "ARCHIVED") return { error: "Initiative déjà validée et archivée." };

  const duplicateProduct = await prisma.product.findFirst({
    where: { workspaceId, name: { equals: initiative.title, mode: "insensitive" } },
    select: { id: true },
  });
  if (duplicateProduct) {
    return { error: `Un produit « ${initiative.title} » existe déjà dans votre espace.` };
  }

  const product = await prisma.product.create({
    data: {
      name: initiative.title,
      productOwnerId: userId,
      productOwnerEmail: parsed.data.productOwnerEmail,
      scrumMasterEmail: parsed.data.scrumMasterEmail,
      workspaceId,
    },
  });
  const team = await prisma.team.create({
    data: { name: parsed.data.teamName, productId: product.id, members: [], workspaceId },
  });

  // Rattachement gouvernance : créateur → PO, comptes espace PO/SM → rôles.
  const users = await prisma.user.findMany({
    where: { workspaceId },
    select: { id: true, email: true },
  });
  const byEmail = new Map(users.map((u) => [u.email.toLowerCase(), u]));
  const memberships: { userId: string; role: string }[] = [{ userId, role: "PRODUCT_OWNER" }];
  const poUser = byEmail.get(parsed.data.productOwnerEmail);
  if (poUser && poUser.id !== userId) memberships.push({ userId: poUser.id, role: "PRODUCT_OWNER" });
  const smUser = byEmail.get(parsed.data.scrumMasterEmail);
  if (smUser) memberships.push({ userId: smUser.id, role: "SCRUM_MASTER" });
  for (const m of memberships) {
    await prisma.teamMembership.upsert({
      where: { userId_teamId: { userId: m.userId, teamId: team.id } },
      create: { userId: m.userId, teamId: team.id, role: m.role },
      update: { role: m.role },
    });
  }

  const description = initiative.description?.trim();
  if (description) {
    await prisma.productGoal.create({ data: { productId: product.id, description } });
  }

  await prisma.initiativeRequest.update({
    where: { id: initiative.id },
    data: { status: "ARCHIVED", convertedProductId: product.id },
  });

  revalidatePath("/requests");
  revalidatePath("/products");
  revalidatePath("/backlog");
  return {
    message: `Initiative « ${initiative.title} » scrummée : produit créé avec l'équipe « ${team.name} » (PO ${parsed.data.productOwnerEmail} · SM ${parsed.data.scrumMasterEmail}).`,
  };
}
