"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { addTeamToProduct, type ProductsActionState } from "@/app/actions/products";
import { Field, buttonPrimary, inputClass } from "@/components/ui";
import {
  MAX_DEVELOPERS_PER_TEAM,
  MAX_SCRUM_TEAM_SIZE,
  TEAM_LIMIT_MESSAGE,
  isLeadershipEmail,
  normalizeDeveloperEntry,
  teamCompositionSummary,
} from "@/lib/scrum-rules";

type Props = {
  productId: string;
  productOwnerEmail: string;
  scrumMasterEmail: string;
};

/**
 * Formulaire "Déclarer une équipe" — héritage PO/SM + développeurs exclusifs.
 * - Bandeau supérieur non modifiable : PO/SM hérités du produit.
 * - Sous-champ d'ajout unitaire de Développeurs (nom ou email).
 * - Mini-badges + compteur "👥 N Développeurs" + total X/10.
 * - Blocage strict UI : à 8 développeurs, saisie + bouton désactivés
 *   avec le message limite Scrum Guide (la garde serveur fait foi).
 * Charte : sand-300 / navy-900 en gras.
 */
export function TeamDeclareForm({ productId, productOwnerEmail, scrumMasterEmail }: Props) {
  const [teamName, setTeamName] = useState("");
  const [draft, setDraft] = useState("");
  const [developers, setDevelopers] = useState<string[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);

  const [state, formAction, pending] = useActionState<ProductsActionState, FormData>(
    addTeamToProduct.bind(null, productId),
    undefined,
  );

  const summary = useMemo(
    () => teamCompositionSummary(developers.length),
    [developers.length],
  );
  const isFull = summary.isFull;

  useEffect(() => {
    if (state?.message) {
      setDevelopers([]);
      setDraft("");
      setTeamName("");
      setLocalError(null);
    }
  }, [state?.message]);

  function addDraft() {
    setLocalError(null);
    if (isFull) {
      setLocalError(TEAM_LIMIT_MESSAGE);
      return;
    }
    const entry = normalizeDeveloperEntry(draft);
    if (entry.length < 2) {
      setLocalError("Nom/email du développeur : 2 caractères minimum.");
      return;
    }
    if (isLeadershipEmail(entry, productOwnerEmail, scrumMasterEmail)) {
      setLocalError(
        "Le Product Owner et le Scrum Master sont hérités du produit — ajoutez uniquement des Développeurs.",
      );
      return;
    }
    const duplicate = developers.some((d) => d.toLowerCase() === entry.toLowerCase());
    if (duplicate) {
      setLocalError(`« ${entry} » est déjà dans la liste.`);
      return;
    }
    if (developers.length + 1 > MAX_DEVELOPERS_PER_TEAM) {
      setLocalError(TEAM_LIMIT_MESSAGE);
      return;
    }
    setDevelopers((prev) => [...prev, entry]);
    setDraft("");
  }

  function removeDeveloper(target: string) {
    setDevelopers((prev) =>
      prev.filter((d) => d.toLowerCase() !== target.toLowerCase()),
    );
    setLocalError(null);
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {/* Héritage centralisé — non modifiable */}
      <div className="rounded-xl border border-sand-300 bg-white p-3">
        <p className="text-xs font-bold uppercase tracking-wide text-navy-900">
          Héritage produit — non modifiable
        </p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <div className="flex items-center justify-between gap-2 rounded-lg bg-sand-300 px-3 py-2">
            <span className="text-sm font-bold text-navy-900">👤 Product Owner</span>
            <span className="max-w-[60%] truncate rounded-full bg-navy-900 px-2.5 py-0.5 text-xs font-bold text-white" title={productOwnerEmail}>
              {productOwnerEmail}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2 rounded-lg bg-sand-300 px-3 py-2">
            <span className="text-sm font-bold text-navy-900">🛡️ Scrum Master</span>
            <span className="max-w-[60%] truncate rounded-full bg-navy-900 px-2.5 py-0.5 text-xs font-bold text-white" title={scrumMasterEmail}>
              {scrumMasterEmail}
            </span>
          </div>
        </div>
      </div>

      <Field
        label="Nom de la nouvelle équipe (texte libre)"
        hint="Le produit accepte plusieurs équipes : chacune pourra mener ses propres sprints parallèles."
      >
        <input
          name="name"
          required
          minLength={2}
          maxLength={200}
          value={teamName}
          onChange={(e) => setTeamName(e.target.value)}
          className={inputClass}
          placeholder="Ex. Équipe Beta"
          autoComplete="off"
        />
      </Field>

      {/* Développeurs exclusifs — ajout un par un */}
      <div className="rounded-xl border border-sand-200 bg-white p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-bold text-navy-900">
            👥 {developers.length} Développeur{developers.length > 1 ? "s" : ""}
            <span className="ml-2 text-xs font-medium text-navy-900/60">
              {summary.total}/{MAX_SCRUM_TEAM_SIZE} membres (PO + SM inclus)
            </span>
          </p>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
              isFull ? "bg-red-100 text-red-700" : "bg-sand-300 text-navy-900"
            }`}
          >
            {developers.length}/{MAX_DEVELOPERS_PER_TEAM} développeurs
          </span>
        </div>

        {/* Jauge de remplissage */}
        <div
          className="mt-2 h-2 overflow-hidden rounded-full bg-sand-100"
          role="progressbar"
          aria-valuenow={developers.length}
          aria-valuemin={0}
          aria-valuemax={MAX_DEVELOPERS_PER_TEAM}
        >
          <div
            className={`h-full rounded-full transition-all ${isFull ? "bg-red-500" : "bg-navy-900"}`}
            style={{ width: `${(developers.length / MAX_DEVELOPERS_PER_TEAM) * 100}%` }}
          />
        </div>

        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addDraft();
              }
            }}
            disabled={isFull || pending}
            className={inputClass}
            placeholder={isFull ? "Limite atteinte — retirez un développeur pour ajouter" : "Ajouter un développeur : nom ou email, un par un"}
            aria-label="Nom ou email du développeur"
            autoComplete="off"
          />
          <button
            type="button"
            onClick={addDraft}
            disabled={isFull || pending || draft.trim().length < 2}
            className="inline-flex items-center justify-center rounded-lg bg-sand-300 px-4 py-2 text-sm font-bold text-navy-900 hover:bg-sand-400 disabled:opacity-50"
          >
            + Ajouter
          </button>
        </div>

        {isFull && (
          <p role="alert" className="mt-2 rounded-lg border border-red-200 bg-red-50 p-2 text-sm font-bold text-red-700">
            {TEAM_LIMIT_MESSAGE}
          </p>
        )}
        {localError && !isFull && (
          <p role="alert" className="mt-2 text-sm text-red-600">
            {localError}
          </p>
        )}

        {developers.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Développeurs de la nouvelle équipe">
            {developers.map((dev) => (
              <span
                key={dev.toLowerCase()}
                className="inline-flex items-center gap-1.5 rounded-full bg-navy-900 py-1 pl-3 pr-1.5 text-xs font-bold text-white"
              >
                {dev}
                <button
                  type="button"
                  onClick={() => removeDeveloper(dev)}
                  disabled={pending}
                  className="rounded-full bg-white/20 px-1.5 leading-none hover:bg-white/30 disabled:opacity-50"
                  aria-label={`Retirer ${dev}`}
                  title={`Retirer ${dev}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-xs text-navy-900/60">
            Aucun développeur pour l&apos;instant — l&apos;équipe hérite déjà du PO et du SM ci-dessus.
          </p>
        )}

        {/* Payload serveur : liste exclusive DEVELOPER */}
        <input type="hidden" name="developersJson" value={JSON.stringify(developers)} />
      </div>

      {state?.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
      {state?.message && (
        <p role="status" className="text-sm text-green-700">
          {state.message}
        </p>
      )}
      <div>
        <button type="submit" disabled={pending} className={buttonPrimary}>
          {pending ? "…" : `Déclarer l'équipe (${summary.total}/${MAX_SCRUM_TEAM_SIZE})`}
        </button>
      </div>
    </form>
  );
}
