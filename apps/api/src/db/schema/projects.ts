import { relations } from "drizzle-orm";
import {
  index,
  boolean,
  integer,
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
import { projectVisibilityEnum } from "./enums.js";
import { teams, workspaces } from "./workspaces.js";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    teamId: uuid("team_id").references(() => teams.id, { onDelete: "set null" }),
    name: varchar("name", { length: 160 }).notNull(),
    key: varchar("key", { length: 12 }).notNull(),
    description: text("description"),
    icon: varchar("icon", { length: 32 }),
    color: varchar("color", { length: 16 }),
    visibility: projectVisibilityEnum("visibility").notNull().default("workspace"),
    taskCounter: integer("task_counter").notNull().default(0),
    settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("project_workspace_key_unique").on(table.workspaceId, table.key),
    index("project_workspace_idx").on(table.workspaceId),
    index("project_team_idx").on(table.teamId),
  ],
);

export const projectMembers = pgTable(
  "project_members",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.userId] }),
    index("project_members_user_idx").on(table.userId),
  ],
);

export const workflowStatuses = pgTable(
  "workflow_statuses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 80 }).notNull(),
    category: varchar("category", { length: 24 }).notNull().default("unstarted"),
    color: varchar("color", { length: 16 }).notNull().default("#64748b"),
    position: integer("position").notNull().default(0),
    isDefault: boolean("is_default").notNull().default(false),
    ...timestamps,
  },
  (table) => [
    index("workflow_status_workspace_idx").on(table.workspaceId),
    index("workflow_status_project_position_idx").on(table.projectId, table.position),
  ],
);

export const labels = pgTable(
  "labels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 80 }).notNull(),
    color: varchar("color", { length: 16 }).notNull(),
    description: text("description"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("label_workspace_name_unique").on(table.workspaceId, table.name),
    index("label_workspace_idx").on(table.workspaceId),
  ],
);

export const projectsRelations = relations(projects, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [projects.workspaceId], references: [workspaces.id] }),
  team: one(teams, { fields: [projects.teamId], references: [teams.id] }),
  members: many(projectMembers),
  statuses: many(workflowStatuses),
}));
