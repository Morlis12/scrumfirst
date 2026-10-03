"use client";

import { useActionState } from "react";
import { signup, type AuthState } from "@/app/actions/auth";
import { Field, buttonPrimary, inputClass } from "@/components/ui";
import { PasswordField } from "@/components/password-field";

export function SignupForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(
    signup,
    undefined,
  );
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="Nom">
        <input
          name="name"
          required
          minLength={2}
          autoComplete="name"
          placeholder="Marie Dupont"
          className={inputClass}
        />
      </Field>
      <Field label="Email">
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="marie@equipe.fr"
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
        {pending ? "Création…" : "Créer mon compte"}
      </button>
    </form>
  );
}
