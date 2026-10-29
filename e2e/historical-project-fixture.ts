import type { Page } from "@playwright/test";
import { Client } from "pg";
import { configureTestDatabase } from "../tests/helpers";
import { projectFields, projectCostFields } from "../src/lib/project-model";
// Seed pre-transition financial records directly in the disposable database.
// The retired Locker API is deliberately never used to write financial data.
export async function historicalProject(
  page: Page,
  input: Record<string, unknown>,
) {
  configureTestDatabase("evolve_e2e");
  const url = new URL(process.env.DATABASE_URL!);
  if (!url.pathname.endsWith("/evolve_e2e"))
    throw Error("Disposable fixture required");
  const fields = projectCostFields(projectFields.parse(input));
  const response = await page.request.post("/api/workspace", {
    headers: { origin: "http://127.0.0.1:3100" },
    data: {
      ...input,
      action: "createProject",
      budget: "0.00",
      costOptions: undefined,
      costItems: undefined,
    },
  });
  if (!response.ok())
    throw Error(
      "Historical metadata fixture creation failed: " + response.status(),
    );
  const project = (await response.json()).project;
  const db = new Client({ connectionString: url.toString() });
  await db.connect();
  try {
    await db.query(
      "UPDATE project SET budget=$1,currency=$2,cost_items=$3::jsonb,cost_options=$4::jsonb WHERE id=$5",
      [
        fields.budget,
        fields.currency,
        fields.costItems == null ? null : JSON.stringify(fields.costItems),
        fields.costOptions == null ? null : JSON.stringify(fields.costOptions),
        project.id,
      ],
    );
  } finally {
    await db.end();
  }
  return {
    ...project,
    budget: fields.budget,
    currency: fields.currency,
    costItems: fields.costItems ?? null,
    costOptions: fields.costOptions ?? null,
  };
}

export async function historicalCosts(
  id: string,
  input: Record<string, unknown>,
) {
  configureTestDatabase("evolve_e2e");
  const fields = projectCostFields(projectFields.parse(input));
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    await db.query(
      "UPDATE project SET budget=$1,currency=$2,cost_items=$3::jsonb,cost_options=$4::jsonb WHERE id=$5",
      [
        fields.budget,
        fields.currency,
        fields.costItems == null ? null : JSON.stringify(fields.costItems),
        fields.costOptions == null ? null : JSON.stringify(fields.costOptions),
        id,
      ],
    );
  } finally {
    await db.end();
  }
  return {
    budget: fields.budget,
    currency: fields.currency,
    costItems: fields.costItems ?? null,
    costOptions: fields.costOptions ?? null,
  };
}

export async function demoHistoricalCost(
  page: Page,
  name: string,
  amount: string,
) {
  await page.evaluate(
    ({ name, amount }) => {
      const d = JSON.parse(localStorage.getItem("evolve-demo-v1")!);
      const p = d.projects.find((p: { name: string }) => p.name === name);
      if (!p) throw Error("Historical demo fixture missing");
      p.costOptions = [
        {
          id: crypto.randomUUID(),
          title: "Historical costs",
          items: [
            {
              id: crypto.randomUUID(),
              title: "Historical equipment",
              unit: "USD",
              amount,
            },
          ],
        },
      ];
      p.costItems = [];
      p.budget = "0.00";
      p.currency = "USD";
      localStorage.setItem("evolve-demo-v1", JSON.stringify(d));
    },
    { name, amount },
  );
  await page.reload();
}
