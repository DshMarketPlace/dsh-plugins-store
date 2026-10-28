import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  INDEX_URL,
  MARKET_BUNDLE,
  MESSAGES,
  STATE_FILE,
  addIndexCommand,
  ensureIndex,
  ensureMarketBundle,
  outsideReload,
  setupMarketIndex,
} from "../src/market-index.js";

// The contract under test, against the dsh 0.2.1-rc.2 … 0.2.2-alpha.2 API
// (`pluginMarket.listIndexes/setIndexes`, `pluginManager.listBundles/
// setBundleEnabled`): never duplicate a source, never drop or rewrite the
// user's other sources, respect a removal, and never throw out of a handler.

async function profile() {
  return mkdtemp(join(tmpdir(), "dshm-index-"));
}

function fakeMarket(urls = []) {
  const market = {
    urls: [...urls],
    writes: 0,
    listIndexes() {
      return market.urls.map((url) => ({ url }));
    },
    async setIndexes(next) {
      // The host's own rule: a repeated URL is refused.
      const keys = next.map((u) => new URL(u).href);
      if (new Set(keys).size !== keys.length) throw new Error("Index source listed twice");
      market.writes += 1;
      market.urls = [...next];
    },
  };
  return market;
}

function fakeManager({ enabled = false, availability = "installation", application = "applied", present = true } = {}) {
  const manager = {
    calls: [],
    async listBundles() {
      return present ? [{ name: MARKET_BUNDLE, enabled, availability }, { name: "other", enabled: true }] : [];
    },
    async setBundleEnabled(name, on) {
      manager.calls.push([name, on]);
      return application === "failed"
        ? { application, error: { message: "nope" } }
        : { application, changed: true };
    },
  };
  return manager;
}

test("adds the index after the user's sources, once", async (t) => {
  const dir = await profile();
  t.after(() => rm(dir, { recursive: true, force: true }));
  const market = fakeMarket(["https://dshopen.org/index.json", "http://broken"]);

  assert.equal(await ensureIndex(market, { dir }), "added");
  assert.deepEqual(market.urls, ["https://dshopen.org/index.json", "http://broken", INDEX_URL]);
  assert.equal(await ensureIndex(market, { dir }), "skipped");
  assert.equal(market.writes, 1);
});

test("a source already configured under another spelling is not added again", async (t) => {
  const dir = await profile();
  t.after(() => rm(dir, { recursive: true, force: true }));
  const market = fakeMarket(["https://DSHMARKETPLACE.dev/market/index.json"]);

  assert.equal(await ensureIndex(market, { dir }), "present");
  assert.equal(market.writes, 0);
});

test("a source the user removed stays removed until they ask", async (t) => {
  const dir = await profile();
  t.after(() => rm(dir, { recursive: true, force: true }));
  const market = fakeMarket();
  await ensureIndex(market, { dir });
  market.urls = []; // removed in Manage index sources…

  assert.equal(await ensureIndex(market, { dir }), "skipped");
  assert.deepEqual(market.urls, []);
  assert.equal(await ensureIndex(market, { dir, force: true }), "added");
  assert.deepEqual(market.urls, [INDEX_URL]);
});

test("a corrupt marker file reads as no marker", async (t) => {
  const dir = await profile();
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(join(dir, STATE_FILE), "{not json");
  const market = fakeMarket();

  assert.equal(await ensureIndex(market, { dir }), "added");
  const state = JSON.parse(await readFile(join(dir, STATE_FILE), "utf8"));
  assert.deepEqual(state.indexAdded, [INDEX_URL]);
});

test("the bundle is switched on once, and a later switch-off is respected", async (t) => {
  const dir = await profile();
  t.after(() => rm(dir, { recursive: true, force: true }));
  const manager = fakeManager({ application: "restart-required" });

  assert.equal(await ensureMarketBundle(manager, { dir }), "restart");
  assert.deepEqual(manager.calls, [[MARKET_BUNDLE, true]]);
  assert.equal(await ensureMarketBundle(manager, { dir }), "skipped");
  assert.equal(manager.calls.length, 1);
});

test("a host without the bundle, or without the API, is unavailable", async () => {
  assert.equal(await ensureMarketBundle(fakeManager({ present: false })), "unavailable");
  assert.equal(await ensureMarketBundle(fakeManager({ availability: "missing" })), "unavailable");
  assert.equal(await ensureMarketBundle({ listPlugins() {} }), "unavailable");
  assert.equal(await ensureMarketBundle(undefined), "unavailable");
});

test("an already-enabled bundle is left alone", async () => {
  const manager = fakeManager({ enabled: true });
  assert.equal(await ensureMarketBundle(manager), "on");
  assert.equal(manager.calls.length, 0);
});

function ctxWith(services) {
  return { get: (name) => services[name] };
}

test("/store-index on dsh without index support answers, it does not throw", async () => {
  for (const services of [{}, { pluginManager: {} }, { pluginManager: fakeManager({ present: false }) }]) {
    const result = await addIndexCommand(ctxWith(services), {});
    assert.deepEqual(result, { kind: "error", text: MESSAGES.unavailable });
  }
  // dsh 0.1 contexts may have no `get` at all.
  assert.equal((await addIndexCommand({}, {})).kind, "error");
});

test("/store-index adds the index when Discover is on, even after a removal", async (t) => {
  const dir = await profile();
  t.after(() => rm(dir, { recursive: true, force: true }));
  const market = fakeMarket();
  await ensureIndex(market, { dir });
  market.urls = [];

  const result = await addIndexCommand(ctxWith({ pluginMarket: market }), { dir });
  assert.equal(result.kind, "success");
  assert.deepEqual(market.urls, [INDEX_URL]);
  const again = await addIndexCommand(ctxWith({ pluginMarket: market }), { dir });
  assert.equal(again.text, MESSAGES.ready(INDEX_URL, "present"));
  assert.deepEqual(market.urls, [INDEX_URL]);
});

test("/store-index switches Discover on and defers the source to its mount", async (t) => {
  const dir = await profile();
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(join(dir, STATE_FILE), JSON.stringify({ indexAdded: [INDEX_URL] }));
  const manager = fakeManager({ application: "restart-required" });

  const result = await addIndexCommand(ctxWith({ pluginManager: manager }), { dir });
  assert.deepEqual(result, { kind: "success", text: MESSAGES.restart });
  // The marker no longer blocks the automatic add at the next start.
  const market = fakeMarket();
  assert.equal(await ensureIndex(market, { dir }), "added");
});

test("/store-index reports a refused change as an error result", async () => {
  const result = await addIndexCommand(ctxWith({ pluginManager: fakeManager({ application: "failed" }) }), {});
  assert.equal(result.kind, "error");
  assert.match(result.text, /nope/);

  const throwing = { listIndexes() { throw new Error("boom"); }, setIndexes() {} };
  const r2 = await addIndexCommand(ctxWith({ pluginMarket: throwing }), {});
  assert.deepEqual(r2, { kind: "error", text: MESSAGES.failed("boom") });
});

test("writes step outside a running HMR transaction", async () => {
  let exited = 0;
  const ctx = { get: (name) => (name === "hmr" ? { executing: { exit: (fn) => { exited += 1; return fn(); } } } : undefined) };
  assert.equal(await outsideReload(ctx, async () => 7), 7);
  assert.equal(exited, 1);
  assert.equal(await outsideReload({}, async () => 8), 8);
  assert.equal(await outsideReload({ get() { throw new Error("x"); } }, async () => 9), 9);
});

test("setup seeds both halves through ctx.inject and swallows failures", async (t) => {
  const dir = await profile();
  t.after(() => rm(dir, { recursive: true, force: true }));
  const market = fakeMarket(["https://dshopen.org/index.json"]);
  const manager = fakeManager();
  const services = { profileContext: { dir }, pluginMarket: market, pluginManager: manager };
  const callbacks = [];
  const ctx = { get: (n) => services[n], inject: (deps, cb) => callbacks.push([deps, cb]) };
  const warnings = [];

  setupMarketIndex(ctx, { logger: { warn: (m) => warnings.push(m), info() {} } });
  assert.deepEqual(callbacks.map(([deps]) => deps), [["pluginManager"], ["pluginMarket"]]);
  for (const [, cb] of callbacks) cb(ctx);
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.deepEqual(market.urls, ["https://dshopen.org/index.json", INDEX_URL]);
  assert.deepEqual(manager.calls, [[MARKET_BUNDLE, true]]);
  assert.deepEqual(warnings, []);

  // A service that blows up is a warning, never an unhandled rejection.
  const fresh = await profile();
  t.after(() => rm(fresh, { recursive: true, force: true }));
  const bad = {
    listIndexes() { throw new Error("bad"); },
    async listBundles() { throw new Error("worse"); },
    async setBundleEnabled() {},
  };
  const broken = { get: (n) => (n === "profileContext" ? { dir: fresh } : bad) };
  const later = [];
  setupMarketIndex({ ...broken, inject: (deps, cb) => later.push(cb) }, { logger: { warn: (m) => warnings.push(m) } });
  for (const cb of later) cb(broken);
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(warnings.length, 2);
  assert.match(warnings.join("\n"), /bad/);
  assert.match(warnings.join("\n"), /worse/);
});

test("setup does nothing on hosts without inject or a profile directory", () => {
  assert.doesNotThrow(() => setupMarketIndex({}));
  assert.doesNotThrow(() => setupMarketIndex({ get: () => undefined, inject() { throw new Error("never"); } }));
  assert.doesNotThrow(() => setupMarketIndex({ get: () => ({ dir: "/x" }), inject() { throw new Error("old"); } }));
});
