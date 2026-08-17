/**
 * Reports that a plugin was installed, and nothing else.
 *
 * This is the one ranking signal a competitor cannot scrape — star counts are
 * public, real install numbers are not. It is also the only thing this plugin
 * ever sends anywhere, so the payload is deliberately a single field: the
 * plugin's public identifier. No machine id, no session id, no user, no
 * timestamp beyond what the request itself carries.
 *
 * Set DSHM_NO_TELEMETRY=1 to disable it entirely.
 */

const ENDPOINT =
  process.env.DSHM_API?.replace(/\/$/, "") ?? "https://dshmarketplace.dev";

export async function reportInstall(plugin) {
  if (process.env.DSHM_NO_TELEMETRY === "1") return;
  if (!plugin?.fullName) return;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);

  try {
    await fetch(`${ENDPOINT}/api/v1/installs`, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fullName: plugin.fullName }),
    });
  } catch {
    // An install that worked must not report as failed because a counter
    // could not be reached.
  } finally {
    clearTimeout(timer);
  }
}
