import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Env file not found: ${filePath}`);
  }

  const raw = fs.readFileSync(filePath, "utf8");
  const env = {};

  for (const originalLine of raw.split(/\r?\n/)) {
    const line = originalLine.trim();

    if (!line || line.startsWith("#")) continue;

    const normalized = line.startsWith("export ") ? line.slice(7) : line;
    const separatorIndex = normalized.indexOf("=");

    if (separatorIndex <= 0) continue;

    const key = normalized.slice(0, separatorIndex).trim();
    let value = normalized.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    env[key] = value;
  }

  return env;
}

const [, , envFileArg, command, ...commandArgs] = process.argv;

if (!envFileArg || !command) {
  console.error("Usage: node scripts/with-env.mjs <env-file> <command> [...args]");
  process.exit(1);
}

const envPath = path.resolve(process.cwd(), envFileArg);
const fileEnv = parseEnvFile(envPath);

const child = spawn(command, commandArgs, {
  cwd: process.cwd(),
  env: {
    ...process.env,
    ...fileEnv,
  },
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
