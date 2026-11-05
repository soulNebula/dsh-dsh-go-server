// Every colour comes from the DSH design tokens, so the page follows the
// active theme (including skins) instead of assuming light mode. The font is
// deliberately not set here: the page inherits the app's font so it matches
// whatever the user picked.
export const STYLE = `
.p-app {
  --p-radius: 12px;
  --p-brand: var(--dsw-alias-brand-primary, #2f6fde);
  --p-border: var(--dsw-alias-border-l1, #d8dbe2);
  --p-border-soft: var(--dsw-alias-border-l2, #e5e7eb);
  --p-surface: var(--dsw-alias-bg-layer-1, #ffffff);
  --p-bg: var(--dsw-alias-bg-base, #ffffff);
  --p-text: var(--dsw-alias-label-primary, #1f2328);
  --p-muted: var(--dsw-alias-label-secondary, #5b6270);
  --p-faint: var(--dsw-alias-label-tertiary, #8b919c);
  --p-danger: var(--dsw-alias-state-error-primary, #c0392b);
  --p-warn: var(--dsw-alias-state-warn-primary, #a86700);
  --p-ok: var(--dsw-alias-state-success-primary, #2e7d32);
  --p-on-brand: var(--dsw-alias-label-primary-inverted, #ffffff);
  --p-hover: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, .05));
  --p-mono: var(--dsw-alias-font-mono, var(--dsw-font-mono, ui-monospace, Consolas, monospace));

  box-sizing: border-box;
  flex: 1 1 auto;
  width: 100%;
  height: 100%;
  max-height: 100%;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  color: var(--p-text);
  font-size: 14px;
  line-height: 1.55;
}
.p-app, .p-app * { box-sizing: border-box; }
.p-inner {
  display: flex;
  flex-direction: column;
  gap: 14px;
  width: 100%;
  max-width: 880px;
  margin: 0 auto;
  padding: 20px 24px 32px;
}
.p-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.p-title { margin: 0; font-size: 22px; line-height: 1.3; font-weight: 650; }
.p-intro { margin: 4px 0 0; color: var(--p-muted); font-size: 13px; }
.p-card { display: flex; flex-direction: column; gap: 12px; padding: 16px; border: 1px solid var(--p-border); border-radius: var(--p-radius); background: var(--p-surface); }
.p-cardHead { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.p-cardTitle { margin: 0; font-size: 16px; font-weight: 650; }
.p-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px 18px; }
.p-field { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.p-fieldLabel { color: var(--p-muted); font-size: 12px; }
.p-fieldValue { font-variant-numeric: tabular-nums; word-break: break-all; }
.p-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.p-formColumn { display: flex; flex-direction: column; gap: 12px; }
.p-label { display: flex; flex-direction: column; gap: 4px; font-weight: 600; font-size: 13px; }
.p-label--half { flex: 0 0 120px; }
.p-label--grow { flex: 1 1 240px; }
.p-input {
  width: 100%;
  min-width: 0;
  padding: 8px 10px;
  border: 1px solid var(--p-border);
  border-radius: 8px;
  background: var(--p-bg);
  color: var(--p-text);
  font: inherit;
  font-weight: 400;
}
.p-input:focus-visible { outline: 2px solid var(--p-brand); outline-offset: 1px; }
.p-input--grow { flex: 1 1 220px; width: auto; }
.p-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 7px 14px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: var(--p-brand);
  color: var(--p-on-brand);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.p-button:hover:not(:disabled) { opacity: .9; }
.p-button:disabled { opacity: .45; cursor: default; }
.p-buttonGhost {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 7px 12px;
  border: 1px solid var(--p-border);
  border-radius: 8px;
  background: var(--p-surface);
  color: var(--p-text);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.p-buttonGhost:hover:not(:disabled) { background: var(--p-hover); }
.p-buttonGhost:disabled { opacity: .45; cursor: default; }
.p-badge { padding: 2px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; border: 1px solid transparent; white-space: nowrap; }
.p-badge--running { color: var(--p-ok); background: color-mix(in srgb, var(--p-ok) 14%, transparent); border-color: color-mix(in srgb, var(--p-ok) 35%, transparent); }
.p-badge--degraded { color: var(--p-warn); background: color-mix(in srgb, var(--p-warn) 14%, transparent); border-color: color-mix(in srgb, var(--p-warn) 35%, transparent); }
.p-badge--stopped { color: var(--p-muted); background: color-mix(in srgb, var(--p-muted) 12%, transparent); border-color: color-mix(in srgb, var(--p-muted) 30%, transparent); }
.p-hint { margin: 0; color: var(--p-muted); font-size: 12px; font-weight: 400; }
.p-meta { color: var(--p-muted); font-size: 12px; }
.p-empty { margin: 0; color: var(--p-muted); font-size: 13px; }
.p-error { margin: 0; color: var(--p-danger); font-size: 13px; }
.p-notice { margin: 0; color: var(--p-brand); font-size: 13px; }
.p-list { display: flex; flex-direction: column; gap: 8px; margin: 0; padding: 0; list-style: none; }
.p-device { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 12px; border: 1px solid var(--p-border-soft); border-radius: 10px; }
.p-deviceMain { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.p-deviceName { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-weight: 600; font-size: 13px; }
.p-tag { padding: 1px 8px; border-radius: 999px; border: 1px solid var(--p-border); font-size: 11px; font-weight: 500; color: var(--p-muted); }
.p-tag--online { color: var(--p-ok); border-color: color-mix(in srgb, var(--p-ok) 40%, transparent); }
.p-tag--offline { color: var(--p-faint); }
.p-pre {
  margin: 0;
  max-height: 300px;
  overflow: auto;
  padding: 12px;
  border: 1px solid var(--p-border-soft);
  border-radius: 10px;
  background: var(--dsw-alias-bg-l2, rgba(127, 127, 127, .08));
  color: var(--p-text);
  font-family: var(--p-mono);
  font-size: 12.5px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
}
.p-tabs { display: flex; gap: 2px; padding: 3px; border: 1px solid var(--p-border); border-radius: 10px; background: var(--p-surface); flex: 0 0 auto; }
.p-tab { padding: 5px 14px; border: 0; border-radius: 7px; background: transparent; color: var(--p-muted); font: inherit; font-size: 13px; cursor: pointer; }
.p-tab:hover { background: var(--p-hover); }
.p-tab--active { background: color-mix(in srgb, var(--p-brand) 15%, transparent); color: var(--p-brand); font-weight: 600; }
.p-kvList { display: flex; flex-direction: column; gap: 6px; }
.p-kv { display: grid; grid-template-columns: 150px minmax(0, 1fr) auto; gap: 8px; align-items: center; }
.p-kvLabel { color: var(--p-muted); font-size: 12px; }
.p-kvValue {
  min-width: 0;
  padding: 5px 8px;
  border: 1px solid var(--p-border-soft);
  border-radius: 6px;
  background: var(--dsw-alias-bg-l2, rgba(127, 127, 127, .08));
  color: var(--p-text);
  font-family: var(--p-mono);
  font-size: 12px;
  overflow-wrap: anywhere;
}
.p-copy { padding: 4px 10px; border: 1px solid var(--p-border); border-radius: 6px; background: var(--p-surface); color: var(--p-text); font: inherit; font-size: 12px; cursor: pointer; }
.p-copy:hover:not(:disabled) { background: var(--p-hover); }
.p-copy:disabled { opacity: .4; cursor: default; }
.p-usageGroup { display: flex; flex-direction: column; gap: 4px; }
.p-usageTitle { margin: 8px 0 0; font-size: 13px; font-weight: 650; }
.p-steps { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
.p-notes { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: var(--p-muted); }
.p-usageVars { margin-top: 4px; }
@media (max-width: 720px) {
  .p-inner { padding: 14px; }
  .p-label--half { flex: 1 1 100px; }
  .p-head { flex-direction: column; }
  .p-kv { grid-template-columns: minmax(0, 1fr) auto; }
  .p-kvLabel { grid-column: 1 / -1; }
}
`
