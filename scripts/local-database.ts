import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });
const name = "evolve-development-db";
function run(args: string[]) {
  const r = spawnSync("docker", args, {
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
  });
  if (r.status !== 0) throw new Error(r.stderr || "Docker command failed");
  return r.stdout.trim();
}
async function ready() {
  for (let i = 0; i < 40; i++) {
    const check = spawnSync(
      "docker",
      ["exec", name, "pg_isready", "-U", "evolve", "-d", "evolve"],
      { stdio: "ignore" },
    );
    if (check.status === 0) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(
    "Database startup timed out. Check docker logs evolve-development-db.",
  );
}
function create(password: string) {
  run([
    "run",
    "--detach",
    "--name",
    name,
    "--publish",
    "127.0.0.1:54329:5432",
    "--env",
    "POSTGRES_USER=evolve",
    "--env",
    "POSTGRES_DB=evolve",
    "--env",
    `POSTGRES_PASSWORD=${password}`,
    "--volume",
    "evolve-development-data:/var/lib/postgresql/data",
    "postgres:17",
  ]);
}
async function main() {
  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    if (
      url.hostname !== "127.0.0.1" ||
      url.port !== "54329" ||
      url.pathname !== "/evolve" ||
      url.username !== "evolve"
    ) {
      console.log(
        "Preserving the configured database; no Docker changes needed.",
      );
      return;
    }
    const existing = run([
      "ps",
      "-a",
      "--filter",
      `name=^/${name}$`,
      "--format",
      "{{.Names}}",
    ]);
    if (existing) run(["start", name]);
    else {
      const password = decodeURIComponent(url.password);
      if (!password)
        throw new Error("The configured local database password is missing.");
      create(password);
    }
    await ready();
    console.log(
      "Local PostgreSQL is running. Existing data and configuration were preserved.",
    );
    return;
  }
  const existing = run([
    "ps",
    "-a",
    "--filter",
    `name=^/${name}$`,
    "--format",
    "{{.Names}}",
  ]);
  if (existing)
    throw new Error(
      "An Evolve database container exists, but DATABASE_URL is missing. Restore local configuration; this script won’t replace data or credentials.",
    );
  const password = randomBytes(32).toString("hex");
  console.log("Starting local PostgreSQL 17 on 127.0.0.1:54329…");
  create(password);
  const path = ".env.local";
  let content = existsSync(path) ? readFileSync(path, "utf8") : "";
  const settings: Record<string, string> = {
    DATABASE_URL: `postgresql://evolve:${password}@127.0.0.1:54329/evolve`,
    ADMIN_EMAIL: "jarjirjor777@gmail.com",
    BETTER_AUTH_SECRET: randomBytes(48).toString("base64"),
    BETTER_AUTH_URL: "http://localhost:3000",
  };
  for (const [key, value] of Object.entries(settings)) {
    if (!process.env[key]) {
      const line = new RegExp(`^${key}=.*$`, "m");
      const replacement = `${key}=${value}`;
      content = line.test(content)
        ? content.replace(line, () => replacement)
        : content + `\n${replacement}`;
    }
  }
  writeFileSync(path, content + "\n", { mode: 0o600 });
  await ready();
  console.log(
    "PostgreSQL is ready. Local credentials were saved to ignored .env.local.",
  );
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
