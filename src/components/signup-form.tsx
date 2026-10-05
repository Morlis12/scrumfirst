"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signup, type AuthState } from "@/app/actions/auth";
import { Field, buttonPrimary, buttonSecondary, inputClass } from "@/components/ui";
import { PasswordField } from "@/components/password-field";

/**
 * Inscription commerciale : crée un Espace de travail cloisonné et vierge
 * (nom d'espace + compte créateur) puis affiche en UNE fois le pack
 * d'équipe de base généré (emails + mots de passe temporaires modifiables).
 * Charte : sand-300 / navy-900 en gras.
 */
export function SignupForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(
    signup,
    undefined,
  );

  if (state?.teamPack) {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-xl border border-sand-300 bg-sand-300/50 p-3">
          <p className="text-sm font-bold text-navy-900">
            🎉 Espace « {state.workspaceName} » créé — votre application est vierge.
          </p>
          <p className="mt-1 text-xs text-navy-900/70">
            Voici l&apos;équipe de base de votre espace. Notez ces identifiants
            temporaires (affichage unique) : distribuez-les et modifiez les mots
            de passe depuis Paramètres.
          </p>
        </div>
        <ul className="flex flex-col gap-2">
          {state.teamPack.map((m) => (
            <li
              key={m.email}
              className="rounded-lg bg-navy-900 p-3 text-sm text-white"
            >
              <p className="font-bold">{m.roleLabel} — {m.name}</p>
              <p className="mt-1 font-mono text-xs">
                ✉️ {m.email}
              </p>
              <p className="font-mono text-xs text-sand-300">
                🔑 {m.tempPassword}
              </p>
            </li>
          ))}
        </ul>
        <Link href="/products" className={buttonPrimary}>
          Entrer dans mon espace vierge →
        </Link>
        <Link href="/settings" className={buttonSecondary}>
          Gérer l&apos;équipe (mots de passe)
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="rounded-lg bg-sand-300 p-3 text-sm font-bold text-navy-900">
        🏢 Chaque inscription crée un espace de travail cloisonné et vierge :
        vous ne verrez que le travail de votre propre équipe.
      </div>
      <Field
        label="Nom de l'espace de travail"
        hint="Ex. Département Data, Startup Acme — un pack d'équipe de base sera généré pour cet espace."
      >
        <input
          name="workspaceName"
          required
          minLength={2}
          maxLength={100}
          autoComplete="organization"
          placeholder="Ex. Département Data"
          className={inputClass}
        />
      </Field>
      <Field label="Votre nom (Product Owner de l'espace)">
        <input
          name="name"
          required
          minLength={2}
          autoComplete="name"
          placeholder="Marie Dupont"
          className={inputClass}
        />
      </Field>
      <Field label="Votre email">
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="marie@entreprise.fr"
          className={inputClass}
        />
      </Field>
      <Field
        label="Mot de passe"
        hint="8 caractères minimum, avec au moins une lettre et un chiffre."
      >
        <PasswordField name="password" autoComplete="new-password" minLength={8} />
      </Field>
      {state?.message && (
        <p role="alert" className="text-sm text-red-600">
          {state.message}
        </p>
      )}
      <button type="submit" disabled={pending} className={buttonPrimary}>
        {pending ? "Création…" : "Créer mon espace de travail"}
      </button>
    </form>
  );
}
