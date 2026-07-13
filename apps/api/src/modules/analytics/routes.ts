import { and, desc, eq, isNull } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../../db/client.js";
import { activities, projects, taskAssignees, tasks, users, workflowStatuses } from "../../db/schema/index.js";
import { requireWorkspacePermission } from "../../lib/authorization.js";
import { requireSession } from "../../plugins/auth-context.js";

const params = z.object({ workspaceId: z.string().uuid() });

function dateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export async function registerAnalyticsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/workspaces/:workspaceId/dashboard", async (request) => {
    const { workspaceId } = params.parse(request.params);
    const session = requireSession(request);
    await requireWorkspacePermission(request, workspaceId, "workspace:read");
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - 7);

    const rows = await db
      .select({ task: tasks, projectName: projects.name, projectKey: projects.key, projectColor: projects.color, statusName: workflowStatuses.name, statusCategory: workflowStatuses.category, statusColor: workflowStatuses.color })
      .from(tasks)
      .innerJoin(projects, eq(projects.id, tasks.projectId))
      .leftJoin(workflowStatuses, eq(workflowStatuses.id, tasks.statusId))
      .where(and(eq(tasks.workspaceId, workspaceId), isNull(tasks.deletedAt)))
      .orderBy(desc(tasks.updatedAt));
    const assignedIds = new Set((await db.select({ taskId: taskAssignees.taskId }).from(taskAssignees).where(eq(taskAssignees.userId, session.user.id))).map((row) => row.taskId));
    const total = rows.length;
    const overdue = rows.filter((row) => row.task.dueAt && row.task.dueAt < now && !row.task.completedAt).length;
    const completedThisWeek = rows.filter((row) => row.task.completedAt && row.task.completedAt >= weekStart).length;
    const assigned = rows.filter((row) => assignedIds.has(row.task.id));
    const recentActivity = await db.select().from(activities).where(eq(activities.workspaceId, workspaceId)).orderBy(desc(activities.createdAt)).limit(10);
    return {
      metrics: { total, assignedToMe: assigned.length, overdue, completedThisWeek },
      tasks: assigned.slice(0, 50).map((row) => ({
        ...row.task,
        projectName: row.projectName,
        projectKey: row.projectKey,
        projectColor: row.projectColor,
        statusName: row.statusName,
        statusCategory: row.statusCategory,
        statusColor: row.statusColor,
        assignees: [{ userId: session.user.id, name: session.user.name, email: session.user.email, image: session.user.image ?? null }],
      })),
      upcoming: rows.filter((row) => row.task.dueAt && row.task.dueAt >= now && !row.task.completedAt).sort((a, b) => Number(a.task.dueAt) - Number(b.task.dueAt)).slice(0, 8).map((row) => ({ ...row.task, projectName: row.projectName })),
      recentActivity,
    };
  });

  app.get("/api/v1/workspaces/:workspaceId/analytics", async (request) => {
    const { workspaceId } = params.parse(request.params);
    await requireWorkspacePermission(request, workspaceId, "workspace:read");
    const now = new Date();
    const from = new Date(now);
    from.setDate(now.getDate() - 13);
    from.setHours(0, 0, 0, 0);

    const rows = await db
      .select({ task: tasks, projectName: projects.name, statusName: workflowStatuses.name, statusCategory: workflowStatuses.category, assigneeId: taskAssignees.userId, assigneeName: users.name })
      .from(tasks)
      .innerJoin(projects, eq(projects.id, tasks.projectId))
      .leftJoin(workflowStatuses, eq(workflowStatuses.id, tasks.statusId))
      .leftJoin(taskAssignees, eq(taskAssignees.taskId, tasks.id))
      .leftJoin(users, eq(users.id, taskAssignees.userId))
      .where(and(eq(tasks.workspaceId, workspaceId), isNull(tasks.deletedAt)));

    const unique = new Map<string, typeof rows[number]>();
    for (const row of rows) if (!unique.has(row.task.id)) unique.set(row.task.id, row);
    const taskRows = [...unique.values()];
    const statusMap = new Map<string, number>();
    for (const row of taskRows) {
      const name = row.statusName ?? "No status";
      statusMap.set(name, (statusMap.get(name) ?? 0) + 1);
    }
    const workload = new Map<string, number>();
    for (const row of rows) if (row.assigneeName) workload.set(row.assigneeName, (workload.get(row.assigneeName) ?? 0) + 1);
    const completedByDay = new Map<string, number>();
    for (let i = 0; i < 14; i += 1) {
      const d = new Date(from); d.setDate(from.getDate() + i); completedByDay.set(dateKey(d), 0);
    }
    for (const row of taskRows) if (row.task.completedAt && row.task.completedAt >= from) {
      const key = dateKey(row.task.completedAt); completedByDay.set(key, (completedByDay.get(key) ?? 0) + 1);
    }
    return {
      metrics: {
        total: taskRows.length,
        completed: taskRows.filter((row) => Boolean(row.task.completedAt)).length,
        overdue: taskRows.filter((row) => row.task.dueAt && row.task.dueAt < now && !row.task.completedAt).length,
        inProgress: taskRows.filter((row) => row.statusCategory === "started").length,
      },
      completedByDay: [...completedByDay.entries()].map(([date, count]) => ({ date, count })),
      byStatus: [...statusMap.entries()].map(([name, count]) => ({ name, count })),
      workload: [...workload.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
      tasks: taskRows.slice(0, 100).map((row) => ({ ...row.task, projectName: row.projectName, statusName: row.statusName, statusCategory: row.statusCategory })),
    };
  });
}
