"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { inputClass } from "@/components/ui";

export type AutoFilterOption = { id: string; name: string };

/**
 * Menu déroulant de filtre AUTOMATIQUE (sans bouton d'application).
 * - La sélection navigue immédiatement (`router.replace`, sans scroll) :
 *   aucun clic sur « Voir / Équipe / Produit / Choisir » n'est requis.
 * - Cascade : `resetParams` liste les sous-filtres à réinitialiser
 *   (ex. changer de produit efface `team` + `sprint` → le serveur
 *   sélectionne la première équipe / le premier sprint du nouveau produit,
 *   le sous-filtre ne propose donc que les éléments concernés).
 * - Tous les autres paramètres d'URL sont conservés.
 */
function AutoFilterSelectInner({
  name,
  value,
  options,
  ariaLabel,
  resetParams,
  disabled,
  placeholder,
  id,
  boldWhenSelected,
}: {
  name: string;
  value: string;
  options: AutoFilterOption[];
  ariaLabel: string;
  resetParams?: string[];
  disabled?: boolean;
  placeholder?: string;
  id?: string;
  boldWhenSelected?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value;
    if (!next) return;
    if (next === value) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set(name, next);
    for (const r of resetParams ?? []) params.delete(r);
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : "?", { scroll: false });
  }

  return (
    <select
      id={id}
      name={name}
      value={value}
      onChange={onChange}
      disabled={disabled}
      aria-label={ariaLabel}
      title={ariaLabel}
      className={`${inputClass}${boldWhenSelected && value ? " font-bold" : ""}${disabled ? " disabled:opacity-50" : ""}`}
    >
      {placeholder ? (
        <option value="" disabled>
          {placeholder}
        </option>
      ) : null}
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </select>
  );
}

export function AutoFilterSelect(props: {
  name: string;
  value: string;
  options: AutoFilterOption[];
  ariaLabel: string;
  resetParams?: string[];
  disabled?: boolean;
  placeholder?: string;
  id?: string;
  boldWhenSelected?: boolean;
}) {
  return (
    <Suspense
      fallback={
        <select
          id={props.id}
          name={props.name}
          defaultValue={props.value}
          disabled
          aria-label={props.ariaLabel}
          className={inputClass}
        >
          {props.placeholder ? (
            <option value="" disabled>
              {props.placeholder}
            </option>
          ) : null}
          {props.options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      }
    >
      <AutoFilterSelectInner {...props} />
    </Suspense>
  );
}
