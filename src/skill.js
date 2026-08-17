import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Minimal frontmatter reader — enough for `name` and `description`, which is
 * all the runtime validates. Not a YAML parser, and deliberately so: adding
 * one to ship two strings would be the wrong trade.
 */
function parseFrontmatter(raw) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  if (!match) return { meta: {}, body: raw };

  const meta = {};
  for (const line of match[1].split(/\r?\n/)) {
    const at = line.indexOf(":");
    if (at === -1) continue;
    const key = line.slice(0, at).trim();
    const value = line.slice(at + 1).trim().replace(/^["']|["']$/g, "");
    if (key) meta[key] = value;
  }
  return { meta, body: match[2] };
}

/**
 * Ships the finder skill inside the package so an agent routes to the
 * catalogue on its own, without the user having to know this plugin exists.
 *
 * The runtime requires a kebab-case name and a non-empty description; a skill
 * carrying only its body fails the whole plugin tree at boot.
 */
export function loadStoreSkill() {
  for (const candidate of [
    join(HERE, "..", "skills", "dsh-plugin-store", "SKILL.md"),
    join(HERE, "skills", "dsh-plugin-store", "SKILL.md"),
  ]) {
    let raw;
    try {
      raw = readFileSync(candidate, "utf8");
    } catch {
      continue;
    }

    const { meta, body } = parseFrontmatter(raw);
    const name = meta.name ?? "dsh-plugin-store";
    const description = meta.description ?? "";
    if (!description) return null;

    return {
      name,
      description,
      content: body.trim(),
      invocation: { modelInvocable: true, userInvocable: true },
    };
  }
  return null;
}
