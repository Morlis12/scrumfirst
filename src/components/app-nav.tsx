import Link from "next/link";
import { getSessionUser } from "@/lib/dal";
import { logout } from "@/app/actions/auth";
import { NavLinks } from "@/components/nav-links";

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
  return (
    <header className="sticky top-0 z-10 border-b border-navy-950 bg-navy-900 text-white shadow-sm">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-2 px-4 py-2.5">
        <Link href="/backlog" className="mr-2 font-semibold text-white">
          ScrumFirst<span className="text-sand-300">.</span>
        </Link>
        <NavLinks links={LINKS} />
        <span className="flex shrink-0 flex-col items-center leading-none">
          <span className="mb-0.5 text-[10px] font-semibold text-sand-200">
            dashboard
          </span>
          <Link
            href="/dashboard"
            title="Tableau de bord des métriques"
            aria-label="Ouvrir le tableau de bord des métriques"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-sand-300 text-navy-900 shadow-sm transition hover:scale-105 hover:bg-sand-200"
          >
            <svg
              aria-hidden="true"
              width="18"
              height="18"
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
          <span className="mb-0.5 text-[10px] font-semibold text-sand-200">
            historique
          </span>
          <Link
            href="/history"
            title="Historique temporel des Daily"
            aria-label="Ouvrir l'historique temporel des Daily"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-sand-300 text-navy-900 shadow-sm transition hover:scale-105 hover:bg-sand-200"
          >
            <svg
              aria-hidden="true"
              width="18"
              height="18"
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
          <span className="mb-0.5 text-[10px] font-semibold text-sand-200">
            guide scrum
          </span>
          <Link
            href="/guide"
            title="Guide Scrum — le diagramme unique : rôles, événements, artefacts"
            aria-label="Ouvrir le guide Scrum (diagramme de référence)"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-sand-300 text-navy-900 shadow-sm transition hover:scale-105 hover:bg-sand-200"
          >
            <svg
              aria-hidden="true"
              width="18"
              height="18"
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
        <form
          action={logout}
          className="flex shrink-0 flex-col items-center leading-none"
        >
          <span className="mb-0.5 text-[10px] font-semibold text-sand-200">
            compte
          </span>
          <button
            type="submit"
            title={`Connecté en tant que ${user.email} — cliquer pour se déconnecter`}
            aria-label={`Se déconnecter (${user.email})`}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-sand-300 text-navy-900 shadow-sm transition hover:scale-105 hover:bg-sand-200"
          >
            <svg
              aria-hidden="true"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </button>
        </form>
      </div>
    </header>
  );
}
