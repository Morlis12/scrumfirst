import Link from "next/link";
import { SignupForm } from "@/components/signup-form";
import { Card } from "@/components/ui";

export default function SignupPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
      <Card>
        <h1 className="text-xl font-semibold text-navy-900">
          Créer un compte
        </h1>
        <p className="mt-1 text-sm text-navy-900/70">
          Le premier compte créé devient administrateur.
        </p>
        <div className="mt-5">
          <SignupForm />
        </div>
        <p className="mt-4 text-sm text-navy-900/70">
          Déjà inscrit ?{" "}
          <Link href="/login" className="font-medium text-navy-900 underline">
            Se connecter
          </Link>
        </p>
      </Card>
    </main>
  );
}
