import { describe, fetchCatalog, hasRisk } from "./catalog.js";

/**
 * Decide what the gate wants for one execution: an `ask` decision for a
 * risky marketplace install, or `undefined` to leave the call alone. Reads
 * `exec.name` / `exec.arguments` (the host's execution shape) but tolerates
 * any other shape by deciding nothing.
 */
async function decide(exec, fetch) {
  const name = exec?.name ?? exec?.tool?.name;
  if (name !== "dshmarketplace_install") return undefined;

  const fullName = exec?.arguments?.fullName;
  if (typeof fullName !== "string" || fullName === "") return undefined;

  const data = await fetch({ q: fullName, limit: 5 });
  const plugin = (data?.results ?? []).find((p) => p?.fullName === fullName);
  if (!plugin || !hasRisk(plugin)) return undefined;

  return {
    kind: "ask",
    reason: [
      `Install ${plugin.name}? ${plugin.fullName} — ${describe(plugin, "en")}`,
      `Detected: ${plugin.riskFlags.join(", ")}.`,
      "Plugins run with this agent's permissions. Detection is heuristic;",
      "an empty list would not have meant the plugin was safe.",
      plugin.url,
    ].join("\n"),
  };
}

/**
 * Nothing that reaches a terminal, a credential or an install script gets run
 * on the model's say-so. The catalogue already detects those; this turns the
 * detection into a stop.
 *
 * `tools/pre-execute` is a cordis waterfall over EVERY tool the harness
 * dispatches, and its value must be a PreToolDecision: a listener that
 * returns without calling `next()` vetoes the rest of the chain — including
 * the built-in `{ kind: "allow" }` — after which the host reads
 * `decision.kind` off `undefined` and every tool call in the session fails,
 * Bash included. Versions 0.1.0–0.1.6 of this plugin did exactly that. So
 * this listener is total: every path, catalogue outage included, ends in
 * `next()` or a decision, and `next()` is never called under a try so a
 * downstream throw is the host's to handle, not ours to retry.
 */
export function createApprovalGate(fetch = fetchCatalog) {
  return async (exec, next) => {
    const pass = () => (typeof next === "function" ? next() : { kind: "allow" });

    let decision;
    try {
      decision = await decide(exec, fetch);
    } catch {
      // If the catalogue is unreachable the install tool itself is about to
      // fail its own lookup; what must never fail is everyone else's tools.
      decision = undefined;
    }
    return decision ?? pass();
  };
}
