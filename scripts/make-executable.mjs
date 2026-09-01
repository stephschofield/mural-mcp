import { chmodSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

if (process.platform === "win32") {
  process.exit(0);
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
chmodSync(join(root, "build", "index.js"), 0o755);
