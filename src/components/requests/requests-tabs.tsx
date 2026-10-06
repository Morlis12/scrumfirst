"use client";

import { useMemo, useState } from "react";
import { Badge, Card, buttonPrimary, inputClass } from "@/components/ui";
import { RequestsImportForm } from "@/components/requests/requests-import-form";
import { RequestsBoard, type InitiativeVM } from "@/components/requests/requests-board";

/** Ligne d'audit complète (PENDING + ARCHIVED) avec traçabilité lineage. */
export type AuditVM = {
  id: string;
  title: string;
  description: string | null;
  nature: string;
  urgency: string;
  impact: string | null;
  sourceFile: string | null;
  status: string;
  createdAt: string;
  createdAtFull: string;
  importedByEmail: string | null;
  requesterFirstName: string | null;
  requesterLastName: string | null;
  requesterFunction: string | null;
  department: string | null;
  beneficiaries: string | null;
  sourceElements: string | null;
  convertedProductId: string | null;
  duplicateHits: number;
};

type TabKey = "ingestion" | "audit";
type StatusFilter = "ALL" | "PENDING" | "ARCHIVED";

function StatusBadge({ status }: { status: string }) {
  if (status === "ARCHIVED") {
    return <Badge tone="green">🚀 En plein Scrum</Badge>;
  }
  return <Badge tone="amber">⏳ En attente</Badge>;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-sand-300/40 p-2.5">
      <dt className="text-xs font-bold uppercase text-navy-900">{label}</dt>
      <dd className="mt-0.5 text-sm text-navy-900/80">{value}</dd>
    </div>
  );
}

/**
 * Onglets du SAS : ingestion/qualification + historique & audit lineage.
 * Filtres anti-surcharge cognitive + panneau latéral de détails AGL (lecture seule).
 */
export function RequestsTabs({
  pending,
  audit,
  archivedCount,
  canManage,
}: {
  pending: InitiativeVM[];
  audit: AuditVM[];
  archivedCount: number;
  canManage: boolean;
}) {
  const [tab, setTab] = useState<TabKey>("ingestion");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [selectedAuditId, setSelectedAuditId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return audit.filter((r) => {
      if (statusFilter !== "ALL" && r.status !== statusFilter) return false;
      if (!q) return true;
      const hay = `${r.title} ${r.importedByEmail ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [audit, query, statusFilter]);

  const selectedAudit = audit.find((r) => r.id === selectedAuditId) ?? null;

  const tabBtn = (active: boolean) =>
    `rounded-lg px-4 py-2 text-sm font-bold transition ${
      active
        ? "bg-sand-300 font-bold text-navy-900 shadow-sm ring-1 ring-sand-400"
        : "bg-white font-bold text-navy-900/60 hover:bg-sand-300/40 hover:text-navy-900"
    }`;

  return (
    <div>
      {/* Barre d'onglets — charte sand-300 / navy-900 en gras */}
      <div
        role="tablist"
        aria-label="Vues du SAS d'atterrissage"
        className="mb-4 flex flex-wrap gap-2 rounded-xl border border-sand-200 bg-white p-2"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === "ingestion"}
          onClick={() => setTab("ingestion")}
          className={tabBtn(tab === "ingestion")}
        >
          📥 Ingestion &amp; Qualification
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "audit"}
          onClick={() => setTab("audit")}
          className={tabBtn(tab === "audit")}
        >
          📜 Historique &amp; Audit Lineage ({audit.length})
        </button>
      </div>

      {tab === "ingestion" && (
        <div role="tabpanel" aria-label="Ingestion et qualification">
          <Card className="mb-4">
            <h2 className="mb-2 font-bold text-navy-900">Zone d&apos;ingestion</h2>
            <RequestsImportForm canImport={canManage} />
          </Card>

          <h2 className="mb-2 font-bold text-navy-900">
            Initiatives qualifiées en attente ({pending.length})
          </h2>
          <RequestsBoard pending={pending} archivedCount={archivedCount} canManage={canManage} />
        </div>
      )}

      {tab === "audit" && (
        <div role="tabpanel" aria-label="Historique et audit lineage">
          {/* Barre de filtres sur une seule ligne */}
          <Card className="mb-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <label htmlFor="audit-search" className="sr-only">
                Rechercher par titre ou auteur
              </label>
              <input
                id="audit-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="🔎 Rechercher par titre ou auteur…"
                autoComplete="off"
                className={inputClass}
              />
              <label htmlFor="audit-status" className="sr-only">
                Filtrer par statut
              </label>
              <select
                id="audit-status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                aria-label="Filtrer par statut"
                className={`${inputClass} font-bold text-navy-900 sm:max-w-[220px]`}
              >
                <option value="ALL">Tous les statuts</option>
                <option value="PENDING">⏳ En attente</option>
                <option value="ARCHIVED">🚀 En plein Scrum</option>
              </select>
            </div>
            <p className="mt-2 text-xs font-bold text-navy-900/60">
              {filtered.length} / {audit.length} initiative(s) affichée(s) — cliquez une ligne pour
              le détail AGL complet.
            </p>
          </Card>

          {/* Tableau de traçabilité complet */}
          <div className="overflow-x-auto rounded-xl border border-sand-200 bg-white">
            <table className="w-full min-w-[760px] border-collapse text-left text-sm">
              <thead>
                <tr className="bg-sand-300 text-navy-900">
                  <th className="px-3 py-2 font-bold">Titre de l&apos;initiative</th>
                  <th className="px-3 py-2 font-bold">Importé le (Date &amp; Heure)</th>
                  <th className="px-3 py-2 font-bold">Par (Email)</th>
                  <th className="px-3 py-2 font-bold">Fichier Source</th>
                  <th className="px-3 py-2 font-bold">Statut Actuel</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => setSelectedAuditId(r.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") setSelectedAuditId(r.id);
                    }}
                    tabIndex={0}
                    title="Cliquer pour voir le détail complet de la demande"
                    className="cursor-pointer border-t border-sand-200 transition hover:bg-sand-300/40 focus:bg-sand-300/40 focus:outline-none"
                  >
                    <td className="px-3 py-2 font-bold text-navy-900">{r.title}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-navy-900/80">
                      {r.createdAtFull}
                    </td>
                    <td className="max-w-[220px] truncate px-3 py-2 text-navy-900/80">
                      {r.importedByEmail || "—"}
                    </td>
                    <td className="max-w-[180px] truncate px-3 py-2 text-xs text-navy-900/60">
                      {r.sourceFile || "—"}
                    </td>
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <StatusBadge status={r.status} />
                      {r.status === "ARCHIVED" && r.convertedProductId && (
                        <a
                          href={`/backlog?product=${encodeURIComponent(r.convertedProductId)}`}
                          className="ml-2 text-xs font-bold text-navy-900 underline hover:no-underline"
                          title="Ouvrir le produit en plein Scrum"
                        >
                          Voir le produit →
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-sm text-navy-900/60">
                      Aucune initiative ne correspond aux filtres — ajustez la recherche ou le statut.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Panneau latéral exhaustif — détails AGL lecture seule */}
          {selectedAudit && (
            <div
              role="dialog"
              aria-modal="true"
              aria-label={`Détail de ${selectedAudit.title}`}
              className="fixed inset-0 z-50 flex justify-end bg-navy-900/50"
              onClick={() => setSelectedAuditId(null)}
            >
              <div
                className="flex h-full w-full max-w-md flex-col overflow-y-auto bg-white p-5 shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-navy-900/60">
                      Demande initiale · Lecture seule
                    </p>
                    <h2 className="mt-1 rounded-lg bg-sand-300 px-3 py-1 text-base font-bold text-navy-900">
                      {selectedAudit.title}
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedAuditId(null)}
                    aria-label="Fermer le panneau"
                    className="rounded-lg border border-navy-900/20 px-2 py-1 text-sm font-bold text-navy-900 hover:bg-sand-100"
                  >
                    ✕
                  </button>
                </div>

                {/* Lien de traçabilité lineage */}
                {selectedAudit.status === "ARCHIVED" && selectedAudit.convertedProductId && (
                  <a
                    href={`/backlog?product=${encodeURIComponent(selectedAudit.convertedProductId)}`}
                    className="mb-3 block rounded-xl bg-navy-900 px-4 py-3 text-center text-sm font-bold text-white hover:bg-navy-800"
                  >
                    🔗 Voir le produit en développement dans ScrumFirst
                  </a>
                )}
                <div className="mb-3">
                  <StatusBadge status={selectedAudit.status} />
                </div>

                <dl className="flex flex-col gap-2 text-sm">
                  <DetailRow
                    label="Nom du demandeur"
                    value={selectedAudit.requesterLastName || "— (non renseigné, import CSV brut)"}
                  />
                  <DetailRow
                    label="Prénom du demandeur"
                    value={selectedAudit.requesterFirstName || "— (non renseigné, import CSV brut)"}
                  />
                  <DetailRow
                    label="Fonction du demandeur"
                    value={selectedAudit.requesterFunction || "—"}
                  />
                  <DetailRow
                    label="Direction / Département"
                    value={selectedAudit.department || "—"}
                  />
                  <DetailRow label="Nature de la soumission" value={selectedAudit.nature || "—"} />
                  <DetailRow label="Intitulé" value={selectedAudit.title} />
                  <DetailRow
                    label="Présentation succincte du besoin (Description)"
                    value={selectedAudit.description || "—"}
                  />
                  <DetailRow
                    label="Impacts attendus détaillés"
                    value={selectedAudit.impact || "—"}
                  />
                  <DetailRow
                    label="Bénéficiaires concernés"
                    value={selectedAudit.beneficiaries || "—"}
                  />
                  <DetailRow
                    label="Niveau d'urgence"
                    value={selectedAudit.urgency || "—"}
                  />
                  <DetailRow
                    label="Éléments et fichiers sources disponibles"
                    value={
                      [
                        selectedAudit.sourceFile ? `Fichier : ${selectedAudit.sourceFile}` : null,
                        selectedAudit.sourceElements
                          ? `Éléments : ${selectedAudit.sourceElements}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "—"
                    }
                  />
                  <DetailRow
                    label="Importé par"
                    value={selectedAudit.importedByEmail || "—"}
                  />
                  <DetailRow label="Importé le" value={selectedAudit.createdAtFull} />
                  {selectedAudit.duplicateHits > 0 && (
                    <DetailRow
                      label="Anti-conflit"
                      value={`${selectedAudit.duplicateHits} doublon(s) intercepté(s) et corrigé(s) sur cette initiative`}
                    />
                  )}
                </dl>

                <div className="mt-4">
                  <button
                    type="button"
                    onClick={() => setSelectedAuditId(null)}
                    className={buttonPrimary}
                  >
                    Fermer le détail
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
