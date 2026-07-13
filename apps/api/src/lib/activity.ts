import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as schema from "../db/schema/index.js";
import { activities, auditLogs } from "../db/schema/index.js";

type Tx = NodePgDatabase<typeof schema>;

export async function recordActivity(
  tx: Tx,
  input: {
    workspaceId: string;
    actorId: string;
    entityType: string;
    entityId: string;
    action: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await tx.insert(activities).values({
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    entityType: input.entityType,
    entityId: input.entityId,
    action: input.action,
    metadata: input.metadata ?? {},
  });
}

export async function recordAudit(
  tx: Tx,
  input: {
    workspaceId?: string;
    actorId: string;
    action: "create" | "update" | "delete" | "restore" | "invite" | "join" | "leave" | "role_change" | "login" | "logout";
    resourceType: string;
    resourceId?: string;
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await tx.insert(auditLogs).values({
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    before: input.before,
    after: input.after,
    metadata: input.metadata ?? {},
  });
}
