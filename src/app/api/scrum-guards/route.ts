/**
 * GET /api/scrum-guards — preuve serveur que chaque contrainte non négociable
 * rejette les requêtes non autorisées. Authentification requise.
 *
 * Partie A : règles pures (sans DB). Partie B : gardes adossées DB sur des
 * fixtures éphémères (créées puis supprimées dans la même requête).
 */
import bcrypt from "bcryptjs";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  BOARD_STAGE_ORDER,
  canCancelSprint,
  canCheckDod,
  canCloseBoardStage,
  canCloseDailyDefinitively,
  canCommentOnSprint,
  canCreateBacklogItemDelegated,
  canCreateProductGoal,
  canCreateSprint,
  canCreateSprintWithItems,
  canEditSprintBacklog,
  canEditSprintGoal,
  canModifySprintContent,
  canMoveBoardItemTo,
  canPlanRetroAction,
  canPostRetroIdea,
  canPostStakeholderFeedback,
  canReopenBoardStage,
  canReturnItemToBacklog,
  canSetDailyTotal,
  canStartSprint,
  canManageDodCriteria,
  canManageEventTimer,
  canManageImprovement,
  canManageProductBacklog,
  canMarkItemReady,
  canTransitionItemStatus,
  canValidateDaily,
  computeTimeboxes,
  dailyProgress,
  guardDodComplete,
  isItemAvailableForSprint,
  isItemHiddenFromBacklog,
  isReviewUnlockedByDaily,
  isSprintTimeboxExpired,
  isStageUnlocked,
  nextBoardStage,
  timeboxForEvent,
  validateSprintDates,
  type Actor,
  type GuardResult,
} from "@/lib/scrum-rules";
import {
  autoCloseExpiredSprints,
  guardCancelSprint,
  guardCheckDod,
  guardCloseDailyDefinitively,
  guardComment,
  guardCreateGoal,
  guardCreateItem,
  guardCreateSprint,
  guardEditSprintGoal,
  guardEventTimer,
  guardItemStatus,
  guardManageDodCriteria,
  guardPromoteToIncrement,
  guardPullItemToSprint,
  guardReorderBacklog,
  guardSetDailyTotal,
  guardStartSprint,
  guardValidateDaily,
} from "@/lib/scrum-guards";

type CaseResult = {
  id: string;
  constraint: string;
  expectedCode: string | "ok";
  got: string;
  pass: boolean;
};

const results: CaseResult[] = [];

function expectReject(id: string, constraint: string, res: GuardResult, expectedCode: string) {
  const got = res.ok ? "ok:true (AUTORISÉ !)" : `ok:false:${"code" in res ? res.code : "?"}`;
  results.push({
    id,
    constraint,
    expectedCode,
    got,
    pass: !res.ok && "code" in res && res.code === expectedCode,
  });
}

function expectAllow(id: string, constraint: string, res: GuardResult) {
  results.push({
    id,
    constraint,
    expectedCode: "ok",
    got: res.ok ? "ok:true" : `ok:false:${"code" in res ? res.code : "?"}`,
    pass: res.ok,
  });
}

const poActor: Actor = {
  userId: "po",
  teamRole: "PRODUCT_OWNER",
  participatesAsDeveloper: false,
  isProductOwner: true,
  canActAsDeveloper: false,
};
const devActor: Actor = {
  userId: "dev",
  teamRole: "DEVELOPER",
  participatesAsDeveloper: false,
  isProductOwner: false,
  canActAsDeveloper: true,
};
const smActor: Actor = {
  userId: "sm",
  teamRole: "SCRUM_MASTER",
  participatesAsDeveloper: false,
  isProductOwner: false,
  canActAsDeveloper: false,
};
const smDevActor: Actor = {
  ...smActor,
  participatesAsDeveloper: true,
  canActAsDeveloper: true,
};
const stakeholderActor: Actor = {
  userId: "sh",
  teamRole: "STAKEHOLDER",
  participatesAsDeveloper: false,
  isProductOwner: false,
  canActAsDeveloper: false,
};

function runPureMatrix() {
  // 1. PO seul sur Product Backlog / Goal / cancel
  expectReject("A01", "Product Backlog réservé au PO", canManageProductBacklog(devActor), "PO_ONLY");
  expectAllow("A02", "PO gère le Product Backlog", canManageProductBacklog(poActor));
  // Items du Product Backlog : Product Owner uniquement (Developer exclu, sans saisie déléguée)
  expectReject("A03", "Dev exclu de la création d'items", canCreateBacklogItemDelegated(devActor, null), "PO_ONLY");
  expectReject("A04", "Saisie déléguée Dev refusée (PO uniquement)", canCreateBacklogItemDelegated(devActor, "user-x"), "PO_ONLY");
  expectAllow("A04b", "PO crée les items du backlog", canCreateBacklogItemDelegated(poActor, null));
  // 2. Sprint Backlog : Developers uniquement
  expectReject("A05", "PO exclu du Sprint Backlog", canEditSprintBacklog(poActor), "DEVELOPERS_ONLY");
  expectReject("A06", "SM exclu du Sprint Backlog", canEditSprintBacklog(smActor), "DEVELOPERS_ONLY");
  expectAllow("A07", "SM participant comme dev édite le Sprint Backlog", canEditSprintBacklog(smDevActor));
  expectAllow("A08", "Developer édite le Sprint Backlog", canEditSprintBacklog(devActor));
  // DoD : cochage Scrum Team (PO, SM, Dev) ; checklist globale Admin/PO + SM (Dev exclu)
  expectAllow("A09", "PO coche la DoD (Scrum Team)", canCheckDod(poActor));
  expectAllow("A09b", "Dev coche la DoD (Scrum Team)", canCheckDod(devActor));
  expectReject("A09c", "Stakeholder ne coche pas la DoD", canCheckDod(stakeholderActor), "SCRUM_TEAM_ONLY_DOD");
  expectAllow("A10", "SM gère les critères DoD (Admin/PO + SM)", canManageDodCriteria(smActor));
  expectAllow("A10b", "PO gère les critères DoD", canManageDodCriteria(poActor));
  expectReject("A10c", "Dev exclu de la DoD globale", canManageDodCriteria(devActor), "DOD_MANAGE_RESTRICTED");
  // 3. Chronos : SM uniquement ; rétro/obstacles : Scrum Team au complet
  expectReject("A11", "PO ne touche pas aux chronos", canManageEventTimer(poActor), "SM_ONLY_TIMER");
  expectReject("A12", "Dev ne touche pas aux chronos", canManageEventTimer(devActor), "SM_ONLY_TIMER");
  expectAllow("A13", "SM pilote les chronos", canManageEventTimer(smActor));
  expectAllow("A14", "Dev consigne les actions rétro (Scrum Team)", canManageImprovement(devActor));
  expectAllow("A14b", "PO consigne les actions rétro (Scrum Team)", canManageImprovement(poActor));
  expectReject("A14c", "Stakeholder exclu de la rétro", canManageImprovement(stakeholderActor), "SCRUM_TEAM_ONLY_RETRO");
  // 4. Sprint Review : Stakeholder en lecture seule absolue (aucune action)
  expectReject("A15", "Stakeholder en lecture seule hors Review", canCommentOnSprint(stakeholderActor, "ACTIVE"), "STAKEHOLDER_READ_ONLY");
  expectReject("A16", "Stakeholder en lecture seule même en Review", canCommentOnSprint(stakeholderActor, "REVIEW"), "STAKEHOLDER_READ_ONLY");
  // 5. Goal unique actif
  expectReject("A17", "Un seul Product Goal actif", canCreateProductGoal(1), "SINGLE_ACTIVE_GOAL");
  expectAllow("A18", "Premier Product Goal autorisé", canCreateProductGoal(0));
  // 6. READY bloqué sans estimation / hors un Sprint
  expectReject("A19", "READY sans estimation", canMarkItemReady({ storyPoints: null, fitsInOneSprint: true }), "READY_REQUIRES_ESTIMATE");
  expectReject("A20", "READY si trop gros pour un Sprint", canMarkItemReady({ storyPoints: 13, fitsInOneSprint: false }), "READY_REQUIRES_FITS_IN_SPRINT");
  expectAllow("A21", "READY estimé et faisable en un Sprint", canMarkItemReady({ storyPoints: 5, fitsInOneSprint: true }));
  // Transitions illégales
  expectReject("A22", "RAW → DONE interdit", canTransitionItemStatus("RAW", "DONE"), "ILLEGAL_TRANSITION");
  expectAllow("A23", "RAW → REFINED autorisé", canTransitionItemStatus("RAW", "REFINED"));
  // Objectif verrouillé après Planning
  expectReject("A24", "Objectif verrouillé pendant le Sprint", canEditSprintGoal({ status: "ACTIVE", goalLockedAt: new Date() }), "SPRINT_GOAL_LOCKED");
  expectReject("A25", "Objectif verrouillé dès goalLockedAt", canEditSprintGoal({ status: "PLANNING", goalLockedAt: new Date() }), "SPRINT_GOAL_LOCKED");
  expectAllow("A26", "Objectif éditable en Planning ouverte", canEditSprintGoal({ status: "PLANNING", goalLockedAt: null }));
  // Annulation : PO + motif
  expectReject("A27", "SM ne peut pas annuler un Sprint", canCancelSprint(smActor, "motif"), "PO_ONLY");
  expectReject("A28", "Annulation PO sans note de recadrage", canCancelSprint(poActor, "  "), "CANCEL_REQUIRES_REASON");
  expectAllow("A29", "Annulation PO motivée", canCancelSprint(poActor, "Objectif obsolète"));
  // Sprint ≤ 1 mois
  expectReject(
    "A30",
    "Sprint de 40 jours rejeté",
    validateSprintDates(new Date("2026-01-01"), new Date("2026-02-10")),
    "SPRINT_TOO_LONG",
  );
  expectAllow("A31", "Sprint de 14 jours valide", validateSprintDates(new Date("2026-01-01"), new Date("2026-01-15")));
  // DoD 100 %
  expectReject("A32", "Increment bloqué si DoD partielle", guardDodComplete(["c1", "c2"], ["c1"]), "DOD_INCOMPLETE");
  expectAllow("A33", "Increment si DoD 100 %", guardDodComplete(["c1", "c2"], ["c1", "c2"]));
  // Timeboxes prorata
  const t2 = computeTimeboxes(14);
  const t4 = computeTimeboxes(28);
  results.push({
    id: "A34",
    constraint: "Planning 2 sem. = 4h max",
    expectedCode: "ok",
    got: `${t2.planningMinutes}min`,
    pass: t2.planningMinutes === 240,
  });
  results.push({
    id: "A35",
    constraint: "Planning 4 sem. = 8h",
    expectedCode: "ok",
    got: `${t4.planningMinutes}min`,
    pass: t4.planningMinutes === 480,
  });
  results.push({
    id: "A36",
    constraint: "Daily = 15min quel que soit le Sprint",
    expectedCode: "ok",
    got: `${timeboxForEvent("DAILY_SCRUM", 21)}min`,
    pass: timeboxForEvent("DAILY_SCRUM", 21) === 15,
  });
  // 7. Séquence stricte des Sprints : N+1 verrouillé tant que N pas CLOSED
  expectReject("A37", "Démarrage bloqué si précédent non clôturé", canStartSprint({ status: "ACTIVE" }), "PREVIOUS_SPRINT_NOT_CLOSED");
  expectAllow("A38", "Démarrage autorisé si précédent CLOSED", canStartSprint({ status: "CLOSED" }));
  expectAllow("A39", "Démarrage autorisé sans précédent", canStartSprint(null));
  expectReject("A40", "Création bloquée si un Sprint est ouvert", canCreateSprint({ status: "REVIEW" }), "PREVIOUS_SPRINT_NOT_CLOSED");
  expectAllow("A41", "Création autorisée si précédent CLOSED", canCreateSprint({ status: "CLOSED" }));
  expectReject(
    "A42",
    "Contenu du Sprint suivant verrouillé (précédent ouvert)",
    canModifySprintContent({ id: "next", status: "PLANNING" }, { id: "prev", status: "ACTIVE" }),
    "PREVIOUS_SPRINT_NOT_CLOSED",
  );
  expectAllow(
    "A43",
    "Contenu du Sprint courant modifiable (aucun précédent ouvert)",
    canModifySprintContent({ id: "cur", status: "ACTIVE" }, null),
  );
  // 8. Fin par time-box : échéance dépassée => clôture obligatoire
  results.push({
    id: "A44",
    constraint: "Time-box écoulée => clôture obligatoire",
    expectedCode: "ok",
    got: String(isSprintTimeboxExpired({ status: "ACTIVE", endDate: new Date("2026-01-01") }, new Date("2026-02-01"))),
    pass: isSprintTimeboxExpired({ status: "ACTIVE", endDate: new Date("2026-01-01") }, new Date("2026-02-01")) === true,
  });
  results.push({
    id: "A45",
    constraint: "Time-box en cours => pas de clôture",
    expectedCode: "ok",
    got: String(isSprintTimeboxExpired({ status: "ACTIVE", endDate: new Date("2026-12-31") }, new Date("2026-02-01"))),
    pass: isSprintTimeboxExpired({ status: "ACTIVE", endDate: new Date("2026-12-31") }, new Date("2026-02-01")) === false,
  });
  results.push({
    id: "A46",
    constraint: "Sprint déjà CLOSED => pas de clôture auto",
    expectedCode: "ok",
    got: String(isSprintTimeboxExpired({ status: "CLOSED", endDate: new Date("2026-01-01") }, new Date("2026-02-01"))),
    pass: isSprintTimeboxExpired({ status: "CLOSED", endDate: new Date("2026-01-01") }, new Date("2026-02-01")) === false,
  });
  // 9. Suivi Sprint séquentiel : pas de saut d'étape, déverrouillage par clôture
  expectAllow("A47", "TODO déverrouillée quand courante", isStageUnlocked("TODO", "TODO") ? { ok: true } : { ok: false, code: "LOCKED", message: "x" });
  expectReject("A48", "IN_PROGRESS verrouillée tant que TODO courante", isStageUnlocked("IN_PROGRESS", "TODO") ? { ok: true } : { ok: false, code: "STAGE_LOCKED", message: "x" }, "STAGE_LOCKED");
  expectAllow("A49", "Clôture TODO quand courante", canCloseBoardStage("TODO", "TODO"));
  expectReject("A50", "Clôture IN_PROGRESS refusée si TODO courante (pas de saut)", canCloseBoardStage("IN_PROGRESS", "TODO"), "STAGE_LOCKED");
  expectReject("A51", "DONE sans bouton de clôture (dernière étape)", canCloseBoardStage("DONE", "REVIEW"), "STAGE_NOT_CLOSABLE");
  expectReject("A52", "Saut TODO → REVIEW interdit", canMoveBoardItemTo("TODO", "REVIEW", "REVIEW"), "STAGE_SKIP_FORBIDDEN");
  expectAllow("A53", "TODO → IN_PROGRESS autorisé si déverrouillée", canMoveBoardItemTo("TODO", "IN_PROGRESS", "IN_PROGRESS"));
  expectReject("A54", "TODO → IN_PROGRESS refusé si verrouillée", canMoveBoardItemTo("TODO", "IN_PROGRESS", "TODO"), "STAGE_LOCKED");
  expectAllow("A54b", "REVIEW → DONE autorisé (dernière étape, DoD cochée dans DONE)", canMoveBoardItemTo("REVIEW", "DONE", "DONE"));
  expectReject("A54c", "Saut TODO → DONE interdit", canMoveBoardItemTo("TODO", "DONE", "DONE"), "STAGE_SKIP_FORBIDDEN");
  expectReject("A54d", "Création bloquée sans item", canCreateSprintWithItems(null, 0), "SPRINT_REQUIRES_ITEM");
  expectAllow("A54e", "Création autorisée avec 2 items", canCreateSprintWithItems(null, 2));
  expectReject("A54f", "Sprint ouvert bloque même avec items", canCreateSprintWithItems({ status: "ACTIVE" }, 3), "PREVIOUS_SPRINT_NOT_CLOSED");
  results.push({
    id: "A55",
    constraint: "Ordre imposé TODO → IN_PROGRESS → REVIEW → DONE",
    expectedCode: "ok",
    got: BOARD_STAGE_ORDER.join(">"),
    pass: BOARD_STAGE_ORDER.join(",") === "TODO,IN_PROGRESS,REVIEW,DONE" && nextBoardStage("TODO") === "IN_PROGRESS" && nextBoardStage("REVIEW") === "DONE" && nextBoardStage("DONE") === null,
  });
  // 10. Règles métier affectation Sprint ↔ Backlog + retour DONE + réactivation
  results.push({
    id: "A56",
    constraint: "Item en Sprint caché du backlog, non choisissable (READY + sans sprint uniquement)",
    expectedCode: "ok",
    got: `${isItemHiddenFromBacklog({ status: "IN_SPRINT", sprintId: "s1" })}/${isItemAvailableForSprint({ status: "READY", sprintId: null })}/${isItemAvailableForSprint({ status: "IN_SPRINT", sprintId: "s1" })}`,
    pass:
      isItemHiddenFromBacklog({ status: "IN_SPRINT", sprintId: "s1" }) === true &&
      isItemAvailableForSprint({ status: "READY", sprintId: null }) === true &&
      isItemAvailableForSprint({ status: "IN_SPRINT", sprintId: "s1" }) === false &&
      isItemAvailableForSprint({ status: "READY", sprintId: "s1" }) === false,
  });
  expectAllow("A57", "Retour backlog autorisé si IN_SPRINT sans Increment (DoD partielle)", canReturnItemToBacklog({ status: "IN_SPRINT", hasIncrement: false }));
  expectReject("A58", "Retour backlog refusé si déjà DONE/Increment", canReturnItemToBacklog({ status: "DONE", hasIncrement: true }), "ALREADY_DONE");
  expectReject("A59", "Retour backlog refusé si hors Sprint", canReturnItemToBacklog({ status: "READY", hasIncrement: false }), "NOT_IN_SPRINT");
  expectAllow("A60", "Réactivation IN_PROGRESS depuis REVIEW (retour arrière)", canReopenBoardStage("IN_PROGRESS", "REVIEW"));
  expectAllow("A60b", "Réactivation TODO depuis DONE (retour arrière)", canReopenBoardStage("TODO", "DONE"));
  expectReject("A61", "Réactivation refusée si étape non clôturée (aller inchangé)", canReopenBoardStage("REVIEW", "IN_PROGRESS"), "STAGE_NOT_CLOSED");
  expectReject("A62", "DONE non réactivable (dernière étape)", canReopenBoardStage("DONE", "DONE"), "STAGE_NOT_REOPENABLE");
  expectAllow("A63", "Recul ticket DONE → REVIEW autorisé si déverrouillée", canMoveBoardItemTo("DONE", "REVIEW", "DONE"));
  // 11. Daily répétés (étape 2) : compteur X/TOTAL + clôture définitive → Review
  expectAllow("A64", "TOTAL 20 valide (défaut mois)", canSetDailyTotal(20));
  expectReject("A65", "TOTAL 0 rejeté", canSetDailyTotal(0), "DAILY_TOTAL_INVALID");
  expectReject("A66", "TOTAL 99 rejeté (>60)", canSetDailyTotal(99), "DAILY_TOTAL_INVALID");
  expectAllow("A67", "Validation Daily 5/20 autorisée", canValidateDaily({ count: 5, total: 20, completed: false }));
  expectReject("A68", "Validation refusée si compteur au max", canValidateDaily({ count: 20, total: 20, completed: false }), "DAILY_MAX_REACHED");
  expectReject("A69", "Validation refusée si définitivement clôturé", canValidateDaily({ count: 5, total: 20, completed: true }), "DAILY_CLOSED");
  expectAllow("A70", "Clôture définitive autorisée si non clôturé", canCloseDailyDefinitively({ completed: false }));
  expectReject("A71", "Clôture définitive refusée si déjà clôturé", canCloseDailyDefinitively({ completed: true }), "DAILY_ALREADY_CLOSED");
  results.push({
    id: "A72",
    constraint: "Progression Daily 5/20 = 25 %",
    expectedCode: "ok",
    got: `${dailyProgress(5, 20)}%`,
    pass: dailyProgress(5, 20) === 25,
  });
  results.push({
    id: "A73",
    constraint: "Review débloquée ssi Daily définitivement clôturés",
    expectedCode: "ok",
    got: `${isReviewUnlockedByDaily(true)}/${isReviewUnlockedByDaily(false)}`,
    pass: isReviewUnlockedByDaily(true) === true && isReviewUnlockedByDaily(false) === false,
  });
  // 12. Rétrospective : post-its Scrum Team, plan d'actions SM/PO
  expectAllow("A74", "Dev poste un post-it (Scrum Team)", canPostRetroIdea(devActor, "WENT_WELL", "Bonne entraide"));
  expectReject("A75", "Stakeholder exclu des post-its (lecture seule)", canPostRetroIdea(stakeholderActor, "WENT_WELL", "Bonne entraide"), "SCRUM_TEAM_ONLY_RETRO");
  expectReject("A76", "Colonne de post-it invalide rejetée", canPostRetroIdea(devActor, "TODO", "Idée"), "INVALID_COLUMN");
  expectAllow("A77", "SM crée une action du plan (SM/PO)", canPlanRetroAction(smActor));
  expectAllow("A77b", "PO crée une action du plan (SM/PO)", canPlanRetroAction(poActor));
  expectReject("A78", "Dev exclu de la création d'actions", canPlanRetroAction(devActor), "SM_PO_ONLY_ACTION");
  expectReject("A78b", "Stakeholder exclu de la création d'actions", canPlanRetroAction(stakeholderActor), "SM_PO_ONLY_ACTION");
  // 13. Session Review : retours clients en écriture Stakeholder uniquement
  expectAllow("A79", "Stakeholder publie un retour client (ACTIVE)", canPostStakeholderFeedback(stakeholderActor, "ACTIVE"));
  expectReject("A80", "Dev exclu des retours clients (lecture seule)", canPostStakeholderFeedback(devActor, "ACTIVE"), "STAKEHOLDER_WRITE_ONLY");
  expectReject("A81", "PO exclu des retours clients (lecture seule)", canPostStakeholderFeedback(poActor, "REVIEW"), "STAKEHOLDER_WRITE_ONLY");
  expectReject("A82", "Retour client refusé hors Sprint ouvert", canPostStakeholderFeedback(stakeholderActor, "CLOSED"), "SPRINT_NOT_OPEN_FOR_COMMENTS");
}

async function runDbBackedMatrix() {
  const tag = `guard-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  // Mot de passe éphémère aléatoire pour les fixtures de test (jamais versionné).
  const { randomUUID } = await import("node:crypto");
  const passwordHash = await bcrypt.hash(`guard-${randomUUID()}`, 10);
  const fixtureWorkspace = await prisma.workspace.create({
    data: { name: `Guard ${tag}`, slug: `guard-${tag}`.slice(0, 60) },
  });
  const mkUser = (role: string) =>
    prisma.user.create({
      data: {
        email: `${tag}-${role}@example.test`,
        name: `Guard ${role}`,
        passwordHash,
        globalRole: "MEMBER",
        workspaceId: fixtureWorkspace.id,
      },
    });
  const createdUserIds: string[] = [];
  let productId = "";
  try {
    const [po, dev, sm, sh] = await Promise.all([
      mkUser("po"),
      mkUser("dev"),
      mkUser("sm"),
      mkUser("sh"),
    ]);
    createdUserIds.push(po.id, dev.id, sm.id, sh.id);

    const product = await prisma.product.create({
      data: {
        name: `Guard product ${tag}`,
        productOwnerId: po.id,
        productOwnerEmail: po.email,
        scrumMasterEmail: sm.email,
        workspaceId: fixtureWorkspace.id,
      },
    });
    productId = product.id;

    const team = await prisma.team.create({
      data: { name: `Guard team ${tag}`, productId: product.id, workspaceId: fixtureWorkspace.id },
    });
    await prisma.teamMembership.createMany({
      data: [
        { userId: po.id, teamId: team.id, role: "PRODUCT_OWNER" },
        { userId: dev.id, teamId: team.id, role: "DEVELOPER" },
        { userId: sm.id, teamId: team.id, role: "SCRUM_MASTER" },
        { userId: sh.id, teamId: team.id, role: "STAKEHOLDER" },
      ],
    });

    // Goal actif existant
    await prisma.productGoal.create({
      data: { productId: product.id, description: "Goal actif", status: "ACTIVE" },
    });
    expectReject("B01", "2e Product Goal actif rejeté (DB)", await guardCreateGoal(po.id, product.id), "SINGLE_ACTIVE_GOAL");

    // Backlog : création / ordre / estimation réservés au PO (Developer exclu)
    expectReject("B02", "Dev ne réordonne pas le Backlog (DB)", await guardReorderBacklog(dev.id, product.id), "PO_ONLY");
    expectReject("B03", "Dev exclu de la création d'items (DB)", await guardCreateItem(dev.id, product.id, null), "PO_ONLY");
    expectReject("B04", "Saisie déléguée Dev refusée (DB)", await guardCreateItem(dev.id, product.id, dev.id), "PO_ONLY");
    expectAllow("B04b", "PO crée les items du backlog (DB)", await guardCreateItem(po.id, product.id, null));

    const itemRaw = await prisma.backlogItem.create({
      data: { productId: product.id, title: "Item brut", status: "RAW", order: 1 },
    });
    expectReject("B05", "RAW → DONE rejeté (DB)", await guardItemStatus(dev.id, product.id, "RAW", "DONE"), "ILLEGAL_TRANSITION");
    expectReject("B06", "READY sans estimation rejeté (DB)", await guardItemStatus(dev.id, product.id, "REFINED", "READY", { storyPoints: null, fitsInOneSprint: true }), "READY_REQUIRES_ESTIMATE");
    expectReject("B06b", "Dev exclu de l'estimation READY même chiffrée (DB)", await guardItemStatus(dev.id, product.id, "REFINED", "READY", { storyPoints: 5, fitsInOneSprint: true }), "PO_ONLY");

    // Sprint + tirage
    const sprint = await prisma.sprint.create({
      data: {
        teamId: team.id,
        workspaceId: fixtureWorkspace.id,
        goal: "Objectif",
        status: "PLANNING",
        startDate: new Date("2026-10-05"),
        endDate: new Date("2026-10-19"),
      },
    });
    const itemReady = await prisma.backlogItem.create({
      data: { productId: product.id, title: "Item prêt", status: "READY", order: 2, storyPoints: 3 },
    });
    expectAllow("B07", "PO tire un item READY en planification collective (DB)", await guardPullItemToSprint(po.id, team.id, sprint.id, itemReady.id));
    expectReject("B07b", "Stakeholder exclu du tirage (DB)", await guardPullItemToSprint(sh.id, team.id, sprint.id, itemReady.id), "PLANNING_TEAM_ONLY");
    expectReject("B08", "Tirage d'un item non prêt rejeté (DB)", await guardPullItemToSprint(dev.id, team.id, sprint.id, itemRaw.id), "ITEM_NOT_READY");
    expectAllow("B09", "Dev tire un item READY (DB)", await guardPullItemToSprint(dev.id, team.id, sprint.id, itemReady.id));

    // Verrouillage objectif
    await prisma.sprint.update({
      where: { id: sprint.id },
      data: { status: "ACTIVE", goalLockedAt: new Date() },
    });
    expectReject("B10", "Objectif verrouillé après Planning (DB)", await guardEditSprintGoal(dev.id, team.id, sprint.id), "SPRINT_GOAL_LOCKED");

    // DoD : 2 critères actifs, 1 seul coché
    const [c1, c2] = await Promise.all([
      prisma.doneCriterion.create({ data: { productId: product.id, label: "Critère 1" } }),
      prisma.doneCriterion.create({ data: { productId: product.id, label: "Critère 2" } }),
    ]);
    const itemInSprint = await prisma.backlogItem.create({
      data: { productId: product.id, title: "Item en sprint", status: "IN_SPRINT", order: 3, sprintId: sprint.id, boardColumn: "REVIEW" },
    });
    // REVIEW déverrouillée pour tester la promotion (séquentiel : clôturez TODO puis IN_PROGRESS).
    await prisma.sprint.update({ where: { id: sprint.id }, data: { currentStage: "REVIEW" } });
    await prisma.doneCheck.create({
      data: { backlogItemId: itemInSprint.id, criterionId: c1.id, checkedById: dev.id },
    });
    expectAllow("B11", "PO coche la DoD — Scrum Team (DB)", await guardCheckDod(po.id, product.id));
    expectReject("B11b", "Stakeholder ne coche pas la DoD (DB)", await guardCheckDod(sh.id, product.id), "SCRUM_TEAM_ONLY_DOD");
    const promo = await guardPromoteToIncrement(dev.id, itemInSprint.id);
    expectReject("B12", "Increment bloqué si DoD incomplète (DB)", promo, "DOD_INCOMPLETE");
    await prisma.doneCheck.create({
      data: { backlogItemId: itemInSprint.id, criterionId: c2.id, checkedById: dev.id },
    });
    expectAllow("B13", "Increment si DoD 100 % (DB)", await guardPromoteToIncrement(dev.id, itemInSprint.id));

    // Suivi séquentiel (DB) : promotion uniquement depuis REVIEW déverrouillée.
    const itemTodo = await prisma.backlogItem.create({
      data: { productId: product.id, title: "Item TODO", status: "IN_SPRINT", order: 4, sprintId: sprint.id, boardColumn: "TODO" },
    });
    await prisma.doneCheck.createMany({
      data: [
        { backlogItemId: itemTodo.id, criterionId: c1.id, checkedById: dev.id },
        { backlogItemId: itemTodo.id, criterionId: c2.id, checkedById: dev.id },
      ],
    });
    expectReject("B13b", "Promotion TODO → DONE refusée (pas de saut, DB)", await guardPromoteToIncrement(dev.id, itemTodo.id), "STAGE_SKIP_FORBIDDEN");

    // Chronos : SM uniquement
    const event = await prisma.scrumEvent.create({
      data: { sprintId: sprint.id, type: "DAILY_SCRUM", timeboxMinutes: 15, dailyCount: 5, dailyTotal: 20 },
    });
    expectReject("B14", "Dev ne démarre pas le chrono (DB)", await guardEventTimer(dev.id, team.id, event.id, "start"), "SM_ONLY_TIMER");
    expectAllow("B15", "SM démarre le chrono (DB)", await guardEventTimer(sm.id, team.id, event.id, "start"));

    // Daily répétés (DB) : SM uniquement, compteur X/TOTAL, clôture → Review
    expectReject("B15b", "Dev ne valide pas le Daily (DB)", await guardValidateDaily(dev.id, team.id, event.id), "SM_ONLY_TIMER");
    expectAllow("B15c", "SM valide le Daily 5/20 (DB)", await guardValidateDaily(sm.id, team.id, event.id));
    expectReject("B15d", "Dev ne modifie pas le TOTAL (DB)", await guardSetDailyTotal(dev.id, team.id, event.id, 20), "SM_ONLY_TIMER");
    expectAllow("B15e", "SM fixe le TOTAL à 20 (DB)", await guardSetDailyTotal(sm.id, team.id, event.id, 20));
    expectReject("B15f", "TOTAL 0 rejeté (DB)", await guardSetDailyTotal(sm.id, team.id, event.id, 0), "DAILY_TOTAL_INVALID");
    expectAllow("B15g", "SM clôt définitivement les Daily (DB)", await guardCloseDailyDefinitively(sm.id, team.id, event.id));

    // Commentaires : Stakeholder en lecture seule absolue (aucune action)
    expectReject("B16", "Stakeholder en lecture seule (DB)", await guardComment(sh.id, team.id, sprint.id), "STAKEHOLDER_READ_ONLY");

    // Annulation
    expectReject("B17", "Annulation sans motif rejetée (DB)", await guardCancelSprint(po.id, sprint.id, ""), "CANCEL_REQUIRES_REASON");
    expectAllow("B18", "Annulation PO motivée (DB)", await guardCancelSprint(po.id, sprint.id, "Cap dépassé"));

    // DoD globale : Admin/PO + SM autorisés, Developer exclu
    expectAllow("B19", "SM gère les critères DoD (DB)", await guardManageDodCriteria(sm.id, product.id));
    expectReject("B19b", "Dev exclu de la DoD globale (DB)", await guardManageDodCriteria(dev.id, product.id), "DOD_MANAGE_RESTRICTED");

    // Séquence stricte : le Sprint fixture est ACTIVE => création/démarrage bloqués
    expectReject("B20", "Création d'un Sprint N+1 rejetée (DB)", await guardCreateSprint(team.id), "PREVIOUS_SPRINT_NOT_CLOSED");
    const nextSprint = await prisma.sprint.create({
      data: {
        teamId: team.id,
        workspaceId: fixtureWorkspace.id,
        goal: "Sprint suivant",
        status: "PLANNING",
        startDate: new Date("2026-10-20"),
        endDate: new Date("2026-11-03"),
      },
    });
    expectReject("B21", "Démarrage du Sprint suivant rejeté (DB)", await guardStartSprint(team.id, nextSprint.id), "PREVIOUS_SPRINT_NOT_CLOSED");

    // Time-box : un Sprint expiré est clôturé automatiquement, l'item non
    // terminé (DoD < 100 %) retourne au Product Backlog.
    const expiredSprint = await prisma.sprint.create({
      data: {
        teamId: team.id,
        workspaceId: fixtureWorkspace.id,
        goal: "Sprint expiré",
        status: "ACTIVE",
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-01-02"),
      },
    });
    const doomed = await prisma.backlogItem.create({
      data: { productId: product.id, title: "Item non fini", status: "IN_SPRINT", order: 9, sprintId: expiredSprint.id },
    });
    const auto = await autoCloseExpiredSprints(team.id, new Date("2026-06-01"));
    const expiredAfter = await prisma.sprint.findUnique({ where: { id: expiredSprint.id } });
    const doomedAfter = await prisma.backlogItem.findUnique({ where: { id: doomed.id } });
    results.push({
      id: "B22",
      constraint: "Clôture auto du Sprint à time-box écoulée (DB)",
      expectedCode: "ok",
      got: `${auto.closed} closed / ${expiredAfter?.status}`,
      pass: auto.closed >= 1 && expiredAfter?.status === "CLOSED",
    });
    results.push({
      id: "B23",
      constraint: "Item non terminé retourné au Backlog (DB)",
      expectedCode: "ok",
      got: `${doomedAfter?.status} / sprint:${doomedAfter?.sprintId}`,
      pass: doomedAfter?.status === "REFINED" && doomedAfter?.sprintId === null,
    });
  } finally {
    // Nettoyage des fixtures éphémères (ordre FK-safe).
    if (productId) {
      const items = await prisma.backlogItem.findMany({
        where: { productId },
        select: { id: true },
      });
      const itemIds = items.map((i) => i.id);
      if (itemIds.length) {
        await prisma.doneCheck.deleteMany({ where: { backlogItemId: { in: itemIds } } });
        await prisma.increment.deleteMany({ where: { backlogItemId: { in: itemIds } } });
      }
      const sprints = await prisma.sprint.findMany({
        where: { team: { productId } },
        select: { id: true },
      });
      const sprintIds = sprints.map((s) => s.id);
      if (sprintIds.length) {
        await prisma.scrumEvent.deleteMany({ where: { sprintId: { in: sprintIds } } });
        await prisma.stakeholderComment.deleteMany({ where: { sprintId: { in: sprintIds } } });
        await prisma.impediment.deleteMany({ where: { sprintId: { in: sprintIds } } });
        await prisma.retrospectiveAction.deleteMany({ where: { sprintId: { in: sprintIds } } });
        await prisma.dailyNote.deleteMany({ where: { sprintId: { in: sprintIds } } });
        const closureDelegate = (prisma as unknown as Record<string, unknown>).sprintStageClosure as
          | { deleteMany: (args: unknown) => Promise<unknown> }
          | undefined;
        if (closureDelegate) {
          await closureDelegate.deleteMany({ where: { sprintId: { in: sprintIds } } });
        }
      }
      await prisma.backlogItem.deleteMany({ where: { productId } });
      await prisma.sprint.deleteMany({ where: { team: { productId } } });
      await prisma.teamMembership.deleteMany({ where: { team: { productId } } });
      await prisma.team.deleteMany({ where: { productId } });
      await prisma.productGoal.deleteMany({ where: { productId } });
      await prisma.doneCriterion.deleteMany({ where: { productId } });
      await prisma.product.deleteMany({ where: { id: productId } });
    }
    if (createdUserIds.length) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    // Espace éphémère (cascade vers les éventuels résidus de fixtures).
    await prisma.workspace.deleteMany({ where: { slug: `guard-${tag}`.slice(0, 60) } });
  }
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }
  results.length = 0;
  runPureMatrix();
  try {
    await runDbBackedMatrix();
  } catch (e) {
    return Response.json(
      { error: "FIXTURE_ERROR", message: (e as Error).message, results },
      { status: 500 },
    );
  }
  const passed = results.filter((r) => r.pass).length;
  return Response.json({
    passed,
    failed: results.length - passed,
    total: results.length,
    results,
  });
}
