/**
 * Règles Scrum (Scrum Guide 2020) encodées comme contraintes pures.
 * Aucune I/O ici : testable sans base, réutilisé par les Server Actions
 * et le Route Handler de preuve `/api/scrum-guards`.
 */

export const TEAM_ROLES = {
  PRODUCT_OWNER: "PRODUCT_OWNER",
  DEVELOPER: "DEVELOPER",
  SCRUM_MASTER: "SCRUM_MASTER",
  STAKEHOLDER: "STAKEHOLDER",
} as const;
export type TeamRole = (typeof TEAM_ROLES)[keyof typeof TEAM_ROLES];

export const ITEM_STATUS = {
  RAW: "RAW", // brut
  REFINED: "REFINED", // affiné
  READY: "READY", // prêt
  IN_SPRINT: "IN_SPRINT",
  DONE: "DONE",
} as const;
export type ItemStatus = (typeof ITEM_STATUS)[keyof typeof ITEM_STATUS];

export const GOAL_STATUS = {
  ACTIVE: "ACTIVE",
  ACHIEVED: "ACHIEVED",
  ABANDONED: "ABANDONED",
} as const;

export const SPRINT_STATUS = {
  PLANNING: "PLANNING",
  ACTIVE: "ACTIVE",
  REVIEW: "REVIEW",
  CLOSED: "CLOSED",
  CANCELLED: "CANCELLED",
} as const;
export type SprintStatus = (typeof SPRINT_STATUS)[keyof typeof SPRINT_STATUS];

export const EVENT_TYPES = {
  SPRINT_PLANNING: "SPRINT_PLANNING",
  DAILY_SCRUM: "DAILY_SCRUM",
  SPRINT_REVIEW: "SPRINT_REVIEW",
  SPRINT_RETROSPECTIVE: "SPRINT_RETROSPECTIVE",
} as const;
export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];

/** Ordre chronologique Scrum : Planning → Daily → Review → Rétrospective (dernière étape). */
export const EVENT_ORDER: readonly string[] = [
  EVENT_TYPES.SPRINT_PLANNING,
  EVENT_TYPES.DAILY_SCRUM,
  EVENT_TYPES.SPRINT_REVIEW,
  EVENT_TYPES.SPRINT_RETROSPECTIVE,
] as const;

export function compareEventsByScrumOrder(a: { type: string }, b: { type: string }): number {
  return EVENT_ORDER.indexOf(a.type) - EVENT_ORDER.indexOf(b.type);
}

export type GuardResult =
  | { ok: true }
  | { ok: false; code: string; message: string };

const deny = (code: string, message: string): GuardResult => ({
  ok: false,
  code,
  message,
});
const allow = (): GuardResult => ({ ok: true });

export type Actor = {
  userId: string;
  /** Rôle dans l'équipe concernée (null = pas membre). */
  teamRole: string | null;
  /** PO/SM qui participe comme Developer sur ce Sprint. */
  participatesAsDeveloper: boolean;
  /** Est le Product Owner du produit concerné. */
  isProductOwner: boolean;
  /** Peut agir comme Developer (rôle DEV ou participation active). */
  canActAsDeveloper: boolean;
  /** Rôle global (ADMIN / MEMBER) — null si inconnu. */
  globalRole?: string | null;
  /** Email — permet de reconnaître l'Admin/PO de référence. */
  email?: string | null;
};

/** Admin applicatif : globalRole ADMIN ou compte Admin/PO de référence. */
export function isAdminActor(actor: Actor): boolean {
  return actor.globalRole === "ADMIN" || actor.email === "admin@scrumfirst.local";
}

/** Product Owner : propriétaire du produit ou rôle PO en équipe (ou Admin). */
export function isPOActor(actor: Actor): boolean {
  return (
    isAdminActor(actor) ||
    actor.isProductOwner ||
    actor.teamRole === TEAM_ROLES.PRODUCT_OWNER
  );
}

/** Membre de la Scrum Team : PO, SM, Dev (ou Admin) — Stakeholder exclu. */
export function isScrumTeamActor(actor: Actor): boolean {
  if (isAdminActor(actor)) return true;
  if (actor.isProductOwner) return true;
  return (
    actor.teamRole === TEAM_ROLES.PRODUCT_OWNER ||
    actor.teamRole === TEAM_ROLES.DEVELOPER ||
    actor.teamRole === TEAM_ROLES.SCRUM_MASTER ||
    actor.canActAsDeveloper
  );
}

/** Création de produit : Admin/PO et Scrum Master uniquement (Dev/Stakeholder exclus). */
export function canCreateProductGlobal(input: {
  globalRole: string | null | undefined;
  email: string | null | undefined;
  hasScrumMasterMembership: boolean;
}): GuardResult {
  if (input.globalRole === "ADMIN") return allow();
  if (input.email === "admin@scrumfirst.local") return allow();
  if (input.hasScrumMasterMembership) return allow();
  return deny(
    "PRODUCT_CREATE_RESTRICTED",
    "Création de produit réservée à l'Admin/Product Owner et au Scrum Master.",
  );
}

/** Planification collective : PO, SM et Dev (Stakeholder exclu). */
export function canPlanSprint(actor: Actor): GuardResult {
  if (!isScrumTeamActor(actor)) {
    return deny(
      "PLANNING_TEAM_ONLY",
      "Planification réservée à la Scrum Team (PO, Scrum Master, Developers).",
    );
  }
  return allow();
}

/** 1. Product Backlog / Product Goal / annulation : Admin/PO uniquement. */
export function canManageProductBacklog(actor: Actor): GuardResult {
  if (isPOActor(actor)) return allow();
  return deny(
    "PO_ONLY",
    "Seul le Product Owner peut gérer le Product Backlog, le Product Goal et annuler un Sprint.",
  );
}

/**
 * Création d'items du Product Backlog : Product Owner uniquement.
 * Aucune saisie déléguée : le Developer,
 * le Scrum Master et le Stakeholder sont formellement exclus.
 */
export function canCreateBacklogItemDelegated(
  actor: Actor,
  delegatedById: string | null | undefined,
): GuardResult {
  void delegatedById;
  if (isPOActor(actor)) return allow();
  return deny(
    "PO_ONLY",
    "Création d'items du Product Backlog réservée au Product Owner.",
  );
}

/** 2. Sprint Backlog : Developers uniquement (PO/SM exclus sauf participation active). */
export function canEditSprintBacklog(actor: Actor): GuardResult {
  if (actor.canActAsDeveloper) return allow();
  return deny(
    "DEVELOPERS_ONLY",
    "Sprint Backlog éditable uniquement par les Developers (le PO et le SM n'ont aucun droit sauf 'participe comme Developer').",
  );
}

/** Estimation / dimensionnement : Developers uniquement. */
export function canEstimateItem(actor: Actor): GuardResult {
  return canEditSprintBacklog(actor);
}

/** Cocher la DoD : tout membre de la Scrum Team (PO, SM, Dev). Stakeholder exclu. */
export function canCheckDod(actor: Actor): GuardResult {
  if (isScrumTeamActor(actor)) return allow();
  return deny(
    "SCRUM_TEAM_ONLY_DOD",
    "Seuls les membres de la Scrum Team (PO, Scrum Master, Developers) peuvent cocher les critères de la Definition of Done.",
  );
}

/** Checklist DoD globale : Admin/PO + Scrum Master uniquement. Developer formellement exclu. */
export function canManageDodCriteria(actor: Actor): GuardResult {
  if (isAdminActor(actor)) return allow();
  if (actor.isProductOwner) return allow();
  if (actor.teamRole === TEAM_ROLES.PRODUCT_OWNER) return allow();
  if (actor.teamRole === TEAM_ROLES.SCRUM_MASTER) return allow();
  return deny(
    "DOD_MANAGE_RESTRICTED",
    "Configuration de la checklist DoD réservée à l'Admin/Product Owner et au Scrum Master (Developer exclu).",
  );
}

/** 3. Chronos des événements : Scrum Master uniquement. */
export function canManageEventTimer(actor: Actor): GuardResult {
  if (actor.teamRole === TEAM_ROLES.SCRUM_MASTER) return allow();
  return deny(
    "SM_ONLY_TIMER",
    "Seul le Scrum Master peut déclencher / stopper les chronomètres des événements.",
  );
}

/** Actions d'amélioration (rétro) + obstacles : Scrum Team au complet (PO, SM, Dev). Stakeholder exclu. */
export function canManageImprovement(actor: Actor): GuardResult {
  if (isScrumTeamActor(actor)) return allow();
  return deny(
    "SCRUM_TEAM_ONLY_RETRO",
    "Rétrospective réservée à la Scrum Team au complet (PO, Scrum Master, Developers).",
  );
}

/** Colonnes du tableau de brainstorming Rétrospective (post-its). */
export const RETRO_IDEA_COLUMNS = ["WENT_WELL", "TO_IMPROVE", "IDEAS"] as const;
export type RetroIdeaColumn = (typeof RETRO_IDEA_COLUMNS)[number];

/**
 * Post-it de Rétrospective : Scrum Team au complet en écriture
 * (Stakeholder exclu, lecture seule). Texte court 2–500 caractères
 * dans une colonne valide.
 */
export function canPostRetroIdea(actor: Actor, column: string, text: string): GuardResult {
  if (!isScrumTeamActor(actor)) {
    return deny(
      "SCRUM_TEAM_ONLY_RETRO",
      "Rétrospective réservée à la Scrum Team au complet (PO, Scrum Master, Developers).",
    );
  }
  if (!(RETRO_IDEA_COLUMNS as readonly string[]).includes(column)) {
    return deny("INVALID_COLUMN", "Colonne invalide (WENT_WELL, TO_IMPROVE ou IDEAS).");
  }
  if (text.trim().length < 2 || text.trim().length > 500) {
    return deny("IDEA_TEXT_INVALID", "Idée trop courte (2 caractères minimum, 500 maximum).");
  }
  return allow();
}

/**
 * Plan d'actions officiel : le Scrum Master ou le PO (ou Admin) crée
 * l'action d'amélioration avec son Responsable. Developer/Stakeholder exclus.
 */
export function canPlanRetroAction(actor: Actor): GuardResult {
  if (isAdminActor(actor)) return allow();
  if (actor.isProductOwner) return allow();
  if (actor.teamRole === TEAM_ROLES.PRODUCT_OWNER) return allow();
  if (actor.teamRole === TEAM_ROLES.SCRUM_MASTER) return allow();
  return deny(
    "SM_PO_ONLY_ACTION",
    "Création d'une action d'amélioration réservée au Scrum Master et au Product Owner.",
  );
}

/**
 * Session de Sprint Review — retours Stakeholders/Clients : ÉCRITURE
 * STAKEHOLDER UNIQUEMENT. Règle inversée par rapport au reste de l'app :
 * la Scrum Team (admin, dev, sm) lit les retours clients en lecture seule,
 * sans pouvoir les modifier ni les supprimer.
 */
export function canPostStakeholderFeedback(actor: Actor, sprintStatus: string): GuardResult {
  if (actor.teamRole !== TEAM_ROLES.STAKEHOLDER) {
    return deny(
      "STAKEHOLDER_WRITE_ONLY",
      "Retours clients réservés au Stakeholder en écriture : la Scrum Team lit en lecture seule.",
    );
  }
  if (sprintStatus !== SPRINT_STATUS.ACTIVE && sprintStatus !== SPRINT_STATUS.REVIEW) {
    return deny(
      "SPRINT_NOT_OPEN_FOR_COMMENTS",
      "Retours possibles uniquement pendant le Sprint (ACTIVE/REVIEW).",
    );
  }
  return allow();
}

/**
 * Sprint Review : accès à tous, mais Stakeholder en LECTURE SEULE absolue
 * (aucune action/modification). Les membres de la Scrum Team commentent
 * pendant ACTIVE/REVIEW.
 */
export function canCommentOnSprint(
  actor: Actor,
  sprintStatus: string,
): GuardResult {
  if (actor.teamRole === TEAM_ROLES.STAKEHOLDER) {
    return deny(
      "STAKEHOLDER_READ_ONLY",
      "Stakeholder en lecture seule : observation de l'Incrément, aucune action ou modification.",
    );
  }
  if (!isScrumTeamActor(actor)) {
    return deny("NOT_A_MEMBER", "Réservé aux membres de la Scrum Team.");
  }
  if (
    sprintStatus === SPRINT_STATUS.ACTIVE ||
    sprintStatus === SPRINT_STATUS.REVIEW
  ) {
    return allow();
  }
  return deny(
    "SPRINT_NOT_OPEN_FOR_COMMENTS",
    "Commentaires possibles uniquement pendant le Sprint (ACTIVE/REVIEW).",
  );
}

/** Un seul Product Goal actif par produit. */
export function canCreateProductGoal(activeGoalCount: number): GuardResult {
  if (activeGoalCount > 0) {
    return deny(
      "SINGLE_ACTIVE_GOAL",
      "Un seul Product Goal actif à la fois : marquez le précédent 'atteint' ou 'abandonné' d'abord.",
    );
  }
  return allow();
}

/**
 * Passage à READY (prêt) bloqué si l'item ne tient pas en un Sprint :
 * exige une estimation (storyPoints) ET un flag fitsInOneSprint.
 */
export function canMarkItemReady(input: {
  storyPoints: number | null | undefined;
  fitsInOneSprint: boolean;
}): GuardResult {
  if (input.storyPoints == null) {
    return deny(
      "READY_REQUIRES_ESTIMATE",
      "Un item ne passe 'prêt' que s'il est estimé par les Developers.",
    );
  }
  if (!input.fitsInOneSprint) {
    return deny(
      "READY_REQUIRES_FITS_IN_SPRINT",
      "Un item ne passe 'prêt' que s'il peut être réalisé en un seul Sprint.",
    );
  }
  return allow();
}

const ITEM_TRANSITIONS: Record<string, string[]> = {
  RAW: ["REFINED"],
  REFINED: ["READY", "RAW"],
  READY: ["IN_SPRINT", "REFINED"],
  IN_SPRINT: ["DONE", "REFINED"], // DONE via DoD+Increment ; REFINED = retour auto si DoD échouée
  DONE: [],
};

export function canTransitionItemStatus(
  from: string,
  to: string,
): GuardResult {
  const allowed = ITEM_TRANSITIONS[from] ?? [];
  if (allowed.includes(to)) return allow();
  return deny(
    "ILLEGAL_TRANSITION",
    `Transition interdite : ${from} → ${to}.`,
  );
}

/** Objectif de Sprint verrouillé dès la fin de la Planning (sauf annulation PO). */
export function canEditSprintGoal(input: {
  status: string;
  goalLockedAt: Date | string | null;
}): GuardResult {
  if (
    input.status !== SPRINT_STATUS.PLANNING ||
    input.goalLockedAt != null
  ) {
    return deny(
      "SPRINT_GOAL_LOCKED",
      "Objectif de Sprint verrouillé après la Sprint Planning (modification impossible pendant le Sprint).",
    );
  }
  return allow();
}

/** Annulation de Sprint : PO uniquement + note de recadrage. */
export function canCancelSprint(
  actor: Actor,
  cancelledReason: string | null | undefined,
): GuardResult {
  const po = canManageProductBacklog(actor);
  if (!po.ok) return po;
  if (!cancelledReason?.trim()) {
    return deny(
      "CANCEL_REQUIRES_REASON",
      "L'annulation du Sprint exige une note de recadrage du PO.",
    );
  }
  return allow();
}

/** Timeboxes au prorata (Scrum Guide 2020, base 4 semaines). */
export function computeTimeboxes(sprintDays: number): {
  planningMinutes: number;
  dailyMinutes: number;
  reviewMinutes: number;
  retrospectiveMinutes: number;
} {
  const weeks = Math.max(sprintDays / 7, 0);
  const roundQuarter = (m: number) => Math.round(m / 15) * 15;
  return {
    planningMinutes: Math.min(roundQuarter(120 * weeks), 480), // 8h max
    dailyMinutes: 15, // fixe
    reviewMinutes: Math.min(roundQuarter(60 * weeks), 240), // 4h max
    retrospectiveMinutes: Math.min(roundQuarter(45 * weeks), 180), // 3h max
  };
}

export function timeboxForEvent(
  eventType: string,
  sprintDays: number,
): number {
  const t = computeTimeboxes(sprintDays);
  switch (eventType) {
    case EVENT_TYPES.SPRINT_PLANNING:
      return t.planningMinutes;
    case EVENT_TYPES.DAILY_SCRUM:
      return t.dailyMinutes;
    case EVENT_TYPES.SPRINT_REVIEW:
      return t.reviewMinutes;
    case EVENT_TYPES.SPRINT_RETROSPECTIVE:
      return t.retrospectiveMinutes;
    default:
      throw new Error(`UNKNOWN_EVENT_TYPE: ${eventType}`);
  }
}

/** Durée de Sprint : 1 mois max, sinon clôture automatique exigée. */
export function validateSprintDates(
  startDate: Date,
  endDate: Date,
): GuardResult {
  if (!(endDate.getTime() > startDate.getTime())) {
    return deny(
      "SPRINT_END_BEFORE_START",
      "La fin du Sprint doit être postérieure à son début.",
    );
  }
  const days =
    (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
  if (days > 31) {
    return deny(
      "SPRINT_TOO_LONG",
      "Un Sprint dure un mois au plus : clôturez le Sprint au lieu de le prolonger.",
    );
  }
  return allow();
}

/** DoD 100 % : l'item ne devient Increment que si TOUS les critères actifs sont cochés. */
export function checkDodComplete(
  activeCriterionIds: string[],
  checkedCriterionIds: string[],
): { complete: boolean; missing: string[] } {
  const checked = new Set(checkedCriterionIds);
  const missing = activeCriterionIds.filter((id) => !checked.has(id));
  return { complete: missing.length === 0, missing };
}

export function guardDodComplete(
  activeCriterionIds: string[],
  checkedCriterionIds: string[],
): GuardResult {
  const { complete, missing } = checkDodComplete(
    activeCriterionIds,
    checkedCriterionIds,
  );
  if (complete) return allow();
  return deny(
    "DOD_INCOMPLETE",
    `Definition of Done incomplète : ${missing.length} critère(s) manquant(s).`,
  );
}

/** Un item échouant à la DoD en fin de Sprint retourne au Product Backlog (affiné, plus 'prêt'). */
export function failedItemReturnStatus(): string {
  return ITEM_STATUS.REFINED;
}

// ---------- Séquence stricte des Sprints & fin par time-box ----------

/** Statuts qui signifient "Sprint encore ouvert" : tout sauf CLOSED / CANCELLED. */
export const OPEN_SPRINT_STATUSES: readonly string[] = [
  SPRINT_STATUS.PLANNING,
  SPRINT_STATUS.ACTIVE,
  SPRINT_STATUS.REVIEW,
] as const;

export function isOpenSprintStatus(status: string): boolean {
  return (OPEN_SPRINT_STATUSES as readonly string[]).includes(status);
}

/**
 * Fonction de validation demandée : bloque le démarrage d'un Sprint
 * si le précédent n'est pas officiellement CLOSED.
 * Pure et testable sans base.
 */
export function canStartSprint(
  previousSprint: { status: string } | null | undefined,
): GuardResult {
  if (previousSprint && isOpenSprintStatus(previousSprint.status)) {
    return deny(
      "PREVIOUS_SPRINT_NOT_CLOSED",
      "Sprint précédent non clôturé : clôturez-le (statut CLOSED) avant de démarrer le Sprint suivant.",
    );
  }
  return allow();
}

/** Création du Sprint N+1 interdite tant qu'un Sprint est encore ouvert. */
export function canCreateSprint(
  openSprint: { status: string } | null | undefined,
): GuardResult {
  if (openSprint && isOpenSprintStatus(openSprint.status)) {
    return deny(
      "PREVIOUS_SPRINT_NOT_CLOSED",
      "Un Sprint est déjà ouvert : clôturez-le (statut CLOSED) avant d'en créer un nouveau.",
    );
  }
  return allow();
}

/**
 * Création d'un Sprint : exige un ou plusieurs items du Product Backlog
 * (prêts, READY) dès la création — un Sprint ne se crée jamais à vide,
 * et ce n'est pas un item seul qui fait le Sprint courant.
 */
export function canCreateSprintWithItems(
  openSprint: { status: string } | null | undefined,
  itemCount: number,
): GuardResult {
  const seq = canCreateSprint(openSprint);
  if (!seq.ok) return seq;
  if (!Number.isFinite(itemCount) || itemCount < 1) {
    return deny(
      "SPRINT_REQUIRES_ITEM",
      "Création bloquée : sélectionnez un ou plusieurs items du Product Backlog (READY) — un Sprint ne se crée jamais à vide.",
    );
  }
  return allow();
}

/**
 * Contenu du Sprint N+1 verrouillé tant que le précédent n'est pas CLOSED :
 * démarrer, modifier l'objectif ou tirer des items est rejeté.
 */
export function canModifySprintContent(
  targetSprint: { id: string; status: string },
  oldestOpenSprint: { id: string; status: string } | null | undefined,
): GuardResult {
  if (
    oldestOpenSprint &&
    oldestOpenSprint.id !== targetSprint.id &&
    isOpenSprintStatus(oldestOpenSprint.status)
  ) {
    return deny(
      "PREVIOUS_SPRINT_NOT_CLOSED",
      "Sprint verrouillé : le Sprint précédent n'est pas clôturé (CLOSED).",
    );
  }
  return allow();
}

/**
 * Fin du Sprint régie uniquement par sa time-box : quand endDate est dépassée,
 * le Sprint doit se terminer obligatoirement (clôture automatique).
 */
export function isSprintTimeboxExpired(
  sprint: { status: string; endDate: Date | string },
  now: Date = new Date(),
): boolean {
  if (!isOpenSprintStatus(sprint.status)) return false;
  return new Date(sprint.endDate).getTime() <= now.getTime();
}

// ---------- Suivi Sprint : progression séquentielle des étapes Kanban ----------

/**
 * Ordre imposé du Suivi Sprint : TODO → IN_PROGRESS → REVIEW → DONE.
 * DONE est la dernière étape (aucun bouton de clôture, entrée via DoD 100 %).
 */
export const BOARD_STAGE_ORDER = ["TODO", "IN_PROGRESS", "REVIEW", "DONE"] as const;
export type BoardStage = (typeof BOARD_STAGE_ORDER)[number];

/** Étapes clôturables (toutes sauf DONE, la dernière). */
export const CLOSABLE_STAGES: readonly string[] = ["TODO", "IN_PROGRESS", "REVIEW"];

/** Index d'une étape dans l'ordre imposé (-1 si inconnue). */
export function boardStageIndex(stage: string): number {
  return (BOARD_STAGE_ORDER as readonly string[]).indexOf(stage);
}

/** Étape suivante dans l'ordre imposé (null pour DONE / inconnue). */
export function nextBoardStage(stage: string): string | null {
  const idx = boardStageIndex(stage);
  if (idx < 0 || idx >= BOARD_STAGE_ORDER.length - 1) return null;
  return BOARD_STAGE_ORDER[idx + 1]!;
}

/**
 * Une étape est cliquable si son indice est <= étape courante déverrouillée.
 * Les étapes futures sont verrouillées (🔒) jusqu'à clôture des précédentes.
 */
export function isStageUnlocked(stage: string, currentStage: string): boolean {
  const idx = boardStageIndex(stage);
  const cur = boardStageIndex(currentStage);
  if (idx < 0) return false;
  if (cur < 0) return idx === 0;
  return idx <= cur;
}

/**
 * Seule l'étape courante (sauf DONE) peut être clôturée pour déverrouiller
 * la suivante. Interdit de sauter une étape ou de re-clôturer le passé.
 */
export function canCloseBoardStage(stage: string, currentStage: string): GuardResult {
  if (!(CLOSABLE_STAGES as readonly string[]).includes(stage)) {
    return deny(
      "STAGE_NOT_CLOSABLE",
      "La dernière étape (DONE) n'a pas de bouton de clôture.",
    );
  }
  if (stage !== currentStage) {
    const idx = boardStageIndex(stage);
    const cur = boardStageIndex(currentStage);
    if (idx < cur) {
      return deny("STAGE_ALREADY_CLOSED", `Étape ${stage} déjà clôturée.`);
    }
    return deny(
      "STAGE_LOCKED",
      `Étape ${stage} verrouillée : clôturez d'abord l'étape ${currentStage} pour la déverrouiller (pas de saut d'étape).`,
    );
  }
  return allow();
}

/**
 * Déplacement ticket par ticket : interdit de sauter une étape
 * (ex. TODO → REVIEW, TODO → DONE). Seuls les passages adjacents
 * (|diff| = 1) sont autorisés, et uniquement vers une étape déverrouillée.
 * REVIEW → DONE = passage vers la dernière étape (la validation DoD
 * 100 % + commentaire se fait ensuite dans DONE, ticket par ticket).
 */
export function canMoveBoardItemTo(
  from: string,
  to: string,
  currentStage: string,
): GuardResult {
  const fromIdx = boardStageIndex(from);
  const toIdx = boardStageIndex(to);
  if (fromIdx < 0 || toIdx < 0) {
    return deny("INVALID_COLUMN", "Colonne invalide (TODO, IN_PROGRESS, REVIEW ou DONE).");
  }
  if (to === "DONE" && from !== "REVIEW") {
    return deny(
      "STAGE_SKIP_FORBIDDEN",
      `Saut d'étape interdit : seul le passage REVIEW → DONE est autorisé (actuellement en ${from}).`,
    );
  }
  if (Math.abs(toIdx - fromIdx) !== 1 && from !== to) {
    // from === to = aucun déplacement (inoffensif, autorisé).
    if (from === to) return allow();
    return deny(
      "STAGE_SKIP_FORBIDDEN",
      `Saut d'étape interdit : avancez étape par étape (${from} → ${to} impossible, passez par l'étape intermédiaire).`,
    );
  }
  if (!isStageUnlocked(to, currentStage)) {
    return deny(
      "STAGE_LOCKED",
      `Étape ${to} verrouillée : clôturez l'étape ${currentStage} (bouton « Passer à l'étape suivante » + synthèse de clôture) pour la déverrouiller.`,
    );
  }
  return allow();
}

// ---------- Règles métier : affectation Sprint ↔ Product Backlog ----------

/**
 * Un item affecté à un Sprint disparaît du Product Backlog et n'est plus
 * un choix pour le Sprint suivant.
 * - Product Backlog = items avec `sprintId == null` et statut != DONE.
 * - Choix du Sprint suivant = items READY + `sprintId == null`.
 * Un item avec `sprintId != null` (IN_SPRINT) est donc exclu des deux.
 */
export function isItemAvailableForSprint(item: {
  status: string;
  sprintId: string | null;
}): boolean {
  return item.sprintId == null && item.status === ITEM_STATUS.READY;
}

/** Un item en Sprint n'est jamais proposable pour un autre Sprint. */
export function isItemHiddenFromBacklog(item: {
  status: string;
  sprintId: string | null;
}): boolean {
  return item.sprintId != null;
}

/**
 * Retour manuel d'un item non terminé vers le Product Backlog depuis DONE.
 * - Autorisé si et seulement si l'item est en Sprint, sans Increment
 *   (DoD < 100 % : certaines cases peuvent être cochées, d'autres non).
 * - Si toutes les cases sont cochées (DoD 100 %), la promotion en
 *   Increment est automatique/disponible — le retour n'a plus lieu d'être
 *   (mais reste techniquement possible tant que non promu).
 * - Interdit si déjà DONE / Increment livré.
 */
export function canReturnItemToBacklog(input: {
  status: string;
  hasIncrement: boolean;
  boardColumn?: string;
}): GuardResult {
  if (input.hasIncrement || input.status === ITEM_STATUS.DONE) {
    return deny(
      "ALREADY_DONE",
      "Item déjà en DONE (Incrément livré) : retour au Backlog impossible.",
    );
  }
  if (input.status !== ITEM_STATUS.IN_SPRINT) {
    return deny(
      "NOT_IN_SPRINT",
      "Seul un item en Sprint (DoD non atteinte) peut retourner au Product Backlog.",
    );
  }
  return allow();
}

/**
 * Réactivation d'une étape déjà clôturée dans le Suivi Sprint.
 * - Au départ, la séquence de déverrouillage est strictement maintenue
 *   (TODO → IN_PROGRESS → REVIEW → DONE, clôture une par une).
 * - Après clôture, un retour en arrière reste possible : toute étape
 *   clôturable d'indice < étape courante peut être réactivée (rouverte).
 * - DONE n'est pas réactivable (dernière étape, sans clôture).
 * - Rouvrir `stage` supprime sa clôture et celles des étapes postérieures.
 */
export function canReopenBoardStage(stage: string, currentStage: string): GuardResult {
  if (!(CLOSABLE_STAGES as readonly string[]).includes(stage)) {
    return deny(
      "STAGE_NOT_REOPENABLE",
      "La dernière étape (DONE) ne se réactive pas.",
    );
  }
  const idx = boardStageIndex(stage);
  const cur = boardStageIndex(currentStage);
  if (idx < 0 || cur < 0) {
    return deny("INVALID_COLUMN", "Colonne invalide (TODO, IN_PROGRESS ou REVIEW).");
  }
  if (idx >= cur) {
    return deny(
      "STAGE_NOT_CLOSED",
      `Étape ${stage} non clôturée (courante : ${currentStage}) : seule une étape déjà clôturée peut être réactivée.`,
    );
  }
  return allow();
}

// ---------- Daily Scrums répétés (étape 2) ----------

/** Objectif par défaut : 20 Daily pour un Sprint d'un mois. */
export const DEFAULT_DAILY_TOTAL = 20;
/** Bornes du TOTAL paramétrable par le Scrum Master. */
export const DAILY_TOTAL_MIN = 1;
export const DAILY_TOTAL_MAX = 60;

/** Assainit le TOTAL saisi (entier dans [1, 60]). */
export function clampDailyTotal(total: number): number {
  if (!Number.isFinite(total)) return DEFAULT_DAILY_TOTAL;
  return Math.min(DAILY_TOTAL_MAX, Math.max(DAILY_TOTAL_MIN, Math.floor(total)));
}

export function canSetDailyTotal(total: number): GuardResult {
  if (!Number.isFinite(total) || Math.floor(total) !== total) {
    return deny("DAILY_TOTAL_INVALID", "Le TOTAL doit être un nombre entier.");
  }
  if (total < DAILY_TOTAL_MIN || total > DAILY_TOTAL_MAX) {
    return deny(
      "DAILY_TOTAL_INVALID",
      `Le TOTAL doit être entre ${DAILY_TOTAL_MIN} et ${DAILY_TOTAL_MAX}.`,
    );
  }
  return allow();
}

/**
 * Validation du Daily du jour : +1 et reset du chrono 15 min.
 * - Refusée si clôture définitive déjà posée (étape figée).
 * - Refusée si le compteur a déjà atteint le TOTAL (augmentez le TOTAL
 *   ou clôturez définitivement).
 */
export function canValidateDaily(input: {
  count: number;
  total: number;
  completed: boolean;
}): GuardResult {
  if (input.completed) {
    return deny(
      "DAILY_CLOSED",
      "Daily définitivement clôturés : compteur figé, validation impossible.",
    );
  }
  if (input.count >= input.total) {
    return deny(
      "DAILY_MAX_REACHED",
      `Compteur au maximum (${input.count}/${input.total}) : augmentez le TOTAL ou cliquez « 🛑 Clôture définitive des Daily ».`,
    );
  }
  return allow();
}

/**
 * Clôture définitive des Daily : fige le compteur final, passe l'étape 2
 * au statut « Terminé » (barre verte) et débloque « 3. Sprint Review ».
 * Autorisée à tout moment tant que non déjà clôturée (même avant TOTAL).
 */
export function canCloseDailyDefinitively(input: {
  completed: boolean;
}): GuardResult {
  if (input.completed) {
    return deny("DAILY_ALREADY_CLOSED", "Daily déjà définitivement clôturés.");
  }
  return allow();
}

/** Progression du compteur (0–100) pour la barre verte/sable. */
export function dailyProgress(count: number, total: number): number {
  if (!Number.isFinite(count) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((count / total) * 100)));
}

/** L'étape « 3. Sprint Review » est débloquée quand les Daily sont définitivement clôturés. */
export function isReviewUnlockedByDaily(dailyCompleted: boolean): boolean {
  return dailyCompleted === true;
}
