import React from "react";

import { describe, filterLocally, hasRisk } from "./shared.js";

const SEARCH_PATH = "/api/dshmarketplace/search";
const INSTALL_PATH = "/api/dshmarketplace/install";

/**
 * Follows the harness's own language setting, live.
 *
 * The catalogue carries a hand-written Chinese description for every entry, so
 * reading this wrong is not cosmetic — it serves English prose to an audience
 * that is largely Chinese. `getSnapshot` is documented as uSES-safe, so this
 * also re-renders the list the moment someone switches language.
 */
function useLocale(localeService) {
  const active = React.useSyncExternalStore(
    (fn) => localeService?.subscribe?.(fn) ?? (() => {}),
    () => localeService?.getSnapshot?.().active ?? "en",
    () => "en",
  );
  return String(active).toLowerCase().startsWith("zh") ? "zh" : "en";
}

function useCatalog(query) {
  const [state, setState] = React.useState({ status: "idle", results: [] });

  React.useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, status: "loading" }));

    fetch(`${SEARCH_PATH}?limit=60${query ? `&q=${encodeURIComponent(query)}` : ""}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
      .then((data) => {
        if (!cancelled) {
          setState({ status: "ready", results: data.results ?? [] });
        }
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error", results: [] });
      });

    return () => {
      cancelled = true;
    };
  }, [query]);

  return state;
}

/** Debounced so typing does not fire a request per keystroke. */
function useDebounced(value, ms = 300) {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

/**
 * pnpm refuses to run a git-hosted package's `prepare` script until the key it
 * prints is allowlisted, and DSH surfaces that as an install failure. It is by
 * far the most common way an install fails, it is entirely recoverable, and
 * the fix is two lines in a file most people have never opened — so it gets
 * its own message rather than being buried in raw pnpm output.
 */
function explain(message, t) {
  return /allowBuilds|prepare script/i.test(message ?? "")
    ? t("needsAllowBuilds")
    : message;
}

function PluginRow({ plugin, locale, t, onInstall, status, error }) {
  const risky = hasRisk(plugin);

  return (
    <li className="dshm-row">
      <div className="dshm-row-main">
        <div className="dshm-row-head">
          <span className="dshm-name">{plugin.name}</span>
          <span className="dshm-owner">{plugin.owner}</span>
          <span className="dshm-stars">
            ★ {Number(plugin.stars ?? 0).toLocaleString()}
          </span>
        </div>

        <p className="dshm-summary">{describe(plugin, locale)}</p>

        <div className="dshm-meta">
          <span>{plugin.inRegistry ? t("registry") : t("topicOnly")}</span>
          {plugin.license ? <span>{plugin.license}</span> : null}
          {risky ? (
            <span className="dshm-risk">
              {plugin.riskFlags.join(" · ")}
            </span>
          ) : null}
          <a href={plugin.url} target="_blank" rel="noopener">
            {t("details")}
          </a>
        </div>
      </div>

      <button
        type="button"
        className="dshm-install"
        disabled={status === "installing" || status === "installed"}
        onClick={() => onInstall(plugin)}
      >
        {status === "installing"
          ? t("installing")
          : status === "installed"
            ? t("installed")
            : status === "failed"
              ? t("failed")
              : t("install")}
      </button>
    </li>
  );
}

function ErrorNote({ error, t }) {
  return (
    <li className="dshm-error">
      <p>{explain(error, t)}</p>
    </li>
  );
}

function RiskDialog({ plugin, locale, t, onConfirm, onCancel }) {
  return (
    <div className="dshm-confirm" role="alertdialog" aria-modal="true">
      <div className="dshm-confirm-body">
        <p className="dshm-confirm-title">{plugin.fullName}</p>
        <p className="dshm-summary">{describe(plugin, locale)}</p>

        <p className="dshm-confirm-risk">
          {t("risk")} <strong>{plugin.riskFlags.join(", ")}</strong>
        </p>
        <p className="dshm-confirm-note">{t("riskNote")}</p>

        <div className="dshm-confirm-actions">
          <button type="button" className="dshm-ghost" onClick={onCancel}>
            {t("cancel")}
          </button>
          <button type="button" className="dshm-install" onClick={onConfirm}>
            {t("confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}

function Catalogue({ t, localeService, initialQuery = "" }) {
  const locale = useLocale(localeService);
  const [input, setInput] = React.useState(initialQuery);
  const query = useDebounced(input);
  const { status, results } = useCatalog(query);
  const [installs, setInstalls] = React.useState({});
  const [errors, setErrors] = React.useState({});
  const [pending, setPending] = React.useState(null);

  const visible = React.useMemo(
    () => filterLocally(results, ""),
    [results],
  );

  async function run(plugin) {
    setInstalls((s) => ({ ...s, [plugin.fullName]: "installing" }));
    setErrors((s) => ({ ...s, [plugin.fullName]: undefined }));

    try {
      const res = await fetch(INSTALL_PATH, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmed: true, plugin }),
      });
      const data = await res.json().catch(() => ({}));

      setInstalls((s) => ({
        ...s,
        [plugin.fullName]: res.ok ? "installed" : "failed",
      }));
      // Swallowing this is what turned a recoverable, well-explained pnpm
      // policy into a bare "install failed".
      if (!res.ok) {
        setErrors((s) => ({ ...s, [plugin.fullName]: data.error ?? "" }));
      }
    } catch (err) {
      setInstalls((s) => ({ ...s, [plugin.fullName]: "failed" }));
      setErrors((s) => ({ ...s, [plugin.fullName]: err.message }));
    }
  }

  // Anything the catalogue flagged stops for a confirmation first. Anything
  // clean installs directly — the flags are the whole point of having them.
  function onInstall(plugin) {
    if (hasRisk(plugin)) setPending(plugin);
    else run(plugin);
  }

  return (
    <div className="dshm">
      <header className="dshm-head">
        <div>
          <p className="dshm-title">{t("title")}</p>
          <p className="dshm-sub">{t("subtitle")}</p>
        </div>
      </header>

      <input
        className="dshm-search"
        type="search"
        value={input}
        placeholder={t("search")}
        onChange={(e) => setInput(e.target.value)}
      />

      {status === "loading" ? <p className="dshm-state">{t("loading")}</p> : null}
      {status === "error" ? <p className="dshm-state">{t("error")}</p> : null}
      {status === "ready" && visible.length === 0 ? (
        <p className="dshm-state">{t("empty")}</p>
      ) : null}

      <ul className="dshm-list">
        {visible.map((plugin) => (
          <React.Fragment key={plugin.fullName}>
            <PluginRow
              plugin={plugin}
              locale={locale}
              t={t}
              status={installs[plugin.fullName]}
              onInstall={onInstall}
            />
            {errors[plugin.fullName] ? (
              <ErrorNote error={errors[plugin.fullName]} t={t} />
            ) : null}
          </React.Fragment>
        ))}
      </ul>

      {pending ? (
        <RiskDialog
          plugin={pending}
          locale={locale}
          t={t}
          onCancel={() => setPending(null)}
          onConfirm={() => {
            const plugin = pending;
            setPending(null);
            run(plugin);
          }}
        />
      ) : null}
    </div>
  );
}

export function StoreOverlay({ dialogController, localeService, t }) {
  const [open, setOpen] = React.useState(dialogController?.isOpen ?? false);
  const [query, setQuery] = React.useState("");

  React.useEffect(
    () => dialogController?.subscribe((next, nextQuery) => {
      setOpen(next);
      if (nextQuery !== undefined) setQuery(nextQuery);
    }),
    [dialogController],
  );

  if (!open) return null;

  return (
    <div className="dshm-overlay" onClick={() => dialogController.close()}>
      <div className="dshm-panel" onClick={(e) => e.stopPropagation()}>
        <Catalogue t={t} localeService={localeService} initialQuery={query} />
      </div>
    </div>
  );
}

export function StoreSettingsTab({ localeService, t }) {
  return <Catalogue t={t} localeService={localeService} />;
}
