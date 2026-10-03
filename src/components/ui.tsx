import type { ReactNode } from "react";

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-sand-200 bg-white p-4 shadow-sm sm:p-5 ${className}`}
    >
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-navy-900 sm:text-2xl">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 max-w-2xl text-sm text-navy-900/70">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Badge({
  children,
  tone = "zinc",
}: {
  children: ReactNode;
  tone?: "zinc" | "green" | "amber" | "red" | "blue";
}) {
  const tones: Record<string, string> = {
    zinc: "bg-sand-100 text-navy-900 ring-sand-300",
    green: "bg-green-50 text-green-700 ring-green-200",
    amber: "bg-sand-300 text-navy-900 ring-sand-400",
    red: "bg-red-50 text-red-700 ring-red-200",
    blue: "bg-navy-900 text-white ring-navy-900",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-navy-900">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-navy-900/60">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "w-full rounded-lg border border-sand-300 bg-white px-3 py-2 text-sm text-navy-900 placeholder:text-navy-900/40 focus:border-navy-900 focus:outline-none";

export const buttonPrimary =
  "inline-flex items-center justify-center rounded-lg bg-navy-900 px-4 py-2 text-sm font-medium text-white hover:bg-navy-800 disabled:opacity-50";

export const buttonSecondary =
  "inline-flex items-center justify-center rounded-lg border border-navy-900/20 bg-white px-4 py-2 text-sm font-medium text-navy-900 hover:bg-sand-100 disabled:opacity-50";

export const buttonDanger =
  "inline-flex items-center justify-center rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50";
