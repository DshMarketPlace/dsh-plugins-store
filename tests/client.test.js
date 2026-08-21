import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveStoreOpen } from "../src/shared.js";

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
