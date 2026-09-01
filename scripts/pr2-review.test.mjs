import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { it } from "node:test";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

it("runs skill contract verification in CI", () => {
  const workflow = readFileSync(
    join(root, ".github", "workflows", "ci.yml"),
    "utf8",
  );

  assert.match(workflow, /run: node scripts\/verify-skill\.mjs all/);
});

it("allows the workshop date to be unavailable", () => {
  const skill = readFileSync(join(root, "skills", "assess", "SKILL.md"), "utf8");

  assert.match(skill, /confirmation that the date is unavailable/);
  assert.match(
    skill,
    /Do not make the workshop date, a transcript, or supporting documents mandatory/,
  );
});
