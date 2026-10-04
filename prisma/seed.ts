/**
 * Seed de démonstration — idempotent (upserts).
 * Usage : npm run seed
 * Comptes créés (emails de démo, domaine .local non routable) :
 *           admin@scrumfirst.local (ADMIN + PO)
 *           dev@scrumfirst.local   (DEVELOPER)
 *           sm@scrumfirst.local    (SCRUM_MASTER)
 *           sh@scrumfirst.local    (STAKEHOLDER)
 * Mots de passe : lus depuis l'environnement, JAMAIS en dur ici.
 * Variables requises : SEED_ADMIN_PASSWORD, SEED_DEV_PASSWORD,
 *                      SEED_SM_PASSWORD, SEED_SH_PASSWORD.
 * Voir .env.example.
 */
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const REQUIRED_SEED_PASSWORDS = [
  "SEED_ADMIN_PASSWORD",
  "SEED_DEV_PASSWORD",
  "SEED_SM_PASSWORD",
  "SEED_SH_PASSWORD",
] as const;

function requiredSeedPassword(name: (typeof REQUIRED_SEED_PASSWORDS)[number]): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Variable d'environnement manquante : ${name} (voir .env.example). ` +
        `Les mots de passe du seed ne sont jamais versionnés.`,
    );
  }
  return value;
}

const USERS = [
  { email: "admin@scrumfirst.local", name: "Alex PO", password: requiredSeedPassword("SEED_ADMIN_PASSWORD"), globalRole: "ADMIN", teamRole: "PRODUCT_OWNER" },
  { email: "dev@scrumfirst.local", name: "Dana Dev", password: requiredSeedPassword("SEED_DEV_PASSWORD"), globalRole: "MEMBER", teamRole: "DEVELOPER" },
  { email: "sm@scrumfirst.local", name: "Sam SM", password: requiredSeedPassword("SEED_SM_PASSWORD"), globalRole: "MEMBER", teamRole: "SCRUM_MASTER" },
  { email: "sh@scrumfirst.local", name: "Sacha SH", password: requiredSeedPassword("SEED_SH_PASSWORD"), globalRole: "MEMBER", teamRole: "STAKEHOLDER" },
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
