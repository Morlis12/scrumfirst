"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { currentUserId } from "@/lib/context";
import { getMembership } from "@/lib/dal";
import {
  autoCloseExpiredSprints,
  guardCancelSprint,
  guardCloseDailyDefinitively,
  guardComment,
  guardCreateSprint,
  guardDeleteSprint,
  guardEditSprintGoal,
  guardEventTimer,
  guardImprovement,
  guardPullItemToSprint,
  guardSetDailyTotal,
  guardSprintDates,
  guardStakeholderFeedback,
  guardStartSprint,
  guardValidateDaily,
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
  // Règle métier : l'item affecté disparaît du Product Backlog
  // (sprintId renseigné → exclu des requêtes backlog/choix) et démarre en TODO.
  await prisma.backlogItem.update({
    where: { id: itemId },
    data: { status: "IN_SPRINT", sprintId, boardColumn: "TODO" },
  });
  revalidatePath("/planning");
  revalidatePath("/backlog");
  revalidatePath("/sprint");
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
  revalidatePath("/sprint");
}

// ---------- Daily Scrums répétés (étape 2) : compteur X / TOTAL ----------

/**
 * TOTAL paramétrable par le Scrum Master (défaut 20 ≈ 1 mois).
 * Refusé si l'étape est définitivement clôturée (compteur figé).
 */
export async function setDailyTotal(teamId: string, eventId: string, total: number) {
  const userId = await currentUserId();
  const clean = Math.floor(Number(total));
  const guard = await guardSetDailyTotal(userId, teamId, eventId, clean);
  if (!guard.ok) throw new Error(guard.message);
  await prisma.scrumEvent.update({
    where: { id: eventId },
    data: { dailyTotal: clean },
  });
  revalidatePath("/planning");
  revalidatePath("/sprint");
}

/**
 * « ✓ Valider le Daily du jour » (Scrum Master) :
 * incrémente `dailyCount` de +1 et réinitialise le chrono de 15 minutes
 * pour le lendemain (`startedAt = maintenant`, `endedAt = null`).
 * Tant que la clôture définitive n'est pas posée, l'étape reste active :
 * notes de Daily + validations possibles.
 */
export async function validateDaily(teamId: string, eventId: string) {
  const userId = await currentUserId();
  const guard = await guardValidateDaily(userId, teamId, eventId);
  if (!guard.ok) throw new Error(guard.message);
  const event = await prisma.scrumEvent.findUnique({ where: { id: eventId } });
  if (!event) throw new Error("Événement introuvable.");
  const e = event as unknown as { dailyCount: number; dailyTotal: number; completed: boolean };
  if (e.completed) throw new Error("Daily définitivement clôturés : compteur figé.");
  if ((e.dailyCount ?? 0) >= (e.dailyTotal ?? 20)) {
    throw new Error("Compteur au maximum : augmentez le TOTAL ou clôturez définitivement.");
  }
  await prisma.scrumEvent.update({
    where: { id: eventId },
    data: {
      dailyCount: (e.dailyCount ?? 0) + 1,
      // Reset du chrono 15 min pour le lendemain (nouveau Daily à animer).
      startedAt: new Date(),
      endedAt: null,
      timeboxMinutes: 15,
    },
  });
  revalidatePath("/planning");
  revalidatePath("/sprint");
}

/**
 * « 🛑 Clôture définitive des Daily » (Scrum Master) :
 * fige le compteur final (ex. « 20 Daily effectués »), passe l'étape 2 au
 * statut « Terminé » (barre verte, `completed = true`) et débloque
 * automatiquement l'étape suivante « 3. Sprint Review ».
 */
export async function closeDailyDefinitively(teamId: string, eventId: string) {
  const userId = await currentUserId();
  const guard = await guardCloseDailyDefinitively(userId, teamId, eventId);
  if (!guard.ok) throw new Error(guard.message);
  await prisma.scrumEvent.update({
    where: { id: eventId },
    data: { completed: true, endedAt: new Date() },
  });
  revalidatePath("/planning");
  revalidatePath("/sprint");
}

async function returnUnfinishedItems(sprintId: string) {
  // Tout item non terminé et sans Increment retourne au Product Backlog (affiné).
  // Règle métier : il réapparaît dans le backlog et redevient un choix du
  // Sprint suivant seulement après ré-affinage → READY. Les checks DoD de la
  // tentative soldée sont effacés, la colonne est réinitialisée.
  const unfinished = await prisma.backlogItem.findMany({
    where: { sprintId, status: "IN_SPRINT", increment: null },
    select: { id: true },
  });
  if (!unfinished.length) return 0;
  const ids = unfinished.map((i) => i.id);
  await prisma.doneCheck.deleteMany({ where: { backlogItemId: { in: ids } } });
  await prisma.backlogItem.updateMany({
    where: { id: { in: ids } },
    data: { status: failedReturnStatus(), sprintId: null, boardColumn: "TODO" },
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
  revalidatePath("/sprint");
  revalidatePath("/dod");
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
  revalidatePath("/sprint");
  revalidatePath("/dod");
}

/**
 * Suppression d'un Sprint à objectif obsolète (PO uniquement).
 * Règle métier : ses items non terminés retournent au Product Backlog
 * (affinés, checks DoD effacés) avant suppression ; les Incréments livrés
 * (DONE) sont conservés (items DONE détachés, statut inchangé).
 * Après suppression, les items retournés réapparaissent dans le backlog et
 * redeviennent un choix du Sprint suivant après ré-affinage → READY.
 */
export async function deleteSprint(teamId: string, sprintId: string): Promise<void> {
  const userId = await currentUserId();
  const guard = await guardDeleteSprint(userId, sprintId);
  if (!guard.ok) throw new Error(guard.message);
  const sprint = await prisma.sprint.findUnique({
    where: { id: sprintId },
    select: { id: true, teamId: true },
  });
  if (!sprint || sprint.teamId !== teamId) throw new Error("Sprint introuvable.");
  const unfinished = await prisma.backlogItem.findMany({
    where: { sprintId, status: "IN_SPRINT", increment: null },
    select: { id: true },
  });
  const unfinishedIds = unfinished.map((i) => i.id);
  if (unfinishedIds.length > 0) {
    await prisma.doneCheck.deleteMany({ where: { backlogItemId: { in: unfinishedIds } } });
    await prisma.backlogItem.updateMany({
      where: { id: { in: unfinishedIds } },
      data: { status: failedReturnStatus(), sprintId: null, boardColumn: "TODO" },
    });
  }
  // Items DONE : on conserve l'Incrément livré mais on détache du Sprint supprimé.
  // (L'Increment porte sprintId avec onDelete Cascade : il sera supprimé avec
  // le Sprint — on détache d'abord l'item pour garder sa traçabilité DONE.)
  await prisma.backlogItem.updateMany({
    where: { sprintId, status: "DONE" },
    data: { sprintId: null },
  });
  // Nettoyage des lignes liées (évite les orphelins si cascade partielle).
  await prisma.dailyNote.deleteMany({ where: { sprintId } });
  await prisma.impediment.deleteMany({ where: { sprintId } });
  await prisma.retrospectiveAction.deleteMany({ where: { sprintId } });
  await prisma.stakeholderComment.deleteMany({ where: { sprintId } });
  await prisma.scrumEvent.deleteMany({ where: { sprintId } });
  const db = prisma as unknown as Record<string, { deleteMany: (args: unknown) => Promise<unknown> } | undefined>;
  await db.sprintStageClosure?.deleteMany({ where: { sprintId } });
  await prisma.sprint.delete({ where: { id: sprintId } });
  revalidatePath("/planning");
  revalidatePath("/backlog");
  revalidatePath("/sprint");
  revalidatePath("/dod");
}

/**
 * Session de Sprint Review — synthèse de la Scrum Team (résumé de démo).
 * Écriture Scrum Team (admin/dev/sm/PO), Stakeholder en lecture seule.
 * Persisté en base, lié au Sprint courant (kind TEAM_SYNTHESIS).
 */
export async function addTeamSynthesis(sprintId: string, teamId: string, formData: FormData) {
  const userId = await currentUserId();
  const text = String(formData.get("text") ?? "");
  const guard = await guardComment(userId, teamId, sprintId);
  if (!guard.ok) throw new Error(guard.message);
  if (text.trim().length < 2) throw new Error("Synthèse trop courte.");
  await prisma.stakeholderComment.create({
    data: { sprintId, authorId: userId, text: text.trim(), kind: "TEAM_SYNTHESIS" },
  });
  revalidatePath("/sprint");
}

/**
 * Session de Sprint Review — retours des Stakeholders/Clients.
 * Écriture STAKEHOLDER UNIQUEMENT (Scrum Team en lecture seule).
 * Persisté en base, lié au Sprint courant (kind STAKEHOLDER_FEEDBACK).
 */
export async function addStakeholderFeedback(sprintId: string, teamId: string, formData: FormData) {
  const userId = await currentUserId();
  const text = String(formData.get("text") ?? "");
  const guard = await guardStakeholderFeedback(userId, teamId, sprintId);
  if (!guard.ok) throw new Error(guard.message);
  if (text.trim().length < 2) throw new Error("Retour trop court.");
  await prisma.stakeholderComment.create({
    data: { sprintId, authorId: userId, text: text.trim(), kind: "STAKEHOLDER_FEEDBACK" },
  });
  revalidatePath("/sprint");
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
