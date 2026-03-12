import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;

    return Response.json({
      ok: true,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Health check failed"
      },
      {
        status: 500
      }
    );
  }
}
