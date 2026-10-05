import { prisma } from "@/lib/prisma";
import { currentUserId, getMyProducts, requireWorkspace } from "@/lib/context";
import { resolveProductActor } from "@/lib/scrum-guards";
import { canCheckDod, canManageDodCriteria } from "@/lib/scrum-rules";
import {
  createCriterionForm,
  promoteToIncrement,
  setDodChecksFromForm,
  toggleCriterion,
} from "@/app/actions/dod";
import { ActionForm, Field, inputClass } from "@/components/action-form";
import { AutoFilterSelect } from "@/components/auto-filter";
import { Badge, Card, PageHeader, buttonSecondary } from "@/components/ui";

export default async function DodPage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string }>;
}) {
  const userId = await currentUserId();
  const products = await getMyProducts(userId);
  if (products.length === 0) {
    return (
      <main className="mx-auto w-full max-w-5xl px-4 py-6">
        <PageHeader title="Definition of Done" subtitle="Créez d&apos;abord un produit depuis le Product Backlog." />
      </main>
    );
  }
  const params = await searchParams;
  const productId = products.some((p) => p.id === params.product) ? params.product! : products[0]!.id;

  const { workspaceId } = await requireWorkspace();
  const [product, criteria, items] = await Promise.all([
    prisma.product.findFirst({ where: { id: productId, workspaceId } }),
    prisma.doneCriterion.findMany({
      where: { productId, product: { workspaceId } },
      orderBy: { label: "asc" },
    }),
    prisma.backlogItem.findMany({
      where: { productId, status: "IN_SPRINT", product: { workspaceId } },
      include: {
        doneChecks: { select: { criterionId: true } },
        sprint: { select: { goal: true, status: true } },
        increment: true,
      },
      orderBy: { order: "asc" },
    }),
  ]);
  if (!product) throw new Error("Produit introuvable.");

  const active = criteria.filter((c) => c.active);
  // Permissions : checklist globale Admin/PO + SM (Developer exclu) ;
  // cochage ouvert à la Scrum Team (PO, SM, Dev), 100 % exigé pour l'Incrément.
  const actor = await resolveProductActor(userId, productId);
  const canManage = canManageDodCriteria(actor).ok;
  const canCheck = canCheckDod(actor).ok;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6">
      <PageHeader
        title={`Definition of Done — ${product.name}`}
        subtitle="DoD unique du produit, partagée par toutes ses équipes. Checklist gérée par l'Admin/PO + SM (Developer exclu) ; cochage ouvert à la Scrum Team. Un item ne devient Increment qu'à 100 %."
        actions={
          <AutoFilterSelect
            name="product"
            value={productId}
            options={products}
            ariaLabel="Produit (applique automatiquement)"
          />
        }
      />

      <Card className="mb-4">
        <h2 className="mb-2 font-medium">Critères ({active.length} actifs / {criteria.length})</h2>
        {!canManage && (
          <p className="mb-2 rounded-lg bg-sand-300 p-2 text-xs font-bold text-navy-900">
            Checklist réservée à l&apos;Admin/PO et au Scrum Master — Developer exclu.
          </p>
        )}
        <div className="mb-3 flex flex-col gap-1.5">
          {criteria.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>
                <Badge tone={c.active ? "green" : "zinc"}>{c.active ? "Actif" : "Inactif"}</Badge>{" "}
                {c.label}
              </span>
              <form action={toggleCriterion.bind(null, productId, c.id, !c.active)}>
                <button type="submit" className={buttonSecondary} disabled={!canManage}>
                  {c.active ? "Désactiver" : "Réactiver"}
                </button>
              </form>
            </div>
          ))}
          {criteria.length === 0 && (
            <p className="text-sm text-navy-900/70">Aucun critère — définissez la DoD ci-dessous.</p>
          )}
        </div>
        {canManage ? (
          <ActionForm action={createCriterionForm.bind(null, productId)} submitLabel="Ajouter le critère">
            <Field label="Nouveau critère">
              <input name="label" required minLength={3} className={inputClass} placeholder="Ex. Tests automatisés verts" />
            </Field>
          </ActionForm>
        ) : (
          <p className="text-sm text-navy-900/70">
            Ajout désactivé pour votre rôle (Developer/Stakeholder exclu).
          </p>
        )}
      </Card>

      <h2 className="mb-2 font-medium">Items en Sprint — cochage DoD ({items.length})</h2>
      <div className="flex flex-col gap-2">
        {items.map((item) => {
          const checkedIds = new Set(item.doneChecks.map((d) => d.criterionId));
          const complete = active.length > 0 && active.every((c) => checkedIds.has(c.id));
          return (
            <Card key={item.id}>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={item.increment ? "green" : "blue"}>
                  {item.increment ? "INCREMENT" : item.status}
                </Badge>
                <span className="font-medium">{item.title}</span>
                <span className="text-xs text-navy-900/60">
                  {item.sprint?.goal} ({item.sprint?.status})
                </span>
              </div>
              {active.length === 0 ? (
                <p className="mt-1 text-sm text-navy-900/70">Définissez d&apos;abord des critères actifs.</p>
              ) : !canCheck ? (
                <p className="mt-1 rounded-lg bg-sand-300 p-2 text-xs font-bold text-navy-900">
                  Lecture seule : cochage réservé à la Scrum Team (PO, SM, Dev).
                </p>
              ) : (
                <form action={setDodChecksFromForm.bind(null, productId, item.id)} className="mt-2 flex flex-col gap-1.5">
                  {active.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        name="crit"
                        value={c.id}
                        defaultChecked={checkedIds.has(c.id)}
                        className="h-4 w-4"
                      />
                      {c.label}
                    </label>
                  ))}
                  <label className="mt-1 flex flex-col gap-1 text-sm">
                    <span className="font-bold text-navy-900">
                      Commentaire de validation DoD (obligatoire pour promouvoir)
                    </span>
                    <input
                      name="validationComment"
                      minLength={2}
                      maxLength={500}
                      placeholder="Ex. DoD 100 % vérifiée : tests verts, revue OK…"
                      className={inputClass}
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button type="submit" className={buttonSecondary}>Enregistrer le cochage</button>
                    {!item.increment && (
                      <button
                        type="submit"
                        formAction={promoteToIncrement.bind(null, item.id)}
                        className={buttonSecondary}
                        disabled={!complete}
                        title={complete ? "DoD 100 %" : "DoD incomplète : promotion bloquée"}
                      >
                        Promouvoir en Increment {complete ? "(DoD 100 %)" : `(${checkedIds.size}/${active.length})`}
                      </button>
                    )}
                  </div>
                </form>
              )}
            </Card>
          );
        })}
        {items.length === 0 && (
          <Card><p className="text-sm text-navy-900/70">Aucun item en Sprint pour ce produit.</p></Card>
        )}
      </div>
    </main>
  );
}
