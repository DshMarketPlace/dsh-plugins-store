/**
 * Puts the dshmarketplace.dev plugin index into DSH's Discover tab.
 *
 * From dsh 0.2.1-rc.2 the experimental bundle
 * `@deepseek-ai/dsh-experimental-plugin-market-bundle` ("Custom plugin
 * indexes") mounts a `pluginMarket` service whose `listIndexes()` /
 * `setIndexes(urls)` read and write the profile's index sources, and the
 * plugin manager's `listBundles()` / `setBundleEnabled()` switch the bundle
 * on. Older hosts ship none of it, and that is a message, not an error.
 *
 * Everything here runs from host lifecycle callbacks or a command handler,
 * so every entry point is total: it resolves to a result, never throws.
 *
 * What the user chose is respected: the source is added once per profile
 * (a marker file in the profile directory remembers it), so a source the
 * user removed stays removed and a bundle they switched off stays off.
 * `/store-index` is the explicit request that overrides both.
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const INDEX_URL = "https://dshmarketplace.dev/market/index.json";
export const MARKET_BUNDLE = "@deepseek-ai/dsh-experimental-plugin-market-bundle";
export const STATE_FILE = ".dshmarketplace-plugin.json";

const MIN_DSH = "0.2.1-rc.2";

/** The serialisation `setIndexes` compares by, so `/x` and `/x?` spellings are one source. */
export function canonical(url) {
  try {
    return new URL(String(url).trim()).href;
  } catch {
    return String(url);
  }
}

export async function readState(dir) {
  if (!dir) return {};
  try {
    const state = JSON.parse(await readFile(join(dir, STATE_FILE), "utf8"));
    return state && typeof state === "object" && !Array.isArray(state) ? state : {};
  } catch {
    return {};
  }
}

async function writeState(dir, patch) {
  if (!dir) return;
  const state = { ...(await readState(dir)), ...patch };
  await writeFile(join(dir, STATE_FILE), `${JSON.stringify(state, null, 2)}\n`);
}

function seededList(state) {
  return Array.isArray(state.indexAdded) ? state.indexAdded.filter((u) => typeof u === "string") : [];
}

/**
 * Append the index to the profile's sources unless it is there already.
 * Other sources are passed back exactly as `listIndexes` reported them,
 * unusable ones included, so nothing the user configured is rewritten.
 * @returns "added" | "present" | "skipped" (seeded before, and not forced)
 */
export async function ensureIndex(market, { url = INDEX_URL, dir, force = false } = {}) {
  const key = canonical(url);
  const seeded = seededList(await readState(dir));
  if (!force && seeded.includes(key)) return "skipped";

  const listed = await market.listIndexes();
  const current = (Array.isArray(listed) ? listed : [])
    .map((source) => source?.url)
    .filter((u) => typeof u === "string");
  const present = current.some((u) => canonical(u) === key);
  if (!present) await market.setIndexes([...current, url]);
  if (!seeded.includes(key)) await writeState(dir, { indexAdded: [...seeded, key] });
  return present ? "present" : "added";
}

/**
 * Switch on Custom plugin indexes, once per profile unless forced.
 * @returns "on" | "enabled" | "restart" | "skipped" | "unavailable"
 * @throws when the host refuses the change; callers catch.
 */
export async function ensureMarketBundle(manager, { dir, force = false } = {}) {
  if (typeof manager?.listBundles !== "function" || typeof manager.setBundleEnabled !== "function") {
    return "unavailable";
  }
  const state = await readState(dir);
  if (!force && state.marketBundle) return "skipped";
  const bundles = await manager.listBundles();
  const bundle = (Array.isArray(bundles) ? bundles : []).find((b) => b?.name === MARKET_BUNDLE);
  if (!bundle || bundle.availability === "missing") return "unavailable";

  let result = "on";
  if (!bundle.enabled) {
    const change = await manager.setBundleEnabled(MARKET_BUNDLE, true);
    const application = change?.application;
    if (application !== "applied" && application !== "restart-required") {
      throw new Error(change?.error?.message ?? `the plugin manager answered "${application ?? "nothing"}"`);
    }
    result = application === "restart-required" ? "restart" : "enabled";
  }
  await writeState(dir, { marketBundle: true });
  return result;
}

/**
 * Settings and plugin-manager writes go through `hmr.runExclusive`, which
 * rejects with "HMR transactions cannot be nested" when called from inside a
 * reload — and a plugin loaded by a reload runs its `apply` inside one, with
 * every async call it starts inheriting the AsyncLocalStorage. Step out of it
 * first; outside a reload this is a plain call.
 */
export function outsideReload(ctx, write) {
  let executing;
  try {
    executing = ctx?.get?.("hmr")?.executing;
  } catch {
    executing = undefined;
  }
  return typeof executing?.exit === "function" ? executing.exit(write) : write();
}

// Command text reaches the UI as-is; the host has no locale for it.
export const MESSAGES = {
  unavailable:
    `这个 DSH 没有「自定义插件索引」（需要 ${MIN_DSH} 或更新版本），DSH Marketplace 索引无法加入「发现」。商店 /store 照常可用。\n` +
    `This DSH has no Custom plugin indexes (it needs ${MIN_DSH} or later), so the DSH Marketplace index cannot be added to Discover. /store still works.`,
  failed: (reason) =>
    `DSH Marketplace 索引设置失败 / Could not set up the DSH Marketplace index: ${reason}`,
  waiting:
    "已打开「自定义插件索引」，DSH Marketplace 索引稍后会出现在「插件 → 发现」。\n" +
    "Custom plugin indexes is on. The DSH Marketplace index will appear in Plugins → Discover in a moment.",
  restart:
    "已打开「自定义插件索引」，重启 DSH 后 DSH Marketplace 索引会出现在「插件 → 发现」。\n" +
    "Custom plugin indexes is on. Restart DSH and the DSH Marketplace index will appear in Plugins → Discover.",
  ready: (url, how) =>
    `${how === "present" ? "DSH Marketplace 索引已在" : "DSH Marketplace 索引已加入"}「插件 → 发现」。只收录在沙箱里真装过的插件。\n` +
    `${how === "present" ? "The DSH Marketplace index is already in" : "The DSH Marketplace index is now in"} Plugins → Discover. It lists only plugins our sandbox installed.\n${url}`,
};

function reasonOf(error) {
  const text = error?.message ?? String(error);
  return text.trim() || "unknown error";
}

/**
 * `/store-index`: the one explicit step. Switches Custom plugin indexes on
 * when it is off and adds the index, even if the user removed either before.
 * Always resolves to a CommandResult.
 */
export async function addIndexCommand(ctx, { url = INDEX_URL, dir } = {}) {
  try {
    const market = ctx.get?.("pluginMarket");
    if (market && typeof market.setIndexes === "function") {
      const how = await outsideReload(ctx, () => ensureIndex(market, { url, dir, force: true }));
      return { kind: "success", text: MESSAGES.ready(url, how) };
    }
    const bundle = await outsideReload(ctx, () =>
      ensureMarketBundle(ctx.get?.("pluginManager"), { dir, force: true }),
    );
    if (bundle === "unavailable") return { kind: "error", text: MESSAGES.unavailable };

    const mounted = ctx.get?.("pluginMarket");
    if (mounted && typeof mounted.setIndexes === "function") {
      const how = await outsideReload(ctx, () => ensureIndex(mounted, { url, dir, force: true }));
      return { kind: "success", text: MESSAGES.ready(url, how) };
    }
    // The service mounts later (now, or at the next start). Forget that this
    // profile was seeded, so the pluginMarket callback adds the source then.
    const state = await readState(dir);
    await writeState(dir, { indexAdded: seededList(state).filter((u) => u !== canonical(url)) });
    return { kind: "success", text: bundle === "restart" ? MESSAGES.restart : MESSAGES.waiting };
  } catch (error) {
    return { kind: "error", text: MESSAGES.failed(reasonOf(error)) };
  }
}

/**
 * Wire the automatic half into the host: once per profile, switch Custom
 * plugin indexes on and, whenever its service mounts, add the index unless
 * this profile already received it. Hosts without `ctx.inject` (dsh 0.1) or
 * without the services simply never call back. Never throws.
 */
export function setupMarketIndex(ctx, { url = INDEX_URL, logger } = {}) {
  const warn = (what) => (error) => logger?.warn?.(`dshmarketplace: could not ${what}: ${reasonOf(error)}`);
  let dir;
  try {
    dir = ctx.get?.("profileContext")?.dir;
  } catch {
    dir = undefined;
  }
  // Without a profile directory there is nowhere to remember a removal, and
  // re-adding a source the user deleted on every start is worse than not
  // adding it. /store-index still works.
  if (!dir || typeof ctx.inject !== "function") return;

  try {
    ctx.inject(["pluginManager"], (sub) => {
      Promise.resolve()
        .then(() => outsideReload(sub, () => ensureMarketBundle(sub.get?.("pluginManager") ?? sub.pluginManager, { dir })))
        .then((result) => {
          if (result === "enabled") logger?.info?.("dshmarketplace: switched on Custom plugin indexes");
          if (result === "restart") logger?.info?.("dshmarketplace: Custom plugin indexes is on from the next start");
        }, warn("switch on Custom plugin indexes"));
    });
    ctx.inject(["pluginMarket"], (sub) => {
      Promise.resolve()
        .then(() => outsideReload(sub, () => ensureIndex(sub.get?.("pluginMarket") ?? sub.pluginMarket, { url, dir })))
        .then((result) => {
          if (result === "added") logger?.info?.(`dshmarketplace: added ${url} to plugin index sources`);
        }, warn(`add ${url} to plugin index sources`));
    });
  } catch (error) {
    warn("watch for the plugin index service")(error);
  }
}
