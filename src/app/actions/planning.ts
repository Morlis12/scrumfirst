"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { currentUserId } from "@/lib/context";
import { getMembership } from "@/lib/dal";
import {
  autoCloseExpiredSprints,
  guardCancelSprint,
  guardComment,
  guardCreateSprint,
  guardEditSprintGoal,
  guardEventTimer,
  guardImprovement,
  guardPullItemToSprint,
  guardSprintDates,
  guardStartSprint,
  failedReturnStatus,
} from "@/lib/scrum-guards";
import { timeboxForEvent, EVENT_ORDER } from "@/lib/scrum-rules";

async function requireTeamMember(userId: string, teamId: string) {
  const m = await getMembership(userId, teamId);
  if (!m) throw new Error("Vous n'êtes pas membre de cette équipe.");
  if (m.role === "STAKEHOLDER") throw new Error("Lecture seule : action réservée à la Scrum Team.");
  return m;
}

const SprintSchema = z.object({
  title: z.string().trim().min(3, "Titre : 3 caractères minimum.").max(120),
  goal: z.string().trim().min(5, "Objectif : 5 caractères minimum.").max(500),
  startDate: z.string().min(1, "Date de début requise."),
  endDate: z.string().min(1, "Date de fin requise."),
});

export async function createSprint(
  teamId: string,
  _state: { error?: string } | undefined,
  formData: FormData,
) {
  const userId = await currentUserId();
  await requireTeamMember(userId, teamId);
  const parsed = SprintSchema.safeParse({
    title: formData.get("title"),
    goal: formData.get("goal"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const start = new Date(parsed.data.startDate);
  const end = new Date(parsed.data.endDate);
  const dates = guardSprintDates(start, end);
  if (!dates.ok) return { error: dates.message };

  // Un Sprint se crée avec un ou plusieurs items du Product Backlog (READY) —
  // jamais à vide, et jamais un item seul « qui fait » le Sprint courant.
  const rawIds = formData.getAll("itemIds").map(String).filter(Boolean);
  const itemIds = [...new Set(rawIds)];
  if (itemIds.length < 1) {
    return {
      error:
        "Sélectionnez un ou plusieurs items READY du Product Backlog — création bloquée sans item.",
    };
  }

  // Time-box d'abord : les Sprints expirés sont clôturés automatiquement,
  // puis la séquence stricte s'applique (un seul Sprint ouvert à la fois).
  await autoCloseExpiredSprints(teamId);
  const seq = await guardCreateSprint(teamId);
  if (!seq.ok) return { error: seq.message };

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { productId: true },
  });
  if (!team) return { error: "Équipe introuvable." };
  const candidates = await prisma.backlogItem.findMany({
    where: { id: { in: itemIds } },
    select: { id: true, productId: true, status: true, sprintId: true, title: true },
  });
  if (candidates.length !== itemIds.length) {
    return { error: "Certains items sélectionnés sont introuvables." };
  }
  for (const c of candidates) {
    if (c.productId !== team.productId) {
      return { error: `« ${c.title} » n'appartient pas au produit de cette équipe.` };
    }
    if (c.sprintId) {
      return { error: `« ${c.title} » est déjà dans un Sprint.` };
    }
    if (c.status !== "READY") {
      return { error: `« ${c.title} » n'est pas READY : affinez puis estimez d'abord.` };
    }
  }

  const days = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
  const sprint = await prisma.sprint.create({
    data: {
      teamId,
      title: parsed.data.title,
      goal: parsed.data.goal,
      status: "PLANNING",
      startDate: start,
      endDate: end,
    },
  });
  // Événements avec timeboxes prorata automatiques, créés dans l'ordre chronologique Scrum.
  await prisma.scrumEvent.createMany({
    data: EVENT_ORDER.map((type) => ({
      sprintId: sprint.id,
      type,
      timeboxMinutes: timeboxForEvent(type, days),
    })),
  });
  // Tirage initial : les items cochés entrent dans le Sprint dès sa création.
  await prisma.backlogItem.updateMany({
    where: { id: { in: itemIds } },
    data: { status: "IN_SPRINT", sprintId: sprint.id, boardColumn: "TODO" },
  });
  revalidatePath("/planning");
  revalidatePath("/backlog");
  revalidatePath("/sprint");
  return undefined;
}

export async function updateSprintGoal(teamId: string, sprintId: string, formData: FormData) {
  const userId = await currentUserId();
  const goal = String(formData.get("goal") ?? "").trim();
  if (goal.length < 5) throw new Error("Objectif trop court.");
  const guard = await guardEditSprintGoal(userId, teamId, sprintId);
  if (!guard.ok) throw new Error(guard.message);
  await prisma.sprint.update({ where: { id: sprintId }, data: { goal } });
  revalidatePath("/planning");
}

/** Clôture la Planning : verrouille l'objectif et démarre le Sprint. */
export async function startSprint(teamId: string, sprintId: string) {
  const userId = await currentUserId();
  await requireTeamMember(userId, teamId);
  await autoCloseExpiredSprints(teamId);
  // Règle de séquence : démarrage impossible si le précédent n'est pas CLOSED.
  const seq = await guardStartSprint(teamId, sprintId);
  if (!seq.ok) throw new Error(seq.message);
  const sprint = await prisma.sprint.findUnique({ where: { id: sprintId } });
  if (!sprint || sprint.teamId !== teamId) throw new Error("Sprint introuvable.");
  if (sprint.status !== "PLANNING" || sprint.goalLockedAt) {
    throw new Error("Objectif du Sprint déjà verrouillé.");
  }
  if (!sprint.goal?.trim()) throw new Error("Objectif de Sprint requis pour démarrer.");
  const plannedCount = await prisma.backlogItem.count({ where: { sprintId } });
  if (plannedCount < 1) {
    throw new Error("Démarrage bloqué : tirez un ou plusieurs items READY dans le Sprint.");
  }
  await prisma.sprint.update({
    where: { id: sprintId },
    data: { status: "ACTIVE", goalLockedAt: new Date() },
  });
  revalidatePath("/planning");
}

/** Tirage d'un item READY dans le Sprint — accord Developers validé côté backend. */
export async function pullItemToSprint(teamId: string, sprintId: string, itemId: string) {
  const userId = await currentUserId();
  await autoCloseExpiredSprints(teamId);
  const guard = await guardPullItemToSprint(userId, teamId, sprintId, itemId);
  if (!guard.ok) throw new Error(guard.message);
  await prisma.backlogItem.update({
    where: { id: itemId },
    data: { status: "IN_SPRINT", sprintId },
  });
  revalidatePath("/planning");
  revalidatePath("/backlog");
}

export async function startTimer(teamId: string, eventId: string) {
  const userId = await currentUserId();
  const guard = await guardEventTimer(userId, teamId, eventId, "start");
  if (!guard.ok) throw new Error(guard.message);
  await prisma.scrumEvent.update({
    where: { id: eventId },
    // (Re)lancer rouvre l'étape : le drapeau « faite » est réinitialisé.
    data: { startedAt: new Date(), endedAt: null, completed: false },
  });
  revalidatePath("/planning");
}

export async function stopTimer(teamId: string, eventId: string) {
  const userId = await currentUserId();
  const guard = await guardEventTimer(userId, teamId, eventId, "stop");
  if (!guard.ok) throw new Error(guard.message);
  await prisma.scrumEvent.update({
    where: { id: eventId },
    data: { endedAt: new Date() },
  });
  revalidatePath("/planning");
}

/**
 * Déplacement manuel du curseur de la timeline (Scrum Master).
 * Positionne le chrono à `elapsedMinutes` (0 = début de la timebox) en
 * recalant `startedAt` ; si le chrono n'était pas démarré, cela le démarre
 * à cet avancement. Les horodatages restent honnêtes : seul le point de
 * départ est recalculé, jamais antidaté au-delà du réel.
 */
export async function adjustEventTime(teamId: string, eventId: string, elapsedMinutes: number) {
  const userId = await currentUserId();
  const guard = await guardEventTimer(userId, teamId, eventId, "adjust");
  if (!guard.ok) throw new Error(guard.message);
  const event = await prisma.scrumEvent.findUnique({ where: { id: eventId } });
  if (!event || Number.isNaN(elapsedMinutes)) throw new Error("Événement introuvable.");
  const clamped = Math.min(
    Math.max(0, Math.floor(elapsedMinutes)),
    Math.max(event.timeboxMinutes, 1),
  );
  await prisma.scrumEvent.update({
    where: { id: eventId },
    data: {
      startedAt: new Date(Date.now() - clamped * 60000),
      endedAt: null,
    },
  });
  revalidatePath("/planning");
}

/**
 * Remplit la barre d'un coup (Scrum Master) : marque l'étape comme faite.
 * Fige `endedAt` à maintenant et lève le drapeau `completed` (barre 100 %,
 * badge « Terminé ✓ »), que le chrono ait tourné ou non — sans réécrire
 * un `startedAt` existant.
 */
export async function completeEvent(teamId: string, eventId: string) {
  const userId = await currentUserId();
  const guard = await guardEventTimer(userId, teamId, eventId, "complete");
  if (!guard.ok) throw new Error(guard.message);
  const now = new Date();
  const event = await prisma.scrumEvent.findUnique({ where: { id: eventId } });
  if (!event) throw new Error("Événement introuvable.");
  await prisma.scrumEvent.update({
    where: { id: eventId },
    data: {
      startedAt: event.startedAt ?? now,
      endedAt: now,
      completed: true,
    },
  });
  revalidatePath("/planning");
}

async function returnUnfinishedItems(sprintId: string) {
  // Tout item non terminé et sans Increment retourne au Product Backlog (affiné).
  const unfinished = await prisma.backlogItem.findMany({
    where: { sprintId, status: "IN_SPRINT", increment: null },
    select: { id: true },
  });
  if (!unfinished.length) return 0;
  await prisma.backlogItem.updateMany({
    where: { id: { in: unfinished.map((i) => i.id) } },
    data: { status: failedReturnStatus(), sprintId: null },
  });
  return unfinished.length;
}

export async function closeSprint(teamId: string, sprintId: string) {
  const userId = await currentUserId();
  await requireTeamMember(userId, teamId);
  const sprint = await prisma.sprint.findUnique({ where: { id: sprintId } });
  if (!sprint || sprint.teamId !== teamId) throw new Error("Sprint introuvable.");
  if (sprint.status === "CLOSED" || sprint.status === "CANCELLED") {
    throw new Error("Sprint déjà clôturé.");
  }
  await returnUnfinishedItems(sprintId);
  await prisma.sprint.update({
    where: { id: sprintId },
    data: { status: "CLOSED", closedAt: new Date() },
  });
  revalidatePath("/planning");
  revalidatePath("/backlog");
}

export async function cancelSprint(
  sprintId: string,
  _state: { error?: string } | undefined,
  formData: FormData,
) {
  const userId = await currentUserId();
  const reason = String(formData.get("reason") ?? "");
  const note = String(formData.get("note") ?? "");
  const guard = await guardCancelSprint(userId, sprintId, reason);
  if (!guard.ok) return { error: guard.message };
  await returnUnfinishedItems(sprintId);
  await prisma.sprint.update({
    where: { id: sprintId },
    data: { status: "CANCELLED", cancelledReason: reason, cancelledNote: note || null },
  });
  revalidatePath("/planning");
  revalidatePath("/backlog");
}

export async function addComment(sprintId: string, teamId: string, formData: FormData) {
  const userId = await currentUserId();
  const text = String(formData.get("text") ?? "");
  const guard = await guardComment(userId, teamId, sprintId);
  if (!guard.ok) throw new Error(guard.message);
  if (text.trim().length < 2) throw new Error("Commentaire trop court.");
  await prisma.stakeholderComment.create({
    data: { sprintId, authorId: userId, text: text.trim() },
  });
  revalidatePath("/planning");
}

export async function addImpediment(teamId: string, sprintId: string, formData: FormData) {
  const userId = await currentUserId();
  const description = String(formData.get("description") ?? "");
  // Obstacles suivis par la Scrum Team au complet (PO, SM, Dev) — Stakeholder exclu.
  const guard = await guardImprovement(userId, teamId);
  if (!guard.ok) throw new Error(guard.message);
  if (description.trim().length < 3) throw new Error("Description trop courte.");
  await prisma.impediment.create({
    data: { sprintId, reportedById: userId, description: description.trim() },
  });
  revalidatePath("/planning");
}

export async function resolveImpediment(teamId: string, impedimentId: string, done: boolean) {
  const userId = await currentUserId();
  const guard = await guardImprovement(userId, teamId);
  if (!guard.ok) throw new Error(guard.message);
  await prisma.impediment.update({
    where: { id: impedimentId },
    data: done
      ? { status: "RESOLVED", resolvedAt: new Date() }
      : { status: "OPEN", resolvedAt: null },
  });
  revalidatePath("/planning");
}

export async function addRetroAction(teamId: string, sprintId: string, formData: FormData) {
  const userId = await currentUserId();
  const description = String(formData.get("description") ?? "");
  const guard = await guardImprovement(userId, teamId);
  if (!guard.ok) throw new Error(guard.message);
  if (description.trim().length < 3) throw new Error("Description trop courte.");
  await prisma.retrospectiveAction.create({
    data: { sprintId, description: description.trim() },
  });
  revalidatePath("/planning");
}

export async function toggleRetroAction(teamId: string, actionId: string, done: boolean) {
  const userId = await currentUserId();
  const guard = await guardImprovement(userId, teamId);
  if (!guard.ok) throw new Error(guard.message);
  await prisma.retrospectiveAction.update({
    where: { id: actionId },
    data: { done },
  });
  revalidatePath("/planning");
}
