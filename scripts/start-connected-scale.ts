import { spawn } from "node:child_process";
import { scaleServerEnvironment } from "./scale-environment";
const env = scaleServerEnvironment();
const url = new URL(env.DATABASE_URL!);
url.pathname = "/evolve_connected_perf";
env.DATABASE_URL = url.toString();
env.EVOLVE_FILES_DIR = ".data/connected-scale-files";
const child = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3101",
  ],
  { env, stdio: "inherit" },
);
for (const s of ["SIGINT", "SIGTERM"] as const)
  process.on(s, () => child.kill(s));
child.on("exit", (c) => {
  process.exitCode = c || 0;
});
