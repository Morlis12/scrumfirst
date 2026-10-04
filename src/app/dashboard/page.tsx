import { prisma } from "@/lib/prisma";
import { currentUserId, getMyProducts, getProductTeams } from "@/lib/context";
import { isOpenSprintStatus } from "@/lib/scrum-rules";
import {
  Badge,
  Card,
  PageHeader,
} from "@/components/ui";
import { AutoFilterSelect } from "@/components/auto-filter";

type StatusFilter = "all" | "open" | "closed";

const STATUS_OPTIONS: { id: StatusFilter; name: string }[] = [
  { id: "all", name: "Tous" },
  { id: "open", name: "Actif" },
  { id: "closed", name: "Clos" },
];

function parseStatusFilter(value: string | undefined): StatusFilter {
  if (value === "open" || value === "closed" || value === "all") return value;
  return "all";
}

/** Barre de progression stylisée (charte sand-300 / navy-900, verte à 100 %). */
function ProgressBar({ value, label }: { value: number; label: string }) {
  const pct = Math.min(100, Math.max(0, Math.round(value)));
  const done = pct >= 100;
  return (
    <div>
      <div
        className="h-2.5 w-full overflow-hidden rounded-full bg-sand-100"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
        title={`${label} : ${pct} %`}
      >
        <div
          className={`h-full rounded-full ${done ? "bg-green-600" : "bg-navy-900"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/**
 * TABLEAU DE BORD DES MÉTRIQUES — /dashboard
 * Filtres automatiques interconnectés (Produit → Équipe → Statut → Sprint),
 * sans bouton : chaque sélection s'applique aussitôt et réinitialise les
 * sous-filtres concernés, résolus côté serveur avec repli sur la première
 * option valide.
 * - Avancement du Sprint : % de Story Points DONE / total du Sprint courant.
 * - Santé du Product Backlog : items hors Sprint + somme des SP restants.
 * - Qualité DoD : taux moyen de réussite + retours au backlog (rejets).
 * - Vitesse de livraison : temps de cycle moyen création → DONE (en jours).
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string; team?: string; status?: string; sprint?: string }>;
}) {
  const userId = await currentUserId();
  const params = await searchParams;
  const products = await getMyProducts(userId);
  if (products.length === 0) {
    return (
      <main className="mx-auto w-full max-w-6xl px-4 py-6">
        <PageHeader
          title="Tableau de bord des Métriques"
          subtitle="Créez d&apos;abord un produit depuis /products."
        />
      </main>
    );
  }
  const firstProduct = products[0];
  const productId =
    params.product !== undefined && products.some((p) => p.id === params.product)
      ? (params.product as string)
      : (firstProduct?.id ?? "");
  const teams = await getProductTeams(productId);
  if (teams.length === 0) {
    return (
      <main className="mx-auto w-full max-w-6xl px-4 py-6">
        <PageHeader title="Tableau de bord des Métriques" subtitle="Aucune équipe pour ce produit." />
      </main>
    );
  }
  const firstTeam = teams[0];
  const teamId =
    params.team !== undefined && teams.some((t) => t.id === params.team)
      ? (params.team as string)
      : (firstTeam?.id ?? "");

  const statusFilter = parseStatusFilter(params.status);

  const sprints = await prisma.sprint.findMany({
    where: { teamId },
    orderBy: { createdAt: "desc" },
  });
  const scopedSprints =
    statusFilter === "open"
      ? sprints.filter((s) => isOpenSprintStatus(s.status))
      : statusFilter === "closed"
        ? sprints.filter((s) => !isOpenSprintStatus(s.status))
        : sprints;
  const firstScoped = scopedSprints[0];
  const sprintId =
    params.sprint !== undefined && scopedSprints.some((s) => s.id === params.sprint)
      ? (params.sprint as string)
      : (firstScoped?.id ?? null);
  const selectedSprint = scopedSprints.find((s) => s.id === sprintId) ?? null;
  const scopedSprintIds = scopedSprints.map((s) => s.id);

  const [sprintItems, scopedItems, backlogItems, activeCriteria] = await Promise.all([
    sprintId
      ? prisma.backlogItem.findMany({
          where: { sprintId },
          select: {
            id: true,
            title: true,
            status: true,
            storyPoints: true,
            createdAt: true,
            updatedAt: true,
            doneChecks: { select: { criterionId: true } },
            increment: { select: { createdAt: true, deliveredAt: true } },
          },
          orderBy: { order: "asc" },
        })
      : [],
    scopedSprintIds.length > 0
      ? prisma.backlogItem.findMany({
          where: { sprintId: { in: scopedSprintIds } },
          select: {
            id: true,
            title: true,
            status: true,
            storyPoints: true,
            createdAt: true,
            updatedAt: true,
            doneChecks: { select: { criterionId: true } },
            increment: { select: { createdAt: true, deliveredAt: true } },
          },
          orderBy: { order: "asc" },
        })
      : [],
    prisma.backlogItem.findMany({
      where: { productId, sprintId: null },
      select: {
        id: true,
        status: true,
        storyPoints: true,
        // Trace d'un passage en sprint : une note de Daily liée à l'item
        // prouve qu'il a tenté un sprint (bouton Retour, clôture, annulation
        // ou suppression) sans valider la DoD — vrai retour au backlog.
        dailyNotes: { select: { id: true }, take: 1 },
      },
      orderBy: { order: "asc" },
    }),
    prisma.doneCriterion.findMany({
      where: { productId, active: true },
      select: { id: true },
    }),
  ]);

  // ---------- 1. Avancement du Sprint courant (Story Points DONE / total) ----------
  const sprintTotalSP = sprintItems.reduce((sum, i) => sum + (i.storyPoints ?? 0), 0);
  const sprintDoneSP = sprintItems
    .filter((i) => i.status === "DONE")
    .reduce((sum, i) => sum + (i.storyPoints ?? 0), 0);
  const sprintDoneCount = sprintItems.filter((i) => i.status === "DONE").length;
  const useStoryPoints = sprintTotalSP > 0;
  const progressPct =
    sprintItems.length === 0
      ? 0
      : useStoryPoints
        ? (sprintDoneSP / sprintTotalSP) * 100
        : (sprintDoneCount / sprintItems.length) * 100;

  // ---------- 2. Santé du Product Backlog (items hors Sprint) ----------
  const backlogCount = backlogItems.length;
  const backlogSP = backlogItems.reduce((sum, i) => sum + (i.storyPoints ?? 0), 0);
  const backlogUnpointed = backlogItems.filter((i) => i.storyPoints == null).length;
  const backlogByStatus = [
    { status: "RAW", label: "Brut", count: backlogItems.filter((i) => i.status === "RAW").length },
    { status: "REFINED", label: "Affiné", count: backlogItems.filter((i) => i.status === "REFINED").length },
    { status: "READY", label: "Prêt", count: backlogItems.filter((i) => i.status === "READY").length },
  ];
  const backlogMaxStatus = Math.max(1, ...backlogByStatus.map((b) => b.count));

  // ---------- 3. Qualité DoD : taux moyen + devenir des items ----------
  // Règle métier : un item DONE (DoD 100 %, Incrément livré) ne revient
  // JAMAIS au backlog et disparaît des choix du sprint suivant. Seuls les
  // items non terminés (DoD non atteinte) retournent au backlog (REFINED).
  const dodTotal = activeCriteria.length;
  const dodRates =
    dodTotal > 0
      ? scopedItems.map(
          (i) => (i.doneChecks.length >= dodTotal ? 1 : i.doneChecks.length / dodTotal),
        )
      : [];
  const dodAvg =
    dodRates.length > 0 ? (dodRates.reduce((a, b) => a + b, 0) / dodRates.length) * 100 : null;
  const dodFull = scopedItems.filter((i) => dodTotal > 0 && i.doneChecks.length >= dodTotal).length;
  // Items DONE du périmètre : Incréments livrés, sortis du planning.
  const doneCount = scopedItems.filter((i) => i.status === "DONE").length;
  // Vrais retours uniquement : items hors Sprint, non DONE, portant des
  // notes de Daily (preuve d'un sprint tenté sans DoD 100 %). Les items
  // affinés jamais partis en sprint ne sont PAS comptés. Les retours
  // automatiques (clôture, annulation, suppression de sprint) comptent aussi.
  const unfinishedBacklogCount = backlogItems.filter(
    (i) => i.status !== "DONE" && i.dailyNotes.length > 0,
  ).length;

  // ---------- 4. Vitesse de livraison : temps de cycle moyen création → DONE (jours) ----------
  const MS_PER_DAY = 1000 * 60 * 60 * 24;
  const cycled = scopedItems
    .filter((i) => i.status === "DONE")
    .map((i) => {
      const end = i.increment?.createdAt ?? i.updatedAt;
      const days = Math.max(0, (end.getTime() - i.createdAt.getTime()) / MS_PER_DAY);
      return { id: i.id, title: i.title, days };
    })
    .sort((a, b) => b.days - a.days);
  const cycleAvg =
    cycled.length > 0 ? cycled.reduce((a, b) => a + b.days, 0) / cycled.length : null;
  const cycleMax = Math.max(1, ...cycled.slice(0, 10).map((c) => c.days));
  const fmtDays = (d: number) =>
    `${d.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} j`;

  const statusLabel =
    statusFilter === "open" ? "Actif" : statusFilter === "closed" ? "Clos" : "Tous";

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6">
      <PageHeader
        title="Tableau de bord des Métriques"
        subtitle={`Périmètre : ${scopedSprints.length} sprint(s) (${statusLabel}) · DoD active : ${dodTotal} critère(s). Les filtres sont interconnectés : équipe et sprints dépendent du produit choisi.`}
      />

      {/* ---------- Filtres interconnectés ---------- */}
      <Card className="mb-4">
        <h2 className="mb-2 font-semibold text-navy-900">Filtres</h2>
        <div className="grid gap-2 md:grid-cols-2">
          <AutoFilterSelect
            name="product"
            value={productId}
            options={products}
            ariaLabel="Produit (applique automatiquement, réinitialise équipe et sprint)"
            resetParams={["team", "sprint"]}
          />
          <AutoFilterSelect
            name="team"
            value={teamId}
            options={teams.map((t) => ({ ...t }))}
            ariaLabel="Équipe (applique automatiquement, réinitialise le sprint)"
            resetParams={["sprint"]}
          />
          <AutoFilterSelect
            name="status"
            value={statusFilter}
            options={STATUS_OPTIONS}
            ariaLabel="Statut du Sprint (applique automatiquement, réinitialise le sprint)"
            resetParams={["sprint"]}
          />
          {scopedSprints.length > 0 && sprintId ? (
            <AutoFilterSelect
              name="sprint"
              value={sprintId}
              options={scopedSprints.map((s) => ({
                id: s.id,
                name: `${("title" in s && typeof s.title === "string" && s.title) || s.goal || "Sprint"} — ${s.status}`,
              }))}
              ariaLabel="Sprint courant (applique automatiquement)"
            />
          ) : (
            <p className="rounded-lg bg-sand-300 p-2 text-xs font-bold text-navy-900">
              Aucun sprint dans ce périmètre — élargissez le filtre de statut.
            </p>
          )}
        </div>
      </Card>

      {/* ---------- Cartes KPI ---------- */}
      <div className="mb-4 grid gap-4 md:grid-cols-3">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-navy-900">Avancement du Sprint</h2>
            <Badge tone="blue">{selectedSprint ? selectedSprint.status : "—"}</Badge>
          </div>
          <p className="mt-2">
            <span className="rounded-lg bg-sand-300 px-2 py-1 text-2xl font-bold text-navy-900">
              {sprintItems.length === 0 ? "—" : `${Math.round(progressPct)} %`}
            </span>
          </p>
          <p className="mt-1 text-xs text-navy-900/60">
            {selectedSprint
              ? `Sprint : ${("title" in selectedSprint && typeof selectedSprint.title === "string" && selectedSprint.title) || selectedSprint.goal || "—"}`
              : "Aucun sprint sélectionné."}{" "}
            {sprintItems.length === 0
              ? "Ajoutez des items au sprint pour mesurer l&apos;avancement."
              : useStoryPoints
                ? `${sprintDoneSP} / ${sprintTotalSP} Story Points terminés (DONE) · ${sprintDoneCount} / ${sprintItems.length} items.`
                : `Items non chiffrés : ${sprintDoneCount} / ${sprintItems.length} terminés (comptage par items).`}
          </p>
          <div className="mt-2">
            <ProgressBar value={progressPct} label="Avancement du Sprint" />
          </div>
        </Card>

        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-navy-900">Santé du Product Backlog</h2>
            <Badge tone="amber">Hors Sprint</Badge>
          </div>
          <p className="mt-2 flex flex-wrap items-baseline gap-2">
            <span className="rounded-lg bg-sand-300 px-2 py-1 text-2xl font-bold text-navy-900">
              {backlogCount}
            </span>
            <span className="text-sm font-bold text-navy-900">
              item(s) restant(s) · {backlogSP} SP à planifier
            </span>
          </p>
          <p className="mt-1 text-xs text-navy-900/60">
            {backlogUnpointed > 0
              ? `${backlogUnpointed} item(s) sans estimation (comptés à 0).`
              : "Tous les items restants sont chiffrés."}{" "}
            Backlog du produit, indépendant de l&apos;équipe.
          </p>
          <div className="mt-2 flex flex-col gap-1.5">
            {backlogByStatus.map((b) => (
              <div key={b.status} className="flex items-center gap-2">
                <span className="w-16 shrink-0 text-xs font-bold text-navy-900">{b.label}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-sand-100">
                  <div
                    className="h-full rounded-full bg-navy-900"
                    style={{ width: `${Math.round((b.count / backlogMaxStatus) * 100)}%` }}
                  />
                </div>
                <span className="w-8 shrink-0 text-right text-xs font-bold text-navy-900">{b.count}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-navy-900">Indicateur Qualité DoD</h2>
            <Badge tone={dodAvg != null && dodAvg >= 100 ? "green" : "blue"}>
              {scopedItems.length} item(s)
            </Badge>
          </div>
          <p className="mt-2">
            <span className="rounded-lg bg-sand-300 px-2 py-1 text-2xl font-bold text-navy-900">
              {dodAvg == null ? "—" : `${Math.round(dodAvg)} %`}
            </span>
          </p>
          <p className="mt-1 text-xs text-navy-900/60">
            {dodTotal === 0
              ? "Définissez des critères DoD actifs pour mesurer la réussite."
              : `Taux moyen de réussite sur le périmètre (${dodFull} / ${scopedItems.length} à 100 %).`}
          </p>
          <div className="mt-2">
            <ProgressBar value={dodAvg ?? 0} label="Taux moyen de réussite DoD" />
          </div>
          <p className="mt-2 text-sm font-bold text-navy-900">
            ✅ {doneCount} DONE — Incréments livrés.
          </p>
          <p className="mt-1 text-sm font-bold text-navy-900">
            ↩ {unfinishedBacklogCount} non terminé(s) — DoD non atteinte : retournés au backlog,
            à re-planifier.
          </p>
        </Card>
      </div>

      {/* ---------- Vitesse de livraison (temps de cycle) ---------- */}
      <Card className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-navy-900">Vitesse de livraison — temps de cycle moyen</h2>
          <Badge tone="blue">{cycled.length} item(s) DONE</Badge>
        </div>
        <p className="mt-2">
          <span className="rounded-lg bg-sand-300 px-2 py-1 text-2xl font-bold text-navy-900">
            {cycleAvg == null ? "—" : fmtDays(cycleAvg)}
          </span>
        </p>
        <p className="mt-1 text-xs text-navy-900/60">
          {cycleAvg == null
            ? "Aucun item DONE dans le périmètre — le cycle se mesure entre la création de l&apos;item et son passage à DONE (horodatage de l&apos;incrément, sinon dernière mise à jour)."
            : "Temps moyen entre la création de l&apos;item et son passage à DONE (horodatage de l&apos;incrément, sinon dernière mise à jour). Détail des 10 cycles les plus longs :"}
        </p>
        {cycled.length > 0 && (
          <div className="mt-2 flex flex-col gap-1.5">
            {cycled.slice(0, 10).map((c) => (
              <div key={c.id} className="flex items-center gap-2">
                <span className="w-40 shrink-0 truncate text-xs font-bold text-navy-900" title={c.title}>
                  {c.title}
                </span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-sand-100">
                  <div
                    className="h-full rounded-full bg-navy-900"
                    style={{ width: `${Math.max(2, Math.round((c.days / cycleMax) * 100))}%` }}
                  />
                </div>
                <span className="w-16 shrink-0 text-right text-xs font-bold text-navy-900">
                  {fmtDays(c.days)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ---------- Détail DoD par item (sprint courant) ---------- */}
      {sprintItems.length > 0 && dodTotal > 0 && (
        <Card>
          <h2 className="mb-1 font-semibold text-navy-900">
            Détail DoD par item — Sprint courant ({sprintItems.length})
          </h2>
          <p className="mb-2 text-xs text-navy-900/60">
            Part de critères DoD cochés par item : {dodTotal} critère(s) actif(s).
          </p>
          <div className="flex flex-col gap-1.5">
            {sprintItems.map((i) => {
              const rate = i.doneChecks.length >= dodTotal ? 100 : (i.doneChecks.length / dodTotal) * 100;
              return (
                <div key={i.id} className="flex items-center gap-2">
                  <span className="w-40 shrink-0 truncate text-xs font-bold text-navy-900" title={i.title}>
                    {i.title}
                  </span>
                  <div className="flex-1">
                    <ProgressBar value={rate} label={`DoD de ${i.title}`} />
                  </div>
                  <span className="w-20 shrink-0 text-right text-xs font-bold text-navy-900">
                    {i.doneChecks.length}/{dodTotal}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </main>
  );
}
