"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

/**
 * Navigation principale SANS scroll horizontal :
 * - mobile : hamburger « ☰ » compact avec menu déroulant ;
 * - écran md+ : liens inline en police réduite.
 */
export function NavLinks({
  links,
}: {
  links: { href: string; label: string }[];
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const activeHref =
    links.find((l) => pathname === l.href || pathname.startsWith(`${l.href}/`))?.href ?? null;

  return (
    <>
      {/* Mobile : hamburger compact, aucun scroll */}
      <span className="relative shrink-0 md:hidden">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label="Ouvrir le menu de navigation"
          className="flex h-7 items-center gap-1 rounded-lg bg-white/10 px-2 text-xs font-semibold text-white hover:bg-white/15"
        >
          ☰
        </button>
        {open && (
          <>
            <button
              type="button"
              aria-label="Fermer le menu"
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-10 cursor-default bg-transparent"
            />
            <nav
              aria-label="Navigation principale"
              className="absolute left-0 top-full z-20 mt-2 flex w-52 flex-col gap-1 rounded-xl border border-sand-300 bg-navy-900 p-2 shadow-lg"
            >
              {links.map((l) => {
                const active = l.href === activeHref;
                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={
                      active
                        ? "rounded-lg bg-sand-300 px-3 py-1.5 text-xs font-bold text-navy-900"
                        : "rounded-lg px-3 py-1.5 text-xs font-medium text-white/85 hover:bg-white/10 hover:text-sand-200"
                    }
                  >
                    {l.label}
                  </Link>
                );
              })}
            </nav>
          </>
        )}
      </span>

      {/* Écrans md+ : liens inline compacts, sans scroll */}
      <nav className="hidden min-w-0 flex-1 items-center gap-0.5 md:flex" aria-label="Navigation principale">
        {links.map((l) => {
          const active = l.href === activeHref;
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-current={active ? "page" : undefined}
              className={
                active
                  ? "shrink-0 whitespace-nowrap rounded-md bg-sand-300 px-2 py-1 text-xs font-semibold text-navy-900 shadow-sm"
                  : "shrink-0 whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium text-white/85 hover:bg-white/10 hover:text-sand-200"
              }
            >
              {l.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
