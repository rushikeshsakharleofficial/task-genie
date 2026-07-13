import { pgEnum } from "drizzle-orm/pg-core";

export const workspaceRoleEnum = pgEnum("workspace_role", [
  "owner",
  "admin",
  "member",
  "guest",
]);

export const membershipStatusEnum = pgEnum("membership_status", [
  "active",
  "suspended",
]);

export const invitationStatusEnum = pgEnum("invitation_status", [
  "pending",
  "accepted",
  "revoked",
  "expired",
]);

export const projectVisibilityEnum = pgEnum("project_visibility", [
  "workspace",
  "private",
]);

export const taskPriorityEnum = pgEnum("task_priority", [
  "urgent",
  "high",
  "normal",
  "low",
  "none",
]);

export const taskTypeEnum = pgEnum("task_type", [
  "task",
  "bug",
  "feature",
  "improvement",
]);

export const dependencyTypeEnum = pgEnum("dependency_type", [
  "blocks",
  "relates_to",
  "duplicates",
]);

export const notificationTypeEnum = pgEnum("notification_type", [
  "assignment",
  "mention",
  "comment",
  "due_date",
  "invitation",
  "system",
]);

export const auditActionEnum = pgEnum("audit_action", [
  "create",
  "update",
  "delete",
  "restore",
  "invite",
  "join",
  "leave",
  "role_change",
  "login",
  "logout",
]);
