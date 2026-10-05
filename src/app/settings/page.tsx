import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/context";
import {
  resetMemberPassword,
  updateMember,
  updateOwnPassword,
} from "@/app/actions/settings";
import { ActionForm, Field, inputClass } from "@/components/action-form";
import { Badge, Card, PageHeader, buttonSecondary } from "@/components/ui";
import { PasswordField } from "@/components/password-field";

const ROLE_LABEL: Record<string, string> = {
  OWNER: "👑 Product Owner (créateur)",
  SCRUM_MASTER: "🛡️ Scrum Master",
  DEVELOPER: "💻 Développeur",
  STAKEHOLDER: "👁️ Stakeholder",
  MEMBER: "Membre",
};

/**
 * PARAMÈTRES DE L'ESPACE — /settings
 * - Changer son propre mot de passe.
 * - OWNER/ADMIN : voir l'équipe de base, renommer / changer l'email d'un
 *   membre, régénérer un mot de passe temporaire (affichage unique).
 * Charte : sand-300 / navy-900 en gras.
 */
export default async function SettingsPage() {
  const { userId, workspaceId } = await requireWorkspace();
  const [workspace, members, me] = await Promise.all([
    prisma.workspace.findUnique({ where: { id: workspaceId } }),
    prisma.user.findMany({
      where: { workspaceId },
      select: { id: true, name: true, email: true, globalRole: true, spaceRole: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { globalRole: true } }),
  ]);
  if (!workspace) throw new Error("Espace introuvable.");
  const isAdmin = me?.globalRole === "ADMIN";

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6">
      <PageHeader
        title={`Paramètres — ${workspace.name}`}
        subtitle="Espace de travail cloisonné : vous ne voyez que votre propre équipe. Les identifiants temporaires sont modifiables ici."
      />

      <Card className="mb-4">
        <h2 className="mb-2 font-semibold text-navy-900">Mon mot de passe</h2>
        <ActionForm action={updateOwnPassword} submitLabel="Mettre à jour">
          <Field label="Mot de passe actuel">
            <PasswordField name="currentPassword" autoComplete="current-password" />
          </Field>
          <Field label="Nouveau mot de passe" hint="8 caractères minimum, avec au moins une lettre et un chiffre.">
            <PasswordField name="newPassword" autoComplete="new-password" minLength={8} />
          </Field>
        </ActionForm>
      </Card>

      <h2 className="mb-2 font-semibold text-navy-900">
        Équipe de base ({members.length})
      </h2>
      <div className="flex flex-col gap-3">
        {members.map((m) => (
          <Card key={m.id}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-lg bg-sand-300 px-3 py-1 text-sm font-bold text-navy-900">
                {m.name ?? "Sans nom"}
              </span>
              <Badge tone="blue">{ROLE_LABEL[m.spaceRole] ?? m.spaceRole}</Badge>
              <Badge>{m.email}</Badge>
              {m.id === userId && <Badge tone="green">Vous</Badge>}
            </div>
            {isAdmin && m.id !== userId && (
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-sand-200 bg-sand-50 p-3">
                  <ActionForm action={updateMember.bind(null, m.id)} submitLabel="Enregistrer">
                    <Field label="Nom">
                      <input name="name" defaultValue={m.name ?? ""} required minLength={2} className={inputClass} />
                    </Field>
                    <Field label="Email (identifiant de connexion)">
                      <input name="email" type="email" defaultValue={m.email} required className={inputClass} />
                    </Field>
                  </ActionForm>
                </div>
                <div className="rounded-xl border border-sand-200 bg-sand-50 p-3">
                  <p className="mb-2 text-sm font-bold text-navy-900">
                    Mot de passe temporaire
                  </p>
                  <p className="mb-2 text-xs text-navy-900/70">
                    Régénère un mot de passe affichable une seule fois, à distribuer au membre.
                  </p>
                  <ActionForm action={resetMemberPassword.bind(null, m.id)} submitLabel="Régénérer">
                    <span />
                  </ActionForm>
                </div>
              </div>
            )}
            {isAdmin && m.id === userId && (
              <p className="mt-2 text-xs text-navy-900/60">
                Votre propre fiche : utilisez « Mon mot de passe » ci-dessus.
              </p>
            )}
          </Card>
        ))}
      </div>
      {!isAdmin && (
        <p className="mt-3 rounded-lg bg-sand-300 p-3 text-sm font-bold text-navy-900">
          Gestion de l&apos;équipe réservée au Product Owner de l&apos;espace.
        </p>
      )}
      <div className="mt-4">
        <Link href="/products" className={buttonSecondary}>
          Voir mes produits →
        </Link>
      </div>
    </main>
  );
}
