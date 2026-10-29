import { addDays, format } from "date-fns";
import type { WorkspaceData, Task, Status, Priority } from "./types";
import { refreshDemoLabels } from "./project-labels";
export function createDemo(): WorkspaceData {
  const now = new Date();
  const date = (days: number) => format(addDays(now, days), "yyyy-MM-dd");
  const members = [
    {
      email: "alex@example.com",
      name: "Alex Morgan",
      color: "violet",
      disabled: false,
    },
    {
      email: "maya@example.com",
      name: "Maya Chen",
      color: "orange",
      disabled: false,
    },
    {
      email: "james@example.com",
      name: "James Wilson",
      color: "blue",
      disabled: false,
    },
    {
      email: "sarah@example.com",
      name: "Sarah Park",
      color: "green",
      disabled: false,
    },
    {
      email: "noah@example.com",
      name: "Noah Davis",
      color: "pink",
      disabled: false,
    },
  ];
  const projects = [
    {
      id: "00000000-0000-4000-8000-000000000001",
      name: "Website redesign",
      labels: ["Design", "UX"],
      description: "A fresh digital home that feels like us.",
      color: "violet",
      createdAt: now.toISOString(),
    },
    {
      id: "00000000-0000-4000-8000-000000000002",
      name: "Product launch",
      labels: ["Launch"],
      description: "Bring our next big idea to the world.",
      color: "orange",
      createdAt: now.toISOString(),
    },
    {
      id: "00000000-0000-4000-8000-000000000003",
      name: "Brand & marketing",
      labels: ["Design", "Creative"],
      description: "Build a brand people connect with.",
      color: "green",
      createdAt: now.toISOString(),
    },
    {
      id: "00000000-0000-4000-8000-000000000004",
      name: "Team operations",
      labels: ["Operations"],
      description: "Make great work feel effortless.",
      color: "blue",
      createdAt: now.toISOString(),
    },
  ];
  const rows: [
    string,
    number,
    Status,
    Priority,
    number,
    number | null,
    string[],
  ][] = [
    [
      "Refine the homepage experience",
      0,
      "in_progress",
      "high",
      0,
      0,
      ["Design"],
    ],
    ["Finalize the launch checklist", 1, "todo", "urgent", 0, 0, ["Launch"]],
    [
      "Review brand photography direction",
      2,
      "review",
      "medium",
      1,
      1,
      ["Creative"],
    ],
    [
      "Map out the new onboarding flow",
      0,
      "in_progress",
      "high",
      3,
      2,
      ["UX", "Design"],
    ],
    ["Write the product announcement", 1, "todo", "high", 1, 3, ["Content"]],
    [
      "Set up the component library",
      0,
      "in_progress",
      "medium",
      2,
      3,
      ["Development"],
    ],
    ["Prepare Q4 team retrospective", 3, "todo", "medium", 0, 4, ["Team"]],
    [
      "Design social launch assets",
      2,
      "in_progress",
      "medium",
      4,
      5,
      ["Design"],
    ],
    [
      "Audit website accessibility",
      0,
      "backlog",
      "high",
      2,
      7,
      ["Development"],
    ],
    [
      "Explore customer interview themes",
      1,
      "backlog",
      "low",
      3,
      null,
      ["Research"],
    ],
    ["Update the team handbook", 3, "review", "low", 4, 6, ["Team"]],
    [
      "Define the launch success metrics",
      1,
      "done",
      "high",
      0,
      -1,
      ["Strategy"],
    ],
    ["Approve the new color palette", 2, "done", "medium", 1, -2, ["Design"]],
    ["Collect stakeholder feedback", 0, "done", "medium", 3, -3, ["Research"]],
    ["Create the project brief", 0, "done", "high", 0, -4, ["Strategy"]],
    ["Set up our shared workspace", 3, "done", "medium", 2, -5, ["Team"]],
    ["Draft the messaging framework", 2, "done", "medium", 1, -2, ["Content"]],
    ["Research competitive positioning", 1, "done", "low", 3, -3, ["Research"]],
    ["Schedule the launch review", 1, "done", "low", 4, -1, ["Launch"]],
    ["Build the pricing page", 0, "backlog", "medium", 2, 10, ["Development"]],
    ["Plan next month’s content", 2, "todo", "low", 1, 8, ["Content"]],
    ["Review the sprint capacity", 3, "todo", "medium", 0, -1, ["Planning"]],
  ];
  const tasks: Task[] = rows.map(
    ([title, p, status, priority, m, days, labels], i) => ({
      id: `10000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
      title,
      description:
        i === 0
          ? "Create a welcoming first impression with a clear story, thoughtful interactions, and a seamless mobile experience.\n\nLet’s bring the updated wireframes to life and make sure every detail feels considered."
          : "Keep the team aligned on the outcome, share your progress here, and flag anything that needs a second pair of eyes.",
      projectId: projects[p].id,
      status,
      priority,
      assignee: members[m].email,
      dueDate: days === null ? null : date(days),
      labels,
      checklist:
        i < 5
          ? [
              {
                id: crypto.randomUUID(),
                text: "Align on the approach",
                done: true,
              },
              {
                id: crypto.randomUUID(),
                text: "Share a first draft with the team",
                done: i !== 0,
              },
              {
                id: crypto.randomUUID(),
                text: "Incorporate feedback",
                done: false,
              },
            ]
          : [],
      version: 1,
      createdBy: members[0].email,
      createdAt: addDays(now, -8).toISOString(),
      updatedAt: addDays(now, -i / 20).toISOString(),
      completedAt:
        status === "done" ? addDays(now, days || -1).toISOString() : null,
      archived: false,
    }),
  );
  return refreshDemoLabels({
    adminEmail: members[0].email,
    actor: { email: members[0].email, name: members[0].name, isAdmin: true },
    members,
    projects,
    tasks,
    nextCursor: null,
    notifications: [
      {
        id: crypto.randomUUID(),
        email: members[0].email,
        taskId: tasks[1].id,
        message: "Maya assigned you “Finalize the launch checklist”",
        read: false,
        createdAt: now.toISOString(),
      },
      {
        id: crypto.randomUUID(),
        email: members[0].email,
        taskId: tasks[0].id,
        message: "Sarah left feedback on “Refine the homepage experience”",
        read: false,
        createdAt: addDays(now, -1).toISOString(),
      },
    ],
    activities: [
      {
        id: crypto.randomUUID(),
        taskId: tasks[0].id,
        actor: members[0].email,
        message: "moved “Refine the homepage experience” to in progress",
        createdAt: now.toISOString(),
      },
      {
        id: crypto.randomUUID(),
        taskId: tasks[12].id,
        actor: members[1].email,
        message: "completed “Approve the new color palette”",
        createdAt: addDays(now, -0.1).toISOString(),
      },
      {
        id: crypto.randomUUID(),
        taskId: tasks[4].id,
        actor: members[1].email,
        message: "created “Write the product announcement”",
        createdAt: addDays(now, -0.2).toISOString(),
      },
    ],
  });
}
