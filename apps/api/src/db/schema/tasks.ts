import { relations, sql } from "drizzle-orm";
import {
  AnyPgColumn,
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
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
  dependencyTypeEnum,
  notificationTypeEnum,
  taskPriorityEnum,
  taskTypeEnum,
} from "./enums.js";
import { labels, projects, workflowStatuses } from "./projects.js";
import { workspaces } from "./workspaces.js";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    parentTaskId: uuid("parent_task_id").references((): AnyPgColumn => tasks.id, {
      onDelete: "set null",
    }),
    statusId: uuid("status_id").references(() => workflowStatuses.id, { onDelete: "set null" }),
    number: integer("number").notNull(),
    title: varchar("title", { length: 500 }).notNull(),
    description: jsonb("description").$type<Record<string, unknown> | null>(),
    type: taskTypeEnum("type").notNull().default("task"),
    priority: taskPriorityEnum("priority").notNull().default("none"),
    position: numeric("position", { precision: 24, scale: 12 }).notNull().default("1000"),
    estimateMinutes: integer("estimate_minutes"),
    startAt: timestamp("start_at", { withTimezone: true }),
    dueAt: timestamp("due_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    version: integer("version").notNull().default(1),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("task_project_number_unique").on(table.projectId, table.number),
    index("task_workspace_idx").on(table.workspaceId),
    index("task_project_status_position_idx").on(table.projectId, table.statusId, table.position),
    index("task_parent_idx").on(table.parentTaskId),
    index("task_due_at_idx").on(table.workspaceId, table.dueAt),
    index("task_active_idx")
      .on(table.workspaceId, table.projectId)
      .where(sql`${table.deletedAt} is null`),
  ],
);

export const taskAssignees = pgTable(
  "task_assignees",
  {
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    assignedBy: uuid("assigned_by").references(() => users.id, { onDelete: "set null" }),
    assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.taskId, table.userId] }),
    index("task_assignees_user_idx").on(table.userId),
  ],
);

export const taskLabels = pgTable(
  "task_labels",
  {
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    labelId: uuid("label_id")
      .notNull()
      .references(() => labels.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.taskId, table.labelId] }),
    index("task_labels_label_idx").on(table.labelId),
  ],
);

export const taskDependencies = pgTable(
  "task_dependencies",
  {
    sourceTaskId: uuid("source_task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    targetTaskId: uuid("target_task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    type: dependencyTypeEnum("type").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.sourceTaskId, table.targetTaskId, table.type] }),
    index("task_dependencies_target_idx").on(table.targetTaskId),
  ],
);

export const checklists = pgTable(
  "checklists",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 200 }).notNull(),
    position: integer("position").notNull().default(0),
    ...timestamps,
  },
  (table) => [index("checklist_task_position_idx").on(table.taskId, table.position)],
);

export const checklistItems = pgTable(
  "checklist_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    checklistId: uuid("checklist_id")
      .notNull()
      .references(() => checklists.id, { onDelete: "cascade" }),
    content: varchar("content", { length: 500 }).notNull(),
    isCompleted: boolean("is_completed").notNull().default(false),
    completedBy: uuid("completed_by").references(() => users.id, { onDelete: "set null" }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    position: integer("position").notNull().default(0),
    ...timestamps,
  },
  (table) => [index("checklist_item_position_idx").on(table.checklistId, table.position)],
);

export const comments = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    parentCommentId: uuid("parent_comment_id").references((): AnyPgColumn => comments.id, {
      onDelete: "cascade",
    }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    body: jsonb("body").$type<Record<string, unknown>>().notNull(),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("comment_task_created_idx").on(table.taskId, table.createdAt),
    index("comment_parent_idx").on(table.parentCommentId),
  ],
);

export const attachments = pgTable(
  "attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "cascade" }),
    commentId: uuid("comment_id").references(() => comments.id, { onDelete: "cascade" }),
    uploadedBy: uuid("uploaded_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    originalName: varchar("original_name", { length: 255 }).notNull(),
    storageKey: varchar("storage_key", { length: 500 }).notNull(),
    mimeType: varchar("mime_type", { length: 160 }).notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    sha256: varchar("sha256", { length: 64 }).notNull(),
    quarantined: boolean("quarantined").notNull().default(true),
    scanStatus: varchar("scan_status", { length: 20 }).notNull().default("pending"),
    scanResult: varchar("scan_result", { length: 255 }),
    scannedAt: timestamp("scanned_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("attachment_storage_key_unique").on(table.storageKey),
    index("attachment_task_idx").on(table.taskId),
    index("attachment_workspace_idx").on(table.workspaceId),
  ],
);

export const savedViews = pgTable(
  "saved_views",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 100 }).notNull(),
    viewType: varchar("view_type", { length: 30 }).notNull(),
    definition: jsonb("definition").$type<Record<string, unknown>>().notNull(),
    isShared: boolean("is_shared").notNull().default(false),
    ...timestamps,
  },
  (table) => [index("saved_view_owner_idx").on(table.workspaceId, table.ownerId)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "cascade" }),
    type: notificationTypeEnum("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("notification_user_created_idx").on(table.userId, table.createdAt),
    index("notification_unread_idx")
      .on(table.userId, table.readAt)
      .where(sql`${table.readAt} is null`),
  ],
);

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [tasks.workspaceId], references: [workspaces.id] }),
  project: one(projects, { fields: [tasks.projectId], references: [projects.id] }),
  status: one(workflowStatuses, { fields: [tasks.statusId], references: [workflowStatuses.id] }),
  parent: one(tasks, {
    fields: [tasks.parentTaskId],
    references: [tasks.id],
    relationName: "task_parent",
  }),
  children: many(tasks, { relationName: "task_parent" }),
  assignees: many(taskAssignees),
  labels: many(taskLabels),
  comments: many(comments),
  checklists: many(checklists),
}));
