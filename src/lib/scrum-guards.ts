/**
 * Gardes serveur adossées à la DB — source unique de vérité utilisée par
 * les Server Actions ET par le Route Handler de preuve `/api/scrum-guards`.
 */
import { prisma } from "@/lib/prisma";
import {
  Actor,
  GuardResult,
  OPEN_SPRINT_STATUSES,
  canCancelSprint,
  canCheckDod,
  canCommentOnSprint,
  canCreateBacklogItemDelegated,
  canCreateProductGoal,
  canCreateSprint,
  canEditSprintGoal,
  canManageDodCriteria,
  canManageEventTimer,
  canManageImprovement,
  canManageProductBacklog,
  canMarkItemReady,
  canModifySprintContent,
  canPlanSprint,
  canStartSprint,
  canTransitionItemStatus,
  checkDodComplete,
  failedItemReturnStatus,
  guardDodComplete,
  isOpenSprintStatus,
  validateSprintDates,
  SPRINT_STATUS,
} from "@/lib/scrum-rules";

export async function resolveProductActor(
  userId: string,
  productId: string,
): Promise<Actor> {
  const [membership, product, user] = await Promise.all([
    prisma.teamMembership.findFirst({
      where: { userId, team: { productId } },
      orderBy: { teamId: "asc" },
    }),
    prisma.product.findUnique({
      where: { id: productId },
      select: { productOwnerId: true },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { globalRole: true, email: true },
    }),
  ]);
  const teamRole = membership?.role ?? null;
  const participatesAsDeveloper =
    membership?.participatesAsDeveloper ?? false;
  return {
    userId,
    teamRole,
    participatesAsDeveloper,
    isProductOwner: product?.productOwnerId === userId,
    canActAsDeveloper:
      teamRole === "DEVELOPER" || participatesAsDeveloper,
    globalRole: user?.globalRole ?? null,
    email: user?.email ?? null,
  };
}

/** Création de produit : Admin/PO et Scrum Master uniquement (Dev/Stakeholder exclus). */
export async function guardCreateProduct(userId: string): Promise<GuardResult> {
  const [user, smMembership] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { globalRole: true, email: true },
    }),
    prisma.teamMembership.findFirst({
      where: { userId, role: "SCRUM_MASTER" },
      select: { id: true },
    }),
  ]);
  const { canCreateProductGlobal } = await import("@/lib/scrum-rules");
  return canCreateProductGlobal({
    globalRole: user?.globalRole ?? null,
    email: user?.email ?? null,
    hasScrumMasterMembership: smMembership != null,
  });
}

/** Construit un Actor d'équipe avec propriété produit + identité globale (PO résolu). */
async function resolveTeamActor(
  userId: string,
  teamId: string,
): Promise<Actor & { productId: string | null }> {
  const [membership, team, user] = await Promise.all([
    prisma.teamMembership.findUnique({
      where: { userId_teamId: { userId, teamId } },
    }),
    prisma.team.findUnique({
      where: { id: teamId },
      select: { productId: true, product: { select: { productOwnerId: true } } },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { globalRole: true, email: true },
    }),
  ]);
  const teamRole = membership?.role ?? null;
  const participatesAsDeveloper = membership?.participatesAsDeveloper ?? false;
  return {
    userId,
    teamRole,
    participatesAsDeveloper,
    isProductOwner: team?.product.productOwnerId === userId,
    canActAsDeveloper:
      teamRole === "DEVELOPER" || participatesAsDeveloper,
    globalRole: user?.globalRole ?? null,
    email: user?.email ?? null,
    productId: team?.productId ?? null,
  };
}

/** Équipe du produit où l'utilisateur est membre (préfère une équipe DEV/SM/PO). */
export async function teamIdForProductUser(
  userId: string,
  productId: string,
) {
  const m = await prisma.teamMembership.findFirst({
    where: { userId, team: { productId } },
    select: { teamId: true },
  });
  return m?.teamId ?? null;
}

// ---------- Séquence stricte des Sprints & fin par time-box ----------

/** Le plus ancien Sprint encore ouvert de l'équipe (hors `excludeSprintId`). */
export async function findOldestOpenSprint(
  teamId: string,
  excludeSprintId?: string,
) {
  return prisma.sprint.findFirst({
    where: {
      teamId,
      status: { in: [...OPEN_SPRINT_STATUSES] },
      ...(excludeSprintId ? { id: { not: excludeSprintId } } : {}),
    },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Verrouillage du "Sprint suivant" : impossible de créer, démarrer, modifier
 * ou alimenter un Sprint tant qu'un Sprint précédent n'est pas officiellement CLOSED.
 * Seul un précédent encore ouvert bloque (un Sprint plus récent ne verrouille jamais l'actuel).
 */
export async function guardSprintSequence(
  teamId: string,
  targetSprintId?: string,
): Promise<GuardResult> {
  if (!targetSprintId) {
    const open = await findOldestOpenSprint(teamId);
    return canCreateSprint(open);
  }
  const target = await prisma.sprint.findUnique({
    where: { id: targetSprintId },
    select: { id: true, status: true, createdAt: true },
  });
  if (!target) return canCreateSprint(await findOldestOpenSprint(teamId));
  const olderOpen = await prisma.sprint.findFirst({
    where: {
      teamId,
      status: { in: [...OPEN_SPRINT_STATUSES] },
      createdAt: { lt: target.createdAt },
    },
    orderBy: { createdAt: "asc" },
  });
  return canModifySprintContent(target, olderOpen);
}

/** Création du Sprint N+1 bloquée si un Sprint est encore ouvert. */
export async function guardCreateSprint(teamId: string): Promise<GuardResult> {
  const open = await findOldestOpenSprint(teamId);
  return canCreateSprint(open);
}

/**
 * Fonction de validation demandée : bloque le démarrage d'un Sprint
 * si le précédent n'est pas clôturé (adossée DB, réutilise la règle pure).
 */
export async function guardStartSprint(
  teamId: string,
  sprintId: string,
): Promise<GuardResult> {
  const sprint = await prisma.sprint.findUnique({ where: { id: sprintId } });
  if (!sprint || sprint.teamId !== teamId)
    return { ok: false, code: "SPRINT_NOT_FOUND", message: "Sprint introuvable." };
  const previous = await findOldestOpenSprint(teamId, sprintId);
  return canStartSprint(previous);
}

async function returnSprintUnfinishedItems(sprintId: string) {
  // Impondérables de fin de Sprint : les items sans Increment (DoD < 100 %)
  // sortent du Sprint et retournent au Product Backlog pour réévaluation.
  const unfinished = await prisma.backlogItem.findMany({
    where: { sprintId, status: "IN_SPRINT", increment: null },
    select: { id: true },
  });
  if (!unfinished.length) return 0;
  await prisma.backlogItem.updateMany({
    where: { id: { in: unfinished.map((i) => i.id) } },
    data: { status: failedItemReturnStatus(), sprintId: null },
  });
  return unfinished.length;
}

/**
 * Clôture automatique des Sprints dont la time-box est écoulée :
 * les items validés DoD restent (Incréments du Sprint), les autres
 * retournent au Product Backlog. Retourne le nombre de Sprints clôturés.
 */
export async function autoCloseExpiredSprints(
  teamId: string,
  now: Date = new Date(),
): Promise<{ closed: number; returned: number }> {
  const expired = await prisma.sprint.findMany({
    where: {
      teamId,
      status: { in: [...OPEN_SPRINT_STATUSES] },
      endDate: { lte: now },
    },
    select: { id: true },
  });
  let returned = 0;
  for (const s of expired) {
    returned += await returnSprintUnfinishedItems(s.id);
    await prisma.sprint.update({
      where: { id: s.id },
      data: { status: "CLOSED", closedAt: now, goalLockedAt: now },
    });
  }
  return { closed: expired.length, returned };
}

// ---------- Product Backlog & Goal ----------

export async function guardCreateItem(
  userId: string,
  productId: string,
  delegatedById?: string | null,
): Promise<GuardResult> {
  const actor = await resolveProductActor(userId, productId);
  return canCreateBacklogItemDelegated(actor, delegatedById);
}

export async function guardReorderBacklog(
  userId: string,
  productId: string,
): Promise<GuardResult> {
  const actor = await resolveProductActor(userId, productId);
  return canManageProductBacklog(actor);
}

export async function guardItemStatus(
  userId: string,
  productId: string,
  from: string,
  to: string,
  estimate?: { storyPoints?: number | null; fitsInOneSprint?: boolean },
): Promise<GuardResult> {
  const actor = await resolveProductActor(userId, productId);
  // La légalité de la transition prime : une transition impossible est
  // rejetée quel que soit le rôle (message explicite, pas de fuite de rôle).
  const transition = canTransitionItemStatus(from, to);
  if (!transition.ok) return transition;
  // Items du Product Backlog : Product Owner uniquement (création, ordre,
  // affinage, estimation Story Points, passage READY). Developer exclu.
  // (Le tirage en Sprint et la promotion utilisent leurs propres gardes.)
  if (to === "READY") {
    const estimateGuard = canMarkItemReady({
      storyPoints: estimate?.storyPoints ?? null,
      fitsInOneSprint: estimate?.fitsInOneSprint ?? false,
    });
    if (!estimateGuard.ok) return estimateGuard;
    return canManageProductBacklog(actor);
  }
  return canManageProductBacklog(actor);
}

export async function guardCreateGoal(
  userId: string,
  productId: string,
): Promise<GuardResult & { activeCount?: number }> {
  const actor = await resolveProductActor(userId, productId);
  const po = canManageProductBacklog(actor);
  if (!po.ok) return po;
  const activeCount = await prisma.productGoal.count({
    where: { productId, status: "ACTIVE" },
  });
  const single = canCreateProductGoal(activeCount);
  if (!single.ok) return single;
  return { ok: true };
}

// ---------- Sprint ----------

export async function guardPullItemToSprint(
  userId: string,
  teamId: string,
  sprintId: string,
  itemId: string,
): Promise<GuardResult> {
  const [actor, sprint, item] = await Promise.all([
    resolveTeamActor(userId, teamId),
    prisma.sprint.findUnique({ where: { id: sprintId } }),
    prisma.backlogItem.findUnique({ where: { id: itemId } }),
  ]);
  // Planification collective : PO, SM et Dev peuvent tirer un item READY.
  const team = canPlanSprint(actor);
  if (!team.ok) return team;
  if (!sprint || sprint.teamId !== teamId)
    return { ok: false, code: "SPRINT_NOT_FOUND", message: "Sprint introuvable." };
  if (sprint.status !== SPRINT_STATUS.PLANNING && sprint.status !== SPRINT_STATUS.ACTIVE)
    return { ok: false, code: "SPRINT_CLOSED", message: "Sprint clôturé : tirage impossible." };
  // Séquence stricte : pas d'ajout dans le Sprint suivant si un précédent est ouvert.
  const seq = await guardSprintSequence(teamId, sprintId);
  if (!seq.ok) return seq;
  if (!item)
    return { ok: false, code: "ITEM_NOT_FOUND", message: "Item introuvable." };
  if (item.status !== "READY")
    return { ok: false, code: "ITEM_NOT_READY", message: "Seul un item 'prêt' peut entrer en Sprint." };
  return { ok: true };
}

/**
 * Gestion quotidienne du tableau Kanban : Developers ou membre qui participe
 * comme Developer (même règle que `canManageBoard` sur /sprint).
 */
export async function guardManageBoard(
  userId: string,
  teamId: string,
): Promise<GuardResult> {
  const membership = await prisma.teamMembership.findUnique({
    where: { userId_teamId: { userId, teamId } },
  });
  const managesBoard =
    membership?.role === "DEVELOPER" || membership?.participatesAsDeveloper === true;
  if (!managesBoard)
    return { ok: false, code: "DEVELOPER_ONLY_BOARD", message: "Gestion quotidienne du tableau réservée aux Developers." };
  return { ok: true };
}

/**
 * Déplacement d'un ticket sur le Kanban du Suivi Sprint (TODO → IN_PROGRESS → REVIEW).
 * Gestion quotidienne réservée aux Developers (ou membre qui participe comme Developer).
 * La colonne DONE est exclue : seul `promoteToIncrement` (DoD 100 %) y fait entrer.
 * Séquentiel : pas de saut d'étape (TODO → REVIEW interdit) et destination
 * obligatoirement déverrouillée (<= Sprint.currentStage).
 */
export async function guardMoveBoardItem(
  userId: string,
  teamId: string,
  sprintId: string,
  itemId: string,
  targetColumn?: string,
): Promise<GuardResult> {
  const board = await guardManageBoard(userId, teamId);
  if (!board.ok) return board;
  const [sprint, item] = await Promise.all([
    prisma.sprint.findUnique({ where: { id: sprintId } }),
    prisma.backlogItem.findUnique({
      where: { id: itemId },
      include: { increment: { select: { id: true } } },
    }),
  ]);
  if (!sprint || sprint.teamId !== teamId)
    return { ok: false, code: "SPRINT_NOT_FOUND", message: "Sprint introuvable." };
  if (!isOpenSprintStatus(sprint.status))
    return { ok: false, code: "SPRINT_CLOSED", message: "Sprint clôturé : tableau figé." };
  if (!item || item.sprintId !== sprintId)
    return { ok: false, code: "ITEM_NOT_IN_SPRINT", message: "Cet item n'appartient pas à ce Sprint." };
  if (item.status === "DONE" || item.increment)
    return { ok: false, code: "ALREADY_DONE", message: "Item déjà en DONE (Incrément livré) : déplacement impossible." };
  if (targetColumn != null) {
    const { canMoveBoardItemTo } = await import("@/lib/scrum-rules");
    const currentStage =
      (sprint as { currentStage?: string }).currentStage ?? "TODO";
    const move = canMoveBoardItemTo(item.boardColumn, targetColumn, currentStage);
    if (!move.ok) return move;
  }
  return { ok: true };
}

/**
 * Clôture d'une étape du Suivi Sprint + déverrouillage de la suivante.
 * Réservée aux Developers (gestion quotidienne). Une seule étape clôturable
 * à la fois : l'étape courante (`Sprint.currentStage`), sauf DONE (dernière).
 * La synthèse de clôture est optionnelle (peut être vide).
 */
export async function guardCloseBoardStage(
  userId: string,
  teamId: string,
  sprintId: string,
  stage: string,
): Promise<GuardResult> {
  const board = await guardManageBoard(userId, teamId);
  if (!board.ok) return board;
  const sprint = await prisma.sprint.findUnique({ where: { id: sprintId } });
  if (!sprint || sprint.teamId !== teamId)
    return { ok: false, code: "SPRINT_NOT_FOUND", message: "Sprint introuvable." };
  if (!isOpenSprintStatus(sprint.status))
    return { ok: false, code: "SPRINT_CLOSED", message: "Sprint clôturé : tableau figé." };
  const { canCloseBoardStage } = await import("@/lib/scrum-rules");
  const currentStage =
    (sprint as { currentStage?: string }).currentStage ?? "TODO";
  return canCloseBoardStage(stage, currentStage);
}

export async function guardEditSprintGoal(
  userId: string,
  teamId: string,
  sprintId: string,
): Promise<GuardResult> {
  const sprint = await prisma.sprint.findUnique({ where: { id: sprintId } });
  if (!sprint)
    return { ok: false, code: "SPRINT_NOT_FOUND", message: "Sprint introuvable." };
  // Séquence stricte : pas de modification du Sprint suivant si un précédent est ouvert.
  const seq = await guardSprintSequence(teamId, sprintId);
  if (!seq.ok) return seq;
  const actor = await resolveTeamActor(userId, teamId);
  // Sprint Goal défini collectivement (PO, SM, Dev) pendant la Planning ouverte.
  const team = canPlanSprint(actor);
  if (!team.ok) return team;
  return canEditSprintGoal({ status: sprint.status, goalLockedAt: sprint.goalLockedAt });
}

export async function guardCancelSprint(
  userId: string,
  sprintId: string,
  reason: string,
): Promise<GuardResult> {
  const sprint = await prisma.sprint.findUnique({
    where: { id: sprintId },
    include: { team: { select: { productId: true } } },
  });
  if (!sprint)
    return { ok: false, code: "SPRINT_NOT_FOUND", message: "Sprint introuvable." };
  const actor = await resolveProductActor(userId, sprint.team.productId);
  return canCancelSprint(actor, reason);
}

export function guardSprintDates(start: Date, end: Date): GuardResult {
  return validateSprintDates(start, end);
}

// ---------- DoD & Increment ----------

export async function guardManageDodCriteria(
  userId: string,
  productId: string,
): Promise<GuardResult> {
  const actor = await resolveProductActor(userId, productId);
  return canManageDodCriteria(actor);
}

export async function guardCheckDod(
  userId: string,
  productId: string,
): Promise<GuardResult> {
  const actor = await resolveProductActor(userId, productId);
  return canCheckDod(actor);
}

export async function guardPromoteToIncrement(
  userId: string,
  itemId: string,
): Promise<GuardResult & { missing?: string[] }> {
  const item = await prisma.backlogItem.findUnique({
    where: { id: itemId },
    include: {
      product: { select: { id: true } },
      doneChecks: { select: { criterionId: true } },
      sprint: { select: { id: true } },
    },
  });
  if (!item)
    return { ok: false, code: "ITEM_NOT_FOUND", message: "Item introuvable." };
  if (!item.sprintId)
    return { ok: false, code: "NOT_IN_SPRINT", message: "Item hors Sprint." };
  // Séquentiel : validation finale en DONE uniquement (le ticket y arrive
  // via REVIEW → DONE, pas de saut TODO → DONE). La DoD se coche dans DONE.
  if (item.boardColumn !== "REVIEW" && item.boardColumn !== "DONE" && item.status !== "DONE") {
    return {
      ok: false,
      code: "STAGE_SKIP_FORBIDDEN",
      message: `Saut d'étape interdit : avancez le ticket en REVIEW puis en DONE avant validation (actuellement en ${item.boardColumn}).`,
    };
  }
  // REVIEW doit être déverrouillée (clôturez les étapes précédentes d'abord).
  if (item.sprintId) {
    const sprint = await prisma.sprint.findUnique({ where: { id: item.sprintId } });
    const currentStage =
      (sprint as unknown as { currentStage?: string } | null)?.currentStage ?? "TODO";
    const { isStageUnlocked } = await import("@/lib/scrum-rules");
    if (!isStageUnlocked("REVIEW", currentStage)) {
      return {
        ok: false,
        code: "STAGE_LOCKED",
        message: `Étape REVIEW verrouillée : clôturez l'étape ${currentStage} d'abord (pas de saut d'étape).`,
      };
    }
  }
  const actor = await resolveProductActor(userId, item.product.id);
  // Promotion collective Scrum Team (PO, SM, Dev) — le passage à DONE exige
  // toujours 100 % de la DoD (vérifié ci-dessous).
  const team = canCheckDod(actor);
  if (!team.ok) return team;
  const active = await prisma.doneCriterion.findMany({
    where: { productId: item.product.id, active: true },
    select: { id: true },
  });
  const res = checkDodComplete(
    active.map((c) => c.id),
    item.doneChecks.map((c) => c.criterionId),
  );
  if (!res.complete) {
    const g = guardDodComplete(
      active.map((c) => c.id),
      item.doneChecks.map((c) => c.criterionId),
    );
    return { ...g, missing: res.missing };
  }
  return { ok: true };
}

/** Clôture : retourne les items non terminés au Product Backlog (affinés). */
export function failedReturnStatus() {
  return failedItemReturnStatus();
}

// ---------- Événements / Rétro / Obstacles / Commentaires ----------

export async function guardEventTimer(
  userId: string,
  teamId: string,
  eventId: string,
  action: "start" | "stop" | "adjust" | "complete",
): Promise<GuardResult> {
  const [membership, event] = await Promise.all([
    prisma.teamMembership.findUnique({
      where: { userId_teamId: { userId, teamId } },
    }),
    prisma.scrumEvent.findUnique({
      where: { id: eventId },
      include: { sprint: { select: { teamId: true } } },
    }),
  ]);
  const actor: Actor = {
    userId,
    teamRole: membership?.role ?? null,
    participatesAsDeveloper: membership?.participatesAsDeveloper ?? false,
    isProductOwner: false,
    canActAsDeveloper: membership?.role === "DEVELOPER",
  };
  const sm = canManageEventTimer(actor);
  if (!sm.ok) return sm;
  if (!event || event.sprint.teamId !== teamId)
    return { ok: false, code: "EVENT_NOT_FOUND", message: "Événement introuvable." };
  if (action === "start" && event.startedAt && !event.endedAt)
    return { ok: false, code: "ALREADY_STARTED", message: "Chronomètre déjà en cours." };
  if (action === "stop" && (!event.startedAt || event.endedAt))
    return { ok: false, code: "NOT_RUNNING", message: "Chronomètre non démarré." };
  // Déplacement manuel du curseur : uniquement sur un chrono non figé
  // (en cours ou non démarré) et une étape non marquée comme faite.
  if (action === "adjust" && event.completed)
    return { ok: false, code: "ALREADY_COMPLETED", message: "Étape déjà marquée comme faite — relancez le chrono pour la rouvrir." };
  if (action === "adjust" && event.endedAt)
    return { ok: false, code: "TIMER_STOPPED", message: "Chrono stoppé — relancez-le pour ajuster le curseur." };
  // Remplissage d'un coup : marque l'étape comme faite (quel que soit l'état du chrono).
  if (action === "complete" && event.completed)
    return { ok: false, code: "ALREADY_COMPLETED", message: "Étape déjà marquée comme faite." };
  return { ok: true };
}

export async function guardImprovement(
  userId: string,
  teamId: string,
): Promise<GuardResult> {
  const membership = await prisma.teamMembership.findUnique({
    where: { userId_teamId: { userId, teamId } },
  });
  const actor: Actor = {
    userId,
    teamRole: membership?.role ?? null,
    participatesAsDeveloper: membership?.participatesAsDeveloper ?? false,
    isProductOwner: false,
    canActAsDeveloper: false,
  };
  return canManageImprovement(actor);
}

export async function guardComment(
  userId: string,
  teamId: string,
  sprintId: string,
): Promise<GuardResult> {
  const [membership, sprint] = await Promise.all([
    prisma.teamMembership.findUnique({
      where: { userId_teamId: { userId, teamId } },
    }),
    prisma.sprint.findUnique({ where: { id: sprintId } }),
  ]);
  if (!sprint)
    return { ok: false, code: "SPRINT_NOT_FOUND", message: "Sprint introuvable." };
  const actor: Actor = {
    userId,
    teamRole: membership?.role ?? null,
    participatesAsDeveloper: membership?.participatesAsDeveloper ?? false,
    isProductOwner: false,
    canActAsDeveloper: false,
  };
  return canCommentOnSprint(actor, sprint.status);
}
