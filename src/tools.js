import { defineTool } from "@deepseek-ai/dsh-tools";

import { fetchCatalog } from "./catalog.js";
import { installPlan, planFromPlugin } from "./installer.js";
import { reportInstall } from "./telemetry.js";

/**
 * `output.schema` is enforced, not advisory — the runtime validates what
 * `execute` returns against it and throws on a mismatch. So every field is
 * coerced to a definite type before it is returned: the catalogue's `license`,
 * `pushedAt` and `category` are all nullable upstream, and a null would fail
 * validation rather than degrade.
 */
const RESULT_ITEM = {
  type: "object",
  additionalProperties: false,
  properties: {
    fullName: { type: "string", required: true },
    summary: { type: "string", required: true },
    category: { type: "string", required: true },
    stars: { type: "number", required: true },
    license: { type: "string", required: true },
    pushedAt: { type: "string", required: true },
    inRegistry: { type: "boolean", required: true },
    riskFlags: { type: "array", required: true, items: { type: "string" } },
    install: { type: "string", required: true },
    url: { type: "string", required: true },
  },
};

function normalise(p) {
  return {
    fullName: String(p.fullName ?? ""),
    summary: String(p.summary ?? ""),
    category: String(p.category ?? "uncategorised"),
    stars: Number(p.stars ?? 0),
    license: String(p.license ?? "none detected"),
    pushedAt: String(p.pushedAt ?? ""),
    inRegistry: Boolean(p.inRegistry),
    riskFlags: Array.isArray(p.riskFlags) ? p.riskFlags.map(String) : [],
    install: String(p.install ?? ""),
    url: String(p.url ?? ""),
  };
}

function renderResults(_args, value) {
  if (value.results.length === 0) {
    return [{ type: "text", text: "No plugins matched." }];
  }

  const lines = value.results.map((p) => {
    const flags = p.riskFlags.length ? ` · reaches: ${p.riskFlags.join(", ")}` : "";
    const registry = p.inRegistry ? " · in the community registry" : "";
    return `- **${p.fullName}** (${p.stars}★, ${p.license})${registry}${flags}\n  ${p.summary}\n  \`${p.install}\`\n  ${p.url}`;
  });

  return [
    {
      type: "text",
      text: `${value.total} matching plugin(s); showing ${value.results.length}.\n\n${lines.join("\n")}`,
    },
  ];
}

export function createTools({ profile, runner, execPath, cliPath }) {
  const search = defineTool({
    name: "dshmarketplace_search",
    description:
      "Search the DSH Marketplace catalogue of DeepSeek Harness plugins by capability, name or author. Returns install commands and detected risk flags. Use this before suggesting any plugin rather than recalling one from memory — the DSH ecosystem is days old and a remembered name is as likely to be wrong as right.",
    parameters: {
      query: {
        type: "string",
        required: true,
        description:
          "A capability rather than a product name — 'memory', 'vision', 'terminal ui'.",
      },
      category: {
        type: "string",
        description: "Optional category id, for example 'memory' or 'vision'.",
      },
      limit: { type: "number", description: "Default 10, maximum 30." },
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          total: { type: "number", required: true },
          results: { type: "array", required: true, items: RESULT_ITEM },
        },
      },
      render: renderResults,
    },
    execute: async ({ query, category, limit }, exec) => {
      const data = await fetchCatalog(
        {
          q: query,
          category,
          limit: Math.min(Number(limit) || 10, 30),
        },
        exec?.signal,
      );

      return {
        total: Number(data.total ?? 0),
        results: (data.results ?? []).map(normalise),
      };
    },
  });

  const install = defineTool({
    name: "dshmarketplace_install",
    description:
      "Install a DeepSeek Harness plugin found via dshmarketplace_search, using the exact fullName from a search result. Tell the user what the plugin reaches before calling this.",
    parameters: {
      fullName: {
        type: "string",
        required: true,
        description: "Exact fullName from a dshmarketplace_search result.",
      },
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          installed: { type: "string", required: true },
          target: { type: "string", required: true },
          restartRequired: { type: "boolean", required: true },
        },
      },
      render: (_args, value) => [
        {
          type: "text",
          text: `Installed ${value.installed} (${value.target}). Restart DSH for it to load.`,
        },
      ],
    },
    execute: async ({ fullName }, exec) => {
      const data = await fetchCatalog({ q: fullName, limit: 5 }, exec?.signal);
      const plugin = (data.results ?? []).find((p) => p.fullName === fullName);
      if (!plugin) throw new Error(`Not in the catalogue: ${fullName}`);

      const result = await installPlan(planFromPlugin(plugin), {
        runner,
        execPath,
        cliPath,
        profile,
        signal: exec?.signal,
      });

      reportInstall(plugin).catch(() => {});
      return {
        installed: plugin.fullName,
        target: result.target,
        restartRequired: true,
      };
    },
  });

  return [search, install];
}
