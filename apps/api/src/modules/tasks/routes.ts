import { and, asc, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../../db/client.js";
import {
  activities,
  labels,
  notifications,
  projectMembers,
  projects,
  taskAssignees,
  taskLabels,
  tasks,
  users,
  workflowStatuses,
  workspaceMembers,
} from "../../db/schema/index.js";
import { requireProjectPermission, requireWorkspacePermission } from "../../lib/authorization.js";
import { requireTaskPermission } from "../../lib/task-access.js";

const workspaceParams = z.object({ workspaceId: z.string().uuid() });
const taskParams = z.object({ workspaceId: z.string().uuid(), taskId: z.string().uuid() });
const listQuerySchema = z.object({
  projectId: z.string().uuid().optional(),
  statusId: z.string().uuid().optional(),
  assigneeId: z.string().uuid().optional(),
  priority: z.enum(["urgent", "high", "normal", "low", "none"]).optional(),
  q: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  sort: z.enum(["position", "created", "updated", "due"]).default("position"),
  direction: z.enum(["asc", "desc"]).default("asc"),
});
const createTaskSchema = z.object({
  projectId: z.string().uuid(),
  parentTaskId: z.string().uuid().nullable().optional(),
  statusId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1).max(500),
  description: z.string().max(100_000).optional(),
  type: z.enum(["task", "bug", "feature", "improvement"]).default("task"),
  priority: z.enum(["urgent", "high", "normal", "low", "none"]).default("none"),
  estimateMinutes: z.number().int().min(0).max(1_000_000).nullable().optional(),
  startAt: z.iso.datetime().nullable().optional(),
  dueAt: z.iso.datetime().nullable().optional(),
  assigneeIds: z.array(z.string().uuid()).max(25).default([]),
  labelIds: z.array(z.string().uuid()).max(25).default([]),
});
const updateTaskSchema = createTaskSchema.omit({ projectId: true }).partial().extend({ completed: z.boolean().optional(), version: z.number().int().positive().optional() });

async function validateReferences(app: FastifyInstance, workspaceId: string, projectId: string, input: { statusId?: string | null | undefined; parentTaskId?: string | null | undefined; assigneeIds?: string[] | undefined; labelIds?: string[] | undefined }) {
  if (input.statusId) {
    const [status] = await db.select({ id: workflowStatuses.id }).from(workflowStatuses).where(and(eq(workflowStatuses.id, input.statusId), eq(workflowStatuses.workspaceId, workspaceId), eq(workflowStatuses.projectId, projectId))).limit(1);
    if (!status) throw app.httpErrors.badRequest("Status does not belong to this project");
  }
  if (input.parentTaskId) {
    const [parent] = await db.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.id, input.parentTaskId), eq(tasks.workspaceId, workspaceId), eq(tasks.projectId, projectId), isNull(tasks.deletedAt))).limit(1);
    if (!parent) throw app.httpErrors.badRequest("Parent task does not belong to this project");
  }
  if (input.assigneeIds?.length) {
    const members = await db.select({ id: workspaceMembers.userId }).from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.status, "active"), inArray(workspaceMembers.userId, input.assigneeIds)));
    if (members.length !== new Set(input.assigneeIds).size) throw app.httpErrors.badRequest("One or more assignees are not active workspace members");
  }
  if (input.labelIds?.length) {
    const valid = await db.select({ id: labels.id }).from(labels).where(and(eq(labels.workspaceId, workspaceId), inArray(labels.id, input.labelIds)));
    if (valid.length !== new Set(input.labelIds).size) throw app.httpErrors.badRequest("One or more labels do not belong to this workspace");
  }
}

async function enrichTasks(rows: Array<{ task: typeof tasks.$inferSelect; projectName: string; projectKey: string; projectColor: string | null; statusName: string | null; statusCategory: string | null; statusColor: string | null }>) {
  const ids = rows.map((row) => row.task.id);
  if (!ids.length) return [];
  const assignees = await db.select({ taskId: taskAssignees.taskId, userId: users.id, name: users.name, email: users.email, image: users.image }).from(taskAssignees).innerJoin(users, eq(users.id, taskAssignees.userId)).where(inArray(taskAssignees.taskId, ids));
  const taskLabelRows = await db.select({ taskId: taskLabels.taskId, id: labels.id, name: labels.name, color: labels.color }).from(taskLabels).innerJoin(labels, eq(labels.id, taskLabels.labelId)).where(inArray(taskLabels.taskId, ids));
  return rows.map((row) => ({
    ...row.task,
    projectName: row.projectName,
    projectKey: row.projectKey,
    projectColor: row.projectColor,
    statusName: row.statusName,
    statusCategory: row.statusCategory,
    statusColor: row.statusColor,
    assignees: assignees.filter((item) => item.taskId === row.task.id).map(({ taskId: _taskId, ...item }) => item),
    labels: taskLabelRows.filter((item) => item.taskId === row.task.id).map(({ taskId: _taskId, ...item }) => item),
  }));
}

export async function registerTaskRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/workspaces/:workspaceId/tasks", async (request) => {
    const { workspaceId } = workspaceParams.parse(request.params);
    const query = listQuerySchema.parse(request.query);
    const access = await requireWorkspacePermission(request, workspaceId, "task:read");
    if (query.projectId) await requireProjectPermission(request, workspaceId, query.projectId, "task:read");

    const conditions = [eq(tasks.workspaceId, workspaceId), isNull(tasks.deletedAt), isNull(projects.deletedAt), or(eq(projects.visibility, "workspace"), eq(projectMembers.userId, access.userId))];
    if (query.projectId) conditions.push(eq(tasks.projectId, query.projectId));
    if (query.statusId) conditions.push(eq(tasks.statusId, query.statusId));
    if (query.priority) conditions.push(eq(tasks.priority, query.priority));
    if (query.q) conditions.push(ilike(tasks.title, `%${query.q.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`));
    if (query.assigneeId) conditions.push(eq(taskAssignees.userId, query.assigneeId));

    const orderColumn = query.sort === "created" ? tasks.createdAt : query.sort === "updated" ? tasks.updatedAt : query.sort === "due" ? tasks.dueAt : tasks.position;
    const order = query.direction === "desc" ? desc(orderColumn) : asc(orderColumn);
    const base = db
      .select({ task: tasks, projectName: projects.name, projectKey: projects.key, projectColor: projects.color, statusName: workflowStatuses.name, statusCategory: workflowStatuses.category, statusColor: workflowStatuses.color })
      .from(tasks)
      .innerJoin(projects, eq(projects.id, tasks.projectId))
      .leftJoin(workflowStatuses, eq(workflowStatuses.id, tasks.statusId))
      .leftJoin(projectMembers, and(eq(projectMembers.projectId, projects.id), eq(projectMembers.userId, access.userId)))
      .leftJoin(taskAssignees, eq(taskAssignees.taskId, tasks.id))
      .where(and(...conditions));
    const rows = await base.orderBy(order, desc(tasks.createdAt)).limit(query.limit).offset(query.offset);
    const uniqueRows = [...new Map(rows.map((row) => [row.task.id, row])).values()];
    const countRows = await db.select({ id: tasks.id }).from(tasks).innerJoin(projects, eq(projects.id, tasks.projectId)).leftJoin(projectMembers, and(eq(projectMembers.projectId, projects.id), eq(projectMembers.userId, access.userId))).leftJoin(taskAssignees, eq(taskAssignees.taskId, tasks.id)).where(and(...conditions));
    return { items: await enrichTasks(uniqueRows), total: new Set(countRows.map((row) => row.id)).size, limit: query.limit, offset: query.offset };
  });

  app.get("/api/v1/workspaces/:workspaceId/tasks/:taskId", async (request) => {
    const { workspaceId, taskId } = taskParams.parse(request.params);
    await requireTaskPermission(request, workspaceId, taskId, "task:read");
    const rows = await db.select({ task: tasks, projectName: projects.name, projectKey: projects.key, projectColor: projects.color, statusName: workflowStatuses.name, statusCategory: workflowStatuses.category, statusColor: workflowStatuses.color }).from(tasks).innerJoin(projects, eq(projects.id, tasks.projectId)).leftJoin(workflowStatuses, eq(workflowStatuses.id, tasks.statusId)).where(eq(tasks.id, taskId)).limit(1);
    const [detail] = await enrichTasks(rows);
    if (!detail) throw app.httpErrors.notFound("Task not found");
    return detail;
  });

  app.post("/api/v1/workspaces/:workspaceId/tasks", async (request, reply) => {
    const { workspaceId } = workspaceParams.parse(request.params);
    const input = createTaskSchema.parse(request.body);
    const { userId } = await requireProjectPermission(request, workspaceId, input.projectId, "task:create");
    await validateReferences(app, workspaceId, input.projectId, input);
    const task = await db.transaction(async (tx) => {
      const [project] = await tx.update(projects).set({ taskCounter: sql`${projects.taskCounter} + 1`, updatedAt: new Date() }).where(and(eq(projects.id, input.projectId), eq(projects.workspaceId, workspaceId))).returning({ taskNumber: projects.taskCounter });
      if (!project) throw app.httpErrors.notFound("Project not found in this workspace");
      const [created] = await tx.insert(tasks).values({
        workspaceId,
        projectId: input.projectId,
        parentTaskId: input.parentTaskId ?? null,
        statusId: input.statusId ?? null,
        number: project.taskNumber,
        title: input.title,
        description: input.description ? { text: input.description } : null,
        type: input.type,
        priority: input.priority,
        estimateMinutes: input.estimateMinutes ?? null,
        startAt: input.startAt ? new Date(input.startAt) : null,
        dueAt: input.dueAt ? new Date(input.dueAt) : null,
        createdBy: userId,
        updatedBy: userId,
      }).returning();
      if (!created) throw new Error("Task insert returned no row");
      if (input.assigneeIds.length) {
        await tx.insert(taskAssignees).values(input.assigneeIds.map((assigneeId) => ({ taskId: created.id, userId: assigneeId, assignedBy: userId })));
        const recipients = input.assigneeIds.filter((assigneeId) => assigneeId !== userId);
        if (recipients.length) await tx.insert(notifications).values(recipients.map((assigneeId) => ({ workspaceId, userId: assigneeId, actorId: userId, taskId: created.id, type: "assignment" as const, payload: { title: created.title } })));
      }
      if (input.labelIds.length) await tx.insert(taskLabels).values(input.labelIds.map((labelId) => ({ taskId: created.id, labelId })));
      await tx.insert(activities).values({ workspaceId, actorId: userId, entityType: "task", entityId: created.id, action: "created", metadata: { title: created.title, projectId: created.projectId } });
      return created;
    });
    await app.realtime.publish({ workspaceId, taskId: task.id, entityType: "task", entityId: task.id, action: "created", visibility: "task_subscribers", actorId: userId, payload: { title: task.title, projectId: task.projectId } });
    return reply.status(201).send(task);
  });

  app.patch("/api/v1/workspaces/:workspaceId/tasks/:taskId", async (request) => {
    const { workspaceId, taskId } = taskParams.parse(request.params);
    const { userId, task } = await requireTaskPermission(request, workspaceId, taskId, "task:update");
    const input = updateTaskSchema.parse(request.body);
    await validateReferences(app, workspaceId, task.projectId, input);
    const updatedTask = await db.transaction(async (tx) => {
      const patch: Record<string, unknown> = { updatedAt: new Date(), updatedBy: userId, version: sql`${tasks.version} + 1` };
      for (const key of ["title", "type", "priority", "estimateMinutes", "parentTaskId", "statusId"] as const) if (input[key] !== undefined) patch[key] = input[key];
      if (input.description !== undefined) patch.description = input.description ? { text: input.description } : null;
      if (input.startAt !== undefined) patch.startAt = input.startAt ? new Date(input.startAt) : null;
      if (input.dueAt !== undefined) patch.dueAt = input.dueAt ? new Date(input.dueAt) : null;
      if (input.completed !== undefined) patch.completedAt = input.completed ? new Date() : null;
      const conditions = [eq(tasks.id, taskId), eq(tasks.workspaceId, workspaceId), isNull(tasks.deletedAt)];
      if (input.version) conditions.push(eq(tasks.version, input.version));
      const [updated] = await tx.update(tasks).set(patch).where(and(...conditions)).returning();
      if (!updated) throw app.httpErrors.conflict("Task was changed by another request; refresh and retry");
      if (input.assigneeIds !== undefined) {
        await tx.delete(taskAssignees).where(eq(taskAssignees.taskId, taskId));
        if (input.assigneeIds.length) {
          await tx.insert(taskAssignees).values(input.assigneeIds.map((assigneeId) => ({ taskId, userId: assigneeId, assignedBy: userId })));
          const recipients = input.assigneeIds.filter((assigneeId) => assigneeId !== userId);
          if (recipients.length) await tx.insert(notifications).values(recipients.map((assigneeId) => ({ workspaceId, userId: assigneeId, actorId: userId, taskId, type: "assignment" as const, payload: { title: updated.title } })));
        }
      }
      if (input.labelIds !== undefined) {
        await tx.delete(taskLabels).where(eq(taskLabels.taskId, taskId));
        if (input.labelIds.length) await tx.insert(taskLabels).values(input.labelIds.map((labelId) => ({ taskId, labelId })));
      }
      await tx.insert(activities).values({ workspaceId, actorId: userId, entityType: "task", entityId: taskId, action: "updated", metadata: { title: updated.title } });
      return updated;
    });
    await app.realtime.publish({ workspaceId, taskId, entityType: "task", entityId: taskId, action: "updated", visibility: "task_subscribers", actorId: userId, payload: { title: updatedTask.title, version: updatedTask.version } });
    return updatedTask;
  });

  app.delete("/api/v1/workspaces/:workspaceId/tasks/:taskId", async (request, reply) => {
    const { workspaceId, taskId } = taskParams.parse(request.params);
    const { userId } = await requireTaskPermission(request, workspaceId, taskId, "task:delete");
    await db.update(tasks).set({ deletedAt: new Date(), updatedAt: new Date(), updatedBy: userId }).where(and(eq(tasks.id, taskId), eq(tasks.workspaceId, workspaceId)));
    await app.realtime.publish({ workspaceId, taskId, entityType: "task", entityId: taskId, action: "deleted", visibility: "task_subscribers", actorId: userId });
    return reply.status(204).send();
  });
}
