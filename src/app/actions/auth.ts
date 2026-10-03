"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { AuthError } from "next-auth";
import { z } from "zod";
import { signIn, signOut } from "@/auth";
import { prisma } from "@/lib/prisma";

const CredentialsSchema = z.object({
  email: z.string().email("Email invalide.").trim().toLowerCase(),
  password: z.string().min(1, "Mot de passe requis."),
});

const SignupSchema = z.object({
  name: z.string().trim().min(2, "Nom : 2 caractères minimum.").max(100),
  email: z.string().email("Email invalide.").trim().toLowerCase(),
  password: z
    .string()
    .min(8, "8 caractères minimum.")
    .regex(/[a-zA-Z]/, "Au moins une lettre.")
    .regex(/[0-9]/, "Au moins un chiffre."),
});

export type AuthState = { message?: string } | undefined;

export async function login(
  _state: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = CredentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { message: "Email ou mot de passe invalide." };

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: "/backlog",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      if (error.type === "CredentialsSignin") {
        return { message: "Identifiants invalides." };
      }
      return { message: "Connexion impossible, réessayez." };
    }
    throw error;
  }
}

export async function signup(
  _state: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = SignupSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { message: parsed.error.issues[0]?.message ?? "Données invalides." };
  }

  const existing = await prisma.user.findUnique({
    where: { email: parsed.data.email },
  });
  if (existing) return { message: "Un compte existe déjà avec cet email." };

  const userCount = await prisma.user.count();
  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  await prisma.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      passwordHash,
      // Bootstrap : le tout premier compte est administrateur.
      globalRole: userCount === 0 ? "ADMIN" : "MEMBER",
    },
  });

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: String(formData.get("password")),
      redirectTo: "/backlog",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { message: "Compte créé, mais connexion impossible." };
    }
    throw error;
  }
}

export async function logout() {
  await signOut({ redirectTo: "/login" });
  redirect("/login");
}
