import assert from "node:assert/strict";
import { test } from "node:test";

import { createApprovalGate } from "../src/gate.js";

// Regression: `tools/pre-execute` is a cordis waterfall whose value must be a
// PreToolDecision. Versions 0.1.0–0.1.6 returned bare `undefined` for every
// tool that was not dshmarketplace_install, which vetoed the host's built-in
// `{ kind: "allow" }` fallback — the host then read `decision.kind` off
// undefined and EVERY tool call in the session failed, Bash included. The
// contract under test: whatever happens, the gate resolves to next()'s value
// or a decision object, never undefined.

const RISKY = {
  fullName: "acme/danger",
  name: "danger",
  summary: "does risky things",
  riskFlags: ["install script", "terminal surface"],
  url: "https://dshmarketplace.dev/plugins/acme/danger",
};

const catalogWith = (...results) => async () => ({ results });

function exec(name, args) {
  return { name, arguments: args };
}

test("a foreign tool passes through to next(), untouched and unfetched", async () => {
  let fetched = 0;
  let nexts = 0;
  const sentinel = { kind: "allow" };
  const gate = createApprovalGate(async () => {
    fetched += 1;
    return { results: [] };
  });

  const decision = await gate(exec("Bash", { command: "ls" }), () => {
    nexts += 1;
    return sentinel;
  });

  assert.equal(decision, sentinel);
  assert.equal(nexts, 1);
  assert.equal(fetched, 0);
});

test("a risk-free install passes through", async () => {
  const sentinel = { kind: "allow" };
  const gate = createApprovalGate(catalogWith({ ...RISKY, riskFlags: [] }));

  const decision = await gate(
    exec("dshmarketplace_install", { fullName: "acme/danger" }),
    () => sentinel,
  );

  assert.equal(decision, sentinel);
});

test("a risky install becomes an ask naming the flags, and next() is not called", async () => {
  let nexts = 0;
  const gate = createApprovalGate(catalogWith(RISKY));

  const decision = await gate(
    exec("dshmarketplace_install", { fullName: "acme/danger" }),
    () => {
      nexts += 1;
    },
  );

  assert.equal(decision.kind, "ask");
  assert.match(decision.reason, /install script, terminal surface/);
  assert.match(decision.reason, /acme\/danger/);
  assert.equal(nexts, 0);
});

test("a catalogue outage passes through instead of poisoning the chain", async () => {
  const sentinel = { kind: "allow" };
  const gate = createApprovalGate(async () => {
    throw new Error("ECONNREFUSED");
  });

  const decision = await gate(
    exec("dshmarketplace_install", { fullName: "acme/danger" }),
    () => sentinel,
  );

  assert.equal(decision, sentinel);
});

test("a host that passes no next() still gets a decision, never undefined", async () => {
  const gate = createApprovalGate(catalogWith());

  const decision = await gate(exec("Bash", { command: "ls" }), undefined);

  assert.deepEqual(decision, { kind: "allow" });
});

test("the older event shape (tool.name) is still recognised", async () => {
  const gate = createApprovalGate(catalogWith(RISKY));

  const decision = await gate(
    { tool: { name: "dshmarketplace_install" }, arguments: { fullName: "acme/danger" } },
    () => ({ kind: "allow" }),
  );

  assert.equal(decision.kind, "ask");
});

test("a missing fullName passes through without a catalogue round-trip", async () => {
  let fetched = 0;
  const gate = createApprovalGate(async () => {
    fetched += 1;
    return { results: [] };
  });

  const decision = await gate(exec("dshmarketplace_install", {}), () => ({ kind: "allow" }));

  assert.equal(decision.kind, "allow");
  assert.equal(fetched, 0);
});
