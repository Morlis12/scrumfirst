"use client";

import { useActionState, useRef } from "react";
import { importInitiatives } from "@/app/actions/requests";
import { buttonPrimary } from "@/components/ui";

/**
 * Zone d'import du SAS : extraction du formulaire InitiatIV' (CSV/Excel exporté en CSV).
 * Traitement anti-doublon en arrière-plan via Server Action (état pending fluide).
 */
export function RequestsImportForm({ canImport }: { canImport: boolean }) {
  const [state, formAction, pending] = useActionState(importInitiatives, undefined);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!canImport) {
    return (
      <div className="rounded-lg bg-sand-300 p-3 text-sm font-bold text-navy-900">
        Import réservé à l&apos;Admin / Product Owner et au Scrum Master — compte Developer en
        lecture seule.
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <label
        htmlFor="requests-file"
        className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-navy-900/30 bg-sand-300/40 px-4 py-6 text-center transition hover:border-navy-900 hover:bg-sand-300/70"
      >
        <span className="text-2xl" aria-hidden="true">
          📥
        </span>
        <span className="text-sm font-bold text-navy-900">
          Importer une extraction du formulaire (CSV/Excel)
        </span>
        <span className="text-xs text-navy-900/70">
          Colonnes attendues : title (ou titre) · description · nature · urgency · impact —
          AGL reconnues si présentes : prénom · nom demandeur · fonction · direction /
          département · bénéficiaires · éléments sources — Excel : exportez en CSV UTF-8.
        </span>
        <input
          ref={fileRef}
          id="requests-file"
          name="file"
          type="file"
          required
          accept=".csv,.txt,.tsv,.xlsx,.xls"
          disabled={pending}
          className="mt-2 w-full max-w-md cursor-pointer rounded-lg border border-sand-300 bg-white px-3 py-2 text-sm font-bold text-navy-900 file:mr-3 file:rounded-md file:border-0 file:bg-navy-900 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-white disabled:opacity-50"
        />
      </label>
      {state?.error && (
        <p role="alert" className="rounded-lg bg-red-50 p-2 text-sm font-bold text-red-700">
          {state.error}
        </p>
      )}
      {state?.message && (
        <p role="status" className="rounded-lg bg-green-50 p-2 text-sm font-bold text-green-700">
          {state.message}
        </p>
      )}
      <div>
        <button type="submit" disabled={pending} className={buttonPrimary}>
          {pending ? "Ingestion en cours…" : "📥 Lancer l'ingestion anti-doublon"}
        </button>
      </div>
    </form>
  );
}
