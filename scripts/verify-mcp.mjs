/**
 * Prove the server speaks MCP over stdio without Mural credentials.
 * Sends initialize, then tools/list, and asserts required tools exist.
 */
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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

function rpc(id, method, params) {
  return JSON.stringify({ jsonrpc: "2.0", id, method, params });
}

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

const init = rpc(1, "initialize", {
  protocolVersion: "2024-11-05",
  capabilities: {},
  clientInfo: { name: "verify-mcp", version: "0" },
});
const list = rpc(2, "tools/list", {});

child.stdin.write(`${init}\n`);
child.stdin.write(
  `${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`,
);
child.stdin.write(`${list}\n`);
child.stdin.end();

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
