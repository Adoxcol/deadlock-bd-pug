import type { PrismaClient, Prisma } from '@prisma/client';
export function audit(db: PrismaClient, actorId: string | null, action: string, entityType: string, entityId: string, before?: unknown, after?: unknown) {
  return db.auditLog.create({ data: { actorId, action, entityType, entityId, before: (before ?? undefined) as Prisma.InputJsonValue | undefined, after: (after ?? undefined) as Prisma.InputJsonValue | undefined } });
}
