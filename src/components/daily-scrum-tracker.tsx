"use client";

import { useState, useTransition } from "react";
import { dailyProgress } from "@/lib/scrum-rules";
import {
  closeDailyDefinitively,
  setDailyTotal,
  validateDaily,
} from "@/app/actions/planning";
import { Badge, buttonPrimary, buttonSecondary } from "@/components/ui";

/**
 * Compteur de Daily Scrums répétés (étape 2) — charte sand-300 / navy-900.
 * - État dynamique : « Daily effectués : [X] / [TOTAL] » (remplace l'état figé).
 * - [TOTAL] modifiable par le Scrum Master (défaut 20 ≈ 1 mois) via petit input numérique.
 * - « ✓ Valider le Daily du jour » : +1 et reset du chrono 15 min pour le lendemain.
 * - « 🛑 Clôture définitive des Daily » : fige le compteur final, passe l'étape
 *   au statut « Terminé » (barre verte) et débloque « 3. Sprint Review ».
 * - Tant que la clôture n'est pas posée, l'étape reste active (notes + validations).
 */
export function DailyScrumTracker({
  teamId,
  eventId,
  dailyCount,
  dailyTotal,
  completed,
  timeboxMinutes,
  canManage,
}: {
  teamId: string;
  eventId: string;
  dailyCount: number;
  dailyTotal: number;
  completed: boolean;
  timeboxMinutes: number;
  /** Scrum Master uniquement pour TOTAL / Valider / Clôturer. */
  canManage: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [totalDraft, setTotalDraft] = useState<string>(String(dailyTotal ?? 20));

  const count = Math.max(0, dailyCount ?? 0);
  const total = Math.max(1, dailyTotal ?? 20);
  const pct = completed ? 100 : dailyProgress(count, total);
  const atMax = count >= total;

  function run(fn: () => Promise<unknown>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Action impossible.");
      }
    });
  }

  return (
    <div className="w-full">
      {/* Compteur dynamique */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {completed ? (
          <span className="rounded-lg bg-sand-300 px-2 py-1 text-sm font-bold text-navy-900">
            {count} Daily effectués — étape terminée ✓
          </span>
        ) : (
          <span className="rounded-lg bg-sand-300 px-2 py-1 text-sm font-bold text-navy-900">
            Daily effectués : {count} / {total}
          </span>
        )}
        <Badge tone={completed ? "green" : atMax ? "amber" : "blue"}>
          {completed ? "Terminé ✓" : atMax ? "TOTAL atteint" : "En cours"}
        </Badge>
        <span className="text-xs text-navy-900/70">
          Chrono journalier : {timeboxMinutes} min — réinitialisé à chaque validation pour le lendemain.
        </span>
      </div>

      {/* Barre de progression (verte à la clôture définitive) */}
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-sand-100">
        <div
          className={`h-full rounded-full ${completed ? "bg-green-600" : "bg-navy-900"}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {!completed && (
        <p className="mt-1 text-xs font-bold text-navy-900">
          Étape 2 active : l&apos;équipe peut continuer à ajouter des notes de Daily et à valider chaque jour.
        </p>
      )}
      {completed && (
        <p className="mt-1 rounded-lg bg-green-50 p-2 text-xs font-bold text-green-800">
          ✅ Compteur final figé — accès débloqué : 3. Sprint Review.
        </p>
      )}

      {/* TOTAL paramétrable (Scrum Master) */}
      {!completed && canManage && (
        <form
          className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-navy-900/30 bg-white/60 p-2"
          onSubmit={(e) => {
            e.preventDefault();
            const v = Math.floor(Number(totalDraft));
            run(() => setDailyTotal(teamId, eventId, v));
          }}
        >
          <label htmlFor={`daily-total-${eventId}`} className="text-xs font-bold text-navy-900">
            TOTAL (objectif) :
          </label>
          <input
            id={`daily-total-${eventId}`}
            type="number"
            min={1}
            max={60}
            step={1}
            value={totalDraft}
            onChange={(e) => setTotalDraft(e.target.value)}
            disabled={pending}
            aria-label="TOTAL de Daily paramétrable"
            title="TOTAL modifiable par le Scrum Master (défaut 20 pour un sprint d'un mois)"
            className="w-20 rounded-md border border-sand-300 bg-white px-2 py-1 text-sm font-bold text-navy-900 focus:border-navy-900 focus:outline-none"
          />
          <button type="submit" disabled={pending} className={buttonSecondary} title="Appliquer le nouveau TOTAL">
            {pending ? "…" : "Appliquer"}
          </button>
          <span className="text-xs text-navy-900/60">Défaut 20 pour un mois.</span>
        </form>
      )}
      {!completed && !canManage && (
        <p className="mt-1 text-xs text-navy-900/60">TOTAL fixé par le Scrum Master ({total}).</p>
      )}

      {/* Actions Scrum Master */}
      {!completed && canManage && (
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending || atMax}
            onClick={() => run(() => validateDaily(teamId, eventId))}
            title={atMax ? "Compteur au maximum : augmentez le TOTAL ou clôturez" : "Incrémente X de +1 et réinitialise le chrono 15 min pour le lendemain"}
            className={buttonPrimary}
          >
            {pending ? "…" : "✓ Valider le Daily du jour"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (typeof window !== "undefined" && !window.confirm(`Clôturer définitivement les Daily à ${count}/${total} ? Le compteur sera figé et la 3. Sprint Review débloquée.`)) return;
              run(() => closeDailyDefinitively(teamId, eventId));
            }}
            title="Fige le compteur final, passe l'étape au statut Terminé (barre verte) et débloque la 3. Sprint Review"
            className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm font-bold text-red-800 hover:bg-red-100 disabled:opacity-50"
          >
            {pending ? "…" : "🛑 Clôture définitive des Daily"}
          </button>
        </div>
      )}
      {!completed && !canManage && (
        <p className="mt-2 rounded-lg bg-sand-300 p-2 text-xs font-bold text-navy-900">
          Validation et clôture réservées au Scrum Master — vous pouvez suivre le compteur et ajouter des notes de Daily depuis le Suivi Sprint.
        </p>
      )}

      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
