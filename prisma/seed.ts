/**
 * Seed de démonstration — idempotent (upserts).
 * Usage : npm run seed
 * Comptes : admin@scrumfirst.local / change-me-seed-admin (ADMIN + PO)
 *           dev@scrumfirst.local   / change-me-seed-dev   (DEVELOPER)
 *           sm@scrumfirst.local    / change-me-seed-sm    (SCRUM_MASTER)
 *           sh@scrumfirst.local    / change-me-seed-sh    (STAKEHOLDER)
 */
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const USERS = [
  { email: "admin@scrumfirst.local", name: "Alex PO", password: "change-me-seed-admin", globalRole: "ADMIN", teamRole: "PRODUCT_OWNER" },
  { email: "dev@scrumfirst.local", name: "Dana Dev", password: "change-me-seed-dev", globalRole: "MEMBER", teamRole: "DEVELOPER" },
  { email: "sm@scrumfirst.local", name: "Sam SM", password: "change-me-seed-sm", globalRole: "MEMBER", teamRole: "SCRUM_MASTER" },
  { email: "sh@scrumfirst.local", name: "Sacha SH", password: "change-me-seed-sh", globalRole: "MEMBER", teamRole: "STAKEHOLDER" },
];

async function main() {
  const users: Record<string, { id: string }> = {};
  for (const u of USERS) {
    const passwordHash = await bcrypt.hash(u.password, 12);
    const user = await prisma.user.upsert({
      where: { email: u.email },
      create: { email: u.email, name: u.name, passwordHash, globalRole: u.globalRole },
      update: { name: u.name, passwordHash, globalRole: u.globalRole },
    });
    users[u.email] = user;
  }
  const po = users["admin@scrumfirst.local"]!;

  let product = await prisma.product.findFirst({ where: { name: "Produit Démo" } });
  if (!product) {
    product = await prisma.product.create({
      data: { name: "Produit Démo", productOwnerId: po.id },
    });
  }

  let team = await prisma.team.findFirst({ where: { productId: product.id } });
  if (!team) {
    team = await prisma.team.create({ data: { name: "Équipe Alpha", productId: product.id } });
  }

  for (const u of USERS) {
    await prisma.teamMembership.upsert({
      where: { userId_teamId: { userId: users[u.email]!.id, teamId: team.id } },
      create: { userId: users[u.email]!.id, teamId: team.id, role: u.teamRole },
      update: { role: u.teamRole },
    });
  }

  const goalCount = await prisma.productGoal.count({
    where: { productId: product.id, status: "ACTIVE" },
  });
  if (goalCount === 0) {
    await prisma.productGoal.create({
      data: { productId: product.id, description: "Permettre la réservation d'une démo en 2 clics." },
    });
  }

  const existingCriteria = await prisma.doneCriterion.count({ where: { productId: product.id } });
  if (existingCriteria === 0) {
    await prisma.doneCriterion.createMany({
      data: [
        "Code relu par un pair",
        "Tests automatisés verts",
        "Documentation mise à jour",
        "Déployable sans interruption",
      ].map((label) => ({ productId: product.id, label })),
    });
  }

  const itemCount = await prisma.backlogItem.count({ where: { productId: product.id } });
  if (itemCount === 0) {
    await prisma.backlogItem.createMany({
      data: [
        { productId: product.id, title: "Voir le catalogue des créneaux", status: "READY", order: 0, storyPoints: 3 },
        { productId: product.id, title: "Réserver un créneau en 2 clics", status: "REFINED", order: 1 },
        { productId: product.id, title: "Recevoir une confirmation par email", status: "RAW", order: 2 },
      ],
    });
  }

  const sprintCount = await prisma.sprint.count({ where: { teamId: team.id } });
  if (sprintCount === 0) {
    const start = new Date();
    const end = new Date(start.getTime() + 14 * 24 * 3600 * 1000);
    const sprint = await prisma.sprint.create({
      data: { teamId: team.id, goal: "Livrer la réservation en 2 clics.", status: "PLANNING", startDate: start, endDate: end },
    });
    // Timeboxes prorata 2 semaines : Planning 4h, Daily 15min, Review 2h, Rétro 1h30.
    await prisma.scrumEvent.createMany({
      data: [
        { sprintId: sprint.id, type: "SPRINT_PLANNING", timeboxMinutes: 240 },
        { sprintId: sprint.id, type: "DAILY_SCRUM", timeboxMinutes: 15 },
        { sprintId: sprint.id, type: "SPRINT_REVIEW", timeboxMinutes: 120 },
        { sprintId: sprint.id, type: "SPRINT_RETROSPECTIVE", timeboxMinutes: 90 },
      ],
    });
  }

  console.log("Seed OK : Produit Démo + Équipe Alpha + 4 comptes.");
}

await main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
