import { and, eq } from "drizzle-orm";
import { db, pool } from "./client.js";
import {
  checklistItems,
  checklists,
  comments,
  contentItems,
  labels,
  projects,
  taskAssignees,
  taskLabels,
  tasks,
  users,
  workflowStatuses,
  workspaceMembers,
  workspaces,
} from "./schema/index.js";
import { closeValkey } from "../plugins/valkey.js";
import { toSlug } from "../lib/slug.js";

const email = process.env.DEMO_USER_EMAIL?.trim().toLowerCase();
if (!email) throw new Error("Set DEMO_USER_EMAIL to an already registered user email");
const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
if (!user) throw new Error(`No registered user found for ${email}`);

const [existingMembership] = await db.select({ workspaceId: workspaceMembers.workspaceId }).from(workspaceMembers).where(eq(workspaceMembers.userId, user.id)).limit(1);
if (existingMembership) {
  console.log(`User already belongs to workspace ${existingMembership.workspaceId}; seed skipped.`);
  await pool.end();
  process.exit(0);
}

const result = await db.transaction(async (tx) => {
  const [workspace] = await tx.insert(workspaces).values({ name: "Task Genie Demo", slug: `${toSlug(user.name)}-${crypto.randomUUID().slice(0, 6)}`, createdBy: user.id }).returning();
  if (!workspace) throw new Error("Workspace creation failed");
  await tx.insert(workspaceMembers).values({ workspaceId: workspace.id, userId: user.id, role: "owner" });

  const projectDefs = [
    { name: "Customer Onboarding", key: "ONB", color: "#3b82f6" },
    { name: "Website Redesign", key: "WEB", color: "#8b5cf6" },
    { name: "Mobile App Launch", key: "APP", color: "#f97316" },
    { name: "Q3 Marketing Campaign", key: "MKT", color: "#22c55e" },
  ];
  const projectRows = [];
  for (const definition of projectDefs) {
    const [project] = await tx.insert(projects).values({ workspaceId: workspace.id, ...definition, visibility: "workspace", createdBy: user.id }).returning();
    if (!project) throw new Error("Project creation failed");
    const statuses = await tx.insert(workflowStatuses).values([
      { workspaceId: workspace.id, projectId: project.id, name: "To Do", category: "unstarted", position: 1000, color: "#64748b", isDefault: true },
      { workspaceId: workspace.id, projectId: project.id, name: "In Progress", category: "started", position: 2000, color: "#3b82f6" },
      { workspaceId: workspace.id, projectId: project.id, name: "Review", category: "started", position: 3000, color: "#8b5cf6" },
      { workspaceId: workspace.id, projectId: project.id, name: "Done", category: "completed", position: 4000, color: "#22c55e" },
    ]).returning();
    projectRows.push({ project, statuses });
  }

  const labelRows = await tx.insert(labels).values([
    { workspaceId: workspace.id, name: "Email", color: "#3b82f6" },
    { workspaceId: workspace.id, name: "Onboarding", color: "#8b5cf6" },
    { workspaceId: workspace.id, name: "Lifecycle", color: "#22c55e" },
    { workspaceId: workspace.id, name: "Design", color: "#f97316" },
  ]).returning();

  const now = Date.now();
  const definitions = [
    ["Launch onboarding email sequence", 0, 1, "high", 1, 60],
    ["Design pricing page mockups", 1, 0, "normal", 4, 0],
    ["Prepare product launch assets", 2, 1, "high", 2, 45],
    ["Analyze user feedback", 3, 2, "normal", 5, 70],
    ["Set up analytics tracking", 0, 0, "low", 7, 0],
    ["Write blog post: Getting Started", 2, 0, "low", 6, 0],
    ["Competitor feature analysis", 1, 1, "normal", 5, 30],
  ] as const;
  const taskRows = [];
  for (let index = 0; index < definitions.length; index += 1) {
    const [title, projectIndex, statusIndex, priority, dueDays, progress] = definitions[index]!;
    const ref = projectRows[projectIndex]!;
    const [task] = await tx.insert(tasks).values({
      workspaceId: workspace.id,
      projectId: ref.project.id,
      statusId: ref.statuses[statusIndex]!.id,
      number: index + 1,
      title,
      description: { text: `${title} with clear acceptance criteria and review steps.` },
      priority,
      dueAt: new Date(now + dueDays * 86_400_000),
      completedAt: null,
      createdBy: user.id,
      updatedBy: user.id,
      position: String((index + 1) * 1000),
    }).returning();
    if (!task) throw new Error("Task creation failed");
    await tx.insert(taskAssignees).values({ taskId: task.id, userId: user.id, assignedBy: user.id });
    if (index === 0) await tx.insert(taskLabels).values(labelRows.slice(0, 3).map((label) => ({ taskId: task.id, labelId: label.id })));
    taskRows.push({ task, progress });
  }

  const first = taskRows[0]!.task;
  const [checklist] = await tx.insert(checklists).values({ workspaceId: workspace.id, taskId: first.id, title: "Email launch checklist" }).returning();
  if (checklist) await tx.insert(checklistItems).values([
    { checklistId: checklist.id, content: "Define email sequence goals", isCompleted: true, completedBy: user.id, completedAt: new Date(), position: 1 },
    { checklistId: checklist.id, content: "Write email copy", isCompleted: true, completedBy: user.id, completedAt: new Date(), position: 2 },
    { checklistId: checklist.id, content: "Design email templates", isCompleted: true, completedBy: user.id, completedAt: new Date(), position: 3 },
    { checklistId: checklist.id, content: "Set up automation in ESP", position: 4 },
    { checklistId: checklist.id, content: "Test and review", position: 5 },
  ]);
  await tx.insert(comments).values({ workspaceId: workspace.id, taskId: first.id, authorId: user.id, body: { text: "Demo workspace created. Use this task to test comments and checklists." } });
  await tx.insert(contentItems).values({ workspaceId: workspace.id, taskId: first.id, creatorId: user.id, type: "email", title: "Launch onboarding email sequence", subject: "Welcome to Task Genie! Let’s get you started ✨", body: "Hi {{first_name}},\n\nWelcome to Task Genie. Create your first project and invite your team.", audience: { name: "New Users (0–7 days)", estimatedRecipients: 12543 }, status: "draft" });
  return { workspaceId: workspace.id, projects: projectRows.length, tasks: taskRows.length };
});

console.log(JSON.stringify(result, null, 2));
await closeValkey().catch(() => undefined);
await pool.end();
