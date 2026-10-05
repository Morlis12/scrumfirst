import { cache } from "react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";

export async function currentUserId() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user.id;
}

/**
 * Cloisonnement commercial : résout l'espace de travail de l'utilisateur
 * connecté. Toutes les lectures/écritures de l'application partent d'ici —
 * un utilisateur ne voit QUE le travail de son propre Workspace.
 * Sans workspace (compte orphelin), redirection vers l'inscription.
 */
export async function requireWorkspace(): Promise<{ userId: string; workspaceId: string }> {
  const userId = await currentUserId();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { workspaceId: true },
  });
  if (!user?.workspaceId) redirect("/signup");
  return { userId, workspaceId: user.workspaceId };
}

export const currentWorkspaceId = cache(async (): Promise<string> => {
  const { workspaceId } = await requireWorkspace();
  return workspaceId;
});

async function assertWorkspaceRecord(
  kind: "product" | "team" | "sprint",
  id: string,
  workspaceId: string,
): Promise<void> {
  const where = { id, workspaceId } as { id: string; workspaceId: string };
  const found =
    kind === "product"
      ? await prisma.product.findFirst({ where, select: { id: true } })
      : kind === "team"
        ? await prisma.team.findFirst({ where, select: { id: true } })
        : await prisma.sprint.findFirst({ where, select: { id: true } });
  if (!found) throw new Error("Élément introuvable dans votre espace de travail.");
}

/** Garde tenant : le produit ciblé appartient à l'espace de l'utilisateur. */
export async function assertProductWorkspace(productId: string, workspaceId: string) {
  await assertWorkspaceRecord("product", productId, workspaceId);
}

/** Garde tenant : l'équipe ciblée appartient à l'espace de l'utilisateur. */
export async function assertTeamWorkspace(teamId: string, workspaceId: string) {
  await assertWorkspaceRecord("team", teamId, workspaceId);
}

/** Garde tenant : le sprint ciblé appartient à l'espace de l'utilisateur. */
export async function assertSprintWorkspace(sprintId: string, workspaceId: string) {
  await assertWorkspaceRecord("sprint", sprintId, workspaceId);
}

/** Produits accessibles : possédés OU via une équipe membre — DANS le workspace. */
export const getMyProducts = cache(async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { workspaceId: true },
  });
  if (!user?.workspaceId) return [];
  const workspaceId = user.workspaceId;
  const [owned, memberships] = await Promise.all([
    prisma.product.findMany({
      where: { productOwnerId: userId, workspaceId },
      select: { id: true, name: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.teamMembership.findMany({
      where: { userId, team: { product: { workspaceId } } },
      select: { team: { select: { product: { select: { id: true, name: true } } } } },
    }),
  ]);
  const map = new Map<string, { id: string; name: string }>();
  for (const p of owned) map.set(p.id, p);
  for (const m of memberships) map.set(m.team.product.id, m.team.product);
  return [...map.values()];
});

export const getProductTeams = cache(async (productId: string, workspaceId: string) => {
  const product = await prisma.product.findFirst({
    where: { id: productId, workspaceId },
    select: { id: true },
  });
  if (!product) return [];
  return prisma.team.findMany({
    where: { productId, workspaceId },
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  });
});

export const getTeamSprints = cache(async (teamId: string, workspaceId: string) => {
  const team = await prisma.team.findFirst({
    where: { id: teamId, workspaceId },
    select: { id: true },
  });
  if (!team) return [];
  return prisma.sprint.findMany({
    where: { teamId, workspaceId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { backlogItems: true } } },
  });
});

/** Nom de l'espace de travail pour l'affichage (nav, en-têtes). */
export const getWorkspaceName = cache(async (workspaceId: string) => {
  const ws = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { name: true },
  });
  return ws?.name ?? "Mon espace";
});
