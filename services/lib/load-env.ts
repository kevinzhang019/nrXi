// Side-effect module: imported for env-loading, not for any exports.
//
// MUST be imported first in any bin script, before any other import that
// reads process.env at module-load time. Mirrors the behavior Next.js
// already provides for app code: `.env.local` overrides nothing already
// in the environment, but fills in the rest.
//
// On Railway / production these files don't exist — readFileSync throws,
// we swallow it, and process.env stays as-is from the platform.
import { readFileSync } from "node:fs";
import { join } from "node:path";

function loadEnvFile(path: string): void {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return;
  }
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    // Existing env wins — Railway-injected vars take priority over the file.
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

const cwd = process.cwd();
loadEnvFile(join(cwd, ".env.local"));
loadEnvFile(join(cwd, ".env"));
