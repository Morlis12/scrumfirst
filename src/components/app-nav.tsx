import Link from "next/link";
import { getSessionUser } from "@/lib/dal";
import { logout } from "@/app/actions/auth";
import { NavLinks } from "@/components/nav-links";

const LINKS = [
  { href: "/products", label: "Produits" },
  { href: "/backlog", label: "Product Backlog" },
  { href: "/planning", label: "Sprint Planning" },
  { href: "/sprint", label: "Suivi Sprint" },
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
        <span className="hidden text-xs text-sand-200 sm:inline">
          {user.email}
        </span>
        <form action={logout}>
          <button
            type="submit"
            className="rounded-lg border border-white/30 px-3 py-1.5 text-sm text-white hover:bg-white/10 hover:text-sand-200"
          >
            Déconnexion
          </button>
        </form>
      </div>
    </header>
  );
}
