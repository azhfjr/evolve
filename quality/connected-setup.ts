import setup from "../e2e/global-setup";
import { configureTestDatabase } from "../tests/helpers";
import { database } from "../src/lib/db";
import * as s from "../src/lib/db/schema";
import { writeFile } from "node:fs/promises";
export default async function connectedSetup() {
  await setup();
  delete (globalThis as { evolveDb?: unknown }).evolveDb;
  configureTestDatabase("evolve_e2e");
  const { db, close } = await database();
  try {
    const oldProjects = await db.select().from(s.project),
      oldTasks = await db.select().from(s.task);
    const actor = {
      email: "jarjirjor777@gmail.com",
      name: "Workspace Admin",
      isAdmin: true,
    };
    const { boardRoomCommand } = await import("../src/lib/board-room/service");
    const { projectSchema } = await import("../src/lib/board-room/model");
    const saved = (await boardRoomCommand(actor, {
      action: "saveProject",
      values: projectSchema.parse({
        externalId: "QA-CANONICAL",
        name: "Connected QA project",
        category: "Pembangkit",
        capacity: 50,
        unit: "MW",
        codYear: 2028,
      }),
    })) as { project: { id: string } };
    const { transitionPreview, activateConnectedWorkspace } =
      await import("../src/lib/connected/transition");
    const preview = await transitionPreview(actor);
    await activateConnectedWorkspace(actor, {
      token: preview.token,
      recoveryEvidence:
        "Disposable browser fixture; full legacy rows preserved and reconciled locally.",
    });
    await writeFile(
      ".data/connected-fixture.json",
      JSON.stringify({
        projectId: saved.project.id,
        oldProjectId: oldProjects[0]?.id,
        oldTaskId: oldTasks[0]?.id,
      }),
    );
  } finally {
    await close();
  }
}
