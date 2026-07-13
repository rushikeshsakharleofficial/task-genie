import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { users } from "./auth.js";
import { tasks } from "./tasks.js";
import { workspaces } from "./workspaces.js";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const contentItems = pgTable(
  "content_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
    creatorId: uuid("creator_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    type: varchar("type", { length: 24 }).notNull().default("email"),
    title: varchar("title", { length: 240 }).notNull(),
    subject: varchar("subject", { length: 240 }),
    body: text("body").notNull().default(""),
    audience: jsonb("audience").$type<Record<string, unknown>>().notNull().default({}),
    status: varchar("status", { length: 24 }).notNull().default("draft"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    lastError: text("last_error"),
    ...timestamps,
  },
  (table) => [
    index("content_workspace_status_idx").on(table.workspaceId, table.status),
    index("content_task_idx").on(table.taskId),
    index("content_schedule_idx").on(table.status, table.scheduledAt),
  ],
);
