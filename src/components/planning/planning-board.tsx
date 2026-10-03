"use client";

import { useRef, useState, useTransition } from "react";
import {
  canCreateSprint,
  canStartSprint,
  isOpenSprintStatus,
} from "@/lib/scrum-rules";
import { createSprint, pullItemToSprint, startSprint } from "@/app/actions/planning";
import { Badge, buttonPrimary, buttonSecondary, inputClass } from "@/components/ui";

export type PlanningBacklogItemVM = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  storyPoints: number | null;
};

export type PlanningSprintVM = {
  id: string;
  title: string | null;
  goal: string | null;
  status: string;
  startDate: string;
  endDate: string;
  itemCount: number;
};

type Props = {
  teamId: string;
  productId: string;
  backlogItems: PlanningBacklogItemVM[];
  sprint: PlanningSprintVM | null;
  /** Verrou calculé serveur via guardStartSprint / guardCreateSprint (source de vérité). */
  serverLocked: boolean;
  serverLockMessage: string | null;
  /** Planification collective PO/SM/Dev — Stakeholder en lecture seule. */
  canPlan: boolean;
};

/**
 * Double vue Planning : Product Backlog (gauche) / Sprint courant (droite).
 * - Boîte de gauche : TOUS les items du produit hors Sprint et non DONE
 *   (sprintId null, statut != DONE) — sans filtre restrictif.
 * - Bandeau "⚠️ Sprint verrouillé" orange/rouge si un Sprint est ouvert.
 * - Création glisser-d'abord : on glisse (ou « ＋ Composer ») des fiches READY
 *   dans la zone de composition — les fiches restent visibles, et la création
 *   (titre + objectif + dates) ne se valide qu'après le glissé (≥ 1 fiche,
 *   sinon bloquée client + serveur).
 * - Assignation au Sprint courant par clic OU drag-and-drop → Server Action
 *   `pullItemToSprint` (garde backend : Scrum Team + item READY + séquence).
 * Charte : actif = bg-sand-300 + text-navy-900 gras.
 */
export function PlanningBoard({
  teamId,
  productId,
  backlogItems,
  sprint,
  serverLocked,
  serverLockMessage,
  canPlan,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const dragIdRef = useRef<string | null>(null);

  // Pré-contrôle client (affichage) — la décision autoritative est serveur.
  const openSprintForRules = sprint && isOpenSprintStatus(sprint.status) ? { status: sprint.status } : null;
  const clientCreateGuard = canCreateSprint(openSprintForRules);
  const clientStartGuard = canStartSprint(
    sprint && sprint.status !== "PLANNING" ? { status: sprint.status } : null,
  );
  void productId;
  void clientStartGuard;

  // Items cochables à la création : READY uniquement, 1 minimum exigé.
  const readyChoices = backlogItems.filter((i) => i.status === "READY");
  // Composition du nouveau Sprint par glissé : les fiches glissées restent
  // visibles ici, et la création ne se valide qu'après le glissé (≥ 1 fiche).
  const [stagedIds, setStagedIds] = useState<string[]>([]);
  const stagedItems = stagedIds
    .map((id) => backlogItems.find((i) => i.id === id))
    .filter((i): i is PlanningBacklogItemVM => i != null);

  function stageItem(itemId: string) {
    const item = backlogItems.find((i) => i.id === itemId);
    if (!item) return;
    if (item.status !== "READY") {
      setError(`« ${item.title} » n'est pas READY : affinez puis estimez d'abord.`);
      return;
    }
    setError(null);
    setStagedIds((prev) => (prev.includes(itemId) ? prev : [...prev, itemId]));
    setShowCreate(true);
  }

  const locked = serverLocked || !clientCreateGuard.ok;
  const lockMessage =
    serverLockMessage ??
    (!clientCreateGuard.ok && "message" in clientCreateGuard ? clientCreateGuard.message : null);

  function run(fn: () => Promise<unknown>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  const handlePull = (itemId: string) => {
    if (!canPlan) {
      setError("Lecture seule : seuls PO, SM et Dev associent des items au Sprint.");
      return;
    }
    if (!sprint) {
      setError("Créez d'abord un Sprint pour y tirer des items.");
      return;
    }
    run(() => pullItemToSprint(teamId, sprint.id, itemId));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const id = dragIdRef.current ?? dragId;
    setDragId(null);
    dragIdRef.current = null;
    if (id) handlePull(id);
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Bandeau d'alerte verrouillage — orange/rouge */}
      {locked && (
        <div
          role="alert"
          className="rounded-xl border border-orange-300 bg-orange-100 p-3 text-sm font-medium text-orange-900"
        >
          <span className="font-bold">⚠️ Sprint verrouillé</span>
          {lockMessage ? ` — ${lockMessage}` : " — un Sprint est déjà actif ou en cours de planification pour cette équipe."}{" "}
          Clôturez-le (CLOSED) avant de démarrer le suivant. Un seul Sprint ouvert à la fois.
        </div>
      )}

      {/* Création Sprint — bouton désactivé si verrouillé ou lecture seule SH */}
      <div className="rounded-xl border border-sand-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-navy-900">Sprint courant</h2>
          <button
            type="button"
            disabled={locked || pending || !canPlan}
            onClick={() => setShowCreate((v) => !v)}
            className={buttonPrimary}
            title={
              !canPlan
                ? "Lecture seule : planification réservée à la Scrum Team (PO, SM, Dev)"
                : locked
                  ? "Création verrouillée tant que le Sprint précédent n'est pas CLOSED"
                  : "Créer un nouveau Sprint"
            }
          >
            Créer un nouveau Sprint
          </button>
        </div>
        {!canPlan && (
          <p className="mt-2 rounded-lg bg-sand-300 p-2 text-xs font-bold text-navy-900">
            Lecture seule : la planification est un effort collectif PO / SM / Dev
            (Stakeholder exclu).
          </p>
        )}
        {showCreate && !locked && canPlan && (
          <div className="mt-3 flex flex-col gap-2">
            {/* Zone de dépôt : les fiches glissées s'affichent ici avant validation. */}
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const id = dragIdRef.current ?? dragId;
                setDragId(null);
                dragIdRef.current = null;
                if (id) stageItem(id);
              }}
              className={
                stagedItems.length > 0
                  ? "rounded-lg border-2 border-dashed border-navy-900 bg-sand-100 p-3"
                  : "rounded-lg border-2 border-dashed border-sand-300 bg-sand-50 p-3"
              }
            >
              <p className="text-xs font-bold text-navy-900">
                Glissez ici les items READY du backlog ({stagedItems.length} fiche(s)) — la création ne se valide qu&apos;après le glissé.
              </p>
              {stagedItems.length === 0 ? (
                <p className="mt-1 text-xs text-navy-900/60">
                  Aucune fiche glissée pour l&apos;instant — déposez des items READY depuis le Product Backlog ci-dessous.
                </p>
              ) : (
                <ul className="mt-2 flex flex-col gap-1.5">
                  {stagedItems.map((item) => (
                    <li
                      key={item.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-sand-300 p-2 text-sm font-bold text-navy-900"
                    >
                      <span>
                        <Badge tone="blue">{item.status}</Badge> {item.title}{" "}
                        {item.storyPoints != null && <span>♥ {item.storyPoints}</span>}
                      </span>
                      <button
                        type="button"
                        onClick={() => setStagedIds((prev) => prev.filter((x) => x !== item.id))}
                        aria-label={`Retirer ${item.title}`}
                        title="Retirer cette fiche"
                        className="rounded-md bg-navy-900 px-2 py-0.5 text-xs font-bold text-white hover:bg-navy-800"
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <form
              className="flex flex-col gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (stagedIds.length < 1) {
                  setError("Glissez d'abord un ou plusieurs items READY — création bloquée sans fiche glissée.");
                  return;
                }
                const fd = new FormData(e.currentTarget);
                run(async () => {
                  const res = await createSprint(teamId, undefined, fd);
                  if (res?.error) throw new Error(res.error);
                  setShowCreate(false);
                  setStagedIds([]);
                });
              }}
            >
              {stagedIds.map((id) => (
                <input key={id} type="hidden" name="itemIds" value={id} />
              ))}
              <input name="title" required minLength={3} maxLength={120} placeholder="Titre du Sprint (propagé aux filtres)" className={inputClass} />
              <input name="goal" required minLength={5} placeholder="Objectif de Sprint" className={inputClass} />
              <div className="grid grid-cols-2 gap-2">
                <input name="startDate" type="date" required className={inputClass} aria-label="Début" />
                <input name="endDate" type="date" required className={inputClass} aria-label="Fin" />
              </div>
              {readyChoices.length === 0 && (
                <p className="rounded-lg bg-sand-300 p-2 text-xs font-bold text-navy-900">
                  Aucun item READY — affinez puis estimez des items depuis le Product Backlog avant de créer le Sprint.
                </p>
              )}
              <div>
                <button
                  type="submit"
                  disabled={pending || stagedIds.length < 1}
                  title={stagedIds.length < 1 ? "Glissez au moins une fiche READY ci-dessus pour valider" : "Créer le Sprint avec les fiches glissées"}
                  className={buttonSecondary}
                >
                  {pending ? "…" : `Valider la création (${stagedIds.length} item(s))`}
                </button>
              </div>
            </form>
          </div>
        )}
        {locked && (
          <p className="mt-2 text-xs text-orange-800">
            Bouton désactivé : séquence stricte — Sprint précédent non clôturé.
          </p>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {/* Double vue */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Gauche : Product Backlog du produit (sprintId null, non DONE) */}
        <section
          aria-label="Product Backlog"
          className="rounded-xl border border-sand-200 bg-white p-4 shadow-sm"
        >
          <h3 className="mb-1 font-semibold text-navy-900">
            Product Backlog ({backlogItems.length})
          </h3>
          <p className="mb-1 text-xs text-navy-900/60">
            Tous les items du produit hors Sprint et non DONE — glissez-déposez
            vers le Sprint courant ou vers la composition du nouveau Sprint
            (seuls les items « prêts » peuvent être tirés / glissés).
          </p>
          <p
            className="mb-2 cursor-help text-xs text-navy-900/50"
            title="Score de priorité calculé selon la Valeur Métier divisée par l'Effort (Story Points)"
          >
            ⓘ Score de priorité calculé selon la Valeur Métier divisée par l&apos;Effort (Story Points)
          </p>
          {!sprint && (
            <div
              role="status"
              className="mb-2 rounded-lg bg-sand-300 p-2 text-sm font-bold text-navy-900"
            >
              Veuillez créer un Sprint ci-dessus pour y ajouter des items
            </div>
          )}
          <ul className="flex flex-col gap-2">
            {backlogItems.map((item) => {
              const ready = item.status === "READY";
              return (
                <li
                  key={item.id}
                  draggable={(!!sprint || (!locked && canPlan)) && !pending && canPlan}
                  onDragStart={() => {
                    dragIdRef.current = item.id;
                    setDragId(item.id);
                  }}
                  onDragEnd={() => {
                    dragIdRef.current = null;
                    setDragId(null);
                  }}
                  className={
                    ready
                      ? "cursor-grab rounded-lg bg-sand-300 p-2 text-sm font-bold text-navy-900 active:cursor-grabbing"
                      : "rounded-lg border border-sand-200 bg-sand-50 p-2 text-sm text-navy-900/80"
                  }
                  title={
                    ready
                      ? "Glisser vers le Sprint (courant ou composition) — Score : Valeur Métier / Effort (Story Points)"
                      : "Cliquer pour tenter le tirage (réservé aux items READY : affinez puis estimez d'abord)"
                  }
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={ready ? "blue" : item.status === "REFINED" ? "amber" : "zinc"}>{item.status}</Badge>
                    {item.storyPoints != null && (
                      <span className="inline-flex items-center gap-1">
                        <Badge>♥ {item.storyPoints}</Badge>
                        <span
                          className="cursor-help text-xs text-navy-900/50"
                          title="Score de priorité calculé selon la Valeur Métier divisée par l'Effort (Story Points)"
                        >
                          ⓘ
                        </span>
                      </span>
                    )}
                    <span>{item.title}</span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      disabled={!sprint || pending || !canPlan}
                      onClick={() => handlePull(item.id)}
                      className={buttonSecondary}
                    >
                      {ready ? "Tirer en Sprint →" : "Tirer en Sprint → (exige READY)"}
                    </button>
                    {!locked && canPlan && (
                      <button
                        type="button"
                        disabled={pending || stagedIds.includes(item.id)}
                        onClick={() => stageItem(item.id)}
                        title="Ajouter cette fiche à la composition du nouveau Sprint (sans glisser)"
                        className={buttonSecondary}
                      >
                        {stagedIds.includes(item.id) ? "✓ Composé" : "＋ Composer"}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
            {backlogItems.length === 0 && (
              <li className="text-sm text-navy-900/70">
                Aucun item hors Sprint pour ce produit — ajoutez des items depuis le Product Backlog.
              </li>
            )}
          </ul>
        </section>

        {/* Droite : Sprint courant + bouton Démarrer */}
        <section
          aria-label="Sprint courant"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          className={
            dragId
              ? "rounded-xl border-2 border-dashed border-navy-900 bg-sand-100 p-4 shadow-sm"
              : "rounded-xl border border-sand-200 bg-white p-4 shadow-sm"
          }
        >
          <h3 className="mb-1 font-semibold text-navy-900">Sprint courant</h3>
          {!sprint && (
            <p className="text-sm text-navy-900/70">
              Aucun Sprint — créez-en un ci-dessus (déposez ensuite les items ici).
            </p>
          )}
          {sprint && (
            <div className="flex flex-col gap-2">
              <div className="rounded-lg bg-sand-300 p-2 text-sm font-bold text-navy-900">
                {sprint.title ?? sprint.goal ?? "Sprint sans titre"} — {sprint.status} · {sprint.itemCount} item(s)
              </div>
              <p className="text-xs text-navy-900/60">
                {new Date(sprint.startDate).toLocaleDateString("fr-FR")} →{" "}
                {new Date(sprint.endDate).toLocaleDateString("fr-FR")} — déposez les items « prêts » ici.
              </p>
              {sprint.status === "PLANNING" && (
                <div>
                  <button
                    type="button"
                    disabled={pending || !canPlan}
                    onClick={() => run(() => startSprint(teamId, sprint.id))}
                    className={buttonPrimary}
                  >
                    {pending ? "…" : "Démarrer le Sprint"}
                  </button>
                </div>
              )}
              {sprint.status !== "PLANNING" && (
                <p className="text-xs text-navy-900/60">
                  Sprint {sprint.status} — démarrage déjà effectué.
                </p>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
