/**
 * Prove the server speaks MCP over stdio without Mural credentials.
 * Sends initialize, then tools/list, and asserts required tools exist.
 */
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { sendVerificationRequests } from "./mcp-verifier.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const serverPath = join(root, "build", "index.js");

const REQUIRED_TOOLS = [
  "check_connection",
  "list_workspaces",
  "list_rooms",
  "list_murals",
  "get_mural",
  "get_mural_text",
  "get_mural_summary",
  "get_mural_widgets",
  "get_mural_structure",
  "search_murals",
  "search_actions",
  "execute_action",
];

const child = spawn(process.execPath, [serverPath], {
  stdio: ["pipe", "pipe", "pipe"],
  windowsHide: true,
  env: { ...process.env },
});

let stdout = "";
let stderr = "";
child.stdout.setEncoding("utf8");
child.stderr.setEncoding("utf8");
child.stdout.on("data", (chunk) => {
  stdout += chunk;
});
child.stderr.on("data", (chunk) => {
  stderr += chunk;
});

let resolveInitialize;
const initializeResponse = new Promise((resolve) => {
  resolveInitialize = resolve;
});

createInterface({ input: child.stdout }).on("line", (line) => {
  try {
    const message = JSON.parse(line);
    if (message.id === 1) resolveInitialize(message);
  } catch {
    // The complete stdout validation below reports malformed protocol output.
  }
});

void sendVerificationRequests(
  (message) => child.stdin.write(`${message}\n`),
  () => initializeResponse,
)
  .then(() => child.stdin.end())
  .catch((error) => fail(`Failed to complete MCP initialization: ${error}`));

const timeout = setTimeout(() => {
  child.kill();
  fail("Timed out waiting for MCP responses");
}, 20000);

child.on("close", () => {
  clearTimeout(timeout);
  const lines = stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const messages = [];
  for (const line of lines) {
    try {
      messages.push(JSON.parse(line));
    } catch {
      fail(`Non-JSON stdout line (stdio corruption): ${line.slice(0, 200)}`);
    }
  }

  const initRes = messages.find((m) => m.id === 1);
  const listRes = messages.find((m) => m.id === 2);

  if (!initRes?.result?.serverInfo) {
    fail(`initialize missing serverInfo. stdout=${stdout} stderr=${stderr}`);
  }
  if (initRes.result.serverInfo.name !== "mural-mcp") {
    fail(`expected server name mural-mcp, got ${initRes.result.serverInfo.name}`);
  }

  const tools = listRes?.result?.tools;
  if (!Array.isArray(tools)) {
    fail(`tools/list did not return tools. stdout=${stdout} stderr=${stderr}`);
  }

  const names = tools.map((t) => t.name);
  const missing = REQUIRED_TOOLS.filter((n) => !names.includes(n));
  if (missing.length) {
    fail(`Missing tools: ${missing.join(", ")}. Got: ${names.join(", ")}`);
  }

  console.log(`ok: mural-mcp initialize + tools/list (${names.length} tools)`);
  console.log(`tools: ${names.join(", ")}`);
  process.exit(0);
});

function fail(message) {
  console.error(`verify-mcp failed: ${message}`);
  process.exit(1);
}
