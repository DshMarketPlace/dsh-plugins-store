/**
 * The site's own palette, carried into the harness so the store looks like
 * dshmarketplace.dev rather than like a generic panel. Warm ink on paper, one
 * copper accent, hairline rules — no pure black, no pure white, no shadows.
 *
 * Scoped under .dshm so nothing here can leak into the host UI.
 */
const CSS = `
.dshm { --paper:#f7f4ed; --ink:#241f1a; --muted:#6b6055; --rule:#ddd6c8; --copper:#c0561d;
  color:var(--ink); background:var(--paper); font-size:14px; display:flex; flex-direction:column; gap:12px; padding:20px; }
@media (prefers-color-scheme: dark) {
  .dshm { --paper:#1a1714; --ink:#ece6da; --muted:#9a9083; --rule:#332d26; }
}
.dshm-head { display:flex; justify-content:space-between; align-items:flex-end; border-bottom:1px solid var(--rule); padding-bottom:12px; }
.dshm-title { font-weight:700; font-size:15px; margin:0; letter-spacing:-0.01em; }
.dshm-sub { color:var(--muted); margin:2px 0 0; font-size:12px; }
.dshm-search { height:38px; padding:0 12px; border:1px solid var(--rule); background:transparent; color:inherit; font:inherit; outline:none; }
.dshm-search:focus { border-color:var(--copper); }
.dshm-state { color:var(--muted); padding:32px 0; text-align:center; font-size:13px; }
.dshm-list { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; border-top:1px solid var(--rule); }
.dshm-row { display:flex; gap:16px; align-items:flex-start; padding:14px 0; border-bottom:1px solid var(--rule); }
.dshm-row-main { flex:1; min-width:0; }
.dshm-row-head { display:flex; gap:10px; align-items:baseline; }
.dshm-name { font-family:ui-monospace,Menlo,monospace; font-weight:600; }
.dshm-owner, .dshm-stars { color:var(--muted); font-size:12px; }
.dshm-summary { margin:4px 0 0; line-height:1.55; color:var(--muted); }
.dshm-meta { display:flex; flex-wrap:wrap; gap:12px; margin-top:6px; font-size:11px; color:var(--muted); }
.dshm-meta a { color:var(--copper); text-decoration:none; }
.dshm-meta a:hover { text-decoration:underline; }
.dshm-risk { color:var(--copper); }
.dshm-error { padding:10px 12px; margin:0 0 12px; border-left:2px solid var(--copper); background:rgba(192,86,29,0.06); font-size:12px; line-height:1.6; list-style:none; }
.dshm-error p { margin:0; }
.dshm-error code { font-family:ui-monospace,Menlo,monospace; }
.dshm-install { flex-shrink:0; height:32px; padding:0 14px; border:1px solid var(--ink); background:var(--ink); color:var(--paper); font:inherit; font-size:13px; cursor:pointer; }
.dshm-install:disabled { opacity:0.45; cursor:default; }
.dshm-ghost { height:32px; padding:0 14px; border:1px solid var(--rule); background:transparent; color:inherit; font:inherit; font-size:13px; cursor:pointer; }
.dshm-overlay { position:fixed; inset:0; background:rgba(36,31,26,0.45); display:flex; align-items:center; justify-content:center; z-index:9999; }
.dshm-panel { width:min(760px,92vw); max-height:82vh; overflow:auto; background:var(--paper,#f7f4ed); border:1px solid rgba(0,0,0,0.15); }
.dshm-confirm { position:fixed; inset:0; background:rgba(36,31,26,0.55); display:flex; align-items:center; justify-content:center; z-index:10000; }
.dshm-confirm-body { width:min(460px,90vw); background:var(--paper); border-left:3px solid var(--copper); padding:20px; }
.dshm-confirm-title { font-family:ui-monospace,Menlo,monospace; font-weight:600; margin:0 0 6px; }
.dshm-confirm-risk { margin:12px 0 4px; color:var(--copper); }
.dshm-confirm-note { margin:0; font-size:12px; line-height:1.6; color:var(--muted); }
.dshm-confirm-actions { display:flex; gap:8px; justify-content:flex-end; margin-top:16px; }
`;

let installed = false;

export function installStyles() {
  if (installed || typeof document === "undefined") return () => {};
  const el = document.createElement("style");
  el.dataset.dshmarketplace = "";
  el.textContent = CSS;
  document.head.append(el);
  installed = true;

  return () => {
    el.remove();
    installed = false;
  };
}
