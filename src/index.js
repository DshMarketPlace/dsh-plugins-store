import { runNativeCommand } from "@deepseek-ai/dsh-native-command";

import { fetchCatalog, onlyVerified } from "./catalog.js";
import { createApprovalGate } from "./gate.js";
import { createInstallHandler, installPlan, send } from "./installer.js";
import { currentProfile } from "./profile.js";
import { createTools } from "./tools.js";
import { reportInstall } from "./telemetry.js";
import { loadStoreSkill } from "./skill.js";
import { addIndexCommand, setupMarketIndex } from "./market-index.js";
import { ANY_SESSION, STORE_QUERY_PATH, createQueryInbox, sessionKeyOf } from "./shared.js";

export const name = "dshmarketplace-plugin";
export const inject = ["commands", "webServer", "tools", "skills"];

const BASE = "/api/dshmarketplace";
const SEARCH_PATH = `${BASE}/search`;
const INSTALL_PATH = `${BASE}/install`;

const PROFILE = currentProfile();

/** cordis exposes a scoped logger factory; anything else gets no logging. */
function loggerOf(ctx) {
  try {
    const logger = ctx.logger;
    return typeof logger === "function" ? logger("dshmarketplace") : logger;
  } catch {
    return undefined;
  }
}

function profileDir(ctx) {
  try {
    return ctx.get?.("profileContext")?.dir;
  } catch {
    return undefined;
  }
}

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
  // dsh 0.1 hands the result to the client as is, so `query` rides on it there.
  // dsh 0.2.1+ strips it, so the handler also parks it for the client to take
  // from STORE_QUERY_PATH.
  const storeQueries = createQueryInbox();
  ctx.commands.register({
    name: "store",
    description: "Browse DeepSeek Harness plugins from DSH Marketplace",
    handler: ({ rawInput, agent } = {}) => {
      const query = typeof rawInput === "string" ? rawInput.trim() : "";
      if (!query) return { kind: "success" };
      storeQueries.put(sessionKeyOf(agent) ?? ANY_SESSION, query);
      return { kind: "success", query };
    },
  });
  ctx.webServer.register({
    kind: "exact",
    path: STORE_QUERY_PATH,
    handler: (req, res) => {
      try {
        const session = new URL(req.url, "http://localhost").searchParams.get("session") ?? "";
        send(res, 200, { query: storeQueries.take(session) || storeQueries.take(ANY_SESSION) });
      } catch {
        send(res, 200, { query: "" });
      }
    },
  });

  // One step to the index in Plugins → Discover (dsh 0.2.1-rc.2+). The
  // automatic half runs once per profile; this is the explicit way back.
  ctx.commands.register({
    name: "store-index",
    description: "Add the DSH Marketplace index to Plugins → Discover / 把 DSH Marketplace 索引加入「发现」",
    handler: () => addIndexCommand(ctx, { dir: profileDir(ctx) }),
  });
  setupMarketIndex(ctx, { logger: loggerOf(ctx) });

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
