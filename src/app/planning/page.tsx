import { prisma } from "@/lib/prisma";
import { currentUserId, getMyProducts, getProductTeams, getTeamSprints } from "@/lib/context";
import { getMembership } from "@/lib/dal";
import {
  canCreateSprint,
  canStartSprint,
  computeTimeboxes,
  isOpenSprintStatus,
} from "@/lib/scrum-rules";
import {
  autoCloseExpiredSprints,
  guardCreateSprint,
  guardStartSprint,
} from "@/lib/scrum-guards";
import { promoteToIncrement } from "@/app/actions/dod";
import {
  cancelSprint,
  closeSprint,
  createSprint,
  deleteSprint,
  pullItemToSprint,
  startSprint,
  updateSprintGoal,
} from "@/app/actions/planning";
import { ActionForm, Field, inputClass } from "@/components/action-form";
import { PlanningBoard } from "@/components/planning/planning-board";
import {
  Badge,
  Card,
  PageHeader,
  buttonPrimary,
  buttonSecondary,
} from "@/components/ui";

const STATUS_TONE: Record<string, "zinc" | "blue" | "amber" | "green" | "red"> = {
  PLANNING: "amber",
  ACTIVE: "blue",
  REVIEW: "blue",
  CLOSED: "zinc",
  CANCELLED: "red",
};

function Picker({
  name, value, options, submitLabel,
}: {
  name: string;
  value: string;
  options: { id: string; name: string }[];
  submitLabel: string;
}) {
  return (
    <form method="GET" className="flex gap-2">
      <select name={name} defaultValue={value} className={inputClass}>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
      <button type="submit" className={buttonSecondary}>
        {submitLabel}
      </button>
    </form>
  );
}

export default async function PlanningPage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string; team?: string; sprint?: string }>;
}) {
  const userId = await currentUserId();
  const params = await searchParams;
  const products = await getMyProducts(userId);
  if (products.length === 0) {
    return (
      <main className="mx-auto w-full max-w-5xl px-4 py-6">
        <PageHeader title="Sprint Planning" subtitle="Créez d&apos;abord un produit depuis le Product Backlog." />
      </main>
    );
  }
  const productId = products.some((p) => p.id === params.product) ? params.product! : products[0]!.id;
  const teams = await getProductTeams(productId);
  if (teams.length === 0) {
    return (
      <main className="mx-auto w-full max-w-5xl px-4 py-6">
        <PageHeader title="Sprint Planning" subtitle="Aucune équipe pour ce produit." />
      </main>
    );
  }
  const teamId = teams.some((t) => t.id === params.team) ? params.team! : teams[0]!.id;
  // Fin par time-box : les Sprints dont la durée est écoulée sont clôturés
  // automatiquement (items DoD validés conservés, autres retournés au Backlog).
  await autoCloseExpiredSprints(teamId);
  const sprints = await getTeamSprints(teamId);
  const sprintId = sprints.some((s) => s.id === params.sprint) ? params.sprint : sprints[0]?.id ?? null;

  const [membership, sprint, readyItems, boardItems, criteria] = await Promise.all([
    getMembership(userId, teamId),
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
    prisma.backlogItem.findMany({
      where: { productId, status: "READY", sprintId: null },
      orderBy: { order: "asc" },
    }),
    // Boîte de gauche : TOUS les items du produit sélectionné hors Sprint et non DONE
    // (hors Sprint, statut différent de DONE) — sans filtre restrictif sur REFINED.
    prisma.backlogItem.findMany({
      where: { productId, sprintId: null, status: { not: "DONE" } },
      orderBy: { order: "asc" },
    }),
    prisma.doneCriterion.findMany({
      where: { productId, active: true },
      orderBy: { label: "asc" },
    }),
  ]);

  const role = membership?.role ?? "—";
  // Permissions d'écran : planification collective PO/SM/Dev, Stakeholder en lecture seule.
  const isStakeholder = membership?.role === "STAKEHOLDER";
  const canPlan = !!membership && !isStakeholder;
  const sprintDays = sprint
    ? (new Date(sprint.endDate).getTime() - new Date(sprint.startDate).getTime()) / 86400000
    : 0;
  const timeboxes = sprint ? computeTimeboxes(sprintDays) : null;
  // Séquence stricte : un seul Sprint ouvert à la fois — le suivant est
  // verrouillé tant que le précédent n'est pas CLOSED.
  // Source de vérité : gardes adossées DB (guardCreateSprint / guardStartSprint),
  // double-checkées par les règles pures (canCreateSprint / canStartSprint).
  const openSprint = sprints.find((s) => isOpenSprintStatus(s.status)) ?? null;
  const createGuard = await guardCreateSprint(teamId);
  const pureCreate = canCreateSprint(openSprint);
  const startGuard = sprint ? await guardStartSprint(teamId, sprint.id) : { ok: true as const };
  const pureStart = canStartSprint(openSprint && openSprint.id !== sprint?.id ? openSprint : null);
  const creationLocked = !createGuard.ok || !pureCreate.ok;
  const lockMessage =
    (!createGuard.ok && "message" in createGuard ? createGuard.message : null) ??
    (!pureCreate.ok && "message" in pureCreate ? pureCreate.message : null) ??
    (!startGuard.ok && "message" in startGuard ? startGuard.message : null) ??
    (!pureStart.ok && "message" in pureStart ? pureStart.message : null) ??
    null;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6">
      <PageHeader
        title="Sprint Planning"
        subtitle={`Votre rôle dans cette équipe : ${role}${membership?.participatesAsDeveloper ? " (participe comme Developer)" : ""}. Timeboxes calculées au prorata de la durée du Sprint.`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Picker name="product" value={productId} options={products} submitLabel="Produit" />
            <Picker name="team" value={teamId} options={teams.map((t) => ({ ...t }))} submitLabel="Équipe" />
          </div>
        }
      />

      {/* Séquence stricte des Sprints : verrou tant que le précédent n'est pas CLOSED.
          Bandeau orange/rouge exigé (guardStartSprint / canStartSprint). */}
      {creationLocked && (
        <div className="mb-4 rounded-xl border border-orange-300 bg-orange-100 p-3 text-sm text-orange-900" role="alert">
          <span className="font-bold">⚠️ Sprint verrouillé :</span>{" "}
          « {openSprint?.goal ?? "Sprint en cours"} » est encore {openSprint?.status} — {lockMessage ?? "clôturez-le avant de démarrer le Sprint suivant."}{" "}
          Un seul Sprint ouvert à la fois.
        </div>
      )}

      {/* Double vue : Product Backlog ↔ Sprint courant (clic + drag-and-drop via guardPullItemToSprint) */}
      <div className="mb-4">
        <PlanningBoard
          teamId={teamId}
          productId={productId}
          backlogItems={boardItems.map((i) => ({
            id: i.id,
            title: i.title,
            description: i.description,
            status: i.status,
            storyPoints: i.storyPoints,
          }))}
          sprint={
            sprint
              ? {
                  id: sprint.id,
                  title: (sprint as { title?: string | null }).title ?? null,
                  goal: sprint.goal,
                  status: sprint.status,
                  startDate: new Date(sprint.startDate).toISOString(),
                  endDate: new Date(sprint.endDate).toISOString(),
                  itemCount: sprint.backlogItems.length,
                }
              : null
          }
          serverLocked={creationLocked}
          serverLockMessage={lockMessage}
          canPlan={canPlan}
        />
      </div>
      {isStakeholder && (
        <div className="mb-4 rounded-xl bg-sand-300 p-3 text-sm font-bold text-navy-900" role="status">
          Lecture seule : vous observez l&apos;Incrément (Stakeholder) — aucune action
          de planification, modification ou commentaire.
        </div>
      )}

      {/* Sélecteur + création de Sprint */}
      <Card className="mb-4">
        <div className="flex flex-col gap-3">
          {sprints.length > 0 && (
            <form method="GET" className="flex gap-2">
              <input type="hidden" name="product" value={productId} />
              <input type="hidden" name="team" value={teamId} />
              <select name="sprint" defaultValue={sprintId ?? ""} className={inputClass}>
                {sprints.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title ?? s.goal ?? "Sprint"} — {s.status} ({new Date(s.startDate).toLocaleDateString("fr-FR")} →{" "}
                    {new Date(s.endDate).toLocaleDateString("fr-FR")}) · {s._count.backlogItems} item(s)
                  </option>
                ))}
              </select>
              <button type="submit" className={buttonSecondary}>
                Voir
              </button>
            </form>
          )}
          <details>
            <summary className="cursor-pointer text-sm font-medium">+ Nouveau Sprint (durée ≤ 1 mois{creationLocked ? " — verrouillé tant que le Sprint en cours n'est pas clôturé" : ""} — 1 item READY minimum)</summary>
            <div className="mt-2">
              {canPlan ? (
                readyItems.length === 0 ? (
                  <p className="rounded-lg bg-sand-300 p-2 text-sm font-bold text-navy-900">
                    Aucun item READY à planifier — affinez puis estimez des items depuis le Product Backlog avant de créer le Sprint.
                  </p>
                ) : (
                  <ActionForm action={createSprint.bind(null, teamId)} submitLabel="Créer le Sprint">
                    <Field label="Titre du Sprint (propagé dans les filtres et lié aux items)">
                      <input name="title" required minLength={3} maxLength={120} className={inputClass} placeholder="Ex. Sprint 12 — Réservation" />
                    </Field>
                    <Field label="Objectif de Sprint (verrouillé à la fin de la Planning)">
                      <input name="goal" required minLength={5} className={inputClass} />
                    </Field>
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Début">
                        <input name="startDate" type="date" required className={inputClass} />
                      </Field>
                      <Field label="Fin">
                        <input name="endDate" type="date" required className={inputClass} />
                      </Field>
                    </div>
                    <Field label="Items du Sprint (1 minimum — création bloquée sinon)">
                      <div className="flex flex-col gap-1.5">
                        {readyItems.map((item) => (
                          <label key={item.id} className="flex items-center gap-2 rounded-lg border border-sand-200 p-2 text-sm text-navy-900">
                            <input type="checkbox" name="itemIds" value={item.id} className="h-4 w-4" />
                            {item.title} {item.storyPoints != null && <Badge>♥ {item.storyPoints}</Badge>}
                          </label>
                        ))}
                      </div>
                    </Field>
                  </ActionForm>
                )
              ) : (
                <p className="rounded-lg bg-sand-300 p-2 text-sm font-bold text-navy-900">
                  Lecture seule : création de Sprint réservée à la Scrum Team (PO, SM, Dev).
                </p>
              )}
            </div>
          </details>
        </div>
      </Card>

      {!sprint && (
        <Card>
          <p className="text-sm text-navy-900/70">Aucun Sprint — créez-en un pour planifier.</p>
        </Card>
      )}

      {sprint && (
        <>
          {/* En-tête Sprint + timeboxes */}
          <Card className="mb-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={STATUS_TONE[sprint.status] ?? "zinc"}>{sprint.status}</Badge>
              <span className="text-sm text-navy-900/70">
                {new Date(sprint.startDate).toLocaleDateString("fr-FR")} →{" "}
                {new Date(sprint.endDate).toLocaleDateString("fr-FR")} ({Math.round(sprintDays)} j)
              </span>
              {sprint.goalLockedAt && <Badge>Objectif verrouillé</Badge>}
            </div>
            <p className="mt-2 font-medium">Sprint : {sprint.title ?? sprint.goal ?? "—"}</p>
            <p className="mt-1 text-sm text-navy-900/70">Objectif : {sprint.goal}</p>
            {timeboxes && (
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <Badge>Planning ≤ {timeboxes.planningMinutes} min</Badge>
                <Badge>Daily : {timeboxes.dailyMinutes} min</Badge>
                <Badge>Review ≤ {timeboxes.reviewMinutes} min</Badge>
                <Badge>Rétro ≤ {timeboxes.retrospectiveMinutes} min</Badge>
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {sprint.status === "PLANNING" && !sprint.goalLockedAt && canPlan && (
                <>
                  <details className="w-full">
                    <summary className="cursor-pointer text-sm font-medium">Modifier l&apos;objectif (possible en Planning ouverte)</summary>
                    <form action={updateSprintGoal.bind(null, teamId, sprint.id)} className="mt-2 flex gap-2">
                      <input name="goal" defaultValue={sprint.goal ?? ""} required minLength={5} className={inputClass} />
                      <button type="submit" className={buttonSecondary}>Sauver</button>
                    </form>
                  </details>
                  <form action={startSprint.bind(null, teamId, sprint.id)}>
                    <button type="submit" className={buttonPrimary}>Clôturer la Planning et démarrer</button>
                  </form>
                </>
              )}
              {(sprint.status === "ACTIVE" || sprint.status === "REVIEW" || sprint.status === "PLANNING") && canPlan && (
                <form action={closeSprint.bind(null, teamId, sprint.id)}>
                  <button type="submit" className={buttonSecondary}>Clôturer le Sprint</button>
                </form>
              )}
              {sprint.status !== "CLOSED" && sprint.status !== "CANCELLED" && canPlan && (
                <details className="w-full">
                  <summary className="cursor-pointer text-sm font-medium text-red-700">
                    Annuler le Sprint (PO uniquement, note de recadrage exigée)
                  </summary>
                  <div className="mt-2">
                    <ActionForm action={cancelSprint.bind(null, sprint.id)} submitLabel="Annuler le Sprint">
                      <Field label="Motif">
                        <input name="reason" required className={inputClass} />
                      </Field>
                      <Field label="Note de recadrage">
                        <textarea name="note" rows={2} className={inputClass} />
                      </Field>
                    </ActionForm>
                  </div>
                </details>
              )}
              {canPlan && (
                <details className="w-full">
                  <summary className="cursor-pointer text-sm font-medium text-red-700">
                    Supprimer le Sprint (objectif obsolète, PO uniquement — items retournés au backlog)
                  </summary>
                  <div className="mt-2 rounded-lg border border-red-200 bg-red-50 p-3">
                    <p className="mb-2 text-xs text-red-800">
                      Règle métier : les items non terminés (DoD non atteinte) retournent
                      automatiquement au Product Backlog (affinés, checks effacés) et
                      redeviennent un choix du Sprint suivant après ré-affinage. Les
                      Incréments livrés (DONE) sont conservés. Suppression définitive.
                    </p>
                    <form action={deleteSprint.bind(null, teamId, sprint.id)}>
                      <button type="submit" className={buttonSecondary}>
                        Supprimer définitivement ce Sprint
                      </button>
                    </form>
                  </div>
                </details>
              )}
            </div>
          </Card>

          {/* Chronos des événements : pilotés depuis le Suivi Sprint (/sprint),
              commun à tous les items du Sprint (événements liés au Sprint). */}

          {/* Sprint Backlog */}
          <Card className="mb-4">
            <h2 className="mb-2 font-medium">
              Sprint Backlog — {sprint.backlogItems.length} item(s) (Scrum Team)
            </h2>
            {isStakeholder && (
              <p className="mb-2 rounded-lg bg-sand-300 p-2 text-xs font-bold text-navy-900">
                Lecture seule : vous observez l&apos;avancement (Stakeholder).
              </p>
            )}
            <div className="flex flex-col gap-2">
              {sprint.backlogItems.map((item) => {
                const checked = item.doneChecks.length;
                const total = criteria.length;
                const complete = total > 0 && checked >= total;
                return (
                  <div key={item.id} className="rounded-lg border border-sand-200 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={item.status === "DONE" ? "green" : "blue"}>{item.status}</Badge>
                      <span className="font-medium">{item.title}</span>
                      {item.storyPoints != null && <Badge>♥ {item.storyPoints}</Badge>}
                    </div>
                    <p className="mt-1 text-sm text-navy-900/70">
                      DoD : {checked}/{total} {complete ? "— 100 %, promouvable en Increment" : ""}
                    </p>
                    {item.status !== "DONE" && canPlan && (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <form action={promoteToIncrement.bind(null, item.id)} className="flex flex-col gap-1.5">
                          <input
                            name="validationComment"
                            minLength={2}
                            maxLength={500}
                            placeholder="Commentaire de validation DoD (obligatoire)…"
                            className={inputClass}
                          />
                          <button type="submit" className={buttonSecondary} disabled={!complete}>
                            Promouvoir en Increment
                          </button>
                        </form>
                        <a
                          href={`/sprint?product=${productId}&team=${teamId}&sprint=${sprint.id}&item=${item.id}`}
                          className={buttonSecondary}
                          title="Activer le Kanban de suivi de cet item"
                        >
                          Suivi Kanban →
                        </a>
                      </div>
                    )}
                    {item.status === "DONE" && (
                      <a
                        href={`/sprint?product=${productId}&team=${teamId}&sprint=${sprint.id}&item=${item.id}`}
                        className={`${buttonSecondary} mt-2`}
                        title="Voir le suivi Kanban de cet item"
                      >
                        Suivi Kanban →
                      </a>
                    )}
                    {item.increment && <p className="mt-1 text-xs text-green-700">Increment livré ✓</p>}
                  </div>
                );
              })}
              {sprint.backlogItems.length === 0 && (
                <p className="text-sm text-navy-900/70">Tirez des items « prêts » ci-dessous (accord Developers, validé backend).</p>
              )}
            </div>
          </Card>

          {/* Réserve READY à tirer */}
          {(sprint.status === "PLANNING" || sprint.status === "ACTIVE") && readyItems.length > 0 && canPlan && (
            <Card className="mb-4">
              <h2 className="mb-2 font-medium">Items « prêts » à tirer ({readyItems.length})</h2>
              <div className="flex flex-col gap-2">
                {readyItems.map((item) => (
                  <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-sand-200 p-2">
                    <span className="text-sm">
                      {item.title} {item.storyPoints != null && <Badge>♥ {item.storyPoints}</Badge>}
                    </span>
                    <form action={pullItemToSprint.bind(null, teamId, sprint.id, item.id)}>
                      <button type="submit" className={buttonSecondary}>Tirer en Sprint</button>
                    </form>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Commentaires Review : déplacés dans le Suivi Sprint (/sprint),
              panneau « 📣 Session de Sprint Review », liés au Sprint courant. */}
        </>
      )}
    </main>
  );
}
