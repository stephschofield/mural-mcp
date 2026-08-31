import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const skillPath = resolve(root, "skills", "assess", "SKILL.md");
const templatePath = resolve(root, "skills", "assess", "references", "digest-template.md");
const githubManifestPath = resolve(root, ".github", "plugin", "plugin.json");
const claudeManifestPath = resolve(root, ".claude-plugin", "plugin.json");

async function read(path) {
  return readFile(path, "utf8");
}

function includesAll(text, values, label) {
  for (const value of values) {
    assert.ok(text.includes(value), `${label} is missing: ${value}`);
  }
}

async function verifyStructure() {
  const [githubManifestText, claudeManifestText, skill] = await Promise.all([
    read(githubManifestPath),
    read(claudeManifestPath),
    read(skillPath),
  ]);
  const githubManifest = JSON.parse(githubManifestText);
  const claudeManifest = JSON.parse(claudeManifestText);

  for (const manifest of [githubManifest, claudeManifest]) {
    assert.equal(manifest.name, "mural");
    assert.equal(manifest.skills, "./skills/");
    assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  }

  assert.match(skill, /^---\r?\nname: assess\r?\n/);
  includesAll(
    skill,
    ["/mural:assess", "Requires a configured Mural MCP server", "<Mural board URL and assessment request>"],
    "skill contract",
  );
}

async function verifyWorkflow() {
  const skill = await read(skillPath);
  includesAll(
    skill,
    [
      "Workshop date",
      "confirmation that the date is unavailable",
      "Meeting transcript filename",
      "Additional document filenames",
      "search the current project directory",
      "copy it into the current project directory",
      "Do not search outside the project",
      "get_mural",
      "get_mural_summary",
      "get_mural_structure",
      "get_mural_text",
      "get_mural_widgets",
      "check_connection",
      "Images, screenshots, diagrams, stickers, icons, and voting markers",
      "Maintain source references",
      "Once required inputs are available, continue through capture, reconciliation, synthesis, quality control, and delivery",
    ],
    "assessment workflow",
  );
}

async function verifyOutput() {
  const [skill, template] = await Promise.all([read(skillPath), read(templatePath)]);
  includesAll(
    template,
    [
      "## Executive summary",
      "## High-level outcomes",
      "## Key points and themes",
      "## Decisions and commitments",
      "## Open questions and unresolved issues",
      "## Follow-ups and action items",
      "## Workshop activities and questions asked",
      "## Visual and participation signals",
      "## Risks, dependencies, and contradictions",
      "## Evidence notes",
      "## Sources and limitations",
      "Unassigned",
      "Not stated",
      "None identified",
    ],
    "digest template",
  );
  includesAll(
    skill,
    [
      "An **explicit decision** requires direct decision language",
      "Never invent an owner or due date",
      "Preserve material disagreement and minority views",
      "Explain conflicts between sources",
      "Do not infer a workshop date from file timestamps",
      "Do not declare the assessment comprehensive",
    ],
    "evidence safeguards",
  );
  assert.ok(
    !/[\u2013\u2014]/.test(skill) && !/[\u2013\u2014]/.test(template),
    "files must not contain em or en dashes",
  );
}

const checks = {
  structure: verifyStructure,
  workflow: verifyWorkflow,
  output: verifyOutput,
};

const requested = process.argv[2] ?? "all";
const selected = requested === "all" ? Object.keys(checks) : [requested];

for (const name of selected) {
  assert.ok(checks[name], `unknown check: ${name}`);
  await checks[name]();
  console.log(`PASS ${name}`);
}
