import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const sdkPath = path.join(here, "node_modules", "@modelcontextprotocol", "sdk");

if (!fs.existsSync(sdkPath)) {
  const install = spawnSync(npm, ["install", "--no-audit", "--no-fund"], {
    cwd: here,
    stdio: ["ignore", "ignore", "inherit"],
  });

  if (install.status !== 0) process.exit(install.status ?? 1);
}

const child = spawn(process.execPath, [path.join(here, "server.mjs")], {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
