"use client";

import { useActionState } from "react";
import { Field, buttonPrimary, inputClass } from "@/components/ui";

type State = { message?: string; error?: string } | undefined;

/** Formulaire générique branché sur une Server Action (FormData). */
export function ActionForm({
  action,
  submitLabel,
  pendingLabel,
  children,
}: {
  action: (state: State, formData: FormData) => Promise<State>;
  submitLabel: string;
  pendingLabel?: string;
  children: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="flex flex-col gap-3">
      {children}
      {state?.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
      {state?.message && (
        <p role="status" className="text-sm text-green-700">
          {state.message}
        </p>
      )}
      <div>
        <button type="submit" disabled={pending} className={buttonPrimary}>
          {pending ? (pendingLabel ?? "…") : submitLabel}
        </button>
      </div>
    </form>
  );
}

export { Field, inputClass };
