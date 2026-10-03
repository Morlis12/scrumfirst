import { cache } from "react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";

export async function currentUserId() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user.id;
}

/** Produits accessibles : possédés OU via une équipe membre. */
export const getMyProducts = cache(async (userId: string) => {
  const [owned, memberships] = await Promise.all([
    prisma.product.findMany({
      where: { productOwnerId: userId },
      select: { id: true, name: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.teamMembership.findMany({
      where: { userId },
      select: { team: { select: { product: { select: { id: true, name: true } } } } },
    }),
  ]);
  const map = new Map<string, { id: string; name: string }>();
  for (const p of owned) map.set(p.id, p);
  for (const m of memberships) map.set(m.team.product.id, m.team.product);
  return [...map.values()];
});

export const getProductTeams = cache(async (productId: string) => {
  return prisma.team.findMany({
    where: { productId },
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  });
});

export const getTeamSprints = cache(async (teamId: string) => {
  return prisma.sprint.findMany({
    where: { teamId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { backlogItems: true } } },
  });
});
