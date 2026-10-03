import { prisma } from "@/lib/prisma";
import { currentUserId, getMyProducts } from "@/lib/context";
import { resolveProductActor } from "@/lib/scrum-guards";
import { isPOActor } from "@/lib/scrum-rules";
import {
  createGoal,
  createItem,
  createProduct,
  moveItem,
  readyWithEstimate,
  resolveGoal,
  setItemStatus,
} from "@/app/actions/backlog";
import { ActionForm, Field, inputClass } from "@/components/action-form";
import { Badge, Card, PageHeader, buttonSecondary } from "@/components/ui";

const STATUS_LABEL: Record<string, { label: string; tone: "zinc" | "amber" | "green" | "blue" }> = {
  RAW: { label: "Brut", tone: "zinc" },
  REFINED: { label: "Affiné", tone: "amber" },
  READY: { label: "Prêt", tone: "green" },
};

export default async function BacklogPage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string }>;
}) {
  const userId = await currentUserId();
  const products = await getMyProducts(userId);

  if (products.length === 0) {
    return (
      <main className="mx-auto w-full max-w-5xl px-4 py-6">
        <PageHeader
          title="Product Backlog"
          subtitle="Créez votre premier produit pour commencer."
        />
        <Card>
          <ActionForm action={createProduct} submitLabel="Créer le produit">
            <Field label="Nom du produit">
              <input name="name" required minLength={3} className={inputClass} placeholder="Mon produit" />
            </Field>
          </ActionForm>
        </Card>
      </main>
    );
  }

  const params = await searchParams;
  const productId =
    products.some((p) => p.id === params.product) ? params.product! : products[0]!.id;

  const [product, items, actor] = await Promise.all([
    prisma.product.findUnique({
      where: { id: productId },
      include: {
        goals: { orderBy: { setAt: "desc" } },
        productOwner: { select: { email: true } },
      },
    }),
    prisma.backlogItem.findMany({
      where: { productId, sprintId: null },
      orderBy: { order: "asc" },
    }),
    resolveProductActor(userId, productId),
  ]);
  if (!product) throw new Error("Produit introuvable.");

  const activeGoal = product.goals.find((g) => g.status === "ACTIVE");
  // Écran du Product Owner : Admin/PO manipule items, ordre et Story Points.
  // Le Developer ne réordonne pas en autonomie (boutons masqués, garde PO_ONLY serveur).
  const canManageBacklog = isPOActor(actor);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6">
      <PageHeader
        title={`Product Backlog — ${product.name}`}
        subtitle={`PO : ${product.productOwner.email}${actor.isProductOwner ? " (vous)" : " — vos créations sont tracées comme saisie déléguée"}. Ordonné par le PO uniquement.`}
        actions={
          <form method="GET" className="flex gap-2">
            <select name="product" defaultValue={productId} className={inputClass}>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button type="submit" className={buttonSecondary}>
              Changer
            </button>
          </form>
        }
      />

      {/* Product Backlog éditable en continu : aucun verrou lié à l'état des Sprints.
          Le PO ajoute / ordonne / affine les items indépendamment des Sprints
          (les gardes portent sur les rôles et les transitions, jamais sur le Sprint). */}
      <Card className="mb-4 border-sand-300 bg-sand-100">
        <p className="text-sm font-bold text-navy-900">
          Backlog éditable en continu
          <span className="ml-2 font-normal text-navy-900/70">
            Ajout et modification possibles à tout moment, indépendamment de l&apos;état des Sprints.
          </span>
        </p>
      </Card>

      {/* Product Goal unique actif — Product Owner uniquement */}
      <Card className="mb-4">
        <h2 className="font-medium">Product Goal</h2>
        {activeGoal ? (
          <div className="mt-2 flex flex-col gap-2">
            <p className="text-sm">
              <Badge tone="blue">Actif</Badge>{" "}
              <span className="ml-1">{activeGoal.description}</span>
            </p>
            {canManageBacklog ? (
              <div className="flex flex-wrap gap-2">
                <form action={resolveGoal.bind(null, productId, activeGoal.id, "ACHIEVED")}>
                  <button className={buttonSecondary} type="submit">
                    Marquer atteint
                  </button>
                </form>
                <form action={resolveGoal.bind(null, productId, activeGoal.id, "ABANDONED")}>
                  <button className={buttonSecondary} type="submit">
                    Abandonner
                  </button>
                </form>
              </div>
            ) : (
              <p className="rounded-lg bg-sand-300 px-2 py-1 text-xs font-bold text-navy-900">
                Product Goal géré par le Product Owner — lecture seule.
              </p>
            )}
          </div>
        ) : canManageBacklog ? (
          <ActionForm action={createGoal.bind(null, productId)} submitLabel="Définir le Product Goal">
            <Field label="Nouvel objectif produit (un seul actif à la fois)">
              <input name="description" required minLength={5} className={inputClass} placeholder="Ex. Permettre la réservation en 2 clics" />
            </Field>
          </ActionForm>
        ) : (
          <p className="rounded-lg bg-sand-300 px-2 py-1 text-xs font-bold text-navy-900">
            Product Goal défini par le Product Owner — lecture seule.
          </p>
        )}
      </Card>

      {/* Création d'item — Product Owner uniquement (Developer exclu) */}
      <Card className="mb-4">
        <h2 className="mb-2 font-medium">Nouvel item</h2>
        {canManageBacklog ? (
          <ActionForm action={createItem.bind(null, productId)} submitLabel="Ajouter au backlog">
            <Field label="Titre">
              <input name="title" required minLength={3} className={inputClass} placeholder="En tant que… je veux… afin de…" />
            </Field>
            <Field label="Description (optionnel)">
              <textarea name="description" rows={2} className={inputClass} />
            </Field>
          </ActionForm>
        ) : (
          <p className="rounded-lg bg-sand-300 px-2 py-1 text-xs font-bold text-navy-900">
            Création d&apos;items réservée au Product Owner
            — compte Developer en lecture seule.
          </p>
        )}
      </Card>

      {/* Items ordonnés */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 className="font-semibold text-navy-900">Items ordonnés</h2>
        <span
          className="cursor-help rounded-full border border-sand-300 bg-sand-100 px-2 py-0.5 text-xs text-navy-900"
          title="Score de priorité calculé selon la Valeur Métier divisée par l'Effort (Story Points)"
        >
          ⓘ Score : Valeur Métier / Effort (Story Points)
        </span>
      </div>
      <p className="mb-2 text-xs text-navy-900/60">
        Score de priorité calculé selon la Valeur Métier divisée par l&apos;Effort (Story Points).
      </p>
      <div className="flex flex-col gap-2">
        {items.length === 0 && (
          <Card>
            <p className="text-sm text-navy-900/70">Backlog vide — ajoutez le premier item ci-dessus.</p>
          </Card>
        )}
        {items.map((item, idx) => {
          const st = STATUS_LABEL[item.status] ?? { label: item.status, tone: "zinc" as const };
          return (
            <Card key={item.id}>
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-navy-900/40">#{idx + 1}</span>
                  <Badge tone={st.tone}>{st.label}</Badge>
                  {item.storyPoints != null && (
                    <span className="inline-flex items-center gap-1">
                      <Badge>♥ {item.storyPoints} pts</Badge>
                      <span
                        className="cursor-help text-xs text-navy-900/50"
                        title="Score de priorité calculé selon la Valeur Métier divisée par l'Effort (Story Points)"
                        aria-label="Aide score de priorité"
                      >
                        ⓘ
                      </span>
                    </span>
                  )}
                  <span className="font-medium">{item.title}</span>
                </div>
                {item.description && (
                  <p className="text-sm text-navy-900/70">{item.description}</p>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  {/* Ordre réservé au PO (Admin/PO) — masqué pour le Developer */}
                  {canManageBacklog && (
                    <>
                      <form action={moveItem.bind(null, productId, item.id, "up")}>
                        <button className={buttonSecondary} type="submit" aria-label="Monter">↑</button>
                      </form>
                      <form action={moveItem.bind(null, productId, item.id, "down")}>
                        <button className={buttonSecondary} type="submit" aria-label="Descendre">↓</button>
                      </form>
                    </>
                  )}
                  {/* Cycle brut → affiné → prêt (PO uniquement, pas de rouge bloquant pour le Dev) */}
                  {canManageBacklog && item.status === "RAW" && (
                    <form
                      action={async () => {
                        "use server";
                        await setItemStatus(productId, item.id, "REFINED");
                      }}
                    >
                      <button className={buttonSecondary} type="submit">Affiner →</button>
                    </form>
                  )}
                  {canManageBacklog && item.status === "REFINED" && (
                    <form
                      action={async () => {
                        "use server";
                        await setItemStatus(productId, item.id, "RAW");
                      }}
                    >
                      <button className={buttonSecondary} type="submit">← Revenir à brut</button>
                    </form>
                  )}
                  {canManageBacklog && item.status === "READY" && (
                    <form
                      action={async () => {
                        "use server";
                        await setItemStatus(productId, item.id, "REFINED");
                      }}
                    >
                      <button className={buttonSecondary} type="submit">← Revenir à affiné</button>
                    </form>
                  )}
                {!canManageBacklog && (
                  <p className="rounded-lg bg-sand-300 px-2 py-1 text-xs font-bold text-navy-900">
                    Ordre et estimation réservés au Product Owner
                    — compte Developer en lecture seule hors planification.
                  </p>
                )}
                </div>
                {item.status === "REFINED" && canManageBacklog && (
                  <details className="rounded-lg bg-sand-50 p-2">
                    <summary className="cursor-pointer text-sm font-medium">
                      Estimation Developers → passer « prêt »
                    </summary>
                    <div className="mt-2">
                      <ActionForm
                        action={readyWithEstimate.bind(null, productId, item.id)}
                        submitLabel="Estimer et passer prêt"
                      >
                        <div className="grid grid-cols-2 gap-2">
                          <Field label="Story points">
                            <input
                              name="storyPoints"
                              type="number"
                              min={1}
                              required
                              defaultValue={item.storyPoints ?? ""}
                              className={inputClass}
                            />
                          </Field>
                          <label className="flex items-end gap-2 pb-2 text-sm">
                            <input type="checkbox" name="fitsInOneSprint" className="h-4 w-4" />
                            Réalisable en un Sprint
                          </label>
                        </div>
                      </ActionForm>
                    </div>
                  </details>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </main>
  );
}
