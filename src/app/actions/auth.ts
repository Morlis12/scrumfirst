"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { AuthError } from "next-auth";
import { z } from "zod";
import { signIn, signOut } from "@/auth";
import { prisma } from "@/lib/prisma";

const CredentialsSchema = z.object({
  email: z.string().email("Email invalide.").trim().toLowerCase(),
  password: z.string().min(1, "Mot de passe requis."),
});

const SignupSchema = z.object({
  workspaceName: z.string().trim().min(2, "Nom d'espace : 2 caractères minimum.").max(100),
  name: z.string().trim().min(2, "Nom : 2 caractères minimum.").max(100),
  email: z.string().email("Email invalide.").trim().toLowerCase(),
  password: z
    .string()
    .min(8, "8 caractères minimum.")
    .regex(/[a-zA-Z]/, "Au moins une lettre.")
    .regex(/[0-9]/, "Au moins un chiffre."),
});

export type TeamPackMember = {
  name: string;
  email: string;
  tempPassword: string;
  spaceRole: string;
  roleLabel: string;
};

export type AuthState =
  | { message?: string; teamPack?: TeamPackMember[]; workspaceName?: string }
  | undefined;

/** Mot de passe temporaire lisible (12 caractères alphanumériques). */
function tempPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = randomBytes(12);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

function slugify(name: string): string {
  const base =
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24) || "espace";
  return `${base}-${randomBytes(2).toString("hex")}`;
}

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

/**
 * Inscription commerciale : crée un Espace de travail cloisonné et vierge
 * + le compte du créateur (OWNER/ADMIN de l'espace) + un pack d'équipe de
 * base (1 SM, 2 Devs, 1 Stakeholder) avec emails et mots de passe temporaires
 * modifiables. Le créateur est connecté puis voit les identifiants du pack
 * (affichage unique) avant d'entrer dans son espace vide.
 */
export async function signup(
  _state: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = SignupSchema.safeParse({
    workspaceName: formData.get("workspaceName"),
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

  // Slug unique pour des emails de pack uniques globalement.
  let slug = slugify(parsed.data.workspaceName);
  for (let i = 0; i < 5; i++) {
    const clash = await prisma.workspace.findUnique({ where: { slug } });
    if (!clash) break;
    slug = slugify(parsed.data.workspaceName);
  }

  const workspace = await prisma.workspace.create({
    data: { name: parsed.data.workspaceName.trim(), slug },
  });

  const ownerHash = await bcrypt.hash(parsed.data.password, 12);
  await prisma.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      passwordHash: ownerHash,
      globalRole: "ADMIN",
      spaceRole: "OWNER",
      workspaceId: workspace.id,
    },
  });

  // Pack d'équipe de base : emails uniques par espace, mots de passe
  // temporaires (modifiables depuis Paramètres). Rôles rattachés
  // automatiquement à la première équipe créée sur un produit.
  const packDefs = [
    { name: "Scrum Master", email: `sm.${slug}@scrumfirst.local`, spaceRole: "SCRUM_MASTER", roleLabel: "🛡️ Scrum Master" },
    { name: "Développeur 1", email: `dev1.${slug}@scrumfirst.local`, spaceRole: "DEVELOPER", roleLabel: "💻 Développeur" },
    { name: "Développeur 2", email: `dev2.${slug}@scrumfirst.local`, spaceRole: "DEVELOPER", roleLabel: "💻 Développeur" },
    { name: "Partie prenante", email: `sh.${slug}@scrumfirst.local`, spaceRole: "STAKEHOLDER", roleLabel: "👁️ Stakeholder" },
  ];
  const teamPack: TeamPackMember[] = [];
  for (const def of packDefs) {
    const pwd = tempPassword();
    await prisma.user.create({
      data: {
        name: def.name,
        email: def.email,
        passwordHash: await bcrypt.hash(pwd, 12),
        globalRole: "MEMBER",
        spaceRole: def.spaceRole,
        workspaceId: workspace.id,
      },
    });
    teamPack.push({ ...def, tempPassword: pwd });
  }

  // Connexion sans redirection : le formulaire affiche le pack (unique
  // affichage des mots de passe temporaires) puis propose d'entrer.
  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: String(formData.get("password")),
      redirect: false,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { message: "Espace créé, mais connexion impossible. Connectez-vous." };
    }
    throw error;
  }
  return { workspaceName: workspace.name, teamPack };
}

export async function logout() {
  await signOut({ redirectTo: "/login" });
  redirect("/login");
}
