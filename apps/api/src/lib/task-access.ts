import { and, eq, isNull } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import { db } from "../db/client.js";
import { tasks } from "../db/schema/index.js";
import { requireProjectPermission, type Permission } from "./authorization.js";

export async function requireTaskPermission(
  request: FastifyRequest,
  workspaceId: string,
  taskId: string,
  permission: Permission,
) {
  const [task] = await db
    .select({ id: tasks.id, projectId: tasks.projectId, workspaceId: tasks.workspaceId })
    .from(tasks)
    .where(
      and(
        eq(tasks.id, taskId),
        eq(tasks.workspaceId, workspaceId),
        isNull(tasks.deletedAt),
      ),
    )
    .limit(1);

  if (!task) {
    throw request.server.httpErrors.notFound("Task not found");
  }

  const access = await requireProjectPermission(
    request,
    workspaceId,
    task.projectId,
    permission,
  );
  return { ...access, task };
}
