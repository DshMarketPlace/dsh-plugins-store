import { fileURLToPath } from "node:url";
import { sep } from "node:path";

/**
 * Works out which profile this copy of the plugin is installed into.
 *
 * `dsh plugin add` is a thin forward to pnpm inside the profile directory, so
 * it requires `--profile <name>` and there is no environment variable saying
 * which one is booted. But the plugin's own file path contains the answer:
 * it lives at `$DSH_HOME/profiles/<name>/node_modules/<pkg>/lib/index.js`.
 */
export function currentProfile(fromUrl = import.meta.url) {
  const parts = fileURLToPath(fromUrl).split(sep);
  const at = parts.lastIndexOf("profiles");
  const name = at !== -1 ? parts[at + 1] : undefined;
  return name && name !== "node_modules" ? name : "web";
}
