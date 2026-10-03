"use client";

import { useActionState } from "react";
import { login, type AuthState } from "@/app/actions/auth";
import { Field, buttonPrimary, inputClass } from "@/components/ui";
import { PasswordField } from "@/components/password-field";

export function LoginForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(
    login,
    undefined,
  );
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="Email">
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="po@equipe.fr"
          className={inputClass}
        />
      </Field>
      <Field label="Mot de passe">
        <PasswordField name="password" autoComplete="current-password" />
      </Field>
      {state?.message && (
        <p role="alert" className="text-sm text-red-600">
          {state.message}
        </p>
      )}
      <button type="submit" disabled={pending} className={buttonPrimary}>
        {pending ? "Connexion…" : "Se connecter"}
      </button>
    </form>
  );
}
