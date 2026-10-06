import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/context";
import { guardCreateProduct } from "@/lib/scrum-guards";
import { Card, PageHeader } from "@/components/ui";
import type { InitiativeVM } from "@/components/requests/requests-board";
import { RequestsTabs, type AuditVM } from "@/components/requests/requests-tabs";

/**
 * SAS D'ATTERRISSAGE — /requests (InitiatIV' Request).
 * Zone tampon des demandes BRUTES, séparée de la base des produits en plein
 * Scrum (`Product`). Import CSV/Excel avec algorithme anti-conflit sur `title`,
 * tableau des initiatives PENDING, conversion « 🚀 Valider et Scrummer ».
 * + Mini-dashboard SAS, onglets Ingestion / Historique & Audit Lineage,
 *   filtres anti-surcharge cognitive et panneau AGL lecture seule.
 * Charte : sand-300 / navy-900 en gras.
 */
export default async function RequestsPage() {
  const { userId, workspaceId } = await requireWorkspace();
  const createGuard = await guardCreateProduct(userId);
  const canManage = createGuard.ok;

  const [pendingRaw, auditRaw, archivedCount, totalCount, logAgg, hitsAgg] =
    await Promise.all([
      prisma.initiativeRequest.findMany({
        where: { workspaceId, status: "PENDING" },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          description: true,
          nature: true,
          urgency: true,
          impact: true,
          sourceFile: true,
          status: true,
          createdAt: true,
        },
      }),
      prisma.initiativeRequest.findMany({
        where: { workspaceId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          description: true,
          nature: true,
          urgency: true,
          impact: true,
          sourceFile: true,
          status: true,
          createdAt: true,
          importedByEmail: true,
          requesterFirstName: true,
          requesterLastName: true,
          requesterFunction: true,
          department: true,
          beneficiaries: true,
          sourceElements: true,
          convertedProductId: true,
          duplicateHits: true,
        },
      }),
      prisma.initiativeRequest.count({ where: { workspaceId, status: "ARCHIVED" } }),
      prisma.initiativeRequest.count({ where: { workspaceId } }),
      prisma.ingestionLog.aggregate({
        where: { workspaceId },
        _sum: { updated: true, skipped: true },
      }),
      prisma.initiativeRequest.aggregate({
        where: { workspaceId },
        _sum: { duplicateHits: true },
      }),
    ]);

  const pending: InitiativeVM[] = pendingRaw.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    nature: r.nature,
    urgency: r.urgency,
    impact: r.impact,
    sourceFile: r.sourceFile,
    status: r.status,
    createdAt: r.createdAt.toLocaleDateString("fr-FR"),
  }));

  const audit: AuditVM[] = auditRaw.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    nature: r.nature,
    urgency: r.urgency,
    impact: r.impact,
    sourceFile: r.sourceFile,
    status: r.status,
    createdAt: r.createdAt.toLocaleDateString("fr-FR"),
    createdAtFull: r.createdAt.toLocaleString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
    importedByEmail: r.importedByEmail,
    requesterFirstName: r.requesterFirstName,
    requesterLastName: r.requesterLastName,
    requesterFunction: r.requesterFunction,
    department: r.department,
    beneficiaries: r.beneficiaries,
    sourceElements: r.sourceElements,
    convertedProductId: r.convertedProductId,
    duplicateHits: r.duplicateHits ?? 0,
  }));

  // Mini-dashboard du SAS.
  const total = totalCount;
  const conversionRate = total > 0 ? Math.round((archivedCount / total) * 100) : 0;
  const logDuplicates =
    (logAgg._sum.updated ?? 0) + (logAgg._sum.skipped ?? 0);
  const hitsDuplicates = hitsAgg._sum.duplicateHits ?? 0;
  const duplicatesIntercepted = logDuplicates > 0 ? logDuplicates : hitsDuplicates;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6">
      <PageHeader
        title="SAS d'atterrissage — InitiatIV' Request"
        subtitle="Demandes brutes en attente de qualification, séparées des produits en plein Scrum. Importez une extraction, qualifiez, puis scrummez."
      />

      {/* Statistiques de l'ingestion — mini-dashboard du SAS */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className="border-sand-300 bg-sand-300/40">
          <p className="text-xs font-bold uppercase tracking-wide text-navy-900">
            Total des initiatives ingérées
          </p>
          <p className="mt-1 text-2xl font-bold text-navy-900">{total}</p>
        </Card>
        <Card className="border-sand-300 bg-sand-300/40">
          <p className="text-xs font-bold uppercase tracking-wide text-navy-900">
            Taux de conversion en Scrum
          </p>
          <p className="mt-1 text-2xl font-bold text-navy-900">{conversionRate} %</p>
          <p className="text-xs font-bold text-navy-900/60">
            {archivedCount} archivée(s) / {total} ingérée(s)
          </p>
        </Card>
        <Card className="border-sand-300 bg-sand-300/40">
          <p className="text-xs font-bold uppercase tracking-wide text-navy-900">
            Doublons interceptés (anti-conflit)
          </p>
          <p className="mt-1 text-2xl font-bold text-navy-900">{duplicatesIntercepted}</p>
          <p className="text-xs font-bold text-navy-900/60">mis à jour ou ignorés, corrigés</p>
        </Card>
      </div>

      <RequestsTabs
        pending={pending}
        audit={audit}
        archivedCount={archivedCount}
        canManage={canManage}
      />
    </main>
  );
}
