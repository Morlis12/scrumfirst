"use client";

import { useActionState, useState } from "react";
import { convertInitiativeToProduct } from "@/app/actions/requests";
import { Badge, buttonPrimary } from "@/components/ui";
import { Field, inputClass } from "@/components/action-form";

export type InitiativeVM = {
  id: string;
  title: string;
  description: string | null;
  nature: string;
  urgency: string;
  impact: string | null;
  sourceFile: string | null;
  status: string;
  createdAt: string;
};

/**
 * Tableau épuré des initiatives en attente + panneau latéral de qualification.
 * Le tableau défile dans son propre conteneur (aucun scroll imposé à la barre des tâches).
 */
export function RequestsBoard({
  pending,
  archivedCount,
  canManage,
}: {
  pending: InitiativeVM[];
  archivedCount: number;
  canManage: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = pending.find((r) => r.id === selectedId) ?? null;

  return (
    <div>
      <div className="overflow-x-auto rounded-xl border border-sand-200 bg-white">
        <table className="w-full min-w-[640px] border-collapse text-left text-sm">
          <thead>
            <tr className="bg-sand-300 text-navy-900">
              <th className="px-3 py-2 font-bold">Titre</th>
              <th className="px-3 py-2 font-bold">Nature</th>
              <th className="px-3 py-2 font-bold">Urgence</th>
              <th className="px-3 py-2 font-bold">Impact</th>
              <th className="px-3 py-2 font-bold">Source</th>
            </tr>
          </thead>
          <tbody>
            {pending.map((r) => (
              <tr
                key={r.id}
                onClick={() => setSelectedId(r.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") setSelectedId(r.id);
                }}
                tabIndex={0}
                title="Cliquer pour qualifier et scrummer"
                className="cursor-pointer border-t border-sand-200 transition hover:bg-sand-300/40 focus:bg-sand-300/40 focus:outline-none"
              >
                <td className="px-3 py-2 font-bold text-navy-900">{r.title}</td>
                <td className="px-3 py-2 text-navy-900/80">{r.nature || "—"}</td>
                <td className="px-3 py-2">
                  <Badge tone={r.urgency.toUpperCase() === "HAUTE" || r.urgency.toUpperCase() === "HIGH" || r.urgency.toUpperCase() === "CRITIQUE" ? "red" : "amber"}>
                    {r.urgency || "MEDIUM"}
                  </Badge>
                </td>
                <td className="max-w-[220px] truncate px-3 py-2 text-navy-900/80">{r.impact || "—"}</td>
                <td className="px-3 py-2 text-xs text-navy-900/60">{r.sourceFile || "—"}</td>
              </tr>
            ))}
            {pending.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-sm text-navy-900/60">
                  Aucune initiative en attente — importez une extraction ci-dessus.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-navy-900/60">
        {pending.length} initiative(s) en attente · {archivedCount} archivée(s) après validation
        Scrum.
      </p>

      {selected && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Qualifier ${selected.title}`}
          className="fixed inset-0 z-50 flex justify-end bg-navy-900/50"
          onClick={() => setSelectedId(null)}
        >
          <div
            className="flex h-full w-full max-w-md flex-col overflow-y-auto bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-navy-900/60">
                  Initiative · SAS d&apos;atterrissage
                </p>
                <h2 className="mt-1 rounded-lg bg-sand-300 px-3 py-1 text-base font-bold text-navy-900">
                  {selected.title}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                aria-label="Fermer le panneau"
                className="rounded-lg border border-navy-900/20 px-2 py-1 text-sm font-bold text-navy-900 hover:bg-sand-100"
              >
                ✕
              </button>
            </div>

            <dl className="flex flex-col gap-2 text-sm">
              <div className="rounded-lg bg-sand-300/40 p-2.5">
                <dt className="text-xs font-bold uppercase text-navy-900">Description</dt>
                <dd className="mt-0.5 text-navy-900/80">{selected.description || "—"}</dd>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-sand-300/40 p-2.5">
                  <dt className="text-xs font-bold uppercase text-navy-900">Nature</dt>
                  <dd className="mt-0.5 font-bold text-navy-900">{selected.nature || "—"}</dd>
                </div>
                <div className="rounded-lg bg-sand-300/40 p-2.5">
                  <dt className="text-xs font-bold uppercase text-navy-900">Urgence</dt>
                  <dd className="mt-0.5 font-bold text-navy-900">{selected.urgency || "—"}</dd>
                </div>
              </div>
              <div className="rounded-lg bg-sand-300/40 p-2.5">
                <dt className="text-xs font-bold uppercase text-navy-900">Impact</dt>
                <dd className="mt-0.5 text-navy-900/80">{selected.impact || "—"}</dd>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-navy-900/60">
                <Badge>{selected.sourceFile || "saisie manuelle"}</Badge>
                <span>Reçue le {selected.createdAt}</span>
              </div>
            </dl>

            <div className="mt-4 rounded-xl border border-sand-300 bg-sand-300/40 p-3">
              <p className="text-xs font-bold uppercase tracking-wide text-navy-900">
                Conversion en produit Scrum actif
              </p>
              {!canManage ? (
                <p className="mt-2 rounded-lg bg-sand-300 p-2 text-xs font-bold text-navy-900">
                  Validation réservée à l&apos;Admin / Product Owner et au Scrum Master.
                </p>
              ) : (
                <ConvertForm requestId={selected.id} defaultTeamName={`Équipe ${selected.title}`} />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ConvertForm({ requestId, defaultTeamName }: { requestId: string; defaultTeamName: string }) {
  const convertWithId = convertInitiativeToProduct.bind(null, requestId);
  const [state, formAction, pending] = useActionState(convertWithId, undefined);
  return (
    <form action={formAction} className="mt-2 flex flex-col gap-3">
      <Field label="Product Owner du produit (email)">
        <input
          name="productOwnerEmail"
          type="email"
          required
          maxLength={200}
          className={inputClass}
          placeholder="Ex. po.data@entreprise.fr"
          autoComplete="off"
        />
      </Field>
      <Field label="Scrum Master du produit (email)">
        <input
          name="scrumMasterEmail"
          type="email"
          required
          maxLength={200}
          className={inputClass}
          placeholder="Ex. sm.data@entreprise.fr"
          autoComplete="off"
        />
      </Field>
      <Field label="Équipe technique dédiée (nom)">
        <input
          name="teamName"
          required
          minLength={2}
          maxLength={200}
          defaultValue={defaultTeamName.slice(0, 200)}
          className={inputClass}
          placeholder="Ex. Équipe Alpha"
          autoComplete="off"
        />
      </Field>
      {state?.error && (
        <p role="alert" className="text-sm font-bold text-red-600">
          {state.error}
        </p>
      )}
      {state?.message && (
        <p role="status" className="rounded-lg bg-green-50 p-2 text-sm font-bold text-green-700">
          {state.message}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className={buttonPrimary}>
          {pending ? "Validation…" : "🚀 Valider et Scrummer cette initiative"}
        </button>
      </div>
      <p className="text-xs text-navy-900/60">
        Archive l&apos;initiative dans le SAS et crée le produit officiel avec son binôme PO/SM et
        son équipe.
      </p>
    </form>
  );
}

