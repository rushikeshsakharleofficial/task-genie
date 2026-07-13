import crypto from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../../db/client.js";
import {
  notifications,
  users,
  workspaceInvitations,
  workspaceMembers,
} from "../../db/schema/index.js";
import { requireWorkspacePermission } from "../../lib/authorization.js";
import { requireSession } from "../../plugins/auth-context.js";

const workspaceParams = z.object({ workspaceId: z.string().uuid() });
const memberParams = z.object({ workspaceId: z.string().uuid(), userId: z.string().uuid() });
const inviteSchema = z.object({
  email: z.string().trim().email().max(320).transform((value) => value.toLowerCase()),
  role: z.enum(["admin", "member", "guest"]).default("member"),
});
const updateMemberSchema = z.object({
  role: z.enum(["admin", "member", "guest"]).optional(),
  status: z.enum(["active", "suspended"]).optional(),
});
const acceptSchema = z.object({ token: z.string().min(32).max(256) });

const hashToken = (value: string) => crypto.createHash("sha256").update(value).digest("hex");

export async function registerMemberRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/workspaces/:workspaceId/members", async (request) => {
    const { workspaceId } = workspaceParams.parse(request.params);
    await requireWorkspacePermission(request, workspaceId, "workspace:read");
    return db
      .select({
        userId: users.id,
        name: users.name,
        email: users.email,
        image: users.image,
        role: workspaceMembers.role,
        status: workspaceMembers.status,
        joinedAt: workspaceMembers.joinedAt,
      })
      .from(workspaceMembers)
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .where(eq(workspaceMembers.workspaceId, workspaceId));
  });

  app.patch("/api/v1/workspaces/:workspaceId/members/:userId", async (request) => {
    const { workspaceId, userId } = memberParams.parse(request.params);
    const actor = await requireWorkspacePermission(request, workspaceId, "member:manage");
    const input = updateMemberSchema.parse(request.body);
    const [target] = await db.select({ role: workspaceMembers.role, status: workspaceMembers.status }).from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId))).limit(1);
    if (!target) throw app.httpErrors.notFound("Member not found");
    if (target.role === "owner") throw app.httpErrors.forbidden("Owner membership cannot be changed through this endpoint");
    if (actor.role === "admin" && target.role === "admin") throw app.httpErrors.forbidden("Admins cannot modify another admin");
    if (actor.userId === userId) throw app.httpErrors.badRequest("You cannot change your own membership here");
    const patch: { role?: "admin" | "member" | "guest"; status?: "active" | "suspended" } = {};
    if (input.role) patch.role = input.role;
    if (input.status) patch.status = input.status;
    const [updated] = await db
      .update(workspaceMembers)
      .set(patch)
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.userId, userId),
        ),
      )
      .returning();
    if (!updated) throw app.httpErrors.notFound("Member not found");
    await app.realtime.publish({ workspaceId, entityType: "member", entityId: userId, action: "updated", actorId: actor.userId });
    return updated;
  });

  app.delete("/api/v1/workspaces/:workspaceId/members/:userId", async (request, reply) => {
    const { workspaceId, userId } = memberParams.parse(request.params);
    const actor = await requireWorkspacePermission(request, workspaceId, "member:manage");
    if (actor.userId === userId) throw app.httpErrors.badRequest("You cannot remove your own membership here");
    const [target] = await db.select({ role: workspaceMembers.role }).from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId))).limit(1);
    if (!target) throw app.httpErrors.notFound("Member not found");
    if (target.role === "owner") throw app.httpErrors.forbidden("Owner membership cannot be removed");
    if (actor.role === "admin" && target.role === "admin") throw app.httpErrors.forbidden("Admins cannot remove another admin");
    await db
      .delete(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.userId, userId),
        ),
      );
    await app.realtime.publish({ workspaceId, entityType: "member", entityId: userId, action: "deleted", actorId: actor.userId });
    return reply.status(204).send();
  });

  app.get("/api/v1/workspaces/:workspaceId/invitations", async (request) => {
    const { workspaceId } = workspaceParams.parse(request.params);
    await requireWorkspacePermission(request, workspaceId, "member:invite");
    return db
      .select({
        id: workspaceInvitations.id,
        email: workspaceInvitations.email,
        role: workspaceInvitations.role,
        status: workspaceInvitations.status,
        expiresAt: workspaceInvitations.expiresAt,
        createdAt: workspaceInvitations.createdAt,
      })
      .from(workspaceInvitations)
      .where(eq(workspaceInvitations.workspaceId, workspaceId));
  });

  app.post("/api/v1/workspaces/:workspaceId/invitations", async (request, reply) => {
    const { workspaceId } = workspaceParams.parse(request.params);
    const { userId } = await requireWorkspacePermission(request, workspaceId, "member:invite");
    const input = inviteSchema.parse(request.body);
    const token = crypto.randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const [created] = await db
      .insert(workspaceInvitations)
      .values({
        workspaceId,
        email: input.email,
        role: input.role,
        tokenHash: hashToken(token),
        expiresAt,
        invitedBy: userId,
      })
      .returning({ id: workspaceInvitations.id, email: workspaceInvitations.email, role: workspaceInvitations.role, expiresAt: workspaceInvitations.expiresAt });
    if (!created) throw new Error("Invitation insert returned no row");

    const [target] = await db.select({ id: users.id }).from(users).where(eq(users.email, input.email)).limit(1);
    if (target) {
      await db.insert(notifications).values({
        workspaceId,
        userId: target.id,
        actorId: userId,
        type: "invitation",
        payload: { invitationId: created.id },
      });
    }
    await app.realtime.publish({ workspaceId, entityType: "member", entityId: created.id, action: "created", actorId: userId, payload: { invitation: true } });
    return reply.status(201).send({ ...created, token });
  });

  app.post("/api/v1/invitations/accept", async (request) => {
    const session = requireSession(request);
    const input = acceptSchema.parse(request.body);
    const [invitation] = await db
      .select()
      .from(workspaceInvitations)
      .where(
        and(
          eq(workspaceInvitations.tokenHash, hashToken(input.token)),
          eq(workspaceInvitations.status, "pending"),
          gt(workspaceInvitations.expiresAt, new Date()),
        ),
      )
      .limit(1);
    if (!invitation) throw app.httpErrors.badRequest("Invitation is invalid or expired");
    if (invitation.email.toLowerCase() !== session.user.email.toLowerCase()) {
      throw app.httpErrors.forbidden("Invitation email does not match signed-in user");
    }
    await db.transaction(async (tx) => {
      await tx
        .insert(workspaceMembers)
        .values({ workspaceId: invitation.workspaceId, userId: session.user.id, role: invitation.role, invitedBy: invitation.invitedBy })
        .onConflictDoUpdate({
          target: [workspaceMembers.workspaceId, workspaceMembers.userId],
          set: { role: invitation.role, status: "active", invitedBy: invitation.invitedBy },
        });
      await tx
        .update(workspaceInvitations)
        .set({ status: "accepted", acceptedBy: session.user.id, acceptedAt: new Date(), updatedAt: new Date() })
        .where(eq(workspaceInvitations.id, invitation.id));
    });
    await app.realtime.publish({ workspaceId: invitation.workspaceId, entityType: "member", entityId: session.user.id, action: "created", actorId: session.user.id });
    return { workspaceId: invitation.workspaceId };
  });
}
