import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });
export function configureTestDatabase(name: "evolve_test" | "evolve_e2e") {
  process.env.BLOB_READ_WRITE_TOKEN = "";
  const explicit =
    process.env[
      name === "evolve_test"
        ? "EVOLVE_TEST_DATABASE_URL"
        : "EVOLVE_E2E_DATABASE_URL"
    ];
  if (explicit) {
    const url = new URL(explicit);
    if (!url.pathname.endsWith(`/${name}`))
      throw new Error(`Explicit test database must be named ${name}.`);
    process.env.DATABASE_URL = explicit;
  } else {
    const url = new URL(process.env.DATABASE_URL || "");
    if (!["127.0.0.1", "localhost"].includes(url.hostname))
      throw new Error("Tests require an explicit disposable database URL.");
    url.pathname = `/${name}`;
    process.env.DATABASE_URL = url.toString();
  }
  process.env.ADMIN_EMAIL = "jarjirjor777@gmail.com";
}
