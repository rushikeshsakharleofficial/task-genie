import { and, desc, eq, isNull } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../../db/client.js";
import { contentItems, tasks } from "../../db/schema/index.js";
import { requireWorkspacePermission } from "../../lib/authorization.js";
import { requireTaskPermission } from "../../lib/task-access.js";

const workspaceParams = z.object({ workspaceId: z.string().uuid() });
const itemParams = z.object({ workspaceId: z.string().uuid(), contentId: z.string().uuid() });
const contentSchema = z.object({
  taskId: z.string().uuid().nullable().optional(),
  type: z.enum(["email", "social", "announcement"]).default("email"),
  title: z.string().trim().min(1).max(240),
  subject: z.string().trim().max(240).nullable().optional(),
  body: z.string().max(200_000).default(""),
  audience: z.record(z.string(), z.unknown()).default({}),
  status: z.enum(["draft", "scheduled", "sent", "failed"]).default("draft"),
  scheduledAt: z.iso.datetime().nullable().optional(),
});
const patchSchema = contentSchema.partial();

export async function registerContentRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/workspaces/:workspaceId/content", async (request) => {
    const { workspaceId } = workspaceParams.parse(request.params);
    await requireWorkspacePermission(request, workspaceId, "workspace:read");
    return db.select().from(contentItems).where(eq(contentItems.workspaceId, workspaceId)).orderBy(desc(contentItems.updatedAt)).limit(200);
  });

  app.post("/api/v1/workspaces/:workspaceId/content", async (request, reply) => {
    const { workspaceId } = workspaceParams.parse(request.params);
    const { userId } = await requireWorkspacePermission(request, workspaceId, "task:create");
    const input = contentSchema.parse(request.body);
    if (input.taskId) await requireTaskPermission(request, workspaceId, input.taskId, "task:read");
    const [created] = await db.insert(contentItems).values({
      workspaceId,
      creatorId: userId,
      taskId: input.taskId ?? null,
      type: input.type,
      title: input.title,
      subject: input.subject ?? null,
      body: input.body,
      audience: input.audience,
      status: input.status,
      scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
      sentAt: input.status === "sent" ? new Date() : null,
    }).returning();
    if (!created) throw new Error("Content item insert returned no row");
    await app.realtime.publish({ workspaceId, entityType: "content", entityId: created.id, action: created.status === "scheduled" ? "scheduled" : "created", actorId: userId });
    return reply.status(201).send(created);
  });

  app.patch("/api/v1/workspaces/:workspaceId/content/:contentId", async (request) => {
    const { workspaceId, contentId } = itemParams.parse(request.params);
    await requireWorkspacePermission(request, workspaceId, "task:update");
    const input = patchSchema.parse(request.body);
    if (input.taskId) await requireTaskPermission(request, workspaceId, input.taskId, "task:read");
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    for (const key of ["type", "title", "subject", "body", "audience", "status", "taskId"] as const) {
      if (input[key] !== undefined) patch[key] = input[key];
    }
    if (input.scheduledAt !== undefined) patch.scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
    if (input.status === "sent") patch.sentAt = new Date();
    const [updated] = await db.update(contentItems).set(patch).where(and(eq(contentItems.id, contentId), eq(contentItems.workspaceId, workspaceId))).returning();
    if (!updated) throw app.httpErrors.notFound("Content item not found");
    await app.realtime.publish({ workspaceId, entityType: "content", entityId: contentId, action: updated.status === "scheduled" ? "scheduled" : "updated" });
    return updated;
  });

  app.delete("/api/v1/workspaces/:workspaceId/content/:contentId", async (request, reply) => {
    const { workspaceId, contentId } = itemParams.parse(request.params);
    await requireWorkspacePermission(request, workspaceId, "task:delete");
    await db.delete(contentItems).where(and(eq(contentItems.id, contentId), eq(contentItems.workspaceId, workspaceId)));
    await app.realtime.publish({ workspaceId, entityType: "content", entityId: contentId, action: "deleted" });
    return reply.status(204).send();
  });
}
