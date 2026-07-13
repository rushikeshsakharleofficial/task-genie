import { and, desc, eq, isNull } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../../db/client.js";
import { activities, workspaceMembers, workspaces } from "../../db/schema/index.js";
import { requireWorkspacePermission } from "../../lib/authorization.js";
import { toSlug } from "../../lib/slug.js";
import { requireSession } from "../../plugins/auth-context.js";

const createWorkspaceSchema = z.object({ name: z.string().trim().min(2).max(120), slug: z.string().trim().min(2).max(80).optional() });
const updateWorkspaceSchema = z.object({ name: z.string().trim().min(2).max(120).optional(), logoUrl: z.string().url().nullable().optional(), settings: z.record(z.string(), z.unknown()).optional() });
const params = z.object({ workspaceId: z.string().uuid() });

export async function registerWorkspaceRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/workspaces", async (request) => {
    const session = requireSession(request);
    return db.select({ id: workspaces.id, name: workspaces.name, slug: workspaces.slug, logoUrl: workspaces.logoUrl, settings: workspaces.settings, role: workspaceMembers.role, createdAt: workspaces.createdAt }).from(workspaceMembers).innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId)).where(and(eq(workspaceMembers.userId, session.user.id), eq(workspaceMembers.status, "active"), isNull(workspaces.deletedAt)));
  });

  app.get("/api/v1/workspaces/:workspaceId", async (request) => {
    const { workspaceId } = params.parse(request.params);
    const access = await requireWorkspacePermission(request, workspaceId, "workspace:read");
    const [workspace] = await db.select().from(workspaces).where(and(eq(workspaces.id, workspaceId), isNull(workspaces.deletedAt))).limit(1);
    if (!workspace) throw app.httpErrors.notFound("Workspace not found");
    return { ...workspace, role: access.role };
  });

  app.post("/api/v1/workspaces", async (request, reply) => {
    const session = requireSession(request);
    const input = createWorkspaceSchema.parse(request.body);
    const baseSlug = toSlug(input.slug ?? input.name);
    if (!baseSlug) throw app.httpErrors.badRequest("Workspace slug is invalid");
    const result = await db.transaction(async (tx) => {
      let slug = baseSlug;
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const [existing] = await tx.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.slug, slug)).limit(1);
        if (!existing) break;
        slug = `${baseSlug}-${crypto.randomUUID().slice(0, 6)}`;
      }
      const [workspace] = await tx.insert(workspaces).values({ name: input.name, slug, createdBy: session.user.id }).returning();
      if (!workspace) throw new Error("Workspace insert returned no row");
      await tx.insert(workspaceMembers).values({ workspaceId: workspace.id, userId: session.user.id, role: "owner", status: "active" });
      await tx.insert(activities).values({ workspaceId: workspace.id, actorId: session.user.id, entityType: "workspace", entityId: workspace.id, action: "created", metadata: { name: workspace.name } });
      return workspace;
    });
    return reply.status(201).send(result);
  });

  app.patch("/api/v1/workspaces/:workspaceId", async (request) => {
    const { workspaceId } = params.parse(request.params);
    await requireWorkspacePermission(request, workspaceId, "workspace:manage");
    const input = updateWorkspaceSchema.parse(request.body);
    const patch: { name?: string; logoUrl?: string | null; settings?: Record<string, unknown>; updatedAt: Date } = { updatedAt: new Date() };
    if (input.name !== undefined) patch.name = input.name;
    if (input.logoUrl !== undefined) patch.logoUrl = input.logoUrl;
    if (input.settings !== undefined) patch.settings = input.settings;
    const [updated] = await db.update(workspaces).set(patch).where(and(eq(workspaces.id, workspaceId), isNull(workspaces.deletedAt))).returning();
    if (!updated) throw app.httpErrors.notFound("Workspace not found");
    return updated;
  });

  app.get("/api/v1/workspaces/:workspaceId/activity", async (request) => {
    const { workspaceId } = params.parse(request.params);
    await requireWorkspacePermission(request, workspaceId, "workspace:read");
    return db.select().from(activities).where(eq(activities.workspaceId, workspaceId)).orderBy(desc(activities.createdAt)).limit(100);
  });
}
