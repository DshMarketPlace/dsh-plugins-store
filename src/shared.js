/**
 * Helpers used by both halves of the plugin.
 *
 * Deliberately free of `process`, `fs` and anything else Node-only: the
 * browser bundle imports this, and a single `process.env` read at module scope
 * takes the whole plugin tree down with "process is not defined".
 */

/**
 * Chooses the description written in the reader's language. Every entry in the
 * catalogue carries both, hand-written — neither is a translation of the other.
 */
export function describe(plugin, locale) {
  const zh = locale === "zh" || locale?.startsWith("zh");
  return (zh ? plugin.summaryZh : plugin.summary) ?? plugin.summary ?? "";
}

/**
 * A plugin is safe to install without asking only when nothing was detected.
 * Detection is heuristic, so an empty list is not a clean bill of health — it
 * is the absence of evidence, and the confirmation copy says so.
 */
export function hasRisk(plugin) {
  return Array.isArray(plugin.riskFlags) && plugin.riskFlags.length > 0;
}

/**
 * Decides whether a settled `command/executed` should open the store overlay,
 * and with what query. Pure and total: `result` may be `undefined` or an
 * unexpected shape (host/runtime versions disagree on what the client ack
 * carries), and this must never throw — the caller runs inside a host event
 * whose failure can take down tool dispatch for the whole session.
 */
export function resolveStoreOpen(commandName, result) {
  if (commandName === "store" && result?.kind === "success") {
    return { open: true, query: result.query ?? "" };
  }
  return { open: false, query: "" };
}

/** In-process filter, for narrowing an already-fetched page. */
export function filterLocally(results, query) {
  const q = query?.trim().toLowerCase();
  if (!q) return results;

  return results.filter((p) =>
    [p.name, p.owner, p.fullName, p.summary, p.summaryZh, p.category]
      .filter(Boolean)
      .some((field) => String(field).toLowerCase().includes(q)),
  );
}

/** Where the browser takes a parked `/store <query>`; served by the host half. */
export const STORE_QUERY_PATH = "/api/dshmarketplace/store-query";

/** Key for a query whose session the host could not name. */
export const ANY_SESSION = "*";

/**
 * One-shot hand-off of a `/store <query>` from the command handler to the
 * browser. dsh 0.2.1+ keeps only `kind`, `text` and `sourceEventSeq` of a
 * command result (`normalizeResult` in @deepseek-ai/dsh-commands), so the
 * query cannot ride on the result there; the handler parks it here by session
 * and the client takes it once. Bounded and short-lived, because a query
 * nobody takes (a dsh 0.1 client already had it on the result) must not pile up.
 */
export function createQueryInbox({ ttlMs = 60_000, max = 32, now = Date.now } = {}) {
  const entries = new Map();
  return {
    put(key, query) {
      if (typeof key !== "string" || !key || typeof query !== "string" || !query) return;
      entries.delete(key);
      entries.set(key, { query, at: now() });
      while (entries.size > max) entries.delete(entries.keys().next().value);
    },
    take(key) {
      const entry = typeof key === "string" ? entries.get(key) : undefined;
      if (!entry) return "";
      entries.delete(key);
      return now() - entry.at <= ttlMs ? entry.query : "";
    },
  };
}

/** The id of the session a command ran in, or undefined. Never throws. */
export function sessionKeyOf(agent) {
  try {
    const id = agent?.session?.id;
    return typeof id === "string" && id ? id : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Asks the host for the query parked by `/store <query>` in this session.
 * Resolves to "" on any failure or after `timeoutMs`; never rejects, because
 * the caller opens the store either way.
 */
export async function takeStoreQuery(sessionId, { fetchImpl = globalThis.fetch, timeoutMs = 1500 } = {}) {
  const ctrl = typeof AbortController === "function" ? new AbortController() : undefined;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : undefined;
  try {
    const session = typeof sessionId === "string" ? sessionId : "";
    const res = await fetchImpl(`${STORE_QUERY_PATH}?session=${encodeURIComponent(session)}`, {
      signal: ctrl?.signal,
    });
    if (!res?.ok) return "";
    const body = await res.json();
    return typeof body?.query === "string" ? body.query : "";
  } catch {
    return "";
  } finally {
    if (timer) clearTimeout(timer);
  }
}
