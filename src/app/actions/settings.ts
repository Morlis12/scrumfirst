"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/context";

export type SettingsActionState = { message?: string; error?: string } | undefined;

const PasswordSchema = z
  .string()
  .min(8, "8 caractères minimum.")
  .regex(/[a-zA-Z]/, "Au moins une lettre.")
  .regex(/[0-9]/, "Au moins un chiffre.");

function tempPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = randomBytes(12);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

async function requireWorkspaceAdmin(workspaceId: string, userId: string) {
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { globalRole: true, workspaceId: true },
  });
  if (!me || me.workspaceId !== workspaceId || me.globalRole !== "ADMIN") {
    throw new Error("Gestion de l'équipe réservée au Product Owner de l'espace.");
  }
}

/**
 * Changer son propre mot de passe (tous les membres de l'espace).
 */
export async function updateOwnPassword(
  _state: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const { userId } = await requireWorkspace();
  const current = String(formData.get("currentPassword") ?? "");
  const next = String(formData.get("newPassword") ?? "");
  const parsed = PasswordSchema.safeParse(next);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { error: "Compte introuvable." };
  const ok = await bcrypt.compare(current, user.passwordHash);
  if (!ok) return { error: "Mot de passe actuel incorrect." };
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await bcrypt.hash(parsed.data, 12) },
  });
  revalidatePath("/settings");
  return { message: "Mot de passe mis à jour." };
}

/**
 * Régénère le mot de passe d'un membre de l'espace (OWNER/ADMIN uniquement).
 * Retourne le temporaire en clair (affichage unique, à distribuer).
 */
export async function resetMemberPassword(
  memberId: string,
  _state: SettingsActionState,
  _formData: FormData,
): Promise<SettingsActionState> {
  const { userId, workspaceId } = await requireWorkspace();
  await requireWorkspaceAdmin(workspaceId, userId);
  const member = await prisma.user.findFirst({
    where: { id: memberId, workspaceId },
    select: { id: true, email: true, name: true },
  });
  if (!member) return { error: "Membre introuvable dans votre espace." };
  const pwd = tempPassword();
  await prisma.user.update({
    where: { id: member.id },
    data: { passwordHash: await bcrypt.hash(pwd, 12) },
  });
  revalidatePath("/settings");
  return { message: `Nouveau mot de passe temporaire pour ${member.email} : ${pwd}` };
}

/**
 * Modifie le nom / l'email d'un membre de l'espace (OWNER/ADMIN uniquement).
 * L'email reste unique globalement (connexion par email).
 */
export async function updateMember(
  memberId: string,
  _state: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const { userId, workspaceId } = await requireWorkspace();
  await requireWorkspaceAdmin(workspaceId, userId);
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (name.length < 2) return { error: "Nom : 2 caractères minimum." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Email invalide." };
  const member = await prisma.user.findFirst({
    where: { id: memberId, workspaceId },
    select: { id: true },
  });
  if (!member) return { error: "Membre introuvable dans votre espace." };
  const clash = await prisma.user.findUnique({ where: { email } });
  if (clash && clash.id !== member.id) return { error: "Cet email est déjà utilisé." };
  await prisma.user.update({ where: { id: member.id }, data: { name, email } });
  revalidatePath("/settings");
  return { message: `Membre mis à jour : ${name} (${email}).` };
}
