import { prisma } from "@/lib/prisma";
import { currentUserId, getMyProducts, requireWorkspace } from "@/lib/context";
import { Badge, Card, PageHeader } from "@/components/ui";
import { AutoFilterSelect } from "@/components/auto-filter";
import { dailyNoteTitleFor } from "@/lib/daily-notes";

const SPRINT_TONE: Record<string, "zinc" | "blue" | "amber" | "green" | "red"> = {
  PLANNING: "amber",
  ACTIVE: "blue",
  REVIEW: "blue",
  CLOSED: "zinc",
  CANCELLED: "red",
};

/** Badge de nature coloré selon le type enregistré. */
function NatureBadge({ nature }: { nature: string }) {
  if (nature === "OBSTACLE") {
    return (
      <span className="inline-flex items-center rounded-full bg-red-600 px-2.5 py-0.5 text-xs font-bold text-white ring-1 ring-inset ring-red-600">
        ⚠️ Obstacle / Blocage
      </span>
    );
  }
  if (nature === "ANNONCE") {
    return (
      <span className="inline-flex items-center rounded-full bg-sand-300 px-2.5 py-0.5 text-xs font-bold text-navy-900 ring-1 ring-inset ring-sand-400">
        📢 Annonce / Rappel
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-blue-100/80 px-2.5 py-0.5 text-xs font-bold text-blue-900 ring-1 ring-inset ring-blue-200">
      🔵 Avancement général
    </span>
  );
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dayLabel(d: Date): string {
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function timeLabel(d: Date): string {
  return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function shortDate(d: Date): string {
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
}

function historyHref(
  productId: string | null,
  sprintId: string | null,
  nature: NatureFilter,
): string {
  const q = new URLSearchParams();
  if (productId) q.set("product", productId);
  if (sprintId) q.set("sprint", sprintId);
  if (nature !== "all") q.set("nature", nature);
  const s = q.toString();
  return s ? `/history?${s}` : "/history";
}

type NatureFilter = "all" | "AVANCEMENT" | "OBSTACLE" | "ANNONCE";

const NATURE_FILTERS: { id: NatureFilter; label: string }[] = [
  { id: "all", label: "Tous" },
  { id: "AVANCEMENT", label: "🔵 Avancement" },
  { id: "OBSTACLE", label: "⚠️ Blocages" },
  { id: "ANNONCE", label: "📢 Annonces" },
];

function parseNatureFilter(
  nature: string | undefined,
  obstacles: string | undefined,
): NatureFilter {
  if (nature === "AVANCEMENT" || nature === "OBSTACLE" || nature === "ANNONCE") return nature;
  // Compatibilité ascendante avec l&apos;ancien toggle ?obstacles=1.
  if (nature === undefined && obstacles === "1") return "OBSTACLE";
  return "all";
}

function sprintOptionLabel(s: { title?: string | null; goal?: string | null; status: string; startDate: Date; endDate: Date }): string {
  const name = (typeof s.title === "string" && s.title) || s.goal || "Sprint";
  return `${name} — ${s.status} (${shortDate(new Date(s.startDate))} → ${shortDate(new Date(s.endDate))})`;
}

/**
 * HISTORIQUE TEMPOREL AVANCÉ — /history
 * Ergonomie compacte : un panneau de filtres empilés (Produit puis Sprint)
 * remplace les gros blocs statiques — aucun scroll infini même avec
 * 100 produits ou sprints. La Timeline jour par jour (plus récent au plus
 * ancien) n&apos;apparaît que lorsque produit ET sprint sont validés.
 * Chaque carte Daily affiche l&apos;en-tête auto, l&apos;équipe, le badge de
 * nature coloré, le texte, puis le Snapshot Agile (étape Kanban + jauge DoD
 * reconstituée à cet instant via les horodatages des DoneCheck). Le filtre
 * par statut (Tous / Avancement / Blocages / Annonces) restreint la timeline
 * — « Blocages » ne garde que les obstacles (Rétrospective).
 */
export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string; sprint?: string; nature?: string; obstacles?: string }>;
}) {
  const userId = await currentUserId();
  const params = await searchParams;
  const products = await getMyProducts(userId);
  const { workspaceId } = await requireWorkspace();
  if (products.length === 0) {
    return (
      <main className="mx-auto w-full max-w-6xl px-4 py-6">
        <PageHeader
          title="Historique Temporel"
          subtitle="Créez d&apos;abord un produit depuis /products."
        />
      </main>
    );
  }
  // Sélection explicite uniquement : pas de timeline tant que produit ET
  // sprint ne sont pas validés dans les menus (ergonomique à 100+ produits).
  const productId =
    params.product !== undefined && products.some((p) => p.id === params.product)
      ? (params.product as string)
      : null;
  const natureFilter = parseNatureFilter(params.nature, params.obstacles);

  // Le menu Sprint se remplit dynamiquement dès qu&apos;un produit est choisi.
  const sprints = productId
    ? await prisma.sprint.findMany({
        where: { workspaceId, team: { productId } },
        include: {
          team: { select: { id: true, name: true } },
          _count: { select: { backlogItems: true, dailyNotes: true } },
        },
        orderBy: { startDate: "asc" },
      })
    : [];
  const sprintId =
    productId && params.sprint !== undefined && sprints.some((s) => s.id === params.sprint)
      ? (params.sprint as string)
      : null;
  const selectedSprint = sprints.find((s) => s.id === sprintId) ?? null;

  // Fil du sprint (plus récent au plus ancien) + pièces du snapshot Agile.
  const [notes, sprintItems, activeCriterionIds] = selectedSprint
    ? await Promise.all([
        prisma.dailyNote.findMany({
          where: { sprintId: selectedSprint.id, sprint: { workspaceId } },
          include: { author: { select: { email: true } } },
          orderBy: { createdAt: "desc" },
        }),
        prisma.backlogItem.findMany({
          where: { sprintId: selectedSprint.id, sprint: { workspaceId } },
          select: {
            id: true,
            title: true,
            doneChecks: { select: { criterionId: true, checkedAt: true } },
          },
        }),
        prisma.doneCriterion.findMany({
          where: { productId: productId ?? "", active: true, product: { workspaceId } },
          select: { id: true },
        }),
      ])
    : [[], [], []];
  const activeSet = new Set(activeCriterionIds.map((c) => c.id));
  const dodTotal = activeCriterionIds.length;
  const itemsById = new Map(sprintItems.map((i) => [i.id, i] as const));

  const visibleNotes =
    natureFilter === "all" ? notes : notes.filter((n) => n.nature === natureFilter);
  const obstacleCount = notes.filter((n) => n.nature === "OBSTACLE").length;
  const natureLabel =
    natureFilter === "all"
      ? null
      : NATURE_FILTERS.find((f) => f.id === natureFilter)?.label ?? natureFilter;

  // Regroupement jour par jour (conserve l&apos;ordre décroissant).
  const days: { key: string; label: string; notes: typeof visibleNotes }[] = [];
  for (const n of visibleNotes) {
    const created = new Date(n.createdAt);
    const key = dayKey(created);
    const last = days[days.length - 1];
    if (last && last.key === key) {
      last.notes.push(n);
    } else {
      days.push({ key, label: dayLabel(created), notes: [n] });
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6">
      <PageHeader
        title="Historique Temporel"
        subtitle="Déballez le produit, puis le sprint : la timeline jour par jour apparaît en dessous (plus récent au plus ancien)."
      />

      {/* ---------- Panneau de sélection compact (Produit → Sprint) ---------- */}
      <Card className="mb-4">
        <div className="grid gap-2 md:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="history-product" className="text-xs font-bold text-navy-900">
              Produit ({products.length})
            </label>
            <AutoFilterSelect
              id="history-product"
              name="product"
              value={productId ?? ""}
              options={products}
              ariaLabel="Sélectionner un produit (applique automatiquement, réinitialise le sprint)"
              resetParams={["sprint"]}
              placeholder="Sélectionner un produit..."
              boldWhenSelected
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="history-sprint" className="text-xs font-bold text-navy-900">
              Sprint {productId ? `(${sprints.length})` : ""}
            </label>
            <AutoFilterSelect
              id="history-sprint"
              name="sprint"
              value={sprintId ?? ""}
              options={sprints.map((s) => ({ id: s.id, name: sprintOptionLabel(s) }))}
              ariaLabel="Sélectionner un sprint (applique automatiquement)"
              disabled={!productId || sprints.length === 0}
              placeholder={
                !productId
                  ? "Sélectionnez d'abord un produit..."
                  : sprints.length === 0
                    ? "Aucun sprint pour ce produit"
                    : "Sélectionner un sprint..."
              }
              boldWhenSelected
            />
          </div>
        </div>
        {productId && sprints.length === 0 && (
          <p className="mt-2 rounded-lg bg-sand-300 p-2 text-xs font-bold text-navy-900">
            Aucun sprint pour ce produit — créez-en un depuis /planning.
          </p>
        )}
      </Card>

      {!selectedSprint && (
        <Card>
          <p className="text-sm text-navy-900/70">
            { !productId
              ? "Déballez le menu Produit ci-dessus pour commencer."
              : "Déballez le menu Sprint ci-dessus : la timeline s'affichera dès qu'un produit ET un sprint seront validés."}
          </p>
        </Card>
      )}

      {/* ---------- Timeline (visible seulement si produit ET sprint validés) ---------- */}
      {selectedSprint && (
        <div className="mb-2 flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-navy-900">
              Timeline : {("title" in selectedSprint && typeof selectedSprint.title === "string" && selectedSprint.title) || selectedSprint.goal || "Sprint"}{" "}
              <Badge tone={SPRINT_TONE[selectedSprint.status] ?? "zinc"}>{selectedSprint.status}</Badge>{" "}
              <span className="text-sm font-normal text-navy-900/60">
                {selectedSprint.team.name} · {visibleNotes.length} note(s) affichée(s) sur {notes.length} · {obstacleCount} obstacle(s)
              </span>
            </h2>
          </div>
          <div
            className="flex flex-wrap items-center gap-1.5 rounded-xl border border-sand-200 bg-white p-2"
            aria-label="Filtrer la timeline par nature"
          >
            <span className="px-1 text-xs font-bold text-navy-900">Filtrer par statut :</span>
            {NATURE_FILTERS.map((f) => {
              const selected = natureFilter === f.id;
              return (
                <a
                  key={f.id}
                  href={historyHref(productId, selectedSprint.id, f.id)}
                  aria-current={selected ? "true" : undefined}
                  title={
                    f.id === "all"
                      ? "Afficher toute la timeline"
                      : f.id === "OBSTACLE"
                        ? "Ne garder que l&apos;historique des obstacles (préparation de la Rétrospective)"
                        : `Ne garder que les notes « ${f.label} »`
                  }
                  className={
                    selected
                      ? "inline-flex items-center justify-center rounded-lg bg-sand-300 px-3 py-1.5 text-xs font-bold text-navy-900 hover:bg-sand-200"
                      : "inline-flex items-center justify-center rounded-lg border border-navy-900/20 bg-white px-3 py-1.5 text-xs font-medium text-navy-900 hover:bg-sand-100"
                  }
                >
                  {f.label}
                </a>
              );
            })}
          </div>
        </div>
      )}

      {selectedSprint && natureFilter === "OBSTACLE" && (
        <p className="mb-2 rounded-lg bg-red-600 p-2 text-xs font-bold text-white">
          Filtre de crise actif : seuls les {obstacleCount} obstacle(s) sont affichés — idéal pour préparer la Rétrospective.
        </p>
      )}

      {selectedSprint && visibleNotes.length === 0 && (
        <Card>
          <p className="text-sm text-navy-900/70">
            {natureFilter === "all"
              ? "Aucune note de Daily sur ce sprint pour l&apos;instant."
              : natureFilter === "OBSTACLE"
                ? "Aucun obstacle enregistré sur ce sprint — tout s&apos;est bien passé."
                : `Aucune note « ${natureLabel} » sur ce sprint.`}
          </p>
        </Card>
      )}

      {selectedSprint && (
        <div className="flex flex-col gap-4">
          {days.map((day) => (
            <section key={day.key} aria-label={`Daily du ${day.label}`}>
              <h3 className="mb-1.5 rounded-lg bg-sand-300 px-2 py-1 text-sm font-bold text-navy-900">
                📅 Daily du {day.label} — {selectedSprint.team.name} · {day.notes.length} note(s)
              </h3>
              <div className="flex flex-col gap-2 border-l-4 border-sand-300 pl-3">
                {day.notes.map((n) => {
                  const created = new Date(n.createdAt);
                  const item = n.backlogItemId ? itemsById.get(n.backlogItemId) : undefined;
                  const checkedAtInstant = item
                    ? item.doneChecks.filter(
                        (c) => activeSet.has(c.criterionId) && new Date(c.checkedAt) <= created,
                      ).length
                    : 0;
                  const pct = dodTotal > 0 ? Math.round((checkedAtInstant / dodTotal) * 100) : 0;
                  return (
                    <article key={n.id} className="rounded-xl border border-sand-200 bg-white p-3 shadow-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-lg bg-sand-300 px-2 py-0.5 text-xs font-bold text-navy-900">
                          {n.title ?? dailyNoteTitleFor(created)}
                        </span>
                        <NatureBadge nature={n.nature} />
                        <span className="text-xs text-navy-900/60">
                          {timeLabel(created)} · {n.author.email}
                        </span>
                      </div>
                      {item && (
                        <p className="mt-1 text-xs font-bold text-navy-900">
                          🎫 Ticket : {item.title}
                        </p>
                      )}
                      <p className="mt-1.5 whitespace-pre-wrap text-sm text-navy-900">{n.text}</p>
                      {/* Snapshot Agile */}
                      <div className="mt-2 rounded-lg bg-sand-100 p-2">
                        <p className="text-xs font-bold text-navy-900">
                          Étape : {n.column}
                          {item ? (
                            dodTotal > 0 ? (
                              <>
                                {" "}· DoD validée à {pct} % : {checkedAtInstant}/{dodTotal} critères
                              </>
                            ) : (
                              <> · DoD non définie</>
                            )
                          ) : (
                            <> · Note d&apos;étape (vue d&apos;ensemble)</>
                          )}
                        </p>
                        {item && dodTotal > 0 && (
                          <div
                            className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white"
                            role="progressbar"
                            aria-valuenow={pct}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-label={`Jauge DoD de ${item.title} à cet instant`}
                            title={`Jauge DoD à cet instant : ${pct} %`}
                          >
                            <div
                              className={`h-full rounded-full ${pct >= 100 ? "bg-green-600" : "bg-navy-900"}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
