// Upload variables from .env.local to Vercel (production, preview, development).
// Values are piped through stdin so they never appear in process args or logs.
// Usage: node scripts/push-env-to-vercel.mjs [PREFIX]   e.g. STELLAR_
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const prefix = process.argv[2] ?? "";
const skip = new Set(["VERCEL_OIDC_TOKEN"]);
const vars = readFileSync(".env.local", "utf8")
  .split("\n")
  .map((line) => line.match(/^([A-Z0-9_]+)=(.*)$/))
  .filter((m) => m && !skip.has(m[1]) && m[1].startsWith(prefix));

let failed = 0;
for (const [, key, value] of vars) {
  for (const target of ["production", "preview", "development"]) {
    const r = spawnSync("npx", ["vercel", "env", "add", key, target, "--force", "--yes"], {
      input: value,
      encoding: "utf8",
    });
    if (r.status !== 0) failed++;
    console.log(`${key.padEnd(30)} ${target.padEnd(11)} ${r.status === 0 ? "OK" : "FAIL"}`);
  }
}
process.exit(failed ? 1 : 0);
