import { cache } from "react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  globalRole: string;
};

/** Session issue du JWT Auth.js (mise en cache par rendu React). */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const session = await auth();
  if (!session?.user?.id) return null;
  return {
    id: session.user.id,
    email: session.user.email ?? "",
    name: session.user.name ?? null,
    globalRole:
      (session.user as { globalRole?: string }).globalRole ?? "MEMBER",
  };
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  return user;
}

/** Rôle Scrum d'un utilisateur dans une équipe (+ flag "participe comme Developer"). */
export async function getMembership(userId: string, teamId: string) {
  return prisma.teamMembership.findUnique({
    where: { userId_teamId: { userId, teamId } },
  });
}

export async function isProductOwnerOf(userId: string, productId: string) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { productOwnerId: true },
  });
  return product?.productOwnerId === userId;
}

/** Résout l'acteur (utilisateur + rôles) pour un contexte produit/équipe. */
export async function resolveActor(
  userId: string,
  ctx: { teamId?: string; productId?: string },
) {
  const [membership, isPO] = await Promise.all([
    ctx.teamId ? getMembership(userId, ctx.teamId) : null,
    ctx.productId ? isProductOwnerOf(userId, ctx.productId) : false,
  ]);
  const teamRole = membership?.role ?? null;
  const participatesAsDeveloper =
    membership?.participatesAsDeveloper ?? false;
  return {
    userId,
    teamRole,
    participatesAsDeveloper,
    isProductOwner: isPO,
    // Peut agir comme Developer : rôle DEVELOPER ou PO/SM participant comme dev.
    canActAsDeveloper:
      teamRole === "DEVELOPER" || participatesAsDeveloper,
  };
}
