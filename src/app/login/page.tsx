import Link from "next/link";
import { LoginForm } from "@/components/login-form";
import { Card } from "@/components/ui";

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
      <Card>
        <h1 className="text-xl font-semibold text-navy-900">ScrumFirst</h1>
        <p className="mt-1 text-sm text-navy-900/70">
          Connectez-vous pour pratiquer Scrum avec votre équipe.
        </p>
        <div className="mt-5">
          <LoginForm />
        </div>
        <p className="mt-4 text-sm text-navy-900/70">
          Pas de compte ?{" "}
          <Link href="/signup" className="font-medium text-navy-900 underline">
            Créer un compte
          </Link>
        </p>
      </Card>
    </main>
  );
}
