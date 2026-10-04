import { prisma } from "@/lib/prisma";
import { currentUserId, getMyProducts, getProductTeams } from "@/lib/context";
import { autoCloseExpiredSprints, resolveProductActor } from "@/lib/scrum-guards";
import { getMembership } from "@/lib/dal";
import { compareEventsByScrumOrder, isOpenSprintStatus, isScrumTeamActor } from "@/lib/scrum-rules";
import { PageHeader, Card, buttonSecondary } from "@/components/ui";
import { inputClass } from "@/components/ui";
import { SprintKanban } from "@/components/sprint/sprint-kanban";
import { EventChrono } from "@/components/event-chrono";
import { DailyScrumTracker } from "@/components/daily-scrum-tracker";
import { addStakeholderFeedback, addTeamSynthesis } from "@/app/actions/planning";

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

  const [sprint, criteria, dailyNotes, sprintEvents, reviewComments] = await Promise.all([
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
    // Événements du Sprint (chronos + compteur Daily répété de l'étape 2).
    sprintId
      ? prisma.scrumEvent.findMany({
          where: { sprintId },
        })
      : [],
    // Session de Sprint Review : commentaires persistés liés au Sprint courant
    // (synthèse Team + retours Stakeholders, distingués par `kind`).
    sprintId
      ? prisma.stakeholderComment.findMany({
          where: { sprintId },
          select: {
            id: true,
            kind: true,
            text: true,
            createdAt: true,
            author: { select: { email: true } },
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
  const isSM = membership?.role === "SCRUM_MASTER";
  const roleByUserId = new Map(teamMemberships.map((m) => [m.userId, m.role] as const));

  // Événements & chronos : ordre Scrum Planning → Daily → Review → Rétro.
  const orderedSprintEvents = [...sprintEvents].sort(compareEventsByScrumOrder);
  const dailySprintEv = orderedSprintEvents.find((e) => e.type === "DAILY_SCRUM");
  const dailySprintCompleted = dailySprintEv?.completed === true;

  // Session de Sprint Review : droits inversés par colonne.
  // - Synthèse Team : écriture Scrum Team (Stakeholder en lecture seule).
  // - Retours Stakeholders : écriture Stakeholder UNIQUEMENT (Team en lecture seule).
  // Commentaires possibles uniquement pendant le Sprint (ACTIVE/REVIEW).
  const reviewOpen =
    sprint != null && (sprint.status === "ACTIVE" || sprint.status === "REVIEW");
  const canPostSynthesis = !isStakeholder && membership != null && reviewOpen;
  const canPostFeedback = isStakeholder && reviewOpen;
  const teamSynthesis = reviewComments.filter((c) => c.kind !== "STAKEHOLDER_FEEDBACK");
  const stakeholderFeedback = reviewComments.filter((c) => c.kind === "STAKEHOLDER_FEEDBACK");

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

      {/* Événements & chronos : liés au Sprint, communs à tous ses items (en bas, après le Kanban). */}
      {sprint && (
        <Card className="mb-3">
          <h2 className="mb-1 font-medium">Événements &amp; chronos — liés au Sprint (communs à tous ses items)</h2>
          <p className="mb-2 text-xs text-navy-900/60">
            Le Daily se répète chaque jour : validez chaque édition (+1 + reset chrono 15 min), puis clôturez définitivement pour débloquer la 3. Sprint Review.
          </p>
          {orderedSprintEvents.length === 0 && (
            <p className="text-sm text-navy-900/70">Aucun événement pour ce Sprint.</p>
          )}
          <div className="flex flex-col gap-3">
            {orderedSprintEvents.map((ev, idx) => {
              const isDaily = ev.type === "DAILY_SCRUM";
              const isReview = ev.type === "SPRINT_REVIEW";
              const reviewLocked = isReview && !dailySprintCompleted;
              const label =
                ev.type === "SPRINT_PLANNING"
                  ? "1. Sprint Planning"
                  : ev.type === "DAILY_SCRUM"
                    ? "2. Daily Scrum"
                    : ev.type === "SPRINT_REVIEW"
                      ? "3. Sprint Review"
                      : "4. Rétrospective";
              return (
                <div key={ev.id} className="rounded-lg border border-sand-200 p-3">
                  <p className="mb-1.5 text-sm font-medium">
                    <span className="mr-1.5 text-navy-900/40">{idx + 1}.</span>
                    {label}
                  </p>
                  {isDaily ? (
                    <DailyScrumTracker
                      teamId={teamId}
                      eventId={ev.id}
                      dailyCount={ev.dailyCount ?? 0}
                      dailyTotal={ev.dailyTotal ?? 20}
                      completed={ev.completed}
                      timeboxMinutes={ev.timeboxMinutes}
                      canManage={isSM}
                    />
                  ) : null}
                  {reviewLocked ? (
                    <p className="mb-2 rounded-lg bg-sand-300 p-2 text-xs font-bold text-navy-900">
                      🔒 Étape verrouillée : clôturez définitivement les Daily (bouton « 🛑 Clôture définitive des Daily » à l&apos;étape 2) pour débloquer la 3. Sprint Review.
                    </p>
                  ) : null}
                  <EventChrono
                    startedAtISO={ev.startedAt ? new Date(ev.startedAt).toISOString() : null}
                    endedAtISO={ev.endedAt ? new Date(ev.endedAt).toISOString() : null}
                    timeboxMinutes={ev.timeboxMinutes}
                    eventId={ev.id}
                    teamId={teamId}
                    canManage={isDaily ? false : isReview ? isSM && !reviewLocked : isSM}
                    completed={ev.completed}
                  />
                  {isDaily && ev.completed ? (
                    <p className="mt-1 rounded-lg bg-green-50 p-2 text-xs font-bold text-green-800">
                      ✅ 3. Sprint Review débloquée : les Daily sont définitivement clôturés.
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* 📣 Session de Sprint Review (Démo & Retours) — en bas, sous les chronos.
          Commentaires persistés en base, liés au Sprint courant.
          Droits inversés : synthèse = écriture Team (sh@ lecture seule) ;
          retours = écriture Stakeholder UNIQUEMENT (Team en lecture seule). */}
      {sprint && (
        <Card className="mb-3">
          <h2 className="mb-1 font-semibold text-navy-900">
            📣 Session de Sprint Review (Démo &amp; Retours)
          </h2>
          <p className="mb-2 text-xs text-navy-900/60">
            Démo de l&apos;Incrément et retours persistés, liés au Sprint courant.
            {!reviewOpen && " Sprint clôturé : les deux colonnes sont en lecture seule."}
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <section
              aria-label="Synthèse de la Scrum Team"
              className="rounded-xl border border-sand-200 bg-white p-3"
            >
              <h3 className="rounded-lg bg-sand-300 px-2 py-1 text-sm font-bold text-navy-900">
                ✍️ Synthèse de la Scrum Team ({teamSynthesis.length})
              </h3>
              <p className="mb-2 px-1 text-xs italic text-navy-900/60">
                Résumé de la démo noté par admin@, dev@, sm@.
              </p>
              <div className="flex flex-col gap-1.5">
                {teamSynthesis.map((c) => (
                  <p key={c.id} className="rounded-lg bg-sand-100 px-2 py-1.5 text-sm text-navy-900">
                    <span className="font-bold">{c.author.email}</span>{" "}
                    <span className="text-navy-900/60">
                      · {new Date(c.createdAt).toLocaleString("fr-FR")}
                    </span>
                    <span className="block">{c.text}</span>
                  </p>
                ))}
                {teamSynthesis.length === 0 && (
                  <p className="px-1 text-xs text-navy-900/50">
                    Aucune synthèse pour ce sprint pour l&apos;instant.
                  </p>
                )}
              </div>
              {canPostSynthesis ? (
                <form action={addTeamSynthesis.bind(null, sprint.id, teamId)} className="mt-2 flex gap-2">
                  <input
                    name="text"
                    required
                    minLength={2}
                    placeholder="Résumé de la démo…"
                    aria-label="Synthèse de la démo"
                    className={inputClass}
                  />
                  <button type="submit" className={buttonSecondary}>
                    Publier
                  </button>
                </form>
              ) : (
                <p className="mt-2 rounded-lg bg-sand-300 p-2 text-xs font-bold text-navy-900">
                  {isStakeholder
                    ? "Lecture seule : synthèse rédigée par la Scrum Team."
                    : "Publication possible uniquement pendant le Sprint (ACTIVE/REVIEW)."}
                </p>
              )}
            </section>
            <section
              aria-label="Retours des Stakeholders"
              className="rounded-xl border border-sand-200 bg-white p-3"
            >
              <h3 className="rounded-lg bg-sand-300 px-2 py-1 text-sm font-bold text-navy-900">
                💬 Retours des Stakeholders / Clients ({stakeholderFeedback.length})
              </h3>
              <p className="mb-2 px-1 text-xs italic text-navy-900/60">
                Écriture Stakeholder uniquement — la Team lit sans modifier.
              </p>
              <div className="flex flex-col gap-1.5">
                {stakeholderFeedback.map((c) => (
                  <p key={c.id} className="rounded-lg bg-sand-100 px-2 py-1.5 text-sm text-navy-900">
                    <span className="font-bold">{c.author.email}</span>{" "}
                    <span className="text-navy-900/60">
                      · {new Date(c.createdAt).toLocaleString("fr-FR")}
                    </span>
                    <span className="block">{c.text}</span>
                  </p>
                ))}
                {stakeholderFeedback.length === 0 && (
                  <p className="px-1 text-xs text-navy-900/50">
                    Aucun retour client pour ce sprint pour l&apos;instant.
                  </p>
                )}
              </div>
              {canPostFeedback ? (
                <form action={addStakeholderFeedback.bind(null, sprint.id, teamId)} className="mt-2 flex gap-2">
                  <input
                    name="text"
                    required
                    minLength={2}
                    placeholder="Votre retour sur la démo…"
                    aria-label="Retour sur la démo"
                    className={inputClass}
                  />
                  <button type="submit" className={buttonSecondary}>
                    Envoyer
                  </button>
                </form>
              ) : (
                <p className="mt-2 rounded-lg bg-sand-300 p-2 text-xs font-bold text-navy-900">
                  {reviewOpen
                    ? "Lecture seule : seuls les Stakeholders publient ici (la Team ne peut ni modifier ni supprimer)."
                    : "Publication possible uniquement pendant le Sprint (ACTIVE/REVIEW)."}
                </p>
              )}
            </section>
          </div>
        </Card>
      )}
    </main>
  );
}
