import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("MCP verifier", () => {
  it("waits for initialize before sending initialized and tools/list", async () => {
    const { sendVerificationRequests } = await import("./mcp-verifier.mjs");
    const sent = [];
    let releaseInitialize;
    const initializeResponse = new Promise((resolve) => {
      releaseInitialize = resolve;
    });

    const sending = sendVerificationRequests(
      (message) => sent.push(JSON.parse(message)),
      () => initializeResponse,
    );

    assert.deepEqual(
      sent.map(({ id, method }) => ({ id, method })),
      [{ id: 1, method: "initialize" }],
    );

    releaseInitialize();
    await sending;

    assert.deepEqual(
      sent.map(({ id, method }) => ({ id, method })),
      [
        { id: 1, method: "initialize" },
        { id: undefined, method: "notifications/initialized" },
        { id: 2, method: "tools/list" },
      ],
    );
  });
});

describe("release metadata", () => {
  it("keeps package and lockfile versions synchronized", () => {
    const packageJson = JSON.parse(
      readFileSync(join(root, "package.json"), "utf8"),
    );
    const packageLock = JSON.parse(
      readFileSync(join(root, "package-lock.json"), "utf8"),
    );

    assert.equal(packageLock.version, packageJson.version);
    assert.equal(packageLock.packages[""].version, packageJson.version);
  });
});

describe("security guidance", () => {
  it("warns every supported client not to expose secrets in prompts", () => {
    const security = readFileSync(join(root, "SECURITY.md"), "utf8");

    assert.match(security, /AI assistant prompt/);
    assert.doesNotMatch(security, /Copilot prompt/);
  });
});

describe("architecture documentation", () => {
  it("derives the documented dedicated-tool count from registrations", () => {
    const source = readFileSync(join(root, "src", "index.ts"), "utf8");
    const architecture = readFileSync(
      join(root, "docs", "ARCHITECTURE.md"),
      "utf8",
    );
    const registeredTools = [
      ...source.matchAll(/server\.registerTool\(\s*"([^"]+)"/g),
    ].map((match) => match[1]);
    const longTailTools = new Set(["search_actions", "execute_action"]);
    const dedicatedCount = registeredTools.filter(
      (name) => !longTailTools.has(name),
    ).length;

    assert.equal(registeredTools.length, 12);
    assert.match(architecture, new RegExp(`\\*\\*${dedicatedCount} dedicated tools\\*\\*`));
  });
});

describe("continuous integration", () => {
  it("builds on Windows with lifecycle scripts disabled during install", () => {
    const workflow = readFileSync(
      join(root, ".github", "workflows", "ci.yml"),
      "utf8",
    );

    assert.match(
      workflow,
      /windows-build:[\s\S]*?runs-on: windows-latest[\s\S]*?npm ci --ignore-scripts[\s\S]*?npm run build/,
    );
  });
});
