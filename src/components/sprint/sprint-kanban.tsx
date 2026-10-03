"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  BOARD_STAGE_ORDER,
  boardStageIndex,
  checkDodComplete,
  guardDodComplete,
  isStageUnlocked,
  nextBoardStage,
} from "@/lib/scrum-rules";
import { NOTE_NATURES, dailyNoteTitleFor, noteNatureLabel } from "@/lib/daily-notes";
import { promoteToIncrement, setDodCheck } from "@/app/actions/dod";
import { addDailyNote, updateDailyNote } from "@/app/actions/daily-notes";
import {
  advanceStage,
  closeStageAndUnlockNext,
  moveBoardColumn,
  updateStageSummary,
} from "@/app/actions/sprint-board";
import { Badge, buttonPrimary, buttonSecondary } from "@/components/ui";

export type SprintCriterionVM = {
  id: string;
  label: string;
};

export type SprintItemVM = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  storyPoints: number | null;
  /** Colonne Kanban persistée en base (TODO · IN_PROGRESS · REVIEW). */
  boardColumn: string;
  checkedCriterionIds: string[];
  hasIncrement: boolean;
};

export type DailyNoteVM = {
  id: string;
  /** Ticket concerné (null = note d'étape, saisie depuis la modale). */
  backlogItemId: string | null;
  column: string;
  text: string;
  /** Tag auto "📅 Daily du 03/10/2026" (null pour les notes antérieures). */
  title: string | null;
  /** Nature du point : AVANCEMENT | OBSTACLE | ANNONCE. */
  nature: string;
  createdAt: string;
  authorRole: string;
};

export type StageClosureVM = {
  stage: string;
  summary: string | null;
  closedAt: string;
};

type ColumnKey = "TODO" | "IN_PROGRESS" | "REVIEW" | "DONE";

/** Ordre de progression sur le tableau : TODO → IN_PROGRESS → REVIEW → DONE. */
const MOVABLE: ColumnKey[] = ["TODO", "IN_PROGRESS", "REVIEW", "DONE"];

const COLUMNS: { key: ColumnKey; label: string; rule: string }[] = [
  { key: "TODO", label: "TODO", rule: "Travail planifié en attente de prise en charge." },
  { key: "IN_PROGRESS", label: "IN_PROGRESS", rule: "Tâches en cours de réalisation par l'équipe." },
  { key: "REVIEW", label: "REVIEW", rule: "Fonctionnalités terminées en cours de révision et de validation DoD." },
  { key: "DONE", label: "DONE", rule: "Items terminés respectant 100% de la Definition of Done." },
];

/**
 * Répartition Kanban :
 * - TODO / IN_PROGRESS / REVIEW / DONE = colonne persistée `boardColumn`
 *   (avancée étape par étape par flèches, drag-and-drop ou bouton d'étape,
 *   Developers uniquement, sans jamais sauter d'étape).
 * - La validation DoD (critères à cocher un par un + commentaire obligatoire)
 *   se fait uniquement dans DONE ; à 100 %, l'item est promu en Incrément
 *   (badge « Increment livré ✓ », cases ensuite verrouillées).
 */
function columnFor(item: SprintItemVM): ColumnKey {
  if (item.status === "DONE" || item.hasIncrement) return "DONE";
  if ((MOVABLE as string[]).includes(item.boardColumn)) return item.boardColumn as ColumnKey;
  return "TODO";
}

/** Couleur du badge de nature : avancement (info), obstacle (alerte), annonce (succès). */
function natureTone(nature: string): "blue" | "amber" | "green" | "zinc" {
  if (nature === "OBSTACLE") return "amber";
  if (nature === "ANNONCE") return "green";
  if (nature === "AVANCEMENT") return "blue";
  return "zinc";
}

/**
 * Tableau Kanban du Sprint actif + modale de validation DoD + historique Daily par étape.
 * Progression SÉQUENTIELLE verrouillée :
 * - Seules les étapes d'indice <= `currentStage` sont cliquables ; les suivantes
 *   sont grisées (le gris = inaccessible) et refusent toute interaction
 *   (pas de saut d'étape). Les cadenas 🔒 n'apparaissent que sur la base
 *   de progression en tête de page.
 * - Chaque étape sauf DONE (la dernière) porte un bouton « Passer à l'étape
 *   suivante » qui clôt l'étape courante (synthèse de clôture optionnelle —
 *   on peut ne rien écrire, le clic suffit) et déverrouille la suivante.
 * - Tickets avancés étape par étape (REVIEW → DONE via flèche, drag ou bouton
 *   d'étape) — gardes serveur anti-saut.
 * - Gestion quotidienne (flèches, drag, clôture) réservée aux Developers.
 * - DoD cochée uniquement dans DONE (dernière étape) par la Scrum Team
 *   (PO, SM, Dev) ; clôture à 100 % + commentaire obligatoire (Incrément),
 *   bouton strictement désactivé sinon.
 * - Notes du Daily : historique par étape en modale + saisie Developers / Scrum Master.
 * - Stakeholder en lecture seule absolue.
 * Charte : colonne/carte active = fond jaune sand-300 + texte bleu navy-900 en gras.
 */
export function SprintKanban({
  productId,
  teamId,
  sprintId,
  sprintTitle,
  sprintGoal,
  sprintStatus,
  focusItemId,
  currentStage,
  stageClosures,
  criteria,
  items,
  notes,
  canManageBoard,
  canCheck,
  canAddNote,
}: {
  productId: string;
  teamId: string;
  sprintId: string;
  sprintGoal: string | null;
  sprintTitle: string | null;
  sprintStatus: string;
  /** Suivi d'un item précis (?item=) — null = tous les items en même temps. */
  focusItemId: string | null;
  /** Étape la plus avancée déverrouillée (TODO → IN_PROGRESS → REVIEW → DONE). */
  currentStage: string;
  /** Synthèses de clôture persistées (TODO / IN_PROGRESS / REVIEW). */
  stageClosures: StageClosureVM[];
  criteria: SprintCriterionVM[];
  items: SprintItemVM[];
  /** Historique des notes de Daily Scrum du Sprint (persistées en base). */
  notes: DailyNoteVM[];
  /** Gestion quotidienne du tableau : Developers uniquement. */
  canManageBoard: boolean;
  /** Cochage DoD : Scrum Team (PO, SM, Dev). */
  canCheck: boolean;
  /** Saisie des notes Daily : Developers + Scrum Master (+ Admin). */
  canAddNote: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(focusItemId);
  const [dragId, setDragId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Notes du Daily : carte dépliée + brouillon de saisie rapide.
  const [notesOpenId, setNotesOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  // Modale d'historique des notes d'une étape (colonne) + saisie.
  const [stageDialogCol, setStageDialogCol] = useState<ColumnKey | null>(null);
  const [stageDraft, setStageDraft] = useState("");
  // Édition d'une note existante (id) + nature choisie + message d'avancement.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [stageNature, setStageNature] = useState<string>("AVANCEMENT");
  const [advanceMsg, setAdvanceMsg] = useState<string | null>(null);
  // Synthèses de clôture : brouillon par étape + message de clôture + édition.
  const [summaryDrafts, setSummaryDrafts] = useState<Record<string, string>>({});
  const [closeMsg, setCloseMsg] = useState<string | null>(null);
  const [editingSummaryStage, setEditingSummaryStage] = useState<string | null>(null);
  // Dernière étape : commentaire de validation DoD (obligatoire pour passer à DONE).
  const [validationComment, setValidationComment] = useState("");

  const total = criteria.length;
  const selected = items.find((i) => i.id === selectedId) ?? null;

  // Suivi par item (?item=) : Kanban filtré sur l'item concerné ;
  // sans focus, tous les items sont suivis en même temps.
  const displayItems = useMemo(
    () => (focusItemId ? items.filter((i) => i.id === focusItemId) : items),
    [items, focusItemId],
  );
  const focusedTitle = focusItemId
    ? (items.find((i) => i.id === focusItemId)?.title ?? null)
    : null;

  // Nouvel item ciblé → on déclenche son suivi (modale DoD ouverte).
  useEffect(() => {
    setSelectedId(focusItemId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusItemId, sprintId]);

  const safeCurrent: string = (BOARD_STAGE_ORDER as readonly string[]).includes(currentStage)
    ? currentStage
    : "TODO";

  const closuresByStage = useMemo(() => {
    const map = new Map<string, StageClosureVM>();
    for (const c of stageClosures) map.set(c.stage, c);
    return map;
  }, [stageClosures]);

  // Pré-remplit les brouillons de synthèse avec les valeurs persistées.
  useEffect(() => {
    setSummaryDrafts((prev) => {
      const next = { ...prev };
      for (const c of stageClosures) {
        if (!(c.stage in next)) next[c.stage] = c.summary ?? "";
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageClosures]);

  // Nouveau ticket sélectionné → commentaire de validation vierge.
  useEffect(() => {
    setValidationComment("");
  }, [selectedId]);

  /** Étape cliquable ? Seules les étapes <= courante (DONE toujours visible). */
  function unlocked(col: ColumnKey): boolean {
    if (col === "DONE") return true;
    return isStageUnlocked(col, safeCurrent);
  }
  function isCurrent(col: ColumnKey): boolean {
    return col === safeCurrent;
  }
  function isPast(col: ColumnKey): boolean {
    if (col === "DONE") return false;
    return boardStageIndex(col) < boardStageIndex(safeCurrent);
  }

  const byColumn = useMemo(() => {
    const map: Record<ColumnKey, SprintItemVM[]> = {
      TODO: [],
      IN_PROGRESS: [],
      REVIEW: [],
      DONE: [],
    };
    for (const item of displayItems) {
      map[columnFor(item)].push(item);
    }
    return map;
  }, [displayItems]);

  const titleById = useMemo(() => new Map(items.map((i) => [i.id, i.title] as const)), [items]);

  // Historique groupé par ticket (notes d'étape sans ticket exclues).
  const notesByItem = useMemo(() => {
    const map = new Map<string, DailyNoteVM[]>();
    for (const n of notes) {
      if (!n.backlogItemId) continue;
      const list = map.get(n.backlogItemId) ?? [];
      list.push(n);
      map.set(n.backlogItemId, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    }
    return map;
  }, [notes]);

  // Notes saisies sur une étape (colonne capturée à la saisie), ordre chronologique.
  const notesByStage = useMemo(() => {
    const map = new Map<ColumnKey, DailyNoteVM[]>();
    for (const n of notes) {
      if (!(MOVABLE as string[]).includes(n.column)) continue;
      const key = n.column as ColumnKey;
      const list = map.get(key) ?? [];
      list.push(n);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    }
    return map;
  }, [notes]);

  function run(fn: () => Promise<unknown>, closeOnSuccess = false) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        if (closeOnSuccess) setSelectedId(null);
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  function openStageDialog(col: ColumnKey) {
    // Étape verrouillée : pas cliquable — on n'ouvre pas la modale.
    if (!unlocked(col)) {
      setError(
        `Étape ${col} verrouillée : clôturez l'étape ${safeCurrent} (bouton « Passer à l'étape suivante ») pour la déverrouiller — pas de saut d'étape.`,
      );
      return;
    }
    setStageDialogCol(col);
    setStageDraft("");
    setEditingId(null);
    setStageNature("AVANCEMENT");
    setAdvanceMsg(null);
    setCloseMsg(null);
  }

  /** Fait progresser le flux d'une étape (résultat résumé en français). */
  function runAdvance(col: ColumnKey) {
    setError(null);
    setAdvanceMsg(null);
    startTransition(async () => {
      try {
        const res = await advanceStage(teamId, sprintId, col);
        const parts: string[] = [];
        if (res.moved > 0) parts.push(`${res.moved} ticket(s) déplacé(s)`);
        if (res.promoted > 0) parts.push(`${res.promoted} promu(s) en DONE ✓`);
        if (res.blocked > 0) parts.push(`${res.blocked} bloqué(s) (DoD incomplète)`);
        setAdvanceMsg(parts.length > 0 ? `Étape avancée : ${parts.join(" · ")}.` : "Aucun changement.");
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  /** Clôture l'étape courante (synthèse optionnelle) et déverrouille la suivante. */
  function runCloseStage(col: ColumnKey) {
    setError(null);
    setCloseMsg(null);
    const summary = (summaryDrafts[col] ?? "").trim();
    startTransition(async () => {
      try {
        const res = await closeStageAndUnlockNext(teamId, sprintId, col, summary);
        setCloseMsg(
          res.summarySaved
            ? `Étape ${res.closedStage} clôturée avec synthèse — ${res.unlockedStage} déverrouillée ✓.`
            : `Étape ${res.closedStage} clôturée — ${res.unlockedStage} déverrouillée ✓ (aucune synthèse, c'est autorisé).`,
        );
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  /** Met à jour la synthèse d'une étape déjà clôturée (sans changer l'étape courante). */
  function runUpdateSummary(col: ColumnKey) {
    setError(null);
    setCloseMsg(null);
    const summary = (summaryDrafts[col] ?? "").trim();
    startTransition(async () => {
      try {
        await updateStageSummary(teamId, sprintId, col, summary);
        setEditingSummaryStage(null);
        setCloseMsg(`Synthèse de ${col} mise à jour ✓.`);
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  const selectedCheck = selected
    ? checkDodComplete(
        criteria.map((c) => c.id),
        selected.checkedCriterionIds,
      )
    : null;
  const selectedGuard = selected
    ? guardDodComplete(
        criteria.map((c) => c.id),
        selected.checkedCriterionIds,
      )
    : null;
  const canPromote = selectedGuard?.ok === true;
  /** La DoD se coche uniquement dans DONE (dernière étape). */
  const selectedColumn = selected ? columnFor(selected) : null;
  const selectedInDone = selectedColumn === "DONE";

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-xl border border-sand-200 bg-white p-3 text-sm">
        <span className="rounded-lg bg-sand-300 px-2 py-0.5 font-bold text-navy-900">
          {sprintTitle ?? sprintGoal ?? "Sprint"}
        </span>{" "}
        <Badge tone="blue">{sprintStatus}</Badge>{" "}
        <span className="text-navy-900/60">
          {displayItems.length} item(s) suivi(s) · DoD : {total} critère(s) actif(s)
        </span>
        {focusedTitle && (
          <span className="ml-2 rounded-lg bg-navy-900 px-2 py-0.5 font-bold text-white">
            Suivi de : {focusedTitle}{" "}
            <a
              href={`/sprint?product=${productId}&team=${teamId}&sprint=${sprintId}`}
              className="underline"
              title="Revenir à tous les items"
            >
              (tous)
            </a>
          </span>
        )}
        {/* Stepper séquentiel : TODO → IN_PROGRESS → REVIEW → DONE */}
        <div
          className="mt-2 flex flex-wrap items-center gap-1 text-xs font-bold"
          aria-label="Progression des étapes"
        >
          {(BOARD_STAGE_ORDER as readonly string[]).map((stage, idx) => {
            const isCur = stage === safeCurrent;
            const isDoneStage = stage === "DONE";
            const past = !isDoneStage && boardStageIndex(stage) < boardStageIndex(safeCurrent);
            const locked = !isDoneStage && !isStageUnlocked(stage, safeCurrent);
            return (
              <span key={stage} className="flex items-center gap-1">
                {idx > 0 && <span className="text-navy-900/40">→</span>}
                <span
                  className={
                    isCur
                      ? "rounded-lg bg-navy-900 px-2 py-0.5 text-white"
                      : past
                        ? "rounded-lg bg-green-100 px-2 py-0.5 text-green-800"
                        : locked
                          ? "rounded-lg bg-zinc-100 px-2 py-0.5 text-zinc-500"
                          : "rounded-lg bg-sand-300 px-2 py-0.5 text-navy-900"
                  }
                  title={
                    isCur
                      ? "Étape courante — à clôturer pour déverrouiller la suivante"
                      : past
                        ? "Étape clôturée"
                        : locked
                          ? "Étape verrouillée — clôturez les précédentes d'abord"
                          : "Étape déverrouillée"
                  }
                >
                  {past ? "✓ " : locked ? "🔒 " : isCur ? "● " : ""}
                  {stage}
                </span>
              </span>
            );
          })}
          <span className="ml-1 font-normal text-navy-900/60">
            Étape courante : {safeCurrent} — clôturez-la pour déverrouiller la suivante (pas de saut).
          </span>
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {closeMsg && (
        <p role="status" className="rounded-lg bg-green-50 border border-green-200 p-2 text-sm font-bold text-green-800">
          {closeMsg}
        </p>
      )}

      {!canManageBoard && (
        <p className="rounded-lg bg-sand-300 p-2 text-xs font-bold text-navy-900">
          Gestion quotidienne réservée aux Developers —
          {canCheck
            ? " vous pouvez cocher la DoD (Scrum Team)."
            : " lecture seule."}
        </p>
      )}

      <div className="grid gap-3 md:grid-cols-4">
        {COLUMNS.map((col) => {
          const colLocked = !unlocked(col.key);
          const colIsCurrent = isCurrent(col.key);
          const colIsPast = isPast(col.key);
          const active = col.key === "REVIEW" && !colLocked;
          const stageNotes = notesByStage.get(col.key) ?? [];
          const closure = closuresByStage.get(col.key);
          const next = nextBoardStage(col.key);
          const isClosable = col.key !== "DONE";
          return (
            <section
              key={col.key}
              aria-label={col.label}
              aria-disabled={colLocked}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (!canManageBoard || colLocked) return;
                const id = (e.dataTransfer.getData("text/plain") || dragId) as string | null;
                setDragId(null);
                if (!id) return;
                const item = items.find((e2) => e2.id === id);
                if (!item || item.status === "DONE" || item.hasIncrement) return;
                if (columnFor(item) === col.key) return;
                // Persistant : mute boardColumn en base (DONE uniquement depuis
                // REVIEW, saut d'étape et étape verrouillée refusés côté serveur ;
                // la DoD se valide ensuite dans DONE).
                run(() => moveBoardColumn(teamId, sprintId, id, col.key));
              }}
              className={
                colLocked
                  ? "rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-3 opacity-70"
                  : active
                    ? "rounded-xl border border-sand-400 bg-sand-300/40 p-3"
                    : "rounded-xl border border-sand-200 bg-white p-3"
              }
            >
              <h3
                className={
                  colLocked
                    ? "px-1 text-sm font-semibold text-zinc-500"
                    : active
                      ? "rounded-lg bg-sand-300 px-2 py-1 text-sm font-bold text-navy-900"
                      : "px-1 text-sm font-semibold text-navy-900"
                }
              >
                {colLocked ? `${col.label} — verrouillée` : col.label}
                {colIsCurrent && isClosable && (
                  <span className="ml-1 rounded bg-navy-900 px-1.5 py-0.5 text-xs text-white">● courante</span>
                )}
                {colIsPast && (
                  <span className="ml-1 rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-800">✓ clôturée</span>
                )}
              </h3>
              <p className="mb-2 px-1 text-xs italic text-navy-900/60">{col.rule}</p>
              {/* DoD du projet : visible et à cocher uniquement dans DONE
                  (dernière étape), même quand la colonne est vide. */}
              {col.key === "DONE" && (
                <div className="mb-2 rounded-lg border border-sand-300 bg-sand-300/30 p-2">
                  <p className="rounded-lg bg-sand-300 px-2 py-0.5 text-xs font-bold text-navy-900">
                    DoD du projet — {total} critère(s) à cocher un par un
                  </p>
                  {total === 0 ? (
                    <p className="mt-1 px-1 text-xs text-navy-900/70">
                      Aucun critère DoD actif — définissez la DoD depuis /products ou /dod.
                    </p>
                  ) : (
                    <ul className="mt-1 flex flex-col gap-0.5 px-1">
                      {criteria.map((c) => (
                        <li key={c.id} className="text-xs font-bold text-navy-900">
                          ☐ {c.label}
                        </li>
                      ))}
                    </ul>
                  )}
                  {(() => {
                    const actionable = byColumn.DONE.find(
                      (i) => !i.hasIncrement && i.status !== "DONE",
                    );
                    return actionable ? (
                      <button
                        type="button"
                        onClick={() => setSelectedId(actionable.id)}
                        className="mt-1.5 w-full rounded-md bg-navy-900 px-2 py-1.5 text-xs font-bold text-white hover:bg-navy-800"
                      >
                        ☑ Cocher la DoD de « {actionable.title} »
                      </button>
                    ) : (
                      <p className="mt-1 px-1 text-xs italic text-navy-900/60">
                        {byColumn.DONE.length === 0
                          ? "Aucun ticket en DONE — avancez un ticket depuis REVIEW (flèche →) puis cliquez-le pour cocher."
                          : "Tous les tickets DONE sont validés ✓."}
                      </p>
                    );
                  })()}
                </div>
              )}
              {colLocked && (
                <p className="mb-2 rounded-lg bg-zinc-100 p-2 text-xs font-bold text-zinc-600">
                  Étape non cliquable — clôturez {safeCurrent} (bouton « Passer à l&apos;étape suivante »)
                  pour la déverrouiller. Saut d&apos;étape interdit.
                </p>
              )}
              <ul className="flex flex-col gap-2">
                {byColumn[col.key].map((item) => {
                  const done = item.checkedCriterionIds.length;
                  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                  const isActive = col.key !== "DONE";
                  const itemNotes = notesByItem.get(item.id) ?? [];
                  const notesOpen = notesOpenId === item.id;
                  const colIdx = MOVABLE.indexOf(col.key as (typeof MOVABLE)[number]);
                  return (
                    <li
                      key={item.id}
                      draggable={col.key !== "DONE" && canManageBoard && !colLocked}
                      onDragStart={(e) => {
                        if (!canManageBoard || colLocked) return;
                        e.dataTransfer.setData("text/plain", item.id);
                        setDragId(item.id);
                      }}
                      onDragEnd={() => setDragId(null)}
                      className={
                        colLocked
                          ? "rounded-lg border border-zinc-200 bg-zinc-100 p-2 text-sm text-zinc-500"
                          : isActive
                            ? "rounded-lg bg-sand-300 p-2 text-sm font-bold text-navy-900"
                            : "rounded-lg border border-green-200 bg-green-50 p-2 text-sm text-green-800"
                      }
                    >
                      <button
                        type="button"
                        disabled={colLocked}
                        onClick={() => setSelectedId(item.id)}
                        className={colLocked ? "w-full cursor-not-allowed text-left" : "w-full cursor-pointer text-left"}
                        title={
                          colLocked
                            ? `Étape ${col.key} verrouillée — déverrouillez-la d'abord`
                            : col.key === "DONE"
                              ? "Cliquer pour cocher la DoD (dernière étape)"
                              : "Cliquer pour voir le détail"
                        }
                      >
                        <span className="block">{item.title}</span>
                        {item.storyPoints != null && (
                          <span className="mt-0.5 block text-xs">♥ {item.storyPoints} pts</span>
                        )}
                        <span className="mt-1 block h-1.5 overflow-hidden rounded bg-white/70">
                          <span
                            className="block h-full bg-navy-900"
                            style={{ width: `${item.hasIncrement ? 100 : pct}%` }}
                          />
                        </span>
                        <span className="mt-0.5 block text-xs">
                          {item.hasIncrement ? "Increment livré ✓" : `DoD : ${done}/${total}`}
                        </span>
                        {col.key === "DONE" && !item.hasIncrement && (
                          <span className="mt-0.5 block text-xs font-bold underline">
                            👆 Cliquez pour cocher les critères →
                          </span>
                        )}
                      </button>
                      {/* Flèches de déplacement (persistant, Developers, hors DONE, étape déverrouillée) */}
                      {col.key !== "DONE" && canManageBoard && !colLocked && (
                        <div className="mt-1.5 flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            disabled={pending || colIdx <= 0}
                            onClick={() => run(() => moveBoardColumn(teamId, sprintId, item.id, MOVABLE[colIdx - 1]!))}
                            aria-label={`Reculer ${item.title} vers ${colIdx > 0 ? MOVABLE[colIdx - 1] : ""}`}
                            title="Colonne précédente (étape par étape, pas de saut)"
                            className="rounded-md bg-navy-900 px-2 py-0.5 text-xs font-bold text-white hover:bg-navy-800 disabled:opacity-40"
                          >
                            ←
                          </button>
                          <button
                            type="button"
                            disabled={pending || colIdx < 0 || colIdx >= MOVABLE.length - 1}
                            onClick={() => {
                              if (colIdx >= 0 && colIdx < MOVABLE.length - 1) {
                                run(() => moveBoardColumn(teamId, sprintId, item.id, MOVABLE[colIdx + 1]!));
                              }
                            }}
                            aria-label={`Avancer ${item.title} vers ${colIdx >= 0 && colIdx < MOVABLE.length - 1 ? MOVABLE[colIdx + 1] : "fin"}`}
                            title={
                              col.key === "REVIEW"
                                ? "Passer à DONE (la DoD se coche ensuite dans DONE)"
                                : "Colonne suivante (étape par étape, pas de saut)"
                            }
                            className="rounded-md bg-navy-900 px-2 py-0.5 text-xs font-bold text-white hover:bg-navy-800 disabled:opacity-40"
                          >
                            →
                          </button>
                          {col.key === "REVIEW" && (
                            <span className="text-xs font-normal text-navy-900/60">→ DONE puis DoD ✓</span>
                          )}
                        </div>
                      )}
                      {/* Notes du Daily (TODO / IN_PROGRESS / REVIEW uniquement, étape déverrouillée) */}
                      {col.key !== "DONE" && !colLocked && (
                        <div className="mt-1.5 border-t border-navy-900/15 pt-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setNotesOpenId(notesOpen ? null : item.id);
                              setDraft("");
                            }}
                            aria-expanded={notesOpen}
                            className="w-full rounded-md bg-navy-900 px-2 py-1 text-left text-xs font-bold text-white hover:bg-navy-800"
                          >
                            📝 Notes du Daily ({itemNotes.length})
                          </button>
                          {notesOpen && (
                            <div className="mt-1.5 flex flex-col gap-1.5 rounded-md bg-white/80 p-1.5">
                              {itemNotes.length === 0 && (
                                <p className="text-xs font-normal text-navy-900/60">
                                  Aucune note — premier Daily à résumer ci-dessous.
                                </p>
                              )}
                              <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto">
                                {itemNotes.map((n) => (
                                  <li key={n.id} className="rounded bg-sand-100 px-1.5 py-1 text-xs font-normal text-navy-900">
                                    <span className="font-bold">
                                      {new Date(n.createdAt).toLocaleString("fr-FR", {
                                        day: "2-digit",
                                        month: "2-digit",
                                        hour: "2-digit",
                                        minute: "2-digit",
                                      })}
                                    </span>{" "}
                                    <Badge tone="blue">{n.authorRole}</Badge>
                                    <span className="ml-1">[{n.column}]</span>
                                    <span className="block">{n.text}</span>
                                  </li>
                                ))}
                              </ul>
                              {canAddNote ? (
                                <form
                                  className="flex gap-1"
                                  onSubmit={(e) => {
                                    e.preventDefault();
                                    if (draft.trim().length < 2) return;
                                    const text = draft.trim();
                                    setDraft("");
                                    run(() => addDailyNote(teamId, sprintId, item.id, col.key, text, "AVANCEMENT"));
                                  }}
                                >
                                  <input
                                    value={draft}
                                    onChange={(e) => setDraft(e.target.value)}
                                    maxLength={500}
                                    placeholder="Ex. Ticket bloqué par la base de données…"
                                    aria-label={`Note Daily pour ${item.title}`}
                                    className="w-full rounded-md border border-sand-300 bg-white px-2 py-1 text-xs font-normal text-navy-900 placeholder:text-navy-900/40 focus:border-navy-900 focus:outline-none"
                                  />
                                  <button
                                    type="submit"
                                    disabled={pending || draft.trim().length < 2}
                                    aria-label="Ajouter la note"
                                    className="rounded-md bg-navy-900 px-2.5 py-1 text-sm font-bold text-white hover:bg-navy-800 disabled:opacity-50"
                                  >
                                    +
                                  </button>
                                </form>
                              ) : (
                                <p className="text-xs font-normal text-navy-900/60">
                                  Saisie réservée aux Developers et au Scrum Master.
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
                {byColumn[col.key].length === 0 && (
                  <li className="px-1 text-xs text-navy-900/50">
                    {col.key === "TODO" && "— vide — tirez des items depuis /planning."}
                    {col.key === "IN_PROGRESS" && "— vide — avancez les tickets depuis TODO (flèches, étape par étape)."}
                    {col.key === "REVIEW" && "— vide — avancez les tickets depuis IN_PROGRESS, puis cliquez un ticket pour cocher chaque critère DoD (100 % + commentaire)."}
                    {col.key === "DONE" && "— vide — aucun incrément : en REVIEW, cochez 100 % DoD + commentaire pour promouvoir en DONE."}
                  </li>
                )}
              </ul>

              {/* Clôture d'étape : bouton sauf DONE (dernière), synthèse optionnelle */}
              {isClosable && !colLocked && (
                <div className="mt-2 rounded-lg border border-sand-300 bg-white/70 p-2">
                  {colIsCurrent ? (
                    <>
                      <label
                        htmlFor={`closure-${col.key}`}
                        className="mb-1 block text-xs font-bold text-navy-900"
                      >
                        Synthèse de clôture de {col.key} (optionnelle)
                      </label>
                      <textarea
                        id={`closure-${col.key}`}
                        value={summaryDrafts[col.key] ?? ""}
                        onChange={(e) =>
                          setSummaryDrafts((p) => ({ ...p, [col.key]: e.target.value }))
                        }
                        maxLength={2000}
                        rows={2}
                        placeholder={`Ex. ${col.key} terminée : 3 tickets avancés, 1 obstacle levé… (vide autorisé)`}
                        className="w-full rounded-md border border-sand-300 bg-white px-2 py-1 text-xs text-navy-900 placeholder:text-navy-900/40 focus:border-navy-900 focus:outline-none"
                      />
                      {canManageBoard ? (
                        <>
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => runCloseStage(col.key)}
                            title={
                              next
                                ? `Clôture ${col.key} et déverrouille ${next}`
                                : `Clôture ${col.key}`
                            }
                            className="mt-1.5 w-full rounded-md bg-navy-900 px-2 py-1.5 text-xs font-bold text-white hover:bg-navy-800 disabled:opacity-50"
                          >
                            {pending ? "…" : `➡️ Passer à l'étape suivante${next ? ` (${next})` : ""}`}
                          </button>
                          <p className="mt-1 text-xs text-navy-900/60">
                            On peut ne rien écrire : le clic suffit à déverrouiller {next ?? "la suite"}.
                            Pas de saut d&apos;étape.
                          </p>
                        </>
                      ) : (
                        <p className="mt-1 text-xs font-bold text-navy-900/60">
                          Clôture réservée aux Developers.
                        </p>
                      )}
                    </>
                  ) : colIsPast ? (
                    <>
                      <p className="text-xs font-bold text-green-800">✓ Étape clôturée</p>
                      {closure?.summary ? (
                        <p className="mt-1 rounded bg-green-50 p-1.5 text-xs text-navy-900">
                          {closure.summary}
                        </p>
                      ) : (
                        <p className="mt-1 text-xs italic text-navy-900/60">
                          Clôturée sans synthèse (autorisé).
                        </p>
                      )}
                      {closure?.closedAt && (
                        <p className="mt-0.5 text-xs text-navy-900/50">
                          {new Date(closure.closedAt).toLocaleString("fr-FR", {
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      )}
                      {canManageBoard && (
                        editingSummaryStage === col.key ? (
                          <div className="mt-1.5">
                            <textarea
                              value={summaryDrafts[col.key] ?? ""}
                              onChange={(e) =>
                                setSummaryDrafts((p) => ({ ...p, [col.key]: e.target.value }))
                              }
                              maxLength={2000}
                              rows={2}
                              className="w-full rounded-md border border-sand-300 bg-white px-2 py-1 text-xs text-navy-900 focus:border-navy-900 focus:outline-none"
                            />
                            <div className="mt-1 flex gap-1.5">
                              <button
                                type="button"
                                disabled={pending}
                                onClick={() => runUpdateSummary(col.key)}
                                className="rounded-md bg-navy-900 px-2 py-1 text-xs font-bold text-white hover:bg-navy-800 disabled:opacity-50"
                              >
                                Enregistrer
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingSummaryStage(null);
                                  setSummaryDrafts((p) => ({ ...p, [col.key]: closure?.summary ?? "" }));
                                }}
                                className={buttonSecondary}
                              >
                                Annuler
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setEditingSummaryStage(col.key)}
                            className="mt-1 text-xs font-bold text-navy-900 underline"
                          >
                            Modifier la synthèse
                          </button>
                        )
                      )}
                    </>
                  ) : null}
                </div>
              )}

              {/* Pied de colonne : notes du Daily de l'étape (cliquable → modale, sauf verrou) */}
              {col.key !== "DONE" && (
                <button
                  type="button"
                  disabled={colLocked}
                  onClick={() => openStageDialog(col.key)}
                  title={
                    colLocked
                      ? `Étape verrouillée — clôturez ${safeCurrent} d'abord`
                      : "Voir l'historique des notes de cette étape"
                  }
                  className={
                    colLocked
                      ? "mt-2 w-full cursor-not-allowed rounded-lg px-1 py-1 text-left text-xs font-bold text-zinc-400"
                      : "mt-2 w-full rounded-lg px-1 py-1 text-left text-xs font-bold text-navy-900 hover:bg-sand-300/60"
                  }
                >
                  {colLocked ? `${stageNotes.length} note(s) — verrouillée` : `📝 ${stageNotes.length} note(s) du Daily sur cette étape`}
                </button>
              )}
            </section>
          );
        })}
      </div>

      {/* Modale d'historique des notes du Daily d'une étape */}
      {stageDialogCol && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Notes du Daily — étape ${stageDialogCol}`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/60 p-4"
          onClick={() => {
            if (!pending) setStageDialogCol(null);
          }}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl border border-sand-300 bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <h3 className="rounded-lg bg-sand-300 px-2 py-1 text-sm font-bold text-navy-900">
                📝 Notes du Daily — {stageDialogCol}
                {isCurrent(stageDialogCol) && stageDialogCol !== "DONE" && " ● courante"}
              </h3>
              <button
                type="button"
                onClick={() => setStageDialogCol(null)}
                className={buttonSecondary}
                aria-label="Fermer"
              >
                ✕
              </button>
            </div>
            {!unlocked(stageDialogCol) ? (
              <p className="rounded-lg bg-zinc-100 p-2 text-sm font-bold text-zinc-600">
                Étape verrouillée : clôturez {safeCurrent} (bouton « Passer à l&apos;étape suivante » +
                synthèse de clôture) pour la déverrouiller. Pas de saut d&apos;étape.
              </p>
            ) : (
              <>
                <p className="mb-3 text-xs text-navy-900/60">
                  Historique chronologique des commentaires saisis pour cette étape.
                </p>

                <ul className="mb-3 flex flex-col gap-1.5 overflow-y-auto pr-1">
                  {(!(notesByStage.get(stageDialogCol) ?? []).length) && (
                    <li className="text-sm text-navy-900/60">
                      Aucune note sur cette étape — premier Daily à résumer ci-dessous (vide autorisé pour clôturer).
                    </li>
                  )}
                  {(notesByStage.get(stageDialogCol) ?? []).map((n) => (
                    <li
                      key={n.id}
                      className={
                        editingId === n.id
                          ? "rounded-lg border-2 border-navy-900 bg-sand-300 px-2 py-1.5 text-sm font-bold text-navy-900"
                          : "rounded-lg bg-sand-100 px-2 py-1.5 text-sm text-navy-900"
                      }
                    >
                      <span className="font-bold">
                        {n.title ?? dailyNoteTitleFor(new Date(n.createdAt))}
                      </span>{" "}
                      <span className="text-navy-900/60">
                        {new Date(n.createdAt).toLocaleString("fr-FR", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>{" "}
                      <Badge tone="blue">{n.authorRole}</Badge>{" "}
                      <Badge tone={natureTone(n.nature)}>{noteNatureLabel(n.nature)}</Badge>
                      {n.backlogItemId && (
                        <> <span className="font-bold">{titleById.get(n.backlogItemId) ?? "Ticket"}</span></>
                      )}
                      <span className="block">{n.text}</span>
                      {canAddNote && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(n.id);
                            setStageDraft(n.text);
                            setAdvanceMsg(null);
                          }}
                          title="Corriger cette note (titre, date et nature conservés)"
                          className="mt-1 rounded-md border border-navy-900/30 px-1.5 py-0.5 text-xs font-bold text-navy-900 hover:bg-sand-300"
                        >
                          ✏️ Modifier
                        </button>
                      )}
                    </li>
                  ))}
                </ul>

                {canAddNote ? (
                  <form
                    className="flex flex-col gap-2 border-t border-sand-200 pt-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (stageDraft.trim().length < 2) return;
                      const text = stageDraft.trim();
                      if (editingId) {
                        const id = editingId;
                        setEditingId(null);
                        setStageDraft("");
                        // Mise à jour : écrase le texte, conserve titre/date/nature.
                        run(() => updateDailyNote(teamId, id, text));
                      } else {
                        setStageDraft("");
                        // Note d'étape : rattachée à la colonne, sans ticket.
                        run(() => addDailyNote(teamId, sprintId, null, stageDialogCol, text, stageNature));
                      }
                    }}
                  >
                    {editingId ? (
                      <p className="rounded-lg bg-sand-300 p-2 text-xs font-bold text-navy-900">
                        ✏️ Correction en cours (titre, date et nature conservés) —{" "}
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(null);
                            setStageDraft("");
                          }}
                          className="underline"
                        >
                          Annuler
                        </button>
                      </p>
                    ) : (
                      <>
                        <label className="text-xs font-bold text-navy-900" htmlFor="stage-note-nature">
                          Nature du point
                        </label>
                        <select
                          id="stage-note-nature"
                          value={stageNature}
                          onChange={(e) => setStageNature(e.target.value)}
                          className="w-full rounded-md border border-sand-300 bg-white px-2 py-1.5 text-sm font-bold text-navy-900 focus:border-navy-900 focus:outline-none"
                        >
                          {NOTE_NATURES.map((nat) => (
                            <option key={nat} value={nat}>
                              {noteNatureLabel(nat)}
                            </option>
                          ))}
                        </select>
                      </>
                    )}
                    <label className="text-xs font-bold text-navy-900" htmlFor="stage-note-text">
                      {editingId ? "Texte corrigé" : "Nouvelle note du Daily"}
                    </label>
                    <textarea
                      id="stage-note-text"
                      value={stageDraft}
                      onChange={(e) => setStageDraft(e.target.value)}
                      maxLength={500}
                      rows={3}
                      placeholder="Ex. Daily du 03/10 : Ticket bloqué par l'environnement de staging"
                      className="w-full rounded-md border border-sand-300 bg-white px-2 py-1.5 text-sm text-navy-900 placeholder:text-navy-900/40 focus:border-navy-900 focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={pending || stageDraft.trim().length < 2}
                      className={buttonPrimary}
                    >
                      {pending ? "…" : editingId ? "Mettre à jour la note" : "Enregistrer la note du Daily"}
                    </button>
                  </form>
                ) : (
                  <p className="rounded-lg bg-sand-300 p-2 text-xs font-bold text-navy-900">
                    Saisie réservée aux Developers et au Scrum Master.
                  </p>
                )}

                {/* Clôture d'étape depuis la modale : déverrouille la suivante */}
                {stageDialogCol !== "DONE" && (
                  <div className="mt-3 border-t border-sand-200 pt-3">
                    {isCurrent(stageDialogCol) ? (
                      <>
                        <label
                          htmlFor="modal-closure-summary"
                          className="mb-1 block text-xs font-bold text-navy-900"
                        >
                          Synthèse de clôture de {stageDialogCol} (optionnelle — vide autorisé)
                        </label>
                        <textarea
                          id="modal-closure-summary"
                          value={summaryDrafts[stageDialogCol] ?? ""}
                          onChange={(e) =>
                            setSummaryDrafts((p) => ({ ...p, [stageDialogCol]: e.target.value }))
                          }
                          maxLength={2000}
                          rows={2}
                          placeholder={`Ex. Fin de ${stageDialogCol} : tout est prêt pour ${nextBoardStage(stageDialogCol) ?? "la suite"}…`}
                          className="w-full rounded-md border border-sand-300 bg-white px-2 py-1.5 text-sm text-navy-900 placeholder:text-navy-900/40 focus:border-navy-900 focus:outline-none"
                        />
                        {canManageBoard ? (
                          <>
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() => runCloseStage(stageDialogCol)}
                              title={`Clôture ${stageDialogCol} et déverrouille ${nextBoardStage(stageDialogCol) ?? "la suite"}`}
                              className={`${buttonPrimary} mt-2 w-full`}
                            >
                              {pending ? "…" : `➡️ Passer à l'étape suivante${nextBoardStage(stageDialogCol) ? ` (${nextBoardStage(stageDialogCol)})` : ""}`}
                            </button>
                            {closeMsg && (
                              <p className="mt-1 rounded-lg bg-green-50 border border-green-200 p-2 text-xs font-bold text-green-800">
                                {closeMsg}
                              </p>
                            )}
                          </>
                        ) : (
                          <p className="mt-1 text-xs font-bold text-navy-900/60">
                            Clôture réservée aux Developers.
                          </p>
                        )}
                      </>
                    ) : (
                      <>
                        {(() => {
                          const cl = closuresByStage.get(stageDialogCol);
                          return (
                            <div className="rounded-lg bg-green-50 border border-green-200 p-2 text-xs text-navy-900">
                              <p className="font-bold text-green-800">✓ Étape clôturée</p>
                              <p className="mt-1">{cl?.summary ?? "Clôturée sans synthèse (autorisé)."}</p>
                            </div>
                          );
                        })()}
                      </>
                    )}
                  </div>
                )}

                {/* Transition d'étape : fait progresser le flux (Developers, destination déverrouillée). */}
                {canManageBoard && (byColumn[stageDialogCol].length > 0) && stageDialogCol !== "DONE" && (
                  <div className="mt-3 border-t border-sand-200 pt-3">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => runAdvance(stageDialogCol)}
                      title={
                        stageDialogCol === "REVIEW"
                          ? "Fait passer les tickets en DONE (la DoD se coche ensuite dans DONE)"
                          : `Déplace tous les tickets de ${stageDialogCol} vers l'étape suivante (si déverrouillée)`
                      }
                      className={buttonSecondary}
                    >
                      {pending ? "…" : stageDialogCol === "REVIEW" ? "➡️ Tout passer à DONE" : "➡️ Déplacer les tickets vers l'étape suivante"}
                    </button>
                    <p className="mt-1 text-xs text-navy-900/60">
                      {stageDialogCol === "REVIEW"
                        ? "Les tickets passent en DONE, où vous cocherez les 4 critères + commentaire pour clore à 100 %."
                        : `Tous les tickets de ${stageDialogCol} avancent d'une colonne (étape suivante doit être déverrouillée).`}
                    </p>
                    {advanceMsg && (
                      <p className="mt-1 rounded-lg bg-sand-300 p-2 text-xs font-bold text-navy-900">
                        {advanceMsg}
                      </p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Modale de validation DoD (dernière étape DONE : on y coche chaque critère) */}
      {selected && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Validation DoD — ${selected.title}`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/60 p-4"
          onClick={() => {
            if (!pending) setSelectedId(null);
          }}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-sand-300 bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <h3 className="rounded-lg bg-sand-300 px-2 py-1 text-sm font-bold text-navy-900">
                Validation DoD — {selected.title}
              </h3>
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className={buttonSecondary}
                aria-label="Fermer"
              >
                ✕
              </button>
            </div>
            <p className="mb-3 text-xs text-navy-900/60">
              Dernière étape DONE : cochez les 4 critères un par un — Scrum Team (PO, SM, Dev).
              À 100 % + commentaire, l&apos;item est promu en Incrément (validé côté serveur).{" "}
              {selectedCheck ? `${selected.checkedCriterionIds.length}/${total} — ${selectedCheck.complete ? "100 %, clôturable" : `manquants : ${selectedCheck.missing.length}`}` : ""}
            </p>
            {!selectedInDone && !selected.hasIncrement && (
              <p className="mb-2 rounded-lg bg-sand-300 p-2 text-xs font-bold text-navy-900">
                Ticket en {selectedColumn} : avancez-le en DONE (flèche → ou bouton d&apos;étape) pour cocher la DoD — pas de saut d&apos;étape.
              </p>
            )}
            {!canCheck && (
              <p className="mb-2 rounded-lg bg-sand-300 p-2 text-xs font-bold text-navy-900">
                Lecture seule : cochage réservé à la Scrum Team (Stakeholder exclu).
              </p>
            )}

            {total === 0 && (
              <p className="text-sm text-navy-900/70">
                Aucun critère DoD actif pour ce produit — définissez la DoD depuis /products ou /dod.
              </p>
            )}

            <ul className="flex flex-col gap-1.5">
              {criteria.map((c) => {
                const checked = selected.checkedCriterionIds.includes(c.id);
                return (
                  <li key={c.id}>
                    <label
                      className={
                        checked
                          ? "flex cursor-pointer items-center gap-2 rounded-lg bg-sand-300 p-2 text-sm font-bold text-navy-900"
                          : "flex cursor-pointer items-center gap-2 rounded-lg border border-sand-200 p-2 text-sm text-navy-900"
                      }
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={pending || selected.hasIncrement || !canCheck || !selectedInDone}
                        onChange={(e) =>
                          run(() => setDodCheck(productId, selected.id, c.id, e.target.checked))
                        }
                        className="h-4 w-4"
                      />
                      {c.label}
                    </label>
                  </li>
                );
              })}
            </ul>

            <div className="mt-4 flex flex-col gap-2">
              <label htmlFor="dod-validation-comment" className="text-xs font-bold text-navy-900">
                Commentaire de validation DoD (obligatoire pour clore à 100 %)
              </label>
              <textarea
                id="dod-validation-comment"
                value={validationComment}
                onChange={(e) => setValidationComment(e.target.value)}
                maxLength={500}
                rows={3}
                placeholder="Ex. DoD validée à 100 % : tests verts, revue OK, docs à jour…"
                disabled={selected.hasIncrement}
                className="w-full rounded-md border border-sand-300 bg-white px-2 py-1.5 text-sm text-navy-900 placeholder:text-navy-900/40 focus:border-navy-900 focus:outline-none"
              />
              <p className="text-xs text-navy-900/60">
                Ce commentaire classe l&apos;item comme valide DoD et est conservé dans l&apos;historique du ticket.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={
                    !canPromote ||
                    pending ||
                    selected.hasIncrement ||
                    !canCheck ||
                    !selectedInDone ||
                    validationComment.trim().length < 2
                  }
                  onClick={() => run(() => promoteToIncrement(selected.id, validationComment.trim()), true)}
                  className={buttonPrimary}
                  title={
                    selected.hasIncrement
                      ? "Déjà promu en Increment"
                      : !selectedInDone
                        ? "Avancez le ticket en DONE pour valider la DoD"
                        : !canPromote
                          ? (selectedGuard && !selectedGuard.ok
                              ? selectedGuard.message
                              : "DoD incomplète : cochez les 4 critères dans DONE")
                          : validationComment.trim().length < 2
                            ? "Ajoutez le commentaire de validation DoD (obligatoire)"
                            : "DoD 100 % + commentaire — clôture autorisée dans DONE"
                  }
                >
                  {pending ? "…" : "Clore à 100 % DoD (Incrément)"}
                </button>
                {(!canPromote || !selectedInDone || validationComment.trim().length < 2) && !selected.hasIncrement && (
                  <span className="text-xs text-orange-800">
                    En DONE : cochez les 4 critères ET renseignez le commentaire pour clore à 100 %.
                  </span>
                )}
                {selected.hasIncrement && (
                  <Badge tone="green">Increment livré ✓</Badge>
                )}
              </div>
            </div>
            <p className="mt-2 text-xs text-navy-900/60">
              Promotion possible uniquement depuis REVIEW (avancez le ticket étape par étape, pas de saut).
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
