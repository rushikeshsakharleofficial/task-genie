import { and, eq, isNull, or } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import { db } from "../db/client.js";
import { projectMembers, projects, workspaceMembers } from "../db/schema/index.js";
import { requireSession } from "../plugins/auth-context.js";

export type WorkspaceRole = "owner" | "admin" | "member" | "guest";
export type Permission =
  | "workspace:read"
  | "workspace:manage"
  | "member:invite"
  | "member:manage"
  | "project:create"
  | "project:read"
  | "project:update"
  | "project:delete"
  | "task:create"
  | "task:read"
  | "task:update"
  | "task:delete"
  | "comment:create";

const permissionsByRole: Record<WorkspaceRole, ReadonlySet<Permission>> = {
  owner: new Set<Permission>([
    "workspace:read",
    "workspace:manage",
    "member:invite",
    "member:manage",
    "project:create",
    "project:read",
    "project:update",
    "project:delete",
    "task:create",
    "task:read",
    "task:update",
    "task:delete",
    "comment:create",
  ]),
  admin: new Set<Permission>([
    "workspace:read",
    "member:invite",
    "member:manage",
    "project:create",
    "project:read",
    "project:update",
    "project:delete",
    "task:create",
    "task:read",
    "task:update",
    "task:delete",
    "comment:create",
  ]),
  member: new Set<Permission>([
    "workspace:read",
    "project:create",
    "project:read",
    "project:update",
    "task:create",
    "task:read",
    "task:update",
    "comment:create",
  ]),
  guest: new Set<Permission>(["workspace:read", "project:read", "task:read", "comment:create"]),
};

export async function requireWorkspacePermission(
  request: FastifyRequest,
  workspaceId: string,
  permission: Permission,
): Promise<{ userId: string; role: WorkspaceRole }> {
  const session = requireSession(request);

  const [membership] = await db
    .select({ role: workspaceMembers.role, status: workspaceMembers.status })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, session.user.id),
      ),
    )
    .limit(1);

  if (!membership || membership.status !== "active") {
    throw request.server.httpErrors.forbidden("Workspace access denied");
  }

  if (!permissionsByRole[membership.role].has(permission)) {
    throw request.server.httpErrors.forbidden("Permission denied");
  }

  return { userId: session.user.id, role: membership.role };
}

export async function requireProjectPermission(
  request: FastifyRequest,
  workspaceId: string,
  projectId: string,
  permission: Permission,
): Promise<{ userId: string; role: WorkspaceRole }> {
  const access = await requireWorkspacePermission(request, workspaceId, permission);

  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .leftJoin(
      projectMembers,
      and(
        eq(projectMembers.projectId, projects.id),
        eq(projectMembers.userId, access.userId),
      ),
    )
    .where(
      and(
        eq(projects.id, projectId),
        eq(projects.workspaceId, workspaceId),
        isNull(projects.deletedAt),
        or(eq(projects.visibility, "workspace"), eq(projectMembers.userId, access.userId)),
      ),
    )
    .limit(1);

  if (!project) {
    throw request.server.httpErrors.notFound("Project not found or access denied");
  }

  return access;
}
