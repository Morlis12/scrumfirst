import { prisma } from "@/lib/prisma";
import { currentUserId } from "@/lib/context";
import { guardCreateProduct, resolveProductActor } from "@/lib/scrum-guards";
import { addTeamToProduct } from "@/app/actions/products";
import { ActionForm, Field, inputClass } from "@/components/action-form";
import { Badge, Card, PageHeader } from "@/components/ui";
import { ProductCreateForm } from "@/components/products/product-create-form";
import { DodConfigPanel } from "@/components/products/dod-config-panel";

/**
 * PAGE DE GESTION DES PRODUITS — /products
 * Accès : création + checklist DoD réservées à l'Admin / Product Owner
 * et au Scrum Master — Developer (dev@) exclu (bouton masqué/désactivé).
 * Gardes : guardCreateProduct + guardManageDodCriteria (scrum-guards.ts).
 */
export default async function ProductsPage() {
  const userId = await currentUserId();
  const createGuard = await guardCreateProduct(userId);
  const canCreate = createGuard.ok;

  const products = await prisma.product.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      productOwner: { select: { email: true } },
      teams: { select: { id: true, name: true } },
      _count: { select: { backlogItems: true, doneCriteria: true } },
      doneCriteria: { orderBy: { label: "asc" } },
    },
  });

  const actors = await Promise.all(
    products.map((p) => resolveProductActor(userId, p.id)),
  );
  const productsWithActor = products.map((p, i) => ({
    product: p,
    actor: actors[i] as (typeof actors)[number],
  }));

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6">
      <PageHeader
        title="Produits"
        subtitle="Un Product Backlog indépendant par produit. Chaque produit porte sa Checklist DoD unique, partagée par toutes ses équipes."
      />

      <Card className="mb-4">
        <h2 className="mb-2 font-semibold text-navy-900">
          Nouveau produit
        </h2>
        {!canCreate && (
          <p className="mb-2 rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">
            {"message" in createGuard ? createGuard.message : "Création réservée à l'Admin/PO et au Scrum Master."}
          </p>
        )}
        <ProductCreateForm canCreate={canCreate} />
      </Card>

      <h2 className="mb-2 font-semibold text-navy-900">
        Produits existants ({products.length})
      </h2>
      <div className="flex flex-col gap-4">
        {productsWithActor.map(({ product: p, actor }) => {
          return (
            <Card key={p.id}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-lg bg-sand-300 px-3 py-1 text-sm font-bold text-navy-900">
                  {p.name}
                </span>
                <Badge>PO : {p.productOwner.email}</Badge>
                <Badge tone="blue">
                  {p.teams.length} équipe(s)
                </Badge>
                <Badge>
                  {p._count.backlogItems} item(s) · {p._count.doneCriteria} critère(s) DoD
                </Badge>
              </div>
              <p className="mt-1 text-xs text-navy-900/60">
                Équipes autorisées ({p.teams.length}) : {p.teams.map((t) => t.name).join(" · ") || "—"}
              </p>
              <div className="mt-1 flex flex-wrap gap-1.5" aria-label="Équipes autorisées">
                {p.teams.map((t) => (
                  <span
                    key={t.id}
                    className="rounded-lg bg-sand-300 px-2 py-1 text-xs font-bold text-navy-900"
                  >
                    {t.name}
                  </span>
                ))}
              </div>
              {/* Déclaration multi-équipes : champ texte libre (tags). */}
              <details className="mt-2">
                <summary className="cursor-pointer text-sm font-bold text-navy-900">
                  + Déclarer une équipe sur ce produit
                </summary>
                <div className="mt-2 rounded-xl border border-sand-200 bg-sand-50 p-3">
                  <ActionForm action={addTeamToProduct.bind(null, p.id)} submitLabel="Déclarer l'équipe">
                    <Field
                      label="Nom de la nouvelle équipe (texte libre)"
                      hint="Le produit accepte plusieurs équipes : chacune pourra mener ses propres sprints parallèles."
                    >
                      <input
                        name="name"
                        required
                        minLength={2}
                        maxLength={200}
                        className={inputClass}
                        placeholder="Ex. Équipe Beta"
                        autoComplete="off"
                      />
                    </Field>
                  </ActionForm>
                </div>
              </details>
              <div className="mt-3 rounded-xl border border-sand-200 bg-sand-50 p-3">
                <DodConfigPanel
                  productId={p.id}
                  productName={p.name}
                  criteria={p.doneCriteria.map((c) => ({
                    id: c.id,
                    label: c.label,
                    active: c.active,
                  }))}
                  actor={actor}
                />
              </div>
            </Card>
          );
        })}
        {products.length === 0 && (
          <Card>
            <p className="text-sm text-navy-900/70">
              Aucun produit — créez le premier ci-dessus.
            </p>
          </Card>
        )}
      </div>
    </main>
  );
}
