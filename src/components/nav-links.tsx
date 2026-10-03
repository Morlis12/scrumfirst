"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLinks({
  links,
}: {
  links: { href: string; label: string }[];
}) {
  const pathname = usePathname();
  return (
    <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto" aria-label="Navigation principale">
      {links.map((l) => {
        const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={
              active
                ? "shrink-0 whitespace-nowrap rounded-lg bg-sand-300 px-2.5 py-1.5 text-[13px] font-semibold text-navy-900 shadow-sm"
                : "shrink-0 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-white/85 hover:bg-white/10 hover:text-sand-200"
            }
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
