"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { currentUserId } from "@/lib/context";
import { guardImprovement, guardPlanRetroAction } from "@/lib/scrum-guards";
import { canPostRetroIdea } from "@/lib/scrum-rules";

async function requireSprintInTeam(sprintId: string, teamId: string) {
  const sprint = await prisma.sprint.findUnique({ where: { id: sprintId } });
  if (!sprint || sprint.teamId !== teamId) throw new Error("Sprint introuvable.");
  return sprint;
}

/**
 * Post-it de brainstorming Rétrospective (Scrum Team au complet en écriture,
 * Stakeholder exclu — lecture seule). Texte court dans une colonne valide,
 * persisté en base (RetrospectiveIdea).
 */
export async function addRetroIdea(teamId: string, sprintId: string, column: string, text: string) {
  const userId = await currentUserId();
  await requireSprintInTeam(sprintId, teamId);
  const guard = await guardImprovement(userId, teamId);
  if (!guard.ok) throw new Error(guard.message);
  const cleanColumn = String(column ?? "").trim();
  const cleanText = String(text ?? "").trim().slice(0, 500);
  // Double contrôle pur (colonne valide + texte 2–500) après la garde de rôle.
  const membership = await prisma.teamMembership.findUnique({
    where: { userId_teamId: { userId, teamId } },
  });
  const pure = canPostRetroIdea(
    {
      userId,
      teamRole: membership?.role ?? null,
      participatesAsDeveloper: membership?.participatesAsDeveloper ?? false,
      isProductOwner: false,
      canActAsDeveloper: false,
    },
    cleanColumn,
    cleanText,
  );
  if (!pure.ok) throw new Error(pure.message);
  await prisma.retrospectiveIdea.create({
    data: { sprintId, column: cleanColumn, text: cleanText, authorId: userId },
  });
  revalidatePath("/retrospective");
}

/**
 * Plan d'actions officiel : le Scrum Master ou le PO crée une action
 * d'amélioration avec son Responsable (texte libre). Persistée en base
 * (RetrospectiveAction.owner), visible dès le tableau de bord du Sprint suivant.
 */
export async function createPlannedAction(
  teamId: string,
  sprintId: string,
  description: string,
  owner: string,
) {
  const userId = await currentUserId();
  await requireSprintInTeam(sprintId, teamId);
  const guard = await guardPlanRetroAction(userId, teamId);
  if (!guard.ok) throw new Error(guard.message);
  const cleanDescription = String(description ?? "").trim().slice(0, 500);
  const cleanOwner = String(owner ?? "").trim().slice(0, 120);
  if (cleanDescription.length < 3) throw new Error("Texte de l'action trop court (3 caractères minimum).");
  if (cleanOwner.length < 2) throw new Error("Responsable requis (2 caractères minimum).");
  await prisma.retrospectiveAction.create({
    data: { sprintId, description: cleanDescription, owner: cleanOwner },
  });
  revalidatePath("/retrospective");
  revalidatePath("/planning");
}

/** Bascule fait / à faire d'une action du plan (Scrum Team). */
export async function togglePlannedAction(teamId: string, actionId: string, done: boolean) {
  const userId = await currentUserId();
  const guard = await guardImprovement(userId, teamId);
  if (!guard.ok) throw new Error(guard.message);
  const action = await prisma.retrospectiveAction.findUnique({
    where: { id: actionId },
    include: { sprint: { select: { teamId: true } } },
  });
  if (!action || action.sprint.teamId !== teamId) throw new Error("Action introuvable.");
  await prisma.retrospectiveAction.update({ where: { id: actionId }, data: { done } });
  revalidatePath("/retrospective");
  revalidatePath("/planning");
}
