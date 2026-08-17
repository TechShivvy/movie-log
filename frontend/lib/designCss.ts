/**
 * Design system CSS injected on web so the app matches CineLog Web.dc.html exactly.
 * Classes mirror the Nocturne design-system stylesheet + app-specific overrides.
 * CSS vars (--color-bg, --color-accent, etc.) are updated dynamically by ThemeContext.
 */

export const DESIGN_SYSTEM_CSS = `
*, *::before, *::after { box-sizing: border-box; }
html, body, #root { margin: 0; padding: 0; height: 100%; }
body { font-size: 15px; line-height: 1.55; font-weight: 400; background: var(--color-bg); color: var(--color-text); font-family: var(--font-body); }

/* ── Typography ─────────────────────────────────────────────────────── */
h1, h2, h3, h4, h5, h6 {
  font-family: var(--font-heading); font-weight: var(--font-heading-weight, 600);
  line-height: 1.12; letter-spacing: -0.015em; margin: 0 0 5.6px;
}
h1 { font-size: 42px; }
h2 { font-size: 32px; }
h3 { font-size: 25px; }
h4 { font-size: 20px; }
h5 { font-size: 16px; }
h6 { font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase; }
p { margin: 0 0 8.4px; }
a { color: var(--color-accent); text-underline-offset: 3px; }
img { display: block; max-width: 100%; }
:focus { outline: none; }
:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
::selection { background: color-mix(in srgb, var(--color-accent) 30%, transparent); }

/* ── Utility ────────────────────────────────────────────────────────── */
.text-muted { color: color-mix(in srgb, var(--color-text) 55%, transparent) !important; }
.lbl { /* label in sidebar — hidden when collapsed */ }
.tapc { cursor: pointer; }
.mono { font-family: 'JetBrains Mono', ui-monospace, monospace; letter-spacing: .01em; }

/* ── Scroll ─────────────────────────────────────────────────────────── */
.clg-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
.clg-scroll::-webkit-scrollbar-thumb { background: var(--color-neutral-800); border-radius: 8px; }
.clg-scroll::-webkit-scrollbar-track { background: transparent; }
.mainscroll > div { margin-inline: auto; }

/* ── Film grain overlay ─────────────────────────────────────────────── */
.grain {
  position: fixed; inset: 0; z-index: 200; pointer-events: none;
  opacity: .04; mix-blend-mode: overlay;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}

/* ── Cinematic background ───────────────────────────────────────────── */
@keyframes clgDrift {
  0%   { transform: translate(0, 0) scale(1); }
  50%  { transform: translate(-4%, -3%) scale(1.06); }
  100% { transform: translate(0, 0) scale(1); }
}
.cine-bg {
  position: absolute; inset: -30%; z-index: 0; filter: blur(60px);
  animation: clgDrift 18s ease-in-out infinite;
  background:
    radial-gradient(circle at 28% 30%, color-mix(in srgb, var(--color-accent) 26%, transparent), transparent 48%),
    radial-gradient(circle at 78% 62%, color-mix(in srgb, var(--color-accent) 16%, transparent), transparent 54%);
}

/* ── Screen enter animation ─────────────────────────────────────────── */
@keyframes clgIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
.screen-anim { animation: clgIn .3s ease both; }

/* ── Glass morphism ─────────────────────────────────────────────────── */
.glass {
  background: color-mix(in srgb, var(--color-surface) 72%, transparent);
  backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
}

/* ── Buttons ────────────────────────────────────────────────────────── */
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  cursor: pointer; text-decoration: none; user-select: none;
  font-family: var(--font-heading); font-weight: var(--font-heading-weight, 500);
  font-size: 14px; line-height: 1.2; color: var(--color-text);
  background: transparent; border: 1px solid transparent;
  padding: 5.6px 10px; border-radius: 8px; transition: background .15s ease, box-shadow .2s ease;
  white-space: nowrap;
}
.btn:disabled { opacity: 0.45; cursor: not-allowed; }
.btn svg, .btn i { display: block; }
.btn-primary { color: var(--color-accent); border-color: var(--color-accent); }
.btn-primary:hover { background: color-mix(in srgb, var(--color-accent) 12%, transparent); box-shadow: 0 0 22px color-mix(in srgb, var(--color-accent) 38%, transparent); }
.btn-primary:active { background: color-mix(in srgb, var(--color-accent) 22%, transparent); }
.btn-secondary { border-color: var(--color-divider); }
.btn-secondary:hover { background: color-mix(in srgb, var(--color-text) 7%, transparent); }
.btn-secondary:active { background: color-mix(in srgb, var(--color-text) 14%, transparent); }
.btn-ghost { color: var(--color-accent); padding-inline: 2.8px; border: none; }
.btn-ghost:hover { background: color-mix(in srgb, var(--color-accent) 10%, transparent); }
.btn-ghost:active { background: color-mix(in srgb, var(--color-accent) 18%, transparent); }
.btn-icon { width: 36px; height: 36px; padding: 0; flex-shrink: 0; }
.btn-block { width: 100%; margin-top: 5.6px; justify-content: center; }

/* ── Forms ──────────────────────────────────────────────────────────── */
.field > label {
  display: block; font-size: 12px; margin-bottom: 5px;
  color: color-mix(in srgb, var(--color-text) 70%, transparent);
}
.input {
  width: 100%; min-height: 36px; padding: 6px 10px;
  font-family: inherit; font-size: 14px; line-height: 1.4;
  color: var(--color-text); caret-color: var(--color-accent);
  background: var(--color-surface);
  border: 1px solid var(--color-divider); border-radius: 8px;
  transition: border-color .15s ease;
}
.input:hover { border-color: color-mix(in srgb, var(--color-text) 45%, transparent); }
.input:focus, .input:focus-visible { border-color: var(--color-accent); outline: none; }
textarea.input { min-height: 90px; resize: vertical; }
.input::placeholder { color: color-mix(in srgb, var(--color-text) 38%, transparent); }

/* ── Segmented control ──────────────────────────────────────────────── */
.seg {
  display: inline-flex; overflow: hidden;
  border: 1px solid var(--color-divider); border-radius: 8px;
}
.seg-opt {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  padding: 7px 12px; font-size: 13px; cursor: pointer;
  color: color-mix(in srgb, var(--color-text) 70%, transparent);
  transition: background .12s ease, color .12s ease;
  user-select: none;
}
.seg-opt + .seg-opt { border-left: 1px solid var(--color-divider); }
.seg-opt.active { color: var(--color-accent); box-shadow: inset 0 0 0 1px var(--color-accent); }
.seg-opt:not(.active):hover { background: color-mix(in srgb, var(--color-text) 7%, transparent); color: var(--color-text); }

/* ── Cards ──────────────────────────────────────────────────────────── */
.card {
  display: flex; flex-direction: column; gap: 5.6px;
  padding: 8.4px; border-radius: 8px; background: var(--color-surface);
}
.card-kicker { font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--color-accent); }
.card-title { font-family: var(--font-heading); font-weight: var(--font-heading-weight, 500); font-size: 17px; line-height: 1.2; }
.card-body { margin: 0; font-size: 13px; opacity: 0.8; flex: 1; }
.card-meta { display: flex; align-items: center; gap: 6px; font-size: 11px; color: color-mix(in srgb, var(--color-text) 50%, transparent); }
.elev-sm { box-shadow: var(--shadow-sm); }
.elev-md { box-shadow: var(--shadow-md); }
.elev-lg { box-shadow: var(--shadow-lg); }

/* ── Tags ───────────────────────────────────────────────────────────── */
.tag {
  display: inline-flex; align-items: center; font-size: 11px;
  letter-spacing: 0.02em; padding: 3px 10px; border-radius: 6px;
}
.tag-accent { background: var(--color-accent-800); color: var(--color-accent-100); }
.tag-neutral { background: var(--color-neutral-800); color: var(--color-neutral-100); font-family: 'JetBrains Mono', monospace; }
.tag-outline { border: 1px solid var(--color-accent); color: var(--color-accent); }

/* ── Navigation item ────────────────────────────────────────────────── */
.navitem {
  display: flex; align-items: center; gap: 11px;
  padding: 9px 12px; border-radius: 8px; font-size: 14px;
  cursor: pointer; color: color-mix(in srgb, var(--color-text) 62%, transparent);
  transition: background .15s ease, color .12s ease;
  user-select: none; white-space: nowrap;
}
.navitem:hover { background: color-mix(in srgb, var(--color-text) 6%, transparent); color: var(--color-text); }
.navitem.active { background: color-mix(in srgb, var(--color-accent) 13%, transparent); color: var(--color-accent); }

/* ── Sidebar ────────────────────────────────────────────────────────── */
.sidebar {
  width: 236px; flex: none;
  border-right: 1px solid var(--color-divider);
  display: flex; flex-direction: column; padding: 18px 14px; gap: 4px;
  overflow: hidden; transition: width .22s cubic-bezier(.2,.7,.3,1);
}
.sidebar.collapsed { width: 68px; }
.sidebar.collapsed .lbl { display: none; }
.sidebar.collapsed .navitem { justify-content: center; padding-left: 0; padding-right: 0; }
.sidebar.collapsed .btn-block { padding-left: 0; padding-right: 0; min-width: 0; }
.sidebar.collapsed .brandrow { justify-content: center; }

/* ── FAB ────────────────────────────────────────────────────────────── */
.fab {
  position: absolute; right: 30px; bottom: 30px; z-index: 90;
  width: 58px; height: 58px; border-radius: 50%; border: none;
  background: var(--color-accent); color: var(--color-bg);
  display: grid; place-items: center; cursor: pointer;
  box-shadow: 0 10px 28px color-mix(in srgb, var(--color-accent) 46%, transparent);
  transition: transform .15s ease, box-shadow .2s ease;
}
.fab:hover { transform: scale(1.07); box-shadow: 0 14px 34px color-mix(in srgb, var(--color-accent) 55%, transparent); }

/* ── Poster / grid card ─────────────────────────────────────────────── */
.poster {
  position: relative; border-radius: 8px; overflow: hidden;
  background-size: cover; background-position: center;
}
.lift { transition: transform .16s cubic-bezier(.2,.7,.3,1), box-shadow .16s ease; }
.lift:hover { transform: translateY(-3px); }
.gridcard:hover .poster { transform: scale(1.04); }
.gridcard { cursor: pointer; }
.ov { opacity: 0; transition: opacity .15s; position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: flex-end; padding: 12px; background: linear-gradient(to top, rgba(0,0,0,.85), transparent 65%); }
.gridcard:hover .ov { opacity: 1; }

/* ── Dialog ─────────────────────────────────────────────────────────── */
.dialog-backdrop {
  position: fixed; inset: 0; display: grid; place-items: center;
  padding: 16px; z-index: 1000;
  background: color-mix(in srgb, #000 50%, transparent);
}
.dialog {
  width: min(460px, 100%); display: flex; flex-direction: column; gap: 8.4px;
  padding: 16px; border-radius: 14px;
  background: var(--color-surface); box-shadow: var(--shadow-lg);
}
.dialog-title { font-family: var(--font-heading); font-weight: var(--font-heading-weight, 500); font-size: 20px; }
.dialog-body { font-size: 14px; opacity: 0.85; }
.dialog-actions { display: flex; justify-content: flex-end; gap: 5.6px; margin-top: 5.6px; }

/* ── Progress bar ───────────────────────────────────────────────────── */
.progress-track { height: 6px; border-radius: 3px; background: var(--color-neutral-800); overflow: hidden; }
.progress-fill { height: 100%; border-radius: 3px; background: var(--color-accent); transition: width .4s ease; }

/* ── Divider (fading rule) ──────────────────────────────────────────── */
.hr {
  height: 1px; border: 0; margin: 11.2px 0;
  background: linear-gradient(to right, transparent, var(--color-divider) 48px, var(--color-divider) calc(100% - 48px), transparent);
}

/* ── App shell ──────────────────────────────────────────────────────── */
.app-shell { display: flex; height: 100vh; overflow: hidden; position: relative; background: var(--color-bg); color: var(--color-text); }
.app-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.topbar {
  height: 62px; flex: none;
  border-bottom: 1px solid var(--color-divider);
  display: flex; align-items: center; gap: 16px; padding: 0 26px;
}

@keyframes clgSpin { to { transform: rotate(360deg); } }
.spin { display: inline-block; animation: clgSpin 1s linear infinite; }
`;

/** Inject design system CSS into <head> once (web only). */
export function injectDesignSystemCss() {
  if (typeof document === "undefined") return;
  if (document.getElementById("clg-ds")) return;
  const el = document.createElement("style");
  el.id = "clg-ds";
  el.textContent = DESIGN_SYSTEM_CSS;
  document.head.appendChild(el);
}
