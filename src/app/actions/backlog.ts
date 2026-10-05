"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { currentUserId } from "@/lib/context";
import {
  guardCreateGoal,
  guardItemStatus,
  guardReorderBacklog,
} from "@/lib/scrum-guards";

export type ActionState = { message?: string; error?: string } | undefined;

const ItemSchema = z.object({
  title: z.string().trim().min(3, "Titre : 3 caractères minimum.").max(200),
  description: z.string().trim().max(2000).optional(),
});

export async function createItem(
  productId: string,
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const userId = await currentUserId();
  const parsed = ItemSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  // Items du Product Backlog : Product Owner uniquement (Developer exclu).
  const { guardCreateItem } = await import("@/lib/scrum-guards");
  const guard = await guardCreateItem(userId, productId, null);
  if (!guard.ok) return { error: guard.message };

  const maxOrder = await prisma.backlogItem.aggregate({
    where: { productId, sprintId: null },
    _max: { order: true },
  });
  await prisma.backlogItem.create({
    data: {
      productId,
      title: parsed.data.title,
      description: parsed.data.description,
      status: "RAW",
      order: (maxOrder._max.order ?? -1) + 1,
      delegatedById: null,
    },
  });
  revalidatePath("/backlog");
}

export async function moveItem(
  productId: string,
  itemId: string,
  direction: "up" | "down",
) {
  const userId = await currentUserId();
  const guard = await guardReorderBacklog(userId, productId);
  if (!guard.ok) throw new Error(guard.message);

  const items = await prisma.backlogItem.findMany({
    where: { productId, sprintId: null },
    orderBy: { order: "asc" },
  });
  const idx = items.findIndex((i) => i.id === itemId);
  if (idx < 0) throw new Error("Item introuvable.");
  const other = direction === "up" ? items[idx - 1] : items[idx + 1];
  if (!other) return;
  const current = items[idx]!;
  await prisma.$transaction([
    prisma.backlogItem.update({ where: { id: current.id }, data: { order: other.order } }),
    prisma.backlogItem.update({ where: { id: other.id }, data: { order: current.order } }),
  ]);
  revalidatePath("/backlog");
}

export async function setItemStatus(
  productId: string,
  itemId: string,
  to: string,
  opts?: { storyPoints?: number | null; fitsInOneSprint?: boolean },
): Promise<void> {
  const userId = await currentUserId();
  const item = await prisma.backlogItem.findUnique({ where: { id: itemId } });
  if (!item || item.productId !== productId) throw new Error("Item introuvable.");

  const guard = await guardItemStatus(userId, productId, item.status, to, {
    storyPoints: opts?.storyPoints ?? item.storyPoints,
    fitsInOneSprint: opts?.fitsInOneSprint ?? false,
  });
  if (!guard.ok) throw new Error(guard.message);

  await prisma.backlogItem.update({
    where: { id: itemId },
    data: {
      status: to,
      ...(to === "READY"
        ? {
            storyPoints: opts?.storyPoints ?? item.storyPoints,
          }
        : {}),
    },
  });
  revalidatePath("/backlog");
  revalidatePath("/planning");
}

export async function readyWithEstimate(
  productId: string,
  itemId: string,
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const points = Number(formData.get("storyPoints"));
  const fits = formData.get("fitsInOneSprint") === "on";
  if (!Number.isFinite(points) || points <= 0) {
    return { error: "Estimation requise (points > 0) pour passer 'prêt'." };
  }
  try {
    await setItemStatus(productId, itemId, "READY", {
      storyPoints: points,
      fitsInOneSprint: fits,
    });
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function createGoal(
  productId: string,
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const userId = await currentUserId();
  const description = String(formData.get("description") ?? "").trim();
  if (description.length < 5) return { error: "Objectif trop court." };
  const guard = await guardCreateGoal(userId, productId);
  if (!guard.ok) return { error: guard.message };
  await prisma.productGoal.create({ data: { productId, description } });
  revalidatePath("/backlog");
}

export async function resolveGoal(
  productId: string,
  goalId: string,
  status: "ACHIEVED" | "ABANDONED",
) {
  const userId = await currentUserId();
  const { resolveProductActor } = await import("@/lib/scrum-guards");
  const { canManageProductBacklog } = await import("@/lib/scrum-rules");
  const actor = await resolveProductActor(userId, productId);
  const guard = canManageProductBacklog(actor);
  if (!guard.ok) throw new Error(guard.message);
  await prisma.productGoal.update({
    where: { id: goalId },
    data: { status, resolvedAt: new Date() },
  });
  revalidatePath("/backlog");
}

export async function createProduct(_state: ActionState, formData: FormData): Promise<ActionState> {
  const { currentWorkspaceId } = await import("@/lib/context");
  const workspaceId = await currentWorkspaceId();
  const userId = await currentUserId();
  const { guardCreateProduct } = await import("@/lib/scrum-guards");
  const allowed = await guardCreateProduct(userId);
  if (!allowed.ok) return { error: allowed.message };
  const name = String(formData.get("name") ?? "").trim();
  const productOwnerEmail = String(formData.get("productOwnerEmail") ?? "").trim().toLowerCase();
  const scrumMasterEmail = String(formData.get("scrumMasterEmail") ?? "").trim().toLowerCase();
  if (name.length < 3) return { error: "Nom de produit trop court." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(productOwnerEmail)) {
    return { error: "Email du Product Owner invalide." };
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(scrumMasterEmail)) {
    return { error: "Email du Scrum Master invalide." };
  }
  const product = await prisma.product.create({
    data: { name, productOwnerId: userId, productOwnerEmail, scrumMasterEmail, workspaceId },
  });
  const team = await prisma.team.create({
    data: { name: "Équipe 1", productId: product.id, members: [], workspaceId },
  });
  await prisma.teamMembership.create({
    data: { userId, teamId: team.id, role: "PRODUCT_OWNER" },
  });
  revalidatePath("/backlog");
  return { message: `Produit « ${name} » créé (PO ${productOwnerEmail} · SM ${scrumMasterEmail}).` };
}
