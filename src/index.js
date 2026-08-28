import { runNativeCommand } from "@deepseek-ai/dsh-native-command";

import { fetchCatalog, onlyVerified } from "./catalog.js";
import { createApprovalGate } from "./gate.js";
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
        // The store lists only sandbox-passed plugins. An install button that
        // errors is our name on someone else's screen; a listing that is
        // absent is nothing. The full catalogue stays on the website, where a
        // verdict badge can explain itself.
        const data = await fetchCatalog({
          q: url.searchParams.get("q") ?? undefined,
          category: url.searchParams.get("category") ?? undefined,
          limit: url.searchParams.get("limit") ?? 60,
          installCheck: "passed",
        });
        send(res, 200, onlyVerified(data));
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
