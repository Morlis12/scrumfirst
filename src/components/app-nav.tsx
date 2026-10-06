import Link from "next/link";
import { getSessionUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { logout } from "@/app/actions/auth";
import { NavLinks } from "@/components/nav-links";
import { AccountMenu, WorkspaceMenu } from "@/components/nav-menus";

const LINKS = [
  { href: "/products", label: "Produits" },
  { href: "/backlog", label: "Product Backlog" },
  { href: "/planning", label: "Sprint Planning" },
  { href: "/sprint", label: "Suivi Sprint" },
  { href: "/retrospective", label: "Rétrospective" },
  { href: "/dod", label: "Definition of Done" },
];

export async function AppNav() {
  const user = await getSessionUser();
  if (!user) return null;
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      workspaceId: true,
      workspace: { select: { name: true } },
    },
  });
  const workspaceName = dbUser?.workspace?.name ?? "Mon espace";
  const [memberCount, productCount] = dbUser?.workspaceId
    ? await Promise.all([
        prisma.user.count({ where: { workspaceId: dbUser.workspaceId } }),
        prisma.product.count({ where: { workspaceId: dbUser.workspaceId } }),
      ])
    : [0, 0];
  return (
    <header className="sticky top-0 z-10 border-b border-navy-950 bg-navy-900 text-white shadow-sm">
      <div className="mx-auto flex w-full max-w-5xl flex-nowrap items-center gap-1.5 px-3 py-2 sm:gap-2 sm:px-4">
        <Link href="/backlog" className="shrink-0 text-sm font-semibold text-white sm:mr-1 sm:text-base">
          ScrumFirst<span className="text-sand-300">.</span>
        </Link>
        <WorkspaceMenu
          workspaceName={workspaceName}
          memberCount={memberCount}
          productCount={productCount}
        />
        <NavLinks links={LINKS} />
        <span className="flex shrink-0 flex-col items-center leading-none">
          <span className="mb-0.5 text-[9px] font-semibold text-sand-200 sm:text-[10px]">
            dashboard
          </span>
          <Link
            href="/dashboard"
            title="Tableau de bord des métriques"
            aria-label="Ouvrir le tableau de bord des métriques"
            className="flex h-7 w-7 items-center justify-center rounded-full bg-sand-300 text-navy-900 shadow-sm transition hover:scale-105 hover:bg-sand-200 sm:h-8 sm:w-8"
          >
            <svg
              aria-hidden="true"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 3v16a2 2 0 0 0 2 2h16" />
              <path d="M7 15v-4" />
              <path d="M12 17V7" />
              <path d="M17 13v-2" />
            </svg>
          </Link>
        </span>
        <span className="flex shrink-0 flex-col items-center leading-none">
          <span className="mb-0.5 text-[9px] font-semibold text-sand-200 sm:text-[10px]">
            historique
          </span>
          <Link
            href="/history"
            title="Historique temporel des Daily"
            aria-label="Ouvrir l'historique temporel des Daily"
            className="flex h-7 w-7 items-center justify-center rounded-full bg-sand-300 text-navy-900 shadow-sm transition hover:scale-105 hover:bg-sand-200 sm:h-8 sm:w-8"
          >
            <svg
              aria-hidden="true"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
              <path d="M12 7v5l4 2" />
            </svg>
          </Link>
        </span>
        <span className="flex shrink-0 flex-col items-center leading-none">
          <span className="mb-0.5 text-[9px] font-semibold text-sand-200 sm:text-[10px]">
            guide scrum
          </span>
          <Link
            href="/guide"
            title="Guide Scrum — le diagramme unique : rôles, événements, artefacts"
            aria-label="Ouvrir le guide Scrum (diagramme de référence)"
            className="flex h-7 w-7 items-center justify-center rounded-full bg-sand-300 text-navy-900 shadow-sm transition hover:scale-105 hover:bg-sand-200 sm:h-8 sm:w-8"
          >
            <svg
              aria-hidden="true"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M2 4h6a4 4 0 0 1 4 4v12a3 3 0 0 0-3-3H2z" />
              <path d="M22 4h-6a4 4 0 0 0-4 4v12a3 3 0 0 1 3-3h7z" />
            </svg>
          </Link>
        </span>
        <span className="flex shrink-0 flex-col items-center leading-none">
          <span className="mb-0.5 text-[9px] font-semibold text-sand-200 sm:text-[10px]">
            sas
          </span>
          <Link
            href="/requests"
            title="SAS d'atterrissage — ingestion des demandes InitiatIV'"
            aria-label="Ouvrir le SAS d'atterrissage (ingestion des demandes)"
            className="flex h-7 w-7 items-center justify-center rounded-full bg-sand-300 text-navy-900 shadow-sm transition hover:scale-105 hover:bg-sand-200 sm:h-8 sm:w-8"
          >
            <svg
              aria-hidden="true"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M22 12h-6l-2 3h-4l-2-3H2" />
              <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
            </svg>
          </Link>
        </span>
        <AccountMenu
          email={user.email}
          workspaceName={workspaceName}
          logout={logout}
        />
      </div>
    </header>
  );
}
