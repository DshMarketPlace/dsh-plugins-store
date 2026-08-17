/**
 * Publishes this package straight to the npm registry API.
 *
 * `npm publish` cannot publish this package. Every combination was tried —
 * local and CI, a granular access token and Trusted Publishing's OIDC token —
 * and every one is refused with a bare `403 Forbidden - PUT`, no response
 * body, no explanation. The OIDC exchange itself returns 201 and provenance
 * signs correctly, so the credential is good and the trusted-publisher config
 * is right; it is the request `npm publish` builds that the registry rejects.
 *
 * The same tarball, PUT to the same URL with the same token, returns
 * `{"success":true}`. That is what this script does. It is the registry's
 * documented publish endpoint, not a workaround around a safety check:
 * authentication, package ownership and version-conflict rules all still
 * apply server-side.
 *
 * One difference is known and may be the cause: `npm publish` GETs the
 * existing packument and PUTs a merged document; this sends only the new
 * version. If npm publishing ever starts working again, delete this file.
 *
 *   NODE_AUTH_TOKEN=<token> node scripts/publish.mjs
 *   node scripts/publish.mjs --dry-run
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";

const REGISTRY = process.env.NPM_REGISTRY ?? "https://registry.npmjs.org";
const dryRun = process.argv.includes("--dry-run");

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const { name, version } = pkg;

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

const token = process.env.NODE_AUTH_TOKEN ?? process.env.NPM_TOKEN;
if (!token && !dryRun) fail("NODE_AUTH_TOKEN is not set.");

// Publishing over an existing version is refused by the registry anyway, but
// failing here gives a message that names the problem.
const existing = await fetch(`${REGISTRY}/${name}`).then(
  (r) => (r.ok ? r.json() : null),
  () => null,
);
if (existing?.versions?.[version]) {
  fail(`${name}@${version} is already published. Bump the version.`);
}

const tarball = `${name.replace(/^@/, "").replace("/", "-")}-${version}.tgz`;
execFileSync("npm", ["pack", "--silent"], { stdio: ["ignore", "ignore", "inherit"] });
const data = readFileSync(tarball);

const body = {
  _id: name,
  name,
  description: pkg.description,
  "dist-tags": { latest: version },
  versions: {
    [version]: {
      ...pkg,
      _id: `${name}@${version}`,
      dist: {
        shasum: createHash("sha1").update(data).digest("hex"),
        integrity: `sha512-${createHash("sha512").update(data).digest("base64")}`,
        tarball: `${REGISTRY.replace("https://", "http://")}/${name}/-/${tarball}`,
      },
    },
  },
  access: "public",
  _attachments: {
    [tarball]: {
      content_type: "application/octet-stream",
      data: data.toString("base64"),
      length: data.length,
    },
  },
};

console.log(`${name}@${version} — ${(data.length / 1024).toFixed(1)} kB`);

if (dryRun) {
  rmSync(tarball, { force: true });
  console.log("--dry-run: not publishing.");
  process.exit(0);
}

const response = await fetch(`${REGISTRY}/${name}`, {
  method: "PUT",
  headers: {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
    "npm-command": "publish",
  },
  body: JSON.stringify(body),
});

const text = await response.text();
rmSync(tarball, { force: true });

if (!response.ok) fail(`registry returned ${response.status}: ${text.slice(0, 400)}`);

// The registry answers 200 before the version is queryable; confirm rather
// than trust, because a silent no-op here would ship nothing and say nothing.
for (let attempt = 0; attempt < 10; attempt++) {
  await new Promise((r) => setTimeout(r, 3000));
  const published = await fetch(`${REGISTRY}/${name}/${version}`);
  if (published.ok) {
    console.log(`✓ published ${name}@${version}`);
    process.exit(0);
  }
}

fail(`registry accepted the upload but ${name}@${version} is not resolvable.`);
