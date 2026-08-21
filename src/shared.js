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
