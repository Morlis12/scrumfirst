import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ status: "ok", db: "reachable" });
  } catch (e) {
    return Response.json(
      { status: "ko", db: String((e as Error).message) },
      { status: 503 },
    );
  }
}
