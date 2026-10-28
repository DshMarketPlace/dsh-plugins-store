import assert from "node:assert/strict";
import { test } from "node:test";

import { ANY_SESSION, createQueryInbox, resolveStoreOpen, sessionKeyOf, takeStoreQuery } from "../src/shared.js";

// Regression for GH #1: a bare `command/executed` whose result is `undefined`
// used to reach `result.kind` and throw "Cannot read properties of undefined
// (reading 'kind')". Because the throw escaped a host event handler, it took
// down tool dispatch for the whole session. The decision must be total.

test("does not throw and does not open when the result is undefined", () => {
  assert.doesNotThrow(() => resolveStoreOpen("store", undefined));
  assert.deepEqual(resolveStoreOpen("store", undefined), { open: false, query: "" });
});

test("does not throw for any command name when the result is missing", () => {
  assert.deepEqual(resolveStoreOpen("ls", undefined), { open: false, query: "" });
  assert.deepEqual(resolveStoreOpen("store", null), { open: false, query: "" });
});

test("opens with an empty query for a bare /store success", () => {
  assert.deepEqual(resolveStoreOpen("store", { kind: "success" }), { open: true, query: "" });
});

test("opens with the query carried by /store <query>", () => {
  assert.deepEqual(resolveStoreOpen("store", { kind: "success", query: "memory" }), {
    open: true,
    query: "memory",
  });
});

test("stays closed for a non-store command that also succeeded", () => {
  assert.deepEqual(resolveStoreOpen("ls", { kind: "success" }), { open: false, query: "" });
});

test("stays closed when the store command failed", () => {
  assert.deepEqual(resolveStoreOpen("store", { kind: "error", text: "boom" }), {
    open: false,
    query: "",
  });
});

// dsh 0.2.1+ keeps only kind/text/sourceEventSeq of a command result, so a
// `/store <query>` reaches the browser through the host's one-shot inbox.

test("the inbox hands a parked query over once, per session", () => {
  const inbox = createQueryInbox();
  inbox.put("s1", "memory");
  inbox.put("s2", "browser");
  assert.equal(inbox.take("s1"), "memory");
  assert.equal(inbox.take("s1"), "");
  assert.equal(inbox.take("s2"), "browser");
});

test("the inbox drops stale and excess entries and ignores junk", () => {
  let t = 0;
  const inbox = createQueryInbox({ ttlMs: 1000, max: 2, now: () => t });
  inbox.put("a", "one");
  t = 2000;
  assert.equal(inbox.take("a"), "");
  inbox.put("a", "1");
  inbox.put("b", "2");
  inbox.put("c", "3");
  assert.equal(inbox.take("a"), "");
  assert.equal(inbox.take("c"), "3");
  inbox.put("", "x");
  inbox.put("d", "");
  inbox.put(undefined, "x");
  assert.equal(inbox.take(""), "");
  assert.equal(inbox.take(undefined), "");
  assert.equal(inbox.take(ANY_SESSION), "");
});

test("the session key is read from agent.session.id, never throwing", () => {
  assert.equal(sessionKeyOf({ session: { id: "ses_1" } }), "ses_1");
  assert.equal(sessionKeyOf(undefined), undefined);
  assert.equal(sessionKeyOf({ session: { id: 7 } }), undefined);
  const hostile = { get session() { throw new Error("boom"); } };
  assert.equal(sessionKeyOf(hostile), undefined);
});

test("takeStoreQuery asks for this session and returns the parked query", async () => {
  let asked;
  const fetchImpl = async (url) => {
    asked = url;
    return { ok: true, json: async () => ({ query: "memory" }) };
  };
  assert.equal(await takeStoreQuery("ses 1", { fetchImpl }), "memory");
  assert.equal(asked, "/api/dshmarketplace/store-query?session=ses%201");
});

test("takeStoreQuery resolves to an empty query on every failure", async () => {
  assert.equal(await takeStoreQuery("s", { fetchImpl: async () => { throw new Error("offline"); } }), "");
  assert.equal(await takeStoreQuery("s", { fetchImpl: async () => ({ ok: false }) }), "");
  assert.equal(await takeStoreQuery("s", { fetchImpl: async () => ({ ok: true, json: async () => ({ query: 3 }) }) }), "");
  assert.equal(await takeStoreQuery("s", { fetchImpl: async () => ({ ok: true, json: async () => { throw new Error("bad json"); } }) }), "");
  const hang = (_url, { signal }) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted"))));
  assert.equal(await takeStoreQuery("s", { fetchImpl: hang, timeoutMs: 20 }), "");
});
