import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/context";
import { guardCreateProduct, resolveProductActor } from "@/lib/scrum-guards";
import {
  MAX_DEVELOPERS_PER_TEAM,
  MAX_SCRUM_TEAM_SIZE,
  getProductLeadership,
} from "@/lib/scrum-rules";
import { Badge, Card, PageHeader } from "@/components/ui";
import { ProductCreateForm } from "@/components/products/product-create-form";
import { TeamDeclareForm } from "@/components/products/team-declare-form";
import { TeamMembersPanel } from "@/components/products/team-members-panel";
import { DodConfigPanel } from "@/components/products/dod-config-panel";

/**
 * PAGE DE GESTION DES PRODUITS — /products
 * Centralisation PO/SM : un seul Product Owner et un seul Scrum Master
 * par produit (hérités par défaut par toutes ses équipes, non modifiables).
 * Composition équipe : rôle exclusif DEVELOPER (`Team.members`), max 8
 * développeurs → total 10 avec PO + SM (Scrum Guide).
 * Accès : création + checklist DoD réservées à l'Admin / Product Owner
 * et au Scrum Master — Developer (dev@) exclu (bouton masqué/désactivé).
 * Gardes : guardCreateProduct + guardManageDodCriteria (scrum-guards.ts).
 */
export default async function ProductsPage() {
  const { userId, workspaceId } = await requireWorkspace();
  const createGuard = await guardCreateProduct(userId);
  const canCreate = createGuard.ok;

  // Cloisonnement : seuls les produits de l'espace de travail.
  const products = await prisma.product.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "asc" },
    include: {
      productOwner: { select: { email: true } },
      teams: { select: { id: true, name: true, members: true }, orderBy: { createdAt: "asc" } },
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
        subtitle="Un Product Backlog indépendant par produit. Chaque produit porte sa Checklist DoD unique et son binôme PO/SM centralisé, hérité par toutes ses équipes (max 8 développeurs, total 10 — Scrum Guide)."
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
          const leadership = getProductLeadership(p);
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

              {/* Attribution unique globale — centralisation PO/SM */}
              <div className="mt-2 rounded-xl border border-sand-300 bg-sand-300/40 p-2.5">
                <p className="text-xs font-bold uppercase tracking-wide text-navy-900">
                  Attribution unique globale — 1 PO + 1 SM par produit
                </p>
                <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
                  <div className="flex items-center justify-between gap-2 rounded-lg bg-sand-300 px-3 py-1.5">
                    <span className="text-sm font-bold text-navy-900">👤 Product Owner</span>
                    <span className="rounded-full bg-navy-900 px-2.5 py-0.5 text-xs font-bold text-white">
                      {leadership.productOwnerEmail}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 rounded-lg bg-sand-300 px-3 py-1.5">
                    <span className="text-sm font-bold text-navy-900">🛡️ Scrum Master</span>
                    <span className="rounded-full bg-navy-900 px-2.5 py-0.5 text-xs font-bold text-white">
                      {leadership.scrumMasterEmail}
                    </span>
                  </div>
                </div>
                <p className="mt-1.5 text-xs text-navy-900/70">
                  Hérité par défaut par toutes les équipes du produit — max{" "}
                  {MAX_DEVELOPERS_PER_TEAM} développeurs par équipe, total{" "}
                  {MAX_SCRUM_TEAM_SIZE} avec PO + SM (Scrum Guide).
                </p>
              </div>

              <p className="mt-2 text-xs text-navy-900/60">
                Équipes autorisées ({p.teams.length}) : {p.teams.map((t) => t.name).join(" · ") || "—"}
              </p>

              {/* Équipes + développeurs (mini-badges, héritage PO/SM, blocage 8) */}
              {p.teams.length > 0 ? (
                <div className="mt-1 flex flex-col gap-2">
                  {p.teams.map((t) => (
                    <TeamMembersPanel
                      key={t.id}
                      teamId={t.id}
                      teamName={t.name}
                      members={t.members ?? []}
                      productOwnerEmail={leadership.productOwnerEmail}
                      scrumMasterEmail={leadership.scrumMasterEmail}
                    />
                  ))}
                </div>
              ) : (
                <p className="mt-2 rounded-lg bg-sand-300 px-3 py-2 text-xs font-bold text-navy-900">
                  Aucune équipe déclarée — créez la première ci-dessous.
                </p>
              )}

              {/* Déclaration multi-équipes : héritage PO/SM + développeurs exclusifs. */}
              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-bold text-navy-900">
                  + Déclarer une équipe sur ce produit
                </summary>
                <div className="mt-2 rounded-xl border border-sand-200 bg-sand-50 p-3">
                  <TeamDeclareForm
                    productId={p.id}
                    productOwnerEmail={leadership.productOwnerEmail}
                    scrumMasterEmail={leadership.scrumMasterEmail}
                  />
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
