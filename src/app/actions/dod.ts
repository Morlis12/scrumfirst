"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { currentUserId } from "@/lib/context";
import {
  guardCheckDod,
  guardManageDodCriteria,
  guardPromoteToIncrement,
} from "@/lib/scrum-guards";

export async function createCriterionForm(productId: string, _state: unknown, formData: FormData) {
  try {
    await createCriterion(productId, String(formData.get("label") ?? ""));
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/** Coche/décoche l'ensemble des critères d'un item depuis un formulaire. */
export async function setDodChecksFromForm(productId: string, itemId: string, formData: FormData) {
  const wanted = new Set(formData.getAll("crit").map(String));
  const item = await prisma.backlogItem.findUnique({
    where: { id: itemId },
    include: { doneChecks: { select: { criterionId: true } } },
  });
  if (!item) throw new Error("Item introuvable.");
  const criteria = await prisma.doneCriterion.findMany({
    where: { productId, active: true },
    select: { id: true },
  });
  for (const c of criteria) {
    const has = item.doneChecks.some((d) => d.criterionId === c.id);
    const want = wanted.has(c.id);
    if (want && !has) await setDodCheck(productId, itemId, c.id, true);
    if (!want && has) await setDodCheck(productId, itemId, c.id, false);
  }
  revalidatePath("/dod");
}

export async function createCriterion(productId: string, label: string) {
  const userId = await currentUserId();
  const guard = await guardManageDodCriteria(userId, productId);
  if (!guard.ok) throw new Error(guard.message);
  if (label.trim().length < 3) throw new Error("Libellé trop court.");
  await prisma.doneCriterion.create({
    data: { productId, label: label.trim() },
  });
  revalidatePath("/dod");
}

export async function toggleCriterion(productId: string, criterionId: string, active: boolean) {
  const userId = await currentUserId();
  const guard = await guardManageDodCriteria(userId, productId);
  if (!guard.ok) throw new Error(guard.message);
  await prisma.doneCriterion.update({
    where: { id: criterionId },
    data: { active },
  });
  revalidatePath("/dod");
}

export async function setDodCheck(
  productId: string,
  itemId: string,
  criterionId: string,
  checked: boolean,
) {
  const userId = await currentUserId();
  const guard = await guardCheckDod(userId, productId);
  if (!guard.ok) throw new Error(guard.message);
  const [item, criterion] = await Promise.all([
    prisma.backlogItem.findUnique({ where: { id: itemId } }),
    prisma.doneCriterion.findUnique({ where: { id: criterionId } }),
  ]);
  if (!item || item.productId !== productId) throw new Error("Item introuvable.");
  if (!criterion || criterion.productId !== productId || !criterion.active) {
    throw new Error("Ce critère n'est plus actif.");
  }
  if (checked) {
    await prisma.doneCheck.upsert({
      where: { backlogItemId_criterionId: { backlogItemId: itemId, criterionId } },
      create: { backlogItemId: itemId, criterionId, checkedById: userId },
      update: { checkedById: userId, checkedAt: new Date() },
    });
  } else {
    await prisma.doneCheck.deleteMany({ where: { backlogItemId: itemId, criterionId } });
  }
  revalidatePath("/dod");
  revalidatePath("/planning");
}

/** Promotion en Increment : 100 % DoD + commentaire de validation obligatoire.
 * Le commentaire classe l'item comme « valide DoD » et est conservé dans
 * l'historique (DailyNote liée au ticket, titre « ✅ Validation DoD »).
 * Accepte un string direct (appel Kanban) ou un FormData (formAction
 * depuis /dod et /planning, champ `validationComment`).
 */
export async function promoteToIncrement(itemId: string, validationComment?: string | FormData) {
  const userId = await currentUserId();
  const guard = await guardPromoteToIncrement(userId, itemId);
  if (!guard.ok) throw new Error(guard.message);
  let comment = "";
  if (typeof validationComment === "string") {
    comment = validationComment.trim().slice(0, 500);
  } else if (validationComment instanceof FormData) {
    comment = String(validationComment.get("validationComment") ?? "").trim().slice(0, 500);
  }
  if (comment.length < 2) {
    throw new Error(
      "Commentaire de validation DoD obligatoire (2 caractères minimum) : il classe l'item comme valide DoD.",
    );
  }
  const item = await prisma.backlogItem.findUnique({
    where: { id: itemId },
    select: { sprintId: true, boardColumn: true },
  });
  if (!item?.sprintId) throw new Error("Item hors Sprint.");
  const noteColumn =
    item.boardColumn === "TODO" || item.boardColumn === "IN_PROGRESS" || item.boardColumn === "REVIEW"
      ? item.boardColumn
      : "REVIEW";
  const { dailyNoteTitleFor } = await import("@/lib/daily-notes");
  await prisma.$transaction([
    prisma.dailyNote.create({
      data: {
        sprintId: item.sprintId,
        backlogItemId: itemId,
        column: noteColumn,
        authorId: userId,
        text: comment,
        title: `✅ Validation DoD — ${dailyNoteTitleFor()}`,
        nature: "AVANCEMENT",
      },
    }),
    prisma.backlogItem.update({ where: { id: itemId }, data: { status: "DONE" } }),
    prisma.increment.create({
      data: { backlogItemId: itemId, sprintId: item.sprintId },
    }),
  ]);
  revalidatePath("/dod");
  revalidatePath("/planning");
  revalidatePath("/backlog");
  revalidatePath("/sprint");
}
