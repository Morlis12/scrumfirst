"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { currentUserId } from "@/lib/context";
import {
  guardCloseBoardStage,
  guardManageBoard,
  guardMoveBoardItem,
  guardReopenBoardStage,
  guardReturnItemToBacklog,
} from "@/lib/scrum-guards";
import {
  BOARD_STAGE_ORDER,
  boardStageIndex,
  failedItemReturnStatus,
  isStageUnlocked,
  nextBoardStage,
} from "@/lib/scrum-rules";

/** Colonnes posables à la main (DONE atteignable uniquement depuis REVIEW). */
const MOVABLE_COLUMNS = ["TODO", "IN_PROGRESS", "REVIEW", "DONE"] as const;
export type MovableColumn = (typeof MOVABLE_COLUMNS)[number];

/**
 * Déplace un ticket vers une colonne du Kanban (flèches ou drag-and-drop).
 * Persiste `boardColumn` en base — DONE atteignable uniquement depuis REVIEW
 * (la validation DoD 100 % + commentaire se fait ensuite dans DONE).
 * Séquentiel : pas de saut d'étape (TODO → REVIEW ou TODO → DONE refusés)
 * et étape de destination obligatoirement déverrouillée.
 */
export async function moveBoardColumn(
  teamId: string,
  sprintId: string,
  itemId: string,
  column: string,
): Promise<void> {
  const userId = await currentUserId();
  if (!(MOVABLE_COLUMNS as readonly string[]).includes(column)) {
    throw new Error("Colonne invalide (TODO, IN_PROGRESS, REVIEW ou DONE).");
  }
  const guard = await guardMoveBoardItem(userId, teamId, sprintId, itemId, column);
  if (!guard.ok) throw new Error(guard.message);
  await prisma.backlogItem.update({
    where: { id: itemId },
    data: { boardColumn: column },
  });
  revalidatePath("/sprint");
}

export type AdvanceStageResult = {
  moved: number;
  promoted: number;
  blocked: number;
};

/**
 * Fait progresser le flux d'une étape vers la colonne suivante (Developers).
 * - TODO → IN_PROGRESS, IN_PROGRESS → REVIEW : déplacement en masse.
 * - REVIEW → DONE : fait passer les tickets dans la dernière étape ; la
 *   validation DoD (100 % des critères + commentaire obligatoire, qui classe
 *   l'item comme valide) se fait ensuite dans DONE, ticket par ticket.
 * Verrou séquentiel : l'étape de destination doit être déverrouillée
 * (clôturez l'étape courante d'abord — pas de saut d'étape).
 */
export async function advanceStage(
  teamId: string,
  sprintId: string,
  column: string,
): Promise<AdvanceStageResult> {
  const userId = await currentUserId();
  const board = await guardManageBoard(userId, teamId);
  if (!board.ok) throw new Error(board.message);
  const sprint = await prisma.sprint.findUnique({ where: { id: sprintId } });
  if (!sprint || sprint.teamId !== teamId) throw new Error("Sprint introuvable.");
  if (!(MOVABLE_COLUMNS as readonly string[]).includes(column)) {
    throw new Error("Étape invalide (TODO, IN_PROGRESS, REVIEW ou DONE).");
  }
  if (column === "DONE") throw new Error("DONE est la dernière étape : aucun passage suivant.");
  const currentStage =
    (sprint as { currentStage?: string }).currentStage ?? "TODO";

  const items = await prisma.backlogItem.findMany({
    where: { sprintId, boardColumn: column, status: { not: "DONE" }, increment: null },
    include: { doneChecks: { select: { criterionId: true } } },
  });
  if (items.length === 0) throw new Error("Aucun ticket à avancer sur cette étape.");

  const next = column === "TODO" ? "IN_PROGRESS" : column === "IN_PROGRESS" ? "REVIEW" : "DONE";
  if (!isStageUnlocked(next, currentStage)) {
    throw new Error(
      `Étape ${next} verrouillée : clôturez l'étape ${currentStage} (bouton « Passer à l'étape suivante » + synthèse de clôture) pour la déverrouiller — pas de saut d'étape.`,
    );
  }
  await prisma.backlogItem.updateMany({
    where: { id: { in: items.map((i) => i.id) } },
    data: { boardColumn: next },
  });
  revalidatePath("/sprint");
  return { moved: items.length, promoted: 0, blocked: 0 };
}

export type CloseStageResult = {
  closedStage: string;
  unlockedStage: string;
  summarySaved: boolean;
};

/**
 * Clôture l'étape courante et déverrouille la suivante (Developers).
 * - Un bouton par étape sauf DONE (dernière) : TODO → IN_PROGRESS →
 *   REVIEW → DONE, sans jamais sauter d'étape.
 * - Synthèse de clôture optionnelle : on peut ne rien écrire dans une
 *   étape, le clic sur le bouton suffit à passer à la phase suivante ;
 *   si une synthèse est saisie, elle est persistée et réaffichée.
 */
export async function closeStageAndUnlockNext(
  teamId: string,
  sprintId: string,
  stage: string,
  summary?: string,
): Promise<CloseStageResult> {
  const userId = await currentUserId();
  const guard = await guardCloseBoardStage(userId, teamId, sprintId, stage);
  if (!guard.ok) throw new Error(guard.message);
  const next = nextBoardStage(stage);
  if (!next) throw new Error("La dernière étape (DONE) n'a pas d'étape suivante.");
  const clean = (summary ?? "").trim().slice(0, 2000);

  const db = prisma as unknown as Record<string, unknown>;
  if (!db.sprintStageClosure) {
    throw new Error(
      "Client Prisma non régénéré : lancez `npx prisma generate --schema prisma/schema.prisma` puis redémarrez le serveur (`next dev`).",
    );
  }
  await (db.sprintStageClosure as {
    upsert: (args: unknown) => Promise<unknown>;
  }).upsert({
    where: { sprintId_stage: { sprintId, stage } },
    create: {
      sprintId,
      stage,
      summary: clean.length > 0 ? clean : null,
      closedById: userId,
    },
    update: {
      summary: clean.length > 0 ? clean : null,
      closedById: userId,
    },
  });
  await prisma.sprint.update({
    where: { id: sprintId },
    data: { currentStage: next } as unknown as Record<string, unknown> as never,
  });
  revalidatePath("/sprint");
  return { closedStage: stage, unlockedStage: next, summarySaved: clean.length > 0 };
}

/**
 * Met à jour la synthèse de clôture d'une étape déjà clôturée (Developers).
 * Ne change pas `currentStage` : réécriture de la synthèse uniquement.
 */
export async function updateStageSummary(
  teamId: string,
  sprintId: string,
  stage: string,
  summary: string,
): Promise<void> {
  const userId = await currentUserId();
  const board = await guardManageBoard(userId, teamId);
  if (!board.ok) throw new Error(board.message);
  const db = prisma as unknown as Record<string, unknown>;
  const closureDelegate = db.sprintStageClosure as
    | {
        findMany: (args: unknown) => Promise<unknown[]>;
        update: (args: unknown) => Promise<unknown>;
      }
    | undefined;
  if (!closureDelegate) {
    throw new Error(
      "Client Prisma non régénéré : lancez `npx prisma generate --schema prisma/schema.prisma` puis redémarrez le serveur.",
    );
  }
  const sprint = await prisma.sprint.findUnique({ where: { id: sprintId } });
  if (!sprint || sprint.teamId !== teamId) throw new Error("Sprint introuvable.");
  const existing = await closureDelegate.findMany({ where: { sprintId, stage } });
  if (existing.length === 0) {
    throw new Error(`Étape ${stage} non clôturée : utilisez le bouton « Passer à l'étape suivante ».`);
  }
  const clean = summary.trim().slice(0, 2000);
  await closureDelegate.update({
    where: { sprintId_stage: { sprintId, stage } },
    data: { summary: clean.length > 0 ? clean : null },
  });
  revalidatePath("/sprint");
}

/**
 * Réactivation d'une étape déjà clôturée (Developers).
 * - La séquence initiale reste verrouillée à l'aller (clôture une par une).
 * - Au retour, on peut revenir sur une étape passée (ex. revenir sur
 *   IN_PROGRESS depuis REVIEW/DONE) : `currentStage` recule et les
 *   clôtures de l'étape cible + suivantes sont supprimées.
 */
export async function reopenStage(
  teamId: string,
  sprintId: string,
  stage: string,
): Promise<{ reopenedStage: string }> {
  const userId = await currentUserId();
  void userId;
  const guard = await guardReopenBoardStage(userId, teamId, sprintId, stage);
  if (!guard.ok) throw new Error(guard.message);
  const db = prisma as unknown as Record<string, {
    deleteMany: (args: unknown) => Promise<unknown>;
  }>;
  const delegate = db.sprintStageClosure;
  if (!delegate) {
    throw new Error(
      "Client Prisma non régénéré : lancez `npx prisma generate --schema prisma/schema.prisma` puis redémarrez le serveur.",
    );
  }
  const targetIdx = boardStageIndex(stage);
  const stagesToDelete = (BOARD_STAGE_ORDER as readonly string[]).filter(
    (_, i) => i >= targetIdx,
  );
  await delegate.deleteMany({
    where: { sprintId, stage: { in: [...stagesToDelete] } },
  });
  await prisma.sprint.update({
    where: { id: sprintId },
    data: { currentStage: stage } as unknown as Record<string, unknown> as never,
  });
  revalidatePath("/sprint");
  return { reopenedStage: stage };
}

/**
 * Retour manuel d'un item non terminé vers le Product Backlog
 * (bouton « ↩ Retour backlog » dans DONE).
 * - Règle métier : l'item n'a pas atteint la DoD (cases partiellement
 *   cochées autorisées). S'il est coché à 100 %, la voie normale est la
 *   promotion en Increment (le retour reste possible tant que non promu).
 * - Effet : détaché du Sprint (`sprintId = null`), statut REFINED
 *   (affiné, plus « prêt »), colonne réinitialisée, checks DoD effacés
 *   (tentative de Sprint soldée). Il réapparaît dans le Product Backlog
 *   et redevient un choix du Sprint suivant seulement après ré-affinage
 *   → READY.
 */
export async function returnItemToBacklog(
  teamId: string,
  sprintId: string,
  itemId: string,
): Promise<void> {
  const userId = await currentUserId();
  const guard = await guardReturnItemToBacklog(userId, teamId, sprintId, itemId);
  if (!guard.ok) throw new Error(guard.message);
  await prisma.doneCheck.deleteMany({ where: { backlogItemId: itemId } });
  await prisma.backlogItem.update({
    where: { id: itemId },
    data: {
      status: failedItemReturnStatus(),
      sprintId: null,
      boardColumn: "TODO",
    },
  });
  revalidatePath("/sprint");
  revalidatePath("/planning");
  revalidatePath("/backlog");
  revalidatePath("/dod");
}
