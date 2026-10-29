import setup from "./connected-setup";
import { configureTestDatabase } from "../tests/helpers";
import { database } from "../src/lib/db";
import * as s from "../src/lib/db/schema";
import { projectSchema } from "../src/lib/board-room/model";
import { readFile, writeFile } from "node:fs/promises";
export default async function storylineSetup() {
  await setup();
  delete (globalThis as { evolveDb?: unknown }).evolveDb;
  configureTestDatabase("evolve_e2e");
  const { db, close } = await database();
  try {
    const id = crypto.randomUUID();
    await db.insert(s.boardRoomProject).values({
      id,
      externalId: "QA-HISTORICAL",
      data: {
        ...projectSchema.parse({
          externalId: "QA-HISTORICAL",
          name: "Historical COD project",
          codYear: 2024,
        }),
        stage: 0,
        completed: false,
      },
    });
    const fixture = JSON.parse(
      await readFile(".data/connected-fixture.json", "utf8"),
    );
    await writeFile(
      ".data/connected-fixture.json",
      JSON.stringify({ ...fixture, historicalProjectId: id }),
    );
  } finally {
    await close();
  }
}
