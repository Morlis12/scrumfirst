"use client";

import { useActionState, useState, useTransition } from "react";
import {
  addDeveloperToTeam,
  removeDeveloperFromTeam,
  type ProductsActionState,
} from "@/app/actions/products";
import { buttonSecondary, inputClass } from "@/components/ui";
import {
  MAX_DEVELOPERS_PER_TEAM,
  MAX_SCRUM_TEAM_SIZE,
  TEAM_LIMIT_MESSAGE,
} from "@/lib/scrum-rules";

type Props = {
  teamId: string;
  teamName: string;
  members: string[];
  productOwnerEmail: string;
  scrumMasterEmail: string;
};

/**
 * Panneau de consultation d'une équipe : héritage PO/SM + développeurs.
 * - En-tête non modifiable : PO/SM hérités du produit.
 * - Mini-badges développeurs + compteur "👥 N Développeurs" + total X/10.
 * - Ajout unitaire (nom/email) avec blocage strict à 8 (UI + Action).
 * - Retrait unitaire (le PO/SM ne sont jamais retirables ici).
 * Charte : sand-300 / navy-900 en gras.
 */
export function TeamMembersPanel({
  teamId,
  teamName,
  members,
  productOwnerEmail,
  scrumMasterEmail,
}: Props) {
  const [draft, setDraft] = useState("");
  const [removing, startRemoving] = useTransition();
  const [removeError, setRemoveError] = useState<string | null>(null);

  const [state, formAction, pending] = useActionState<ProductsActionState, FormData>(
    addDeveloperToTeam.bind(null, teamId),
    undefined,
  );

  const isFull = members.length >= MAX_DEVELOPERS_PER_TEAM;
  const total = 2 + members.length;

  function handleRemove(developer: string) {
    setRemoveError(null);
    startRemoving(async () => {
      try {
        await removeDeveloperFromTeam(teamId, developer);
      } catch (e) {
        setRemoveError((e as Error).message);
      }
    });
  }

  return (
    <div className="mt-2 rounded-xl border border-sand-200 bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold text-navy-900">
          {teamName}
          <span className="ml-2 rounded-full bg-sand-300 px-2.5 py-0.5 text-xs font-bold text-navy-900">
            👥 {members.length} Développeur{members.length > 1 ? "s" : ""}
          </span>
          <span className="ml-1.5 text-xs font-medium text-navy-900/60">
            {total}/{MAX_SCRUM_TEAM_SIZE} membres
          </span>
        </p>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
            isFull ? "bg-red-100 text-red-700" : "bg-sand-100 text-navy-900"
          }`}
        >
          {members.length}/{MAX_DEVELOPERS_PER_TEAM}
        </span>
      </div>

      {/* Héritage — non modifiable */}
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <div className="flex items-center justify-between gap-2 rounded-lg bg-sand-300/60 px-2.5 py-1.5">
          <span className="text-xs font-bold text-navy-900">👤 Product Owner</span>
          <span className="max-w-[60%] truncate text-xs font-bold text-navy-900" title={productOwnerEmail}>
            {productOwnerEmail}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 rounded-lg bg-sand-300/60 px-2.5 py-1.5">
          <span className="text-xs font-bold text-navy-900">🛡️ Scrum Master</span>
          <span className="max-w-[60%] truncate text-xs font-bold text-navy-900" title={scrumMasterEmail}>
            {scrumMasterEmail}
          </span>
        </div>
      </div>

      {/* Mini-badges développeurs */}
      {members.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5" aria-label={`Développeurs de ${teamName}`}>
          {members.map((dev) => (
            <span
              key={`${teamId}-${dev.toLowerCase()}`}
              className="inline-flex items-center gap-1.5 rounded-full bg-navy-900 py-1 pl-3 pr-1.5 text-xs font-bold text-white"
            >
              {dev}
              <button
                type="button"
                onClick={() => handleRemove(dev)}
                disabled={removing || pending}
                className="rounded-full bg-white/20 px-1.5 leading-none hover:bg-white/30 disabled:opacity-50"
                aria-label={`Retirer ${dev} de ${teamName}`}
                title={`Retirer ${dev}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-xs text-navy-900/60">
          Aucun développeur — ajoutez-les un par un ci-dessous (max {MAX_DEVELOPERS_PER_TEAM}).
        </p>
      )}

      {/* Ajout unitaire avec blocage strict */}
      <form action={formAction} className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          name="developer"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={isFull || pending || removing}
          className={inputClass}
          placeholder={isFull ? "Limite atteinte" : "Nom ou email du développeur"}
          aria-label={`Ajouter un développeur à ${teamName}`}
          autoComplete="off"
          minLength={2}
          maxLength={200}
        />
        <button
          type="submit"
          disabled={isFull || pending || removing || draft.trim().length < 2}
          className={buttonSecondary}
        >
          {pending ? "…" : "+ Développeur"}
        </button>
      </form>
      {isFull && (
        <p role="alert" className="mt-2 rounded-lg border border-red-200 bg-red-50 p-2 text-sm font-bold text-red-700">
          {TEAM_LIMIT_MESSAGE}
        </p>
      )}
      {state?.error && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {state.error}
        </p>
      )}
      {state?.message && (
        <p role="status" className="mt-2 text-sm text-green-700">
          {state.message}
        </p>
      )}
      {removeError && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {removeError}
        </p>
      )}
    </div>
  );
}
