"use client";

import { useState, useTransition } from "react";
import { canManageDodCriteria, type Actor } from "@/lib/scrum-rules";
import { createCriterion, toggleCriterion } from "@/app/actions/dod";
import { deleteCriterion } from "@/app/actions/products";
import { Badge, buttonSecondary, inputClass } from "@/components/ui";

export type DodCriterionVM = {
  id: string;
  label: string;
  active: boolean;
};

/**
 * Panneau de configuration de la Checklist DoD unique du produit.
 * - Ajout / activation / désactivation / suppression définitive des critères globaux.
 * - Rôles autorisés : Admin / Product Owner + Scrum Master.
 *   Developer formellement exclu : saisie désactivée.
 * - Import métier : `canManageDodCriteria` (scrum-rules.ts, pur et testable)
 *   pour le pré-contrôle d'affichage ; la garde réelle est serveur
 *   (`guardManageDodCriteria` dans les Server Actions).
 * Charte : élément actif = fond jaune sand-300 + texte bleu navy-900 en gras.
 */
export function DodConfigPanel({
  productId,
  productName,
  criteria,
  actor,
}: {
  productId: string;
  productName: string;
  criteria: DodCriterionVM[];
  actor: Actor;
}) {
  const [label, setLabel] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Pré-contrôle d'affichage (la décision autoritative reste serveur).
  // Seuls Admin/PO + SM gèrent la DoD globale ; le Developer est exclu.
  const preview = canManageDodCriteria(actor);
  const canManage = preview.ok;

  const activeCount = criteria.filter((c) => c.active).length;

  function run(fn: () => Promise<unknown>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        setLabel("");
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold text-navy-900">
          Checklist DoD — {productName}
        </h3>
        <Badge tone="amber">
          {activeCount} actif(s) / {criteria.length}
        </Badge>
        {!canManage && (
          <Badge tone="red">Admin/PO + SM uniquement</Badge>
        )}
      </div>

      {/* Bandeau masqué pour Admin/PO + SM (affiché uniquement si refus, ex. Developer). */}
      {!canManage && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">
          Checklist DoD réservée à l&apos;Admin/Product Owner et au Scrum Master
          — compte Developer exclu.
        </p>
      )}

      <ul className="flex flex-col gap-1.5">
        {criteria.map((c) => (
          <li
            key={c.id}
            className={
              c.active
                ? "flex flex-wrap items-center justify-between gap-2 rounded-lg bg-sand-300 p-2 text-sm font-bold text-navy-900"
                : "flex flex-wrap items-center justify-between gap-2 rounded-lg border border-sand-200 bg-white p-2 text-sm text-navy-900/60"
            }
          >
            <span>
              <Badge tone={c.active ? "blue" : "zinc"}>
                {c.active ? "Actif" : "Inactif"}
              </Badge>{" "}
              {c.label}
            </span>
            <span className="flex gap-2">
              <button
                type="button"
                disabled={!canManage || pending}
                onClick={() => run(() => toggleCriterion(productId, c.id, !c.active))}
                className={buttonSecondary}
              >
                {c.active ? "Désactiver" : "Réactiver"}
              </button>
              <button
                type="button"
                disabled={!canManage || pending}
                onClick={() => run(() => deleteCriterion(productId, c.id))}
                className={buttonSecondary}
                title="Suppression définitive du critère global"
              >
                Supprimer
              </button>
            </span>
          </li>
        ))}
        {criteria.length === 0 && (
          <li className="text-sm text-navy-900/70">
            Aucun critère — définissez la DoD unique du produit ci-dessous.
          </li>
        )}
      </ul>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (label.trim().length < 3) {
            setError("Libellé trop court (3 caractères minimum).");
            return;
          }
          run(() => createCriterion(productId, label.trim()));
        }}
      >
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          minLength={3}
          placeholder="Ex. Tests automatisés verts"
          disabled={!canManage || pending}
          className={inputClass}
          aria-label="Nouveau critère DoD"
        />
        <button type="submit" disabled={!canManage || pending} className={buttonSecondary}>
          {pending ? "…" : "Ajouter"}
        </button>
      </form>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
