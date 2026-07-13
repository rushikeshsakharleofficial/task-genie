import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../../db/client.js";
import {
  checklistItems,
  checklists,
  comments,
  notifications,
  taskAssignees,
  users,
} from "../../db/schema/index.js";
import { requireTaskPermission } from "../../lib/task-access.js";
import { requireWorkspacePermission } from "../../lib/authorization.js";
import { requireSession } from "../../plugins/auth-context.js";

const taskParams = z.object({ workspaceId: z.string().uuid(), taskId: z.string().uuid() });
const checklistParams = z.object({ workspaceId: z.string().uuid(), taskId: z.string().uuid(), checklistId: z.string().uuid() });
const itemParams = z.object({ workspaceId: z.string().uuid(), taskId: z.string().uuid(), itemId: z.string().uuid() });
const commentSchema = z.object({ body: z.string().trim().min(1).max(20_000) });
const checklistSchema = z.object({ title: z.string().trim().min(1).max(200).default("Checklist") });
const itemSchema = z.object({ content: z.string().trim().min(1).max(500) });
const itemPatchSchema = z.object({ content: z.string().trim().min(1).max(500).optional(), isCompleted: z.boolean().optional() });

export async function registerCollaborationRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/workspaces/:workspaceId/tasks/:taskId/comments", async (request) => {
    const { workspaceId, taskId } = taskParams.parse(request.params);
    await requireTaskPermission(request, workspaceId, taskId, "task:read");
    return db
      .select({ id: comments.id, taskId: comments.taskId, body: comments.body, editedAt: comments.editedAt, createdAt: comments.createdAt, authorId: users.id, authorName: users.name, authorImage: users.image })
      .from(comments)
      .innerJoin(users, eq(users.id, comments.authorId))
      .where(and(eq(comments.taskId, taskId), isNull(comments.deletedAt)))
      .orderBy(asc(comments.createdAt));
  });

  app.post("/api/v1/workspaces/:workspaceId/tasks/:taskId/comments", async (request, reply) => {
    const { workspaceId, taskId } = taskParams.parse(request.params);
    const { userId } = await requireTaskPermission(request, workspaceId, taskId, "comment:create");
    const input = commentSchema.parse(request.body);
    const [created] = await db.insert(comments).values({ workspaceId, taskId, authorId: userId, body: { text: input.body } }).returning();
    if (!created) throw new Error("Comment insert returned no row");
    const recipients = (await db.select({ userId: taskAssignees.userId }).from(taskAssignees).where(eq(taskAssignees.taskId, taskId))).map((row) => row.userId).filter((id) => id !== userId);
    if (recipients.length) await db.insert(notifications).values(recipients.map((recipientId) => ({ workspaceId, userId: recipientId, actorId: userId, taskId, type: "comment" as const, payload: { commentId: created.id } })));
    await app.realtime.publish({ workspaceId, taskId, entityType: "comment", entityId: created.id, action: "created", visibility: "task_subscribers", actorId: userId, payload: { authorName: request.authSession?.user.name } });
    return reply.status(201).send(created);
  });

  app.delete("/api/v1/workspaces/:workspaceId/tasks/:taskId/comments/:commentId", async (request, reply) => {
    const params = taskParams.extend({ commentId: z.string().uuid() }).parse(request.params);
    const session = requireSession(request);
    await requireTaskPermission(request, params.workspaceId, params.taskId, "comment:create");
    const [comment] = await db.select({ authorId: comments.authorId }).from(comments).where(and(eq(comments.id, params.commentId), eq(comments.taskId, params.taskId))).limit(1);
    if (!comment) throw app.httpErrors.notFound("Comment not found");
    if (comment.authorId !== session.user.id) {
      const membership = await requireWorkspacePermission(request, params.workspaceId, "member:manage").catch(() => null);
      if (!membership) throw app.httpErrors.forbidden("Only the author or an admin can delete this comment");
    }
    await db.update(comments).set({ deletedAt: new Date(), editedAt: new Date() }).where(eq(comments.id, params.commentId));
    await app.realtime.publish({ workspaceId: params.workspaceId, taskId: params.taskId, entityType: "comment", entityId: params.commentId, action: "deleted", visibility: "task_subscribers", actorId: session.user.id });
    return reply.status(204).send();
  });

  app.get("/api/v1/workspaces/:workspaceId/tasks/:taskId/checklists", async (request) => {
    const { workspaceId, taskId } = taskParams.parse(request.params);
    await requireTaskPermission(request, workspaceId, taskId, "task:read");
    const lists = await db.select().from(checklists).where(eq(checklists.taskId, taskId)).orderBy(asc(checklists.position));
    const ids = lists.map((list) => list.id);
    const items = ids.length
      ? await db.select().from(checklistItems).where(inArray(checklistItems.checklistId, ids)).orderBy(asc(checklistItems.position))
      : [];
    return lists.map((list) => ({ ...list, items: items.filter((item) => item.checklistId === list.id) }));
  });

  app.post("/api/v1/workspaces/:workspaceId/tasks/:taskId/checklists", async (request, reply) => {
    const { workspaceId, taskId } = taskParams.parse(request.params);
    const { userId } = await requireTaskPermission(request, workspaceId, taskId, "task:update");
    const input = checklistSchema.parse(request.body ?? {});
    const [created] = await db.insert(checklists).values({ workspaceId, taskId, title: input.title }).returning();
    if (!created) throw new Error("Checklist insert returned no row");
    await app.realtime.publish({ workspaceId, taskId, entityType: "checklist", entityId: created.id, action: "created", visibility: "task_subscribers", actorId: userId });
    return reply.status(201).send(created);
  });

  app.delete("/api/v1/workspaces/:workspaceId/tasks/:taskId/checklists/:checklistId", async (request, reply) => {
    const { workspaceId, taskId, checklistId } = checklistParams.parse(request.params);
    const { userId } = await requireTaskPermission(request, workspaceId, taskId, "task:update");
    const [deleted] = await db.delete(checklists).where(and(eq(checklists.id, checklistId), eq(checklists.taskId, taskId), eq(checklists.workspaceId, workspaceId))).returning({ id: checklists.id });
    if (!deleted) throw app.httpErrors.notFound("Checklist not found");
    await app.realtime.publish({ workspaceId, taskId, entityType: "checklist", entityId: checklistId, action: "deleted", visibility: "task_subscribers", actorId: userId });
    return reply.status(204).send();
  });

  app.post("/api/v1/workspaces/:workspaceId/tasks/:taskId/checklists/:checklistId/items", async (request, reply) => {
    const { workspaceId, taskId, checklistId } = checklistParams.parse(request.params);
    const { userId } = await requireTaskPermission(request, workspaceId, taskId, "task:update");
    const [list] = await db.select({ id: checklists.id }).from(checklists).where(and(eq(checklists.id, checklistId), eq(checklists.taskId, taskId))).limit(1);
    if (!list) throw app.httpErrors.notFound("Checklist not found");
    const input = itemSchema.parse(request.body);
    const [created] = await db.insert(checklistItems).values({ checklistId, content: input.content }).returning();
    if (!created) throw new Error("Checklist item insert returned no row");
    await app.realtime.publish({ workspaceId, taskId, entityType: "checklist_item", entityId: created.id, action: "created", visibility: "task_subscribers", actorId: userId, payload: { checklistId } });
    return reply.status(201).send(created);
  });

  app.patch("/api/v1/workspaces/:workspaceId/tasks/:taskId/checklist-items/:itemId", async (request) => {
    const { workspaceId, taskId, itemId } = itemParams.parse(request.params);
    const { userId } = await requireTaskPermission(request, workspaceId, taskId, "task:update");
    const input = itemPatchSchema.parse(request.body);
    const patch: { content?: string; isCompleted?: boolean; completedBy?: string | null; completedAt?: Date | null; updatedAt: Date } = { updatedAt: new Date() };
    if (input.content !== undefined) patch.content = input.content;
    if (input.isCompleted !== undefined) {
      patch.isCompleted = input.isCompleted;
      patch.completedBy = input.isCompleted ? userId : null;
      patch.completedAt = input.isCompleted ? new Date() : null;
    }
    const [updated] = await db
      .update(checklistItems)
      .set(patch)
      .where(
        and(
          eq(checklistItems.id, itemId),
          sql`exists (select 1 from ${checklists} where ${checklists.id} = ${checklistItems.checklistId} and ${checklists.taskId} = ${taskId})`,
        ),
      )
      .returning();
    if (!updated) throw app.httpErrors.notFound("Checklist item not found");
    await app.realtime.publish({ workspaceId, taskId, entityType: "checklist_item", entityId: itemId, action: "updated", visibility: "task_subscribers", actorId: userId, payload: { isCompleted: updated.isCompleted } });
    return updated;
  });

  app.delete("/api/v1/workspaces/:workspaceId/tasks/:taskId/checklist-items/:itemId", async (request, reply) => {
    const { workspaceId, taskId, itemId } = itemParams.parse(request.params);
    const { userId } = await requireTaskPermission(request, workspaceId, taskId, "task:update");
    const [deleted] = await db.delete(checklistItems).where(and(eq(checklistItems.id, itemId), sql`exists (select 1 from ${checklists} where ${checklists.id} = ${checklistItems.checklistId} and ${checklists.taskId} = ${taskId} and ${checklists.workspaceId} = ${workspaceId})`)).returning({ id: checklistItems.id });
    if (!deleted) throw app.httpErrors.notFound("Checklist item not found");
    await app.realtime.publish({ workspaceId, taskId, entityType: "checklist_item", entityId: itemId, action: "deleted", visibility: "task_subscribers", actorId: userId });
    return reply.status(204).send();
  });

  app.get("/api/v1/workspaces/:workspaceId/notifications", async (request) => {
    const { workspaceId } = z.object({ workspaceId: z.string().uuid() }).parse(request.params);
    const session = requireSession(request);
    await requireWorkspacePermission(request, workspaceId, "workspace:read");
    return db.select().from(notifications).where(and(eq(notifications.workspaceId, workspaceId), eq(notifications.userId, session.user.id))).orderBy(desc(notifications.createdAt)).limit(100);
  });

  app.patch("/api/v1/workspaces/:workspaceId/notifications/:notificationId/read", async (request) => {
    const { workspaceId, notificationId } = z.object({ workspaceId: z.string().uuid(), notificationId: z.string().uuid() }).parse(request.params);
    const session = requireSession(request);
    await requireWorkspacePermission(request, workspaceId, "workspace:read");
    const [updated] = await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.id, notificationId), eq(notifications.workspaceId, workspaceId), eq(notifications.userId, session.user.id))).returning({ id: notifications.id });
    if (!updated) throw app.httpErrors.notFound("Notification not found");
    await app.realtime.publish({ workspaceId, entityType: "notification", entityId: session.user.id, action: "read", actorId: session.user.id });
    return { ok: true };
  });

  app.patch("/api/v1/workspaces/:workspaceId/notifications/read-all", async (request) => {
    const { workspaceId } = z.object({ workspaceId: z.string().uuid() }).parse(request.params);
    const session = requireSession(request);
    await requireWorkspacePermission(request, workspaceId, "workspace:read");
    await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.workspaceId, workspaceId), eq(notifications.userId, session.user.id), isNull(notifications.readAt)));
    await app.realtime.publish({ workspaceId, entityType: "notification", entityId: session.user.id, action: "read", actorId: session.user.id, payload: { all: true } });
    return { ok: true };
  });
}
