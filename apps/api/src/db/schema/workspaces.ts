import { relations } from "drizzle-orm";
import {
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { users } from "./auth.js";
import {
  invitationStatusEnum,
  membershipStatusEnum,
  workspaceRoleEnum,
} from "./enums.js";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const workspaces = pgTable(
  "workspaces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 120 }).notNull(),
    slug: varchar("slug", { length: 80 }).notNull(),
    logoUrl: text("logo_url"),
    settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [uniqueIndex("workspace_slug_unique").on(table.slug)],
);

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: workspaceRoleEnum("role").notNull().default("member"),
    status: membershipStatusEnum("status").notNull().default("active"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
    invitedBy: uuid("invited_by").references(() => users.id, { onDelete: "set null" }),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.userId] }),
    index("workspace_members_user_idx").on(table.userId),
    index("workspace_members_workspace_role_idx").on(table.workspaceId, table.role),
  ],
);

export const workspaceInvitations = pgTable(
  "workspace_invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 320 }).notNull(),
    role: workspaceRoleEnum("role").notNull().default("member"),
    tokenHash: varchar("token_hash", { length: 128 }).notNull(),
    status: invitationStatusEnum("status").notNull().default("pending"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    invitedBy: uuid("invited_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    acceptedBy: uuid("accepted_by").references(() => users.id, { onDelete: "set null" }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("workspace_invitation_token_unique").on(table.tokenHash),
    index("workspace_invitation_email_idx").on(table.workspaceId, table.email),
    index("workspace_invitation_status_idx").on(table.workspaceId, table.status),
  ],
);

export const teams = pgTable(
  "teams",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 100 }).notNull(),
    key: varchar("key", { length: 12 }).notNull(),
    description: text("description"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("team_workspace_key_unique").on(table.workspaceId, table.key),
    index("team_workspace_idx").on(table.workspaceId),
  ],
);

export const teamMembers = pgTable(
  "team_members",
  {
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.teamId, table.userId] }),
    index("team_members_user_idx").on(table.userId),
  ],
);

export const workspacesRelations = relations(workspaces, ({ one, many }) => ({
  creator: one(users, { fields: [workspaces.createdBy], references: [users.id] }),
  members: many(workspaceMembers),
  invitations: many(workspaceInvitations),
  teams: many(teams),
}));

export const workspaceMembersRelations = relations(workspaceMembers, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [workspaceMembers.workspaceId],
    references: [workspaces.id],
  }),
  user: one(users, {
    fields: [workspaceMembers.userId],
    references: [users.id],
    relationName: "workspace_member_user",
  }),
  inviter: one(users, {
    fields: [workspaceMembers.invitedBy],
    references: [users.id],
    relationName: "workspace_member_inviter",
  }),
}));

export const teamsRelations = relations(teams, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [teams.workspaceId], references: [workspaces.id] }),
  members: many(teamMembers),
}));
