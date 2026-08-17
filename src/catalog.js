/**
 * Reads the catalogue from dshmarketplace.dev.
 *
 * The site, the CLI and this plugin all read the same endpoint, so a listing
 * cannot say one thing in the browser and another inside the harness.
 */

export { describe, hasRisk, filterLocally } from "./shared.js";

const ENDPOINT =
  process.env.DSHM_API?.replace(/\/$/, "") ?? "https://dshmarketplace.dev";

const TIMEOUT_MS = 12_000;

/** Cached per process. The catalogue changes hourly; a session does not. */
const cache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

export function catalogUrl(params = {}) {
  const url = new URL("/api/v1/plugins", ENDPOINT);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

export async function fetchCatalog(params = {}, signal) {
  const url = catalogUrl(params);

  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  signal?.addEventListener("abort", () => controller.abort(), { once: true });

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`catalogue responded ${res.status}`);

    const data = await res.json();
    cache.set(url, { at: Date.now(), data });
    return data;
  } finally {
    clearTimeout(timer);
  }
}

export class CatalogStore {
  constructor() {
    this.state = { status: "idle", results: [], total: 0, error: null };
    this.listeners = new Set();
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  #emit() {
    for (const fn of this.listeners) fn(this.state);
  }

  #set(patch) {
    this.state = { ...this.state, ...patch };
    this.#emit();
  }

  async load(params = {}) {
    this.#set({ status: "loading", error: null });
    try {
      const data = await fetchCatalog({ limit: 60, ...params });
      this.#set({
        status: "ready",
        results: data.results ?? [],
        total: data.total ?? 0,
      });
    } catch (err) {
      this.#set({ status: "error", error: err.message, results: [] });
    }
    return this.state;
  }
}
