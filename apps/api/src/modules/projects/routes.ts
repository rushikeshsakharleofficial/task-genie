import { and, asc, eq, isNull, or } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../../db/client.js";
import {
  labels,
  projectMembers,
  projects,
  taskAssignees,
  tasks,
  users,
  workspaceMembers,
  workflowStatuses,
} from "../../db/schema/index.js";
import { requireProjectPermission, requireWorkspacePermission } from "../../lib/authorization.js";

const workspaceParams = z.object({ workspaceId: z.string().uuid() });
const projectParams = z.object({ workspaceId: z.string().uuid(), projectId: z.string().uuid() });
const createProjectSchema = z.object({
  name: z.string().trim().min(2).max(160),
  key: z.string().trim().min(2).max(12).regex(/^[A-Za-z][A-Za-z0-9]*$/),
  description: z.string().max(10_000).optional(),
  visibility: z.enum(["workspace", "private"]).default("workspace"),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});
const updateProjectSchema = createProjectSchema.partial().omit({ key: true }).extend({ archived: z.boolean().optional() });
const labelSchema = z.object({ name: z.string().trim().min(1).max(80), color: z.string().regex(/^#[0-9a-fA-F]{6}$/), description: z.string().max(1000).optional() });
const projectMemberSchema = z.object({ userId: z.string().uuid() });

export async function registerProjectRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/workspaces/:workspaceId/projects", async (request) => {
    const { workspaceId } = workspaceParams.parse(request.params);
    await requireWorkspacePermission(request, workspaceId, "project:read");
    const session = request.authSession!;
    const projectRows = await db
      .select({ project: projects })
      .from(projects)
      .leftJoin(projectMembers, and(eq(projectMembers.projectId, projects.id), eq(projectMembers.userId, session.user.id)))
      .where(and(eq(projects.workspaceId, workspaceId), isNull(projects.deletedAt), or(eq(projects.visibility, "workspace"), eq(projectMembers.userId, session.user.id))))
      .orderBy(asc(projects.name));

    const taskRows = await db.select({ projectId: tasks.projectId, completedAt: tasks.completedAt }).from(tasks).where(and(eq(tasks.workspaceId, workspaceId), isNull(tasks.deletedAt)));
    return projectRows.map(({ project }) => {
      const projectTasks = taskRows.filter((task) => task.projectId === project.id);
      return {
        ...project,
        taskCount: projectTasks.length,
        completedTaskCount: projectTasks.filter((task) => task.completedAt).length,
      };
    });
  });

  app.get("/api/v1/workspaces/:workspaceId/projects/:projectId", async (request) => {
    const { workspaceId, projectId } = projectParams.parse(request.params);
    await requireProjectPermission(request, workspaceId, projectId, "project:read");
    const [project] = await db.select().from(projects).where(and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId), isNull(projects.deletedAt))).limit(1);
    if (!project) throw app.httpErrors.notFound("Project not found");
    const statuses = await db.select().from(workflowStatuses).where(eq(workflowStatuses.projectId, projectId)).orderBy(asc(workflowStatuses.position));
    return { ...project, statuses };
  });

  app.post("/api/v1/workspaces/:workspaceId/projects", async (request, reply) => {
    const { workspaceId } = workspaceParams.parse(request.params);
    const { userId } = await requireWorkspacePermission(request, workspaceId, "project:create");
    const input = createProjectSchema.parse(request.body);
    const project = await db.transaction(async (tx) => {
      const [created] = await tx.insert(projects).values({
        workspaceId,
        name: input.name,
        key: input.key.toUpperCase(),
        description: input.description,
        visibility: input.visibility,
        color: input.color ?? "#6d4aff",
        createdBy: userId,
      }).returning();
      if (!created) throw new Error("Project insert returned no row");
      if (created.visibility === "private") await tx.insert(projectMembers).values({ projectId: created.id, userId });
      await tx.insert(workflowStatuses).values([
        { workspaceId, projectId: created.id, name: "Backlog", category: "backlog", position: 1000, color: "#94a3b8", isDefault: true },
        { workspaceId, projectId: created.id, name: "To Do", category: "unstarted", position: 2000, color: "#3b82f6" },
        { workspaceId, projectId: created.id, name: "In Progress", category: "started", position: 3000, color: "#f59e0b" },
        { workspaceId, projectId: created.id, name: "Review", category: "started", position: 3500, color: "#8b5cf6" },
        { workspaceId, projectId: created.id, name: "Done", category: "completed", position: 4000, color: "#22c55e" },
      ]);
      return created;
    });
    await app.realtime.publish({ workspaceId, entityType: "workspace", entityId: workspaceId, action: "updated", actorId: userId, payload: { reason: "projects_changed" } });
    return reply.status(201).send(project);
  });

  app.patch("/api/v1/workspaces/:workspaceId/projects/:projectId", async (request) => {
    const { workspaceId, projectId } = projectParams.parse(request.params);
    const access = await requireProjectPermission(request, workspaceId, projectId, "project:update");
    const input = updateProjectSchema.parse(request.body);
    if (input.visibility !== undefined && access.role === "member") throw app.httpErrors.forbidden("Only owners and admins can change project visibility");
    const patch: { name?: string; description?: string | null; visibility?: "workspace" | "private"; color?: string; archivedAt?: Date | null; updatedAt: Date } = { updatedAt: new Date() };
    if (input.name !== undefined) patch.name = input.name;
    if (input.description !== undefined) patch.description = input.description;
    if (input.visibility !== undefined) patch.visibility = input.visibility;
    if (input.color !== undefined) patch.color = input.color;
    if (input.archived !== undefined) patch.archivedAt = input.archived ? new Date() : null;
    const updated = await db.transaction(async (tx) => {
      const [row] = await tx.update(projects).set(patch).where(and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId), isNull(projects.deletedAt))).returning();
      if (!row) throw app.httpErrors.notFound("Project not found");
      if (input.visibility === "private") await tx.insert(projectMembers).values({ projectId, userId: access.userId }).onConflictDoNothing();
      return row;
    });
    await app.realtime.publish({ workspaceId, entityType: "workspace", entityId: workspaceId, action: input.archived ? "archived" : "updated", actorId: access.userId, payload: { reason: "projects_changed" } });
    return updated;
  });

  app.get("/api/v1/workspaces/:workspaceId/projects/:projectId/members", async (request) => {
    const { workspaceId, projectId } = projectParams.parse(request.params);
    await requireProjectPermission(request, workspaceId, projectId, "project:read");
    return db.select({ userId: users.id, name: users.name, email: users.email, image: users.image, createdAt: projectMembers.createdAt }).from(projectMembers).innerJoin(users, eq(users.id, projectMembers.userId)).where(eq(projectMembers.projectId, projectId));
  });

  app.post("/api/v1/workspaces/:workspaceId/projects/:projectId/members", async (request, reply) => {
    const { workspaceId, projectId } = projectParams.parse(request.params);
    const access = await requireProjectPermission(request, workspaceId, projectId, "project:update");
    if (access.role === "member") throw app.httpErrors.forbidden("Only owners and admins can manage private-project members");
    const { userId } = projectMemberSchema.parse(request.body);
    const [member] = await db.select({ userId: workspaceMembers.userId }).from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId), eq(workspaceMembers.status, "active"))).limit(1);
    if (!member) throw app.httpErrors.badRequest("User is not an active workspace member");
    await db.insert(projectMembers).values({ projectId, userId }).onConflictDoNothing();
    await app.realtime.publish({ workspaceId, entityType: "workspace", entityId: workspaceId, action: "updated", actorId: access.userId, payload: { reason: "project_members_changed" } });
    return reply.status(201).send({ projectId, userId });
  });

  app.delete("/api/v1/workspaces/:workspaceId/projects/:projectId/members/:userId", async (request, reply) => {
    const { workspaceId, projectId, userId } = projectParams.extend({ userId: z.string().uuid() }).parse(request.params);
    const access = await requireProjectPermission(request, workspaceId, projectId, "project:update");
    if (access.role === "member") throw app.httpErrors.forbidden("Only owners and admins can manage private-project members");
    if (access.userId === userId) throw app.httpErrors.badRequest("You cannot remove yourself from a private project here");
    await db.delete(projectMembers).where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)));
    await app.realtime.publish({ workspaceId, entityType: "workspace", entityId: workspaceId, action: "updated", actorId: access.userId, payload: { reason: "project_members_changed" } });
    return reply.status(204).send();
  });

  app.delete("/api/v1/workspaces/:workspaceId/projects/:projectId", async (request, reply) => {
    const { workspaceId, projectId } = projectParams.parse(request.params);
    const { userId } = await requireProjectPermission(request, workspaceId, projectId, "project:delete");
    await db.update(projects).set({ deletedAt: new Date(), updatedAt: new Date() }).where(and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId)));
    await app.realtime.publish({ workspaceId, entityType: "workspace", entityId: workspaceId, action: "updated", actorId: userId, payload: { reason: "projects_changed" } });
    return reply.status(204).send();
  });

  app.get("/api/v1/workspaces/:workspaceId/projects/:projectId/statuses", async (request) => {
    const { workspaceId, projectId } = projectParams.parse(request.params);
    await requireProjectPermission(request, workspaceId, projectId, "project:read");
    return db.select().from(workflowStatuses).where(and(eq(workflowStatuses.workspaceId, workspaceId), eq(workflowStatuses.projectId, projectId))).orderBy(asc(workflowStatuses.position));
  });

  app.get("/api/v1/workspaces/:workspaceId/labels", async (request) => {
    const { workspaceId } = workspaceParams.parse(request.params);
    await requireWorkspacePermission(request, workspaceId, "workspace:read");
    return db.select().from(labels).where(eq(labels.workspaceId, workspaceId)).orderBy(asc(labels.name));
  });

  app.post("/api/v1/workspaces/:workspaceId/labels", async (request, reply) => {
    const { workspaceId } = workspaceParams.parse(request.params);
    const { userId } = await requireWorkspacePermission(request, workspaceId, "project:update");
    const input = labelSchema.parse(request.body);
    const [created] = await db.insert(labels).values({ workspaceId, ...input }).returning();
    if (!created) throw new Error("Label insert returned no row");
    await app.realtime.publish({ workspaceId, entityType: "workspace", entityId: workspaceId, action: "updated", actorId: userId, payload: { reason: "labels_changed" } });
    return reply.status(201).send(created);
  });
}
