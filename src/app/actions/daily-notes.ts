"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { currentUserId } from "@/lib/context";
import { getMembership } from "@/lib/dal";
import { DAILY_COLUMNS, NOTE_NATURES, dailyNoteTitleFor } from "@/lib/daily-notes";

/**
 * Garde d'écriture : Developers et Scrum Master (+ Admin global).
 * Le Daily Scrum est leur réunion ; PO/Stakeholder lisent seulement.
 */
async function guardWriteDailyNote(userId: string, teamId: string) {
  const [membership, user] = await Promise.all([
    getMembership(userId, teamId),
    prisma.user.findUnique({
      where: { id: userId },
      select: { globalRole: true },
    }),
  ]);
  if (user?.globalRole === "ADMIN") return { ok: true as const };
  const role = membership?.role;
  if (
    role === "DEVELOPER" ||
    role === "SCRUM_MASTER" ||
    membership?.participatesAsDeveloper === true
  ) {
    return { ok: true as const };
  }
  return {
    ok: false as const,
    message:
      "Ajout de notes Daily réservé aux Developers et au Scrum Master.",
  };
}

/**
 * Ajoute un résumé textuel du Daily sur un ticket (colonne capturée à la saisie).
 * Persiste en base (modèle DailyNote).
 */
export async function addDailyNote(
  teamId: string,
  sprintId: string,
  backlogItemId: string | null,
  column: string,
  text: string,
  nature = "AVANCEMENT",
): Promise<void> {
  const userId = await currentUserId();
  const guard = await guardWriteDailyNote(userId, teamId);
  if (!guard.ok) throw new Error(guard.message);
  const clean = text.trim().slice(0, 500);
  if (clean.length < 2) throw new Error("Note trop courte (2 caractères minimum).");
  if (!(DAILY_COLUMNS as readonly string[]).includes(column)) {
    throw new Error("Colonne invalide (TODO, IN_PROGRESS ou REVIEW).");
  }
  if (!(NOTE_NATURES as readonly string[]).includes(nature)) {
    throw new Error("Nature invalide (Avancement, Obstacle ou Annonce).");
  }
  const [sprint, item] = await Promise.all([
    prisma.sprint.findUnique({ where: { id: sprintId } }),
    backlogItemId ? prisma.backlogItem.findUnique({ where: { id: backlogItemId } }) : null,
  ]);
  if (!sprint || sprint.teamId !== teamId) throw new Error("Sprint introuvable.");
  // Verrou séquentiel : pas de note sur une étape encore verrouillée.
  // (On peut ne rien écrire dans une étape, mais on ne peut y écrire
  // qu'une fois déverrouillée — clôturez l'étape courante d'abord.)
  const { isStageUnlocked } = await import("@/lib/scrum-rules");
  const currentStage =
    (sprint as { currentStage?: string }).currentStage ?? "TODO";
  if (!isStageUnlocked(column, currentStage)) {
    throw new Error(
      `Étape ${column} verrouillée : clôturez l'étape ${currentStage} (bouton « Passer à l'étape suivante ») pour l'ouvrir.`,
    );
  }
  // Ticket optionnel : null = note d'étape (modale), sinon le ticket doit être du Sprint.
  if (backlogItemId && (!item || item.sprintId !== sprintId)) {
    throw new Error("Cet item n'appartient pas à ce Sprint.");
  }
  await prisma.dailyNote.create({
    data: {
      sprintId,
      backlogItemId,
      column,
      authorId: userId,
      text: clean,
      // Titre auto : "📅 Daily du 03/10/2026" (date système à la création).
      title: dailyNoteTitleFor(),
      nature,
    },
  });
  revalidatePath("/sprint");
  revalidatePath("/planning");
}

/**
 * Corrige le texte d'une note existante (Developers + Scrum Master + Admin).
 * Écrase l'ancien texte en conservant titre, date et nature initiales.
 */
export async function updateDailyNote(
  teamId: string,
  noteId: string,
  text: string,
): Promise<void> {
  const userId = await currentUserId();
  const guard = await guardWriteDailyNote(userId, teamId);
  if (!guard.ok) throw new Error(guard.message);
  const clean = text.trim().slice(0, 500);
  if (clean.length < 2) throw new Error("Note trop courte (2 caractères minimum).");
  const note = await prisma.dailyNote.findUnique({
    where: { id: noteId },
    include: { sprint: { select: { teamId: true } } },
  });
  if (!note || note.sprint.teamId !== teamId) throw new Error("Note introuvable.");
  await prisma.dailyNote.update({
    where: { id: noteId },
    data: { text: clean },
  });
  revalidatePath("/sprint");
  revalidatePath("/planning");
}
