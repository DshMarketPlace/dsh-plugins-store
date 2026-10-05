import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../scripts/publish.mjs", import.meta.url));

async function runPublish(t, scenario) {
  const cwd = mkdtempSync(join(tmpdir(), "dsh-publish-test-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  writeFileSync(join(cwd, "package.json"), JSON.stringify({ name: "publish-fixture", version: "0.2.0" }));
  execFileSync("npm", ["pack", "--silent", "--ignore-scripts"], { cwd, stdio: "ignore" });
  const tarball = join(cwd, "publish-fixture-0.2.0.tgz");
  const integrity = `sha512-${createHash("sha512").update(readFileSync(tarball)).digest("base64")}`;
  rmSync(tarball);
  let metadata = scenario === "new" ? {} : {
    versions: { "0.2.0": { dist: { integrity: scenario === "different" ? "different" : integrity } } },
    "dist-tags": { latest: scenario === "old-tag" ? "0.1.7" : "0.2.0" },
  };
  let uploads = 0;
  const server = createServer(async (req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.method === "PUT") {
      uploads++;
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      metadata = JSON.parse(Buffer.concat(chunks).toString());
      res.end(JSON.stringify({ success: true }));
    } else {
      res.end(JSON.stringify(metadata));
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const child = spawn(process.execPath, [script], {
    cwd,
    env: { ...process.env, NODE_AUTH_TOKEN: "fixture-token", NPM_REGISTRY: `http://127.0.0.1:${server.address().port}` },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (data) => { output += data; });
  child.stderr.on("data", (data) => { output += data; });
  const code = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });
  return { code, output, uploads };
}

test("retry accepts the identical published tarball without uploading again", async (t) => {
  const result = await runPublish(t, "same");
  assert.equal(result.code, 0, result.output);
  assert.equal(result.uploads, 0);
});

for (const scenario of ["different", "old-tag"]) {
  test(`retry refuses an existing version with ${scenario}`, async (t) => {
    const result = await runPublish(t, scenario);
    assert.equal(result.code, 1, result.output);
    assert.equal(result.uploads, 0);
    assert.match(result.output, /different tarball or latest tag/);
  });
}

test("publish verifies the registry tarball integrity and latest tag", async (t) => {
  const result = await runPublish(t, "new");
  assert.equal(result.code, 0, result.output);
  assert.equal(result.uploads, 1);
  assert.match(result.output, /published publish-fixture@0.2.0/);
});
