import { prisma } from "@/lib/prisma";
import { currentUserId, getMyProducts, getProductTeams } from "@/lib/context";
import { getMembership } from "@/lib/dal";
import { resolveProductActor } from "@/lib/scrum-guards";
import { RETRO_IDEA_COLUMNS, canPlanRetroAction } from "@/lib/scrum-rules";
import {
  addRetroIdea,
  createPlannedAction,
  togglePlannedAction,
} from "@/app/actions/retrospective";
import { Badge, Card, PageHeader, buttonSecondary, inputClass } from "@/components/ui";

const IDEA_COLUMNS: {
  id: (typeof RETRO_IDEA_COLUMNS)[number];
  title: string;
  hint: string;
  cardClass: string;
}[] = [
  {
    id: "WENT_WELL",
    title: "🟢 Ce qui a bien marché",
    hint: "Points positifs à célébrer et à conserver.",
    cardClass: "border-green-200 bg-green-50",
  },
  {
    id: "TO_IMPROVE",
    title: "🔴 Ce qui a moins bien marché",
    hint: "Frictions, bugs, ralentissements à traiter.",
    cardClass: "border-red-200 bg-red-50",
  },
  {
    id: "IDEAS",
    title: "💡 Idées d'améliorations",
    hint: "Pistes concrètes pour le futur.",
    cardClass: "border-sand-300 bg-sand-100",
  },
];

/**
 * SPRINT RETROSPECTIVE — /retrospective
 * - Accès : Scrum Team au complet (admin@, dev@, sm@, PO) en écriture ;
 *   Stakeholder (sh@) en LECTURE SEULE absolue (aucun bouton affiché).
 * - Tableau de brainstorming : 3 colonnes de post-its persistés en base
 *   (RetrospectiveIdea), un texte court par membre et par colonne.
 * - Plan d'actions : décisions officielles créées par le SM ou le PO
 *   (texte + Responsable), persistées en base et visibles dès le Sprint suivant.
 */
export default async function RetrospectivePage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string; team?: string; sprint?: string }>;
}) {
  const userId = await currentUserId();
  const params = await searchParams;
  const products = await getMyProducts(userId);
  if (products.length === 0) {
    return (
      <main className="mx-auto w-full max-w-6xl px-4 py-6">
        <PageHeader
          title="Sprint Retrospective"
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
        <PageHeader title="Sprint Retrospective" subtitle="Aucune équipe pour ce produit." />
      </main>
    );
  }
  const firstTeam = teams[0];
  const teamId =
    params.team !== undefined && teams.some((t) => t.id === params.team)
      ? (params.team as string)
      : (firstTeam?.id ?? "");

  const sprints = await prisma.sprint.findMany({
    where: { teamId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { backlogItems: true } } },
  });
  const firstSprint = sprints[0];
  const sprintId =
    params.sprint !== undefined && sprints.some((s) => s.id === params.sprint)
      ? (params.sprint as string)
      : (firstSprint?.id ?? null);
  const selectedSprint = sprints.find((s) => s.id === sprintId) ?? null;

  const [membership, actor] = await Promise.all([
    getMembership(userId, teamId),
    resolveProductActor(userId, productId),
  ]);
  // Sécurité Scrum Team : Stakeholder exclu de toute écriture (lecture seule).
  // Miroir exact de guardImprovement : membre non-Stakeholder uniquement.
  const canWrite = membership != null && membership.role !== "STAKEHOLDER";
  const isStakeholder = membership?.role === "STAKEHOLDER";
  // Plan d'actions officiel : Scrum Master ou PO (règle pure partagée).
  const canPlan = canPlanRetroAction(actor).ok;

  const [ideas, actions] = selectedSprint
    ? await Promise.all([
        prisma.retrospectiveIdea.findMany({
          where: { sprintId: selectedSprint.id },
          include: { author: { select: { email: true } } },
          orderBy: { createdAt: "asc" },
        }),
        prisma.retrospectiveAction.findMany({
          where: { sprintId: selectedSprint.id },
          orderBy: { createdAt: "asc" },
        }),
      ])
    : [[], []];
  const ideasByColumn = new Map<string, typeof ideas>();
  for (const idea of ideas) {
    const list = ideasByColumn.get(idea.column) ?? [];
    list.push(idea);
    ideasByColumn.set(idea.column, list);
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6">
      <PageHeader
        title="Sprint Retrospective — Brainstorming & Plan d&apos;actions"
        subtitle={`Votre rôle dans cette équipe : ${membership?.role ?? "—"}. Idées et actions persistées en base pour le sprint concerné.`}
        actions={
          <div className="flex flex-wrap gap-2">
            <form method="GET" className="flex gap-2">
              <input type="hidden" name="team" value={teamId} />
              {sprintId && <input type="hidden" name="sprint" value={sprintId} />}
              <select name="product" defaultValue={productId} className={inputClass} aria-label="Produit">
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <button type="submit" className={buttonSecondary}>
                Produit
              </button>
            </form>
            <form method="GET" className="flex gap-2">
              <input type="hidden" name="product" value={productId} />
              {sprintId && <input type="hidden" name="sprint" value={sprintId} />}
              <select name="team" defaultValue={teamId} className={inputClass} aria-label="Équipe">
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <button type="submit" className={buttonSecondary}>
                Équipe
              </button>
            </form>
          </div>
        }
      />

      {isStakeholder && (
        <Card className="mb-4">
          <p className="rounded-lg bg-sand-300 p-2 text-sm font-bold text-navy-900">
            Lecture seule : vous observez la Rétrospective (Stakeholder) — ajout et
            modification réservés à la Scrum Team.
          </p>
        </Card>
      )}

      {sprints.length > 0 && (
        <Card className="mb-4">
          <form method="GET" className="flex gap-2">
            <input type="hidden" name="product" value={productId} />
            <input type="hidden" name="team" value={teamId} />
            <select name="sprint" defaultValue={sprintId ?? ""} className={inputClass} aria-label="Sprint">
              {sprints.map((s) => (
                <option key={s.id} value={s.id}>
                  {("title" in s && typeof s.title === "string" && s.title) || s.goal || "Sprint"} — {s.status} (
                  {new Date(s.startDate).toLocaleDateString("fr-FR")} →{" "}
                  {new Date(s.endDate).toLocaleDateString("fr-FR")}) · {s._count.backlogItems} item(s)
                </option>
              ))}
            </select>
            <button type="submit" className={buttonSecondary}>
              Voir
            </button>
          </form>
        </Card>
      )}

      {!selectedSprint && (
        <Card>
          <p className="text-sm text-navy-900/70">
            Aucun Sprint pour cette équipe — créez-en un depuis /planning (1 item READY minimum).
          </p>
        </Card>
      )}

      {selectedSprint && (
        <>
          {/* ---------- Tableau de brainstorming : 3 colonnes de post-its ---------- */}
          <h2 className="mb-2 font-semibold text-navy-900">
            Brainstorming — {ideas.length} idée(s) postée(s)
          </h2>
          <div className="mb-4 grid gap-4 md:grid-cols-3">
            {IDEA_COLUMNS.map((col) => {
              const list = ideasByColumn.get(col.id) ?? [];
              return (
                <section
                  key={col.id}
                  aria-label={col.title}
                  className="rounded-xl border border-sand-200 bg-white p-4 shadow-sm"
                >
                  <h3 className="rounded-lg bg-sand-300 px-2 py-1 text-sm font-bold text-navy-900">
                    {col.title} ({list.length})
                  </h3>
                  <p className="mb-2 px-1 text-xs italic text-navy-900/60">{col.hint}</p>
                  <ul className="flex flex-col gap-2">
                    {list.map((idea) => (
                      <li
                        key={idea.id}
                        className={`rounded-lg border p-2 text-sm font-bold text-navy-900 ${col.cardClass}`}
                      >
                        <span className="block">{idea.text}</span>
                        <span className="mt-1 block text-xs font-normal text-navy-900/60">
                          {idea.author.email} ·{" "}
                          {new Date(idea.createdAt).toLocaleString("fr-FR", {
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </li>
                    ))}
                    {list.length === 0 && (
                      <li className="px-1 text-xs text-navy-900/50">
                        Aucun post-it — à vous de jouer ci-dessous.
                      </li>
                    )}
                  </ul>
                  {canWrite ? (
                    <form
                      className="mt-2 flex gap-1.5"
                      action={async (formData: FormData) => {
                        "use server";
                        await addRetroIdea(
                          teamId,
                          selectedSprint.id,
                          col.id,
                          String(formData.get("text") ?? ""),
                        );
                      }}
                    >
                      <input
                        name="text"
                        required
                        minLength={2}
                        maxLength={500}
                        placeholder="Votre idée en quelques mots…"
                        aria-label={`Nouvelle idée : ${col.title}`}
                        className={inputClass}
                      />
                      <button
                        type="submit"
                        aria-label="Ajouter le post-it"
                        title="Ajouter ce post-it à la colonne"
                        className="shrink-0 rounded-lg bg-navy-900 px-3 py-2 text-sm font-bold text-white hover:bg-navy-800"
                      >
                        +
                      </button>
                    </form>
                  ) : (
                    <p className="mt-2 rounded-lg bg-sand-300 p-2 text-xs font-bold text-navy-900">
                      Saisie réservée à la Scrum Team.
                    </p>
                  )}
                </section>
              );
            })}
          </div>

          {/* ---------- Plan d'actions officiel ---------- */}
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold text-navy-900">
                Plan d&apos;actions — {actions.length} décision(s) officielle(s)
              </h2>
              <Badge tone="blue">SM / PO</Badge>
            </div>
            <p className="mb-2 text-xs text-navy-900/60">
              Décisions officielles de l&apos;équipe, enregistrées en base et visibles dès le
              tableau de bord du Sprint suivant.
            </p>
            <div className="flex flex-col gap-2">
              {actions.map((a) => (
                <div
                  key={a.id}
                  className={
                    a.done
                      ? "flex flex-wrap items-center justify-between gap-2 rounded-lg border border-green-200 bg-green-50 p-2 text-sm text-green-800"
                      : "flex flex-wrap items-center justify-between gap-2 rounded-lg bg-sand-300 p-2 text-sm font-bold text-navy-900"
                  }
                >
                  <span>
                    {a.done ? "✅" : "⬜"} {a.description}{" "}
                    {a.owner && (
                      <span className="ml-1 rounded-full bg-navy-900 px-2 py-0.5 text-xs font-bold text-white">
                        👤 {a.owner}
                      </span>
                    )}
                  </span>
                  {canWrite && (
                    <form
                      action={async () => {
                        "use server";
                        await togglePlannedAction(teamId, a.id, !a.done);
                      }}
                    >
                      <button type="submit" className={buttonSecondary}>
                        {a.done ? "Rouvrir" : "Fait"}
                      </button>
                    </form>
                  )}
                </div>
              ))}
              {actions.length === 0 && (
                <p className="text-sm text-navy-900/70">
                  Aucune action décidée pour ce sprint — le Scrum Master ou le PO peut en créer une ci-dessous.
                </p>
              )}
            </div>
            {canPlan ? (
              <details className="mt-3">
                <summary className="cursor-pointer rounded-lg bg-sand-300 px-2 py-1 text-sm font-bold text-navy-900">
                  ＋ Créer une action d&apos;amélioration (SM / PO)
                </summary>
                <form
                  className="mt-2 flex flex-col gap-2"
                  action={async (formData: FormData) => {
                    "use server";
                    await createPlannedAction(
                      teamId,
                      selectedSprint.id,
                      String(formData.get("description") ?? ""),
                      String(formData.get("owner") ?? ""),
                    );
                  }}
                >
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="font-bold text-navy-900">Texte de l&apos;action</span>
                    <input
                      name="description"
                      required
                      minLength={3}
                      maxLength={500}
                      placeholder="Ex. Automatiser les tests de non-régression"
                      className={inputClass}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="font-bold text-navy-900">Responsable</span>
                    <input
                      name="owner"
                      required
                      minLength={2}
                      maxLength={120}
                      placeholder="Ex. Awa (Dev) / Karim (SM)"
                      className={inputClass}
                    />
                  </label>
                  <div>
                    <button
                      type="submit"
                      className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-bold text-white hover:bg-navy-800"
                    >
                      Enregistrer l&apos;action
                    </button>
                  </div>
                </form>
              </details>
            ) : (
              <p className="mt-3 rounded-lg bg-sand-300 p-2 text-xs font-bold text-navy-900">
                Création d&apos;actions réservée au Scrum Master et au Product Owner.
              </p>
            )}
          </Card>
        </>
      )}
    </main>
  );
}
