import { runNativeCommand } from "@deepseek-ai/dsh-native-command";

import { fetchCatalog, describe, hasRisk } from "./catalog.js";
import { createInstallHandler, installPlan, send } from "./installer.js";
import { currentProfile } from "./profile.js";
import { createTools } from "./tools.js";
import { reportInstall } from "./telemetry.js";
import { loadStoreSkill } from "./skill.js";

export const name = "dshmarketplace-plugin";
export const inject = ["commands", "webServer", "tools", "skills"];

const BASE = "/api/dshmarketplace";
const SEARCH_PATH = `${BASE}/search`;
const INSTALL_PATH = `${BASE}/install`;

const PROFILE = currentProfile();

function runnerOptions(signal) {
  return {
    runner: runNativeCommand,
    execPath: process.execPath,
    cliPath: process.argv[1],
    profile: PROFILE,
    signal,
  };
}

/**
 * Nothing that reaches a terminal, a credential or an install script gets run
 * on the model's say-so. The catalogue already detects those; this turns the
 * detection into a stop.
 */
function createApprovalGate() {
  return async (event) => {
    if (event?.tool?.name !== "dshmarketplace_install") return;

    const fullName = event.arguments?.fullName;
    if (!fullName) return;

    const data = await fetchCatalog({ q: fullName, limit: 5 });
    const plugin = (data.results ?? []).find((p) => p.fullName === fullName);
    if (!plugin || !hasRisk(plugin)) return;

    event.requireApproval?.({
      title: `Install ${plugin.name}?`,
      detail: [
        `${plugin.fullName} — ${describe(plugin, "en")}`,
        "",
        `Detected: ${plugin.riskFlags.join(", ")}.`,
        "Plugins run with this agent's permissions. Detection is heuristic;",
        "an empty list would not have meant the plugin was safe.",
        "",
        plugin.url,
      ].join("\n"),
    });
  };
}

export function apply(ctx) {
  ctx.commands.register({
    name: "store",
    description: "Browse DeepSeek Harness plugins from DSH Marketplace",
    handler: ({ rawInput }) =>
      rawInput.trim() === ""
        ? { kind: "success" }
        : { kind: "success", query: rawInput.trim() },
  });

  for (const tool of createTools(runnerOptions())) ctx.tools.register(tool);
  ctx.on("tools/pre-execute", createApprovalGate());

  const skill = loadStoreSkill();
  if (skill) ctx.skills.register(skill);

  // The browser half cannot reach npm or the shell. These two endpoints are
  // the whole bridge, and both are exact-path.
  ctx.webServer.register({
    kind: "exact",
    path: SEARCH_PATH,
    handler: async (req, res) => {
      const url = new URL(req.url, "http://localhost");
      try {
        const data = await fetchCatalog({
          q: url.searchParams.get("q") ?? undefined,
          category: url.searchParams.get("category") ?? undefined,
          limit: url.searchParams.get("limit") ?? 60,
        });
        send(res, 200, data);
      } catch (err) {
        send(res, 502, { error: err.message });
      }
    },
  });

  ctx.webServer.register({
    kind: "exact",
    path: INSTALL_PATH,
    handler: createInstallHandler({
      install: (plan) => installPlan(plan, runnerOptions()),
      onInstalled: reportInstall,
    }),
  });
}
