"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

function useDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open ]);
  return { open, setOpen, ref };
}

const panelClass =
  "absolute right-0 top-full z-20 mt-2 w-64 rounded-xl border border-sand-300 bg-white p-3 text-navy-900 shadow-lg";

const iconClass =
  "flex h-7 w-7 items-center justify-center rounded-full bg-sand-300 text-navy-900 shadow-sm transition hover:scale-105 hover:bg-sand-200 sm:h-8 sm:w-8";

const iconLabelClass = "mb-0.5 text-[9px] font-semibold text-sand-200 sm:text-[10px]";

/**
 * Icône espace de travail (compacte, sans texte) :
 * - survol : nom de l'espace (title natif) ;
 * - clic : panneau avec le contenu (nom, compteurs, liens).
 */
export function WorkspaceMenu({
  workspaceName,
  memberCount,
  productCount,
}: {
  workspaceName: string;
  memberCount: number;
  productCount: number;
}) {
  const { open, setOpen, ref } = useDropdown();
  return (
    <span ref={ref} className="relative flex shrink-0 flex-col items-center leading-none">
      <span className={iconLabelClass}>espace</span>
      <button
        type="button"
        title={workspaceName}
        aria-label={`Espace de travail : ${workspaceName} — cliquer pour voir le contenu`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={iconClass}
      >
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 21h18" />
          <path d="M5 21V7l7-4 7 4v14" />
          <path d="M9 21v-4h6v4" />
          <path d="M9 10h.01M15 10h.01M9 13h.01M15 13h.01" />
        </svg>
      </button>
      {open && (
        <span className={panelClass}>
          <span className="block truncate text-sm font-bold" title={workspaceName}>
            🏢 {workspaceName}
          </span>
          <span className="mt-1 block text-xs text-navy-900/70">
            {memberCount} membre{memberCount > 1 ? "s" : ""} · {productCount} produit{productCount > 1 ? "s" : ""}
          </span>
          <span className="mt-2 flex flex-col gap-1.5">
            <Link href="/products" onClick={() => setOpen(false)} className="rounded-lg bg-sand-300 px-3 py-1.5 text-center text-sm font-bold text-navy-900 hover:bg-sand-400">
              Voir mes produits
            </Link>
            <Link href="/settings" onClick={() => setOpen(false)} className="rounded-lg border border-navy-900/20 px-3 py-1.5 text-center text-sm font-bold text-navy-900 hover:bg-sand-100">
              Paramètres de l&apos;espace
            </Link>
          </span>
        </span>
      )}
    </span>
  );
}

/**
 * Icône compte (compacte) :
 * - survol : email du connecté (title natif) ;
 * - clic : panneau avec le contenu (email, espace, mot de passe, déconnexion).
 */
export function AccountMenu({
  email,
  workspaceName,
  logout,
}: {
  email: string;
  workspaceName: string;
  logout: () => Promise<void>;
}) {
  const { open, setOpen, ref } = useDropdown();
  return (
    <span ref={ref} className="relative flex shrink-0 flex-col items-center leading-none">
      <span className={iconLabelClass}>compte</span>
      <button
        type="button"
        title={email}
        aria-label={`Compte : ${email} — cliquer pour voir le contenu`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={iconClass}
      >
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      </button>
      {open && (
        <span className={panelClass}>
          <span className="block truncate text-sm font-bold" title={email}>
            {email}
          </span>
          <span className="mt-1 block truncate text-xs text-navy-900/70" title={workspaceName}>
            🏢 {workspaceName}
          </span>
          <span className="mt-2 flex flex-col gap-1.5">
            <Link href="/settings" onClick={() => setOpen(false)} className="rounded-lg bg-sand-300 px-3 py-1.5 text-center text-sm font-bold text-navy-900 hover:bg-sand-400">
              Modifier mon mot de passe
            </Link>
            <form action={logout}>
              <button type="submit" className="w-full rounded-lg border border-navy-900/20 px-3 py-1.5 text-sm font-bold text-navy-900 hover:bg-sand-100">
                Se déconnecter
              </button>
            </form>
          </span>
        </span>
      )}
    </span>
  );
}
