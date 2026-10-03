import { prisma } from "@/lib/prisma";
import { currentUserId, getMyProducts, getProductTeams } from "@/lib/context";
import { autoCloseExpiredSprints, resolveProductActor } from "@/lib/scrum-guards";
import { getMembership } from "@/lib/dal";
import { isOpenSprintStatus, isScrumTeamActor } from "@/lib/scrum-rules";
import { PageHeader, Card, buttonSecondary } from "@/components/ui";
import { inputClass } from "@/components/ui";
import { SprintKanban } from "@/components/sprint/sprint-kanban";

/**
 * INTERFACE DE VALIDATION DOD ET SUIVI DU SPRINT — /sprint
 * Serveur :
 * - Nettoie les Sprints dépassés via `autoCloseExpiredSprints()` (time-box).
 * - Charge le Sprint actif (PLANNING / ACTIVE / REVIEW) de l'équipe.
 * - Charge la DoD unique du produit + items du Sprint avec DoneCheck/Increment.
 * Délègue le Kanban + la modale au composant client `SprintKanban`
 * (checklist à cocher un par un, promotion bloquée < 100 %).
 */
export default async function SprintPage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string; team?: string; sprint?: string; item?: string }>;
}) {
  const userId = await currentUserId();
  const params = await searchParams;
  const products = await getMyProducts(userId);
  if (products.length === 0) {
    return (
      <main className="mx-auto w-full max-w-6xl px-4 py-6">
        <PageHeader
          title="Suivi du Sprint"
          subtitle="Créez d'abord un produit depuis /products."
        />
      </main>
    );
  }
  const productId = products.some((p) => p.id === params.product)
    ? params.product!
    : products[0]!.id;
  const teams = await getProductTeams(productId);
  if (teams.length === 0) {
    return (
      <main className="mx-auto w-full max-w-6xl px-4 py-6">
        <PageHeader title="Suivi du Sprint" subtitle="Aucune équipe pour ce produit." />
      </main>
    );
  }
  const teamId = teams.some((t) => t.id === params.team) ? params.team! : teams[0]!.id;

  // Tâche de fond : clôture automatique des Sprints à time-box écoulée.
  await autoCloseExpiredSprints(teamId);

  const sprints = await prisma.sprint.findMany({
    where: { teamId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { backlogItems: true } } },
  });
  const openSprints = sprints.filter((s) => isOpenSprintStatus(s.status));
  const sprintId = sprints.some((s) => s.id === params.sprint)
    ? params.sprint!
    : (openSprints[0]?.id ?? sprints[0]?.id ?? null);

  const [sprint, criteria, dailyNotes] = await Promise.all([
    sprintId
      ? prisma.sprint.findUnique({
          where: { id: sprintId },
          include: {
            backlogItems: {
              include: {
                doneChecks: { select: { criterionId: true } },
                increment: true,
              },
              orderBy: { order: "asc" },
            },
          },
        })
      : null,
    prisma.doneCriterion.findMany({
      where: { productId, active: true },
      orderBy: { label: "asc" },
    }),
    // Requête séparée (plutôt qu'un `include: { dailyNotes }` sur Sprint) :
    // évite toute désynchronisation du client Prisma généré et ne charge
    // que les champs strictement nécessaires à `SprintKanban`.
    sprintId
      ? prisma.dailyNote.findMany({
          where: { sprintId },
          select: {
            id: true,
            backlogItemId: true,
            column: true,
            text: true,
            title: true,
            nature: true,
            createdAt: true,
            authorId: true,
          },
          orderBy: { createdAt: "asc" },
        })
      : [],
  ]);

  // Synthèses de clôture des étapes (TODO / IN_PROGRESS / REVIEW).
  // Résilient au client Prisma non régénéré (ancien `next dev` sans
  // `prisma generate`) : page lisible en mode dégradé au lieu de crasher
  // sur `prisma.sprintStageClosure is undefined`.
  let stageClosures: { stage: string; summary: string | null; closedAt: Date }[] = [];
  if (sprintId) {
    const delegate = (prisma as unknown as Record<string, unknown>).sprintStageClosure as
      | { findMany: (args: unknown) => Promise<{ stage: string; summary: string | null; closedAt: Date }[]> }
      | undefined;
    if (delegate?.findMany) {
      stageClosures = await delegate.findMany({
        where: { sprintId },
        select: { stage: true, summary: true, closedAt: true },
      });
    }
  }

  // Suivi quotidien : tableau géré par les Developers ; cochage DoD ouvert à
  // toute la Scrum Team (PO, SM, Dev) ; Stakeholder en lecture seule.
  // Notes du Daily : écriture Developers + Scrum Master (+ Admin).
  const [actor, membership, teamMemberships, currentUser] = await Promise.all([
    resolveProductActor(userId, productId),
    getMembership(userId, teamId),
    prisma.teamMembership.findMany({
      where: { teamId },
      select: { userId: true, role: true },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { globalRole: true },
    }),
  ]);
  const canManageBoard =
    membership?.role === "DEVELOPER" || membership?.participatesAsDeveloper === true;
  const canCheck = isScrumTeamActor(actor);
  const canAddNote =
    currentUser?.globalRole === "ADMIN" ||
    membership?.role === "DEVELOPER" ||
    membership?.role === "SCRUM_MASTER" ||
    membership?.participatesAsDeveloper === true;
  const isStakeholder = membership?.role === "STAKEHOLDER";
  const roleByUserId = new Map(teamMemberships.map((m) => [m.userId, m.role] as const));

  // Suivi par item : le Sprint affiche autant de suivis que d'items rattachés
  // en Planning (?item= pour suivre un item précis, sinon tous en même temps).
  const focusItemId =
    sprint && params.item && sprint.backlogItems.some((i) => i.id === params.item)
      ? params.item
      : null;
  const suiviHref = (itemId: string | null) =>
    `/sprint?product=${productId}&team=${teamId}&sprint=${sprint?.id ?? ""}${itemId ? `&item=${itemId}` : ""}`;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6">
      <PageHeader
        title="Suivi du Sprint — Kanban & validation DoD"
        subtitle="TODO / IN_PROGRESS / REVIEW / DONE en séquence verrouillée (pas de saut). Dernière étape : validez 100 % de la DoD + commentaire de validation obligatoire pour passer en Incrément."
        actions={
          <div className="flex flex-wrap gap-2">
            <form method="GET" className="flex gap-2">
              <input type="hidden" name="team" value={teamId} />
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

      {sprints.length > 0 && (
        <Card className="mb-3">
          <p className="mb-2 text-sm font-bold text-navy-900">
            Sprint suivi : {(sprint as { title?: string | null })?.title ?? sprint?.goal ?? "—"} · {sprint?.backlogItems.length ?? 0} item(s) rattaché(s)
          </p>
          <form method="GET" className="flex gap-2">
            <input type="hidden" name="product" value={productId} />
            <input type="hidden" name="team" value={teamId} />
            <select name="sprint" defaultValue={sprintId ?? ""} className={inputClass} aria-label="Sprint">
                {sprints.map((s) => (
                  <option key={s.id} value={s.id}>
                    {(s as { title?: string | null }).title ?? s.goal ?? "Sprint"} — {s.status} ({new Date(s.startDate).toLocaleDateString("fr-FR")} →{" "}
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

      {!sprint && (
        <Card>
          <p className="text-sm text-navy-900/70">
            Aucun Sprint pour cette équipe — créez-en un depuis /planning (1 item READY minimum).
          </p>
        </Card>
      )}

      {sprint && sprint.backlogItems.length > 0 && (
        <Card className="mb-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-medium">
              Liste des suivis — {sprint.backlogItems.length} item(s) rattaché(s)
              {focusItemId ? " (1 suivi affiché)" : " (tous suivis en même temps)"}
            </h2>
            {focusItemId && (
              <a href={suiviHref(null)} className={buttonSecondary}>
                Tous les items
              </a>
            )}
          </div>
          <ul className="flex flex-col gap-1.5">
            {sprint.backlogItems.map((i) => {
              const col = i.status === "DONE" || i.increment != null ? "DONE" : i.boardColumn;
              const focused = focusItemId === i.id;
              return (
                <li
                  key={i.id}
                  className={
                    focused
                      ? "flex flex-wrap items-center justify-between gap-2 rounded-lg bg-sand-300 p-2 text-sm font-bold text-navy-900"
                      : "flex flex-wrap items-center justify-between gap-2 rounded-lg border border-sand-200 p-2 text-sm text-navy-900"
                  }
                >
                  <span>
                    [{col}] {i.title}{" "}
                    <span className="text-xs text-navy-900/60">
                      DoD : {i.doneChecks.length}/{criteria.length}
                    </span>{" "}
                    {i.increment != null && <span className="text-xs text-green-700">Increment livré ✓</span>}
                  </span>
                  {focused ? (
                    <span className="text-xs font-bold text-navy-900">● suivi affiché</span>
                  ) : (
                    <a href={suiviHref(i.id)} className={buttonSecondary}>
                      Suivre cet item →
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {isStakeholder && (
        <Card className="mb-3">
          <p className="rounded-lg bg-sand-300 p-2 text-sm font-bold text-navy-900">
            Lecture seule : vous observez l&apos;Incrément (Stakeholder) — gestion
            quotidienne réservée aux Developers.
          </p>
        </Card>
      )}

      {sprint && (
        <SprintKanban
          productId={productId}
          teamId={teamId}
          sprintId={sprint.id}
          sprintTitle={(sprint as { title?: string | null }).title ?? sprint.goal}
          sprintGoal={sprint.goal}
          sprintStatus={sprint.status}
          focusItemId={focusItemId}
          currentStage={(sprint as { currentStage?: string }).currentStage ?? "TODO"}
          stageClosures={stageClosures.map((c) => ({
            stage: c.stage,
            summary: c.summary,
            closedAt: c.closedAt.toISOString(),
          }))}
          criteria={criteria.map((c) => ({ id: c.id, label: c.label }))}
          items={sprint.backlogItems.map((i) => ({
            id: i.id,
            title: i.title,
            description: i.description,
            status: i.status,
            storyPoints: i.storyPoints,
            boardColumn: i.boardColumn,
            checkedCriterionIds: i.doneChecks.map((d) => d.criterionId),
            hasIncrement: i.increment != null,
          }))}
          notes={dailyNotes.map((n) => ({
            id: n.id,
            backlogItemId: n.backlogItemId,
            column: n.column,
            text: n.text,
            title: n.title,
            nature: n.nature,
            createdAt: n.createdAt.toISOString(),
            authorRole: roleByUserId.get(n.authorId) ?? "—",
          }))}
          canManageBoard={canManageBoard}
          canCheck={canCheck}
          canAddNote={canAddNote}
        />
      )}
    </main>
  );
}
