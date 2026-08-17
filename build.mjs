import { mkdir, rm, writeFile } from "node:fs/promises";
import { build } from "esbuild";

const root = new URL("./", import.meta.url);
const outDir = new URL("./lib/", root);

// Must match the package name — the loader keys the registry on it.
const PACKAGE_ID = JSON.parse(
  await (await import("node:fs/promises")).readFile(new URL("./package.json", root), "utf8"),
).name;

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

// Host half: runs in the harness's Node process.
await build({
  entryPoints: [new URL("./src/index.js", root).pathname],
  outfile: new URL("./index.js", outDir).pathname,
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  external: ["@deepseek-ai/dsh-native-command", "@deepseek-ai/dsh-tools"],
  minify: true,
});

// Browser half. Written to memory first so the module allowlist below can be
// checked before anything lands on disk.
const client = await build({
  entryPoints: [new URL("./src/client.jsx", root).pathname],
  bundle: true,
  format: "cjs",
  platform: "browser",
  target: ["chrome120"],
  external: ["react", "@deepseek-ai/dsh-client-ui-primitives"],
  jsxFactory: "React.createElement",
  jsxFragment: "React.Fragment",
  minify: true,
  write: false,
});

if (client.outputFiles?.length !== 1) {
  throw new Error(`expected one browser bundle, got ${client.outputFiles?.length}`);
}

const code = client.outputFiles[0].text;

// The harness only provides these two modules to a client bundle. Anything
// else resolves to undefined at runtime, inside someone else's install — so
// this is a build failure on our machine instead.
const ALLOWED = new Set(["react", "@deepseek-ai/dsh-client-ui-primitives"]);
const required = [...code.matchAll(/\brequire\("([^"]+)"\)/g)].map((m) => m[1]);
const unsupported = [...new Set(required)].filter((id) => !ALLOWED.has(id));

if (unsupported.length > 0) {
  throw new Error(`unsupported client modules: ${unsupported.join(", ")}`);
}

// The harness loads client bundles through its own module registry rather
// than as plain scripts. A bundle that does not announce itself is fetched,
// evaluated, and then rejected with "loaded without registering ... via
// __ModuleLoader__.load" — so esbuild's CommonJS output gets wrapped in the
// envelope the loader expects, with `require` supplied by the factory.
const wrapped = [
  'window.__ModuleLoader__.load({',
  `  id: ${JSON.stringify(PACKAGE_ID)},`,
  "  factory: (require) => {",
  "    var module = { exports: {} };",
  "    var exports = module.exports;",
  '    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });',
  code,
  "    return module.exports;",
  "  },",
  "});",
].join("\n");

await writeFile(new URL("./client.js", outDir), wrapped);

console.log(
  `built lib/index.js and lib/client.js (${(wrapped.length / 1024).toFixed(1)} KB client)`,
);
