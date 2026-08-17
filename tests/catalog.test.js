import assert from "node:assert/strict";
import { test } from "node:test";

import { catalogUrl, describe, hasRisk, filterLocally } from "../src/catalog.js";

test("builds a catalogue URL and drops empty params", () => {
  const url = catalogUrl({ q: "memory", category: "", limit: 10 });
  assert.ok(url.includes("q=memory"));
  assert.ok(url.includes("limit=10"));
  assert.ok(!url.includes("category="));
});

test("describe picks the language the reader is actually in", () => {
  const plugin = { summary: "English copy", summaryZh: "中文文案" };
  assert.equal(describe(plugin, "en"), "English copy");
  assert.equal(describe(plugin, "zh"), "中文文案");
  assert.equal(describe(plugin, "zh-CN"), "中文文案");
});

test("describe falls back to English rather than rendering nothing", () => {
  assert.equal(describe({ summary: "only English" }, "zh"), "only English");
});

test("hasRisk is false only for an empty list", () => {
  assert.equal(hasRisk({ riskFlags: [] }), false);
  assert.equal(hasRisk({}), false);
  assert.equal(hasRisk({ riskFlags: ["terminal surface"] }), true);
});

test("local filter searches both languages", () => {
  const results = [
    { name: "a", summary: "memory store", summaryZh: "记忆" },
    { name: "b", summary: "vision", summaryZh: "视觉" },
  ];
  assert.equal(filterLocally(results, "记忆").length, 1);
  assert.equal(filterLocally(results, "vision").length, 1);
  assert.equal(filterLocally(results, "").length, 2);
});

// The runtime validates a registered skill's name and description and fails
// the whole plugin tree at boot if either is missing.
test("the bundled skill parses into what the runtime requires", async () => {
  const { loadStoreSkill } = await import("../src/skill.js");
  const skill = loadStoreSkill();
  assert.ok(skill, "skill should load");
  assert.match(skill.name, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  assert.ok(skill.description.length > 0);
  assert.ok(skill.content.length > 0);
  assert.equal(typeof skill.invocation.modelInvocable, "boolean");
});
