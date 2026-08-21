/**
 * Design system CSS injected on web.
 *
 * SOURCE OF TRUTH — this file is a faithful port of, in order:
 *   1. the Nocturne design system stylesheet at
 *      docs/design/_ds/nocturne-[id]/styles.css
 *   2. the <style> block in docs/design/CineLog Web.dc.html  (app-level classes)
 *
 * Keep it that way. If a value here disagrees with those files, those files win.
 * Colour tokens in :root below are DEFAULTS only — ThemeContext overrides them
 * per theme via themeVars() (see constants/themes.ts, which mirrors the exact
 * derivations from support.js).
 */

export const DESIGN_SYSTEM_CSS = `
/* Webfonts + icons. MUST be first — CSS requires @import before other rules.
   Matches the design file's own <link>s exactly. Without the font import every
   glyph falls back to system-ui, which also shifts every line-height. Without
   the Phosphor web font the <i class="ph ph-*"> icons render as nothing.      */
@import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
@import url('https://unpkg.com/@phosphor-icons/web@2.1.1/src/regular/style.css');
@import url('https://unpkg.com/@phosphor-icons/web@2.1.1/src/fill/style.css');
@import url('https://unpkg.com/@phosphor-icons/web@2.1.1/src/bold/style.css');

/* ══════════════════════════════════════════════════════════════════════════
   1. Nocturne design system — ported from the nocturne folder's styles.css
   ══════════════════════════════════════════════════════════════════════
   BUG THAT LIVED HERE: this line used to end in a literal star-slash
   sequence in the middle of a sentence (a glob-style path with a folder
   name ending in a star, immediately followed by a slash) — CSS comments
   have no escaping, so that in-sentence star-slash is a real end-of-comment
   token and silently closed this banner three lines early. Everything from
   there through the :root block below got swallowed into one garbled,
   invalid selector (up to :root's own opening brace), and a rule with an
   invalid selector is dropped whole — so the entire :root block below
   (every --space-*, --radius-*, and --shadow-* token) was defined in source
   but never once reached the page. Confirmed via computed styles: every
   .btn had padding:0 (var(--space-2) resolved to nothing) and
   border-radius:0 (same for var(--radius-md)) — the thin, square-cornered
   buttons/inputs across the whole app. Colors survived only because
   ThemeContext.tsx separately sets those 12 tokens inline on
   documentElement, unaffected by what this stylesheet does or doesn't
   parse. Moral: never spell out a real star-slash inside a CSS comment,
   including in a comment describing this bug. */

:root {
  /* Colour defaults (nocturne). ThemeContext overrides these per theme. */
  --color-bg: #161826;
  --color-surface: #232532;
  --color-text: #e9e9ed;
  --color-accent: #9184d9;
  --color-divider: color-mix(in srgb, #e9e9ed 15%, transparent);

  --color-neutral-100: #f3f5fe;
  --color-neutral-800: #3f424d;
  --color-neutral-900: #292b31;

  --color-accent-100: #f5f4ff;
  --color-accent-300: #d2cefd;
  --color-accent-400: #b5abfc;
  --color-accent-500: #968ae0;
  --color-accent-600: #796cbf;
  --color-accent-700: #5d5294;
  --color-accent-800: #423a6a;
  --color-accent-900: #2b2741;

  --color-error: #EF4444;

  /* Typeface — swapped by the Settings "Typeface" seg (Cinematic·Sora /
     Inter / System). ThemeContext writes these. */
  --font-heading: 'Sora', system-ui, sans-serif;
  --font-heading-weight: 600;
  --font-body: 'Plus Jakarta Sans', system-ui, sans-serif;

  /* Space scale — the design system's real values, NOT round 8/12/16. */
  --space-1: 2.8px;
  --space-2: 5.6px;
  --space-3: 8.4px;
  --space-4: 11.2px;
  --space-6: 16.8px;
  --space-8: 22.4px;

  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 14px;

  --shadow-sm: 0 0 0 1px color-mix(in srgb, var(--color-text) 14%, transparent);
  --shadow-md: 0 0 0 1px color-mix(in srgb, var(--color-text) 12%, transparent), 0 6px 18px rgba(0,0,0,.5);
  --shadow-lg: 0 0 0 1px color-mix(in srgb, var(--color-text) 20%, transparent), 0 16px 40px rgba(0,0,0,.6);
}

*, *::before, *::after { box-sizing: border-box; }
/* No custom <button> anywhere in the app ever reset the browser's native
   form-control rendering (appearance:auto by default). Chromium/Windows
   paints that as a subtle raised bevel — a highlight top-left, a shadow
   bottom-right — entirely outside CSS's box-shadow/filter (getComputedStyle
   reports box-shadow:none and filter:none on an affected button; the bevel
   is native theme-engine paint, not a CSS property). Invisible on a flat
   single-color .btn, but the sidebar's diagonal two-color theme swatches
   (Sidebar.tsx's THEMES.map buttons) have no shared class to carry a fix,
   so every one of them showed a dark smudge dragging off the bottom-right
   corner — worse on the unselected ones, whose transparent border isn't
   there to visually compete with it. Same effect, fainter, on every other
   ad-hoc <button> in the app (segmented-control options, icon buttons):
   this global reset is deliberately unscoped rather than patched per call
   site so nothing else surfaces the same smudge later.
   background/border are also reset to none here for the same reason —
   appearance:none alone still leaves Chromium's default light ButtonFace
   background and 1px outset border in place on some platforms, and every
   custom button already sets its own background/border via .btn or an
   inline style, so this never removes anything actually wanted. */
button { appearance: none; -webkit-appearance: none; background: none; border: none; font: inherit; color: inherit; }

/* Mobile Chrome/WebKit's default tap feedback — a semi-transparent grey
   rectangle flashed over whatever was tapped — is not a CSS box-shadow
   or outline and does not respect border-radius, so on a real touch
   device it visibly overshoots every rounded button, card, chip and
   swatch in the app the instant a finger taps one. A mouse click never
   triggers it at all (mousedown/mouseup don't fire the same tap-highlight
   path touchstart/touchend do), which is why this went unnoticed testing
   through a desktop click, and why it reads as "every curved box in the
   app" rather than any specific component: the browser applies it to
   every clickable/focusable element by default, not something any
   component here opted into. -webkit-tap-highlight-color inherits, so
   setting it to fully transparent once on html removes the flash
   everywhere without touching any of the app's own :active/:focus/press
   styling, which every interactive element already handles itself. */
html { -webkit-tap-highlight-color: transparent; }

html, body, #root { margin: 0; padding: 0; height: 100%; }
body {
  background: var(--color-bg); color: var(--color-text);
  font-family: var(--font-body);
  font-size: 15px; line-height: 1.55; font-weight: 400;
}

/* — typography — exact DS scale — */
h1, h2, h3, h4, h5, h6 {
  font-family: var(--font-heading); font-weight: var(--font-heading-weight);
  line-height: 1.12; letter-spacing: -0.015em; margin: 0 0 var(--space-2);
}
h1 { font-size: 42px; }
h2 { font-size: 32px; }
h3 { font-size: 25px; }
h4 { font-size: 20px; }
h5 { font-size: 16px; }
h6 { font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase; }
p { margin: 0 0 var(--space-3); }
a { color: var(--color-accent); text-underline-offset: 3px; }
img { display: block; max-width: 100%; }
figure { margin: 0; }
figcaption {
  font-size: 11px; margin-top: var(--space-1);
  color: color-mix(in srgb, var(--color-text) 55%, transparent);
}
.text-muted { color: color-mix(in srgb, var(--color-text) 55%, transparent); }
:focus { outline: none; }
/* box-shadow, not outline, for the focus ring: outline draws outside the
   border box and is inconsistently clipped by an ancestor's
   overflow:hidden across browsers, while box-shadow always is — and
   outline only follows the FOCUSED element's own border-radius, not a
   parent's. A lot of "rounded" controls here (.seg-opt inside .seg,
   chips/tags inside their row, the grid/list view toggle) are actually
   square elements whose corners are visually rounded off by a wrapping
   container's overflow:hidden, not by their own border-radius — outline
   drew a full sharp-cornered rectangle poking out past that rounded
   wrapper on click for every one of them. box-shadow, being clipped the
   same way any other painted content is, stays inside the shape the
   user actually sees. */
:focus-visible { outline: none; box-shadow: 0 0 0 2px var(--color-accent); }
::selection { background: color-mix(in srgb, var(--color-accent) 30%, transparent); }

/* — rules — Nocturne signature: fades to transparent 48px at both ends — */
.hr {
  height: 1px; border: 0; margin: var(--space-4) 0;
  background: linear-gradient(to right,
    transparent, var(--color-divider) 48px,
    var(--color-divider) calc(100% - 48px), transparent);
}

/* — buttons — */
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  cursor: pointer; text-decoration: none;
  font-family: var(--font-heading); font-weight: var(--font-heading-weight);
  font-size: 14px; line-height: 1.2; color: var(--color-text);
  background: transparent; border: 1.5px solid transparent;
  min-height: 36px; /* lines up with .input's own min-height */
  padding: var(--space-2) calc(var(--space-3) * 1.2);
  border-radius: var(--radius-md);
}
.btn svg { display: block; }
.btn:disabled { opacity: 0.45; cursor: not-allowed; }
.btn-primary { color: var(--color-accent); border-color: var(--color-accent); }
.btn-primary:hover { background: color-mix(in srgb, var(--color-accent) 12%, transparent); }
.btn-primary:active { background: color-mix(in srgb, var(--color-accent) 22%, transparent); }
/* background was transparent at rest — only tinted on :hover, which
   never fires on touch — same "reads as barely-there against the page"
   problem LogDetailScreen's icon buttons were fixed for individually
   earlier; fixed here at the class level instead, so every
   .btn-secondary (Settings, Edit profile, Follow once already
   following, and anywhere else this class is used) gets a real fill at
   rest without needing a one-off override per screen. */
.btn-secondary { background: var(--color-surface-high); border-color: var(--color-divider); }
.btn-secondary:hover { background: color-mix(in srgb, var(--color-text) 7%, var(--color-surface-high)); }
.btn-secondary:active { background: color-mix(in srgb, var(--color-text) 14%, var(--color-surface-high)); }
.btn-ghost { color: var(--color-accent); padding-inline: var(--space-1); }
.btn-ghost:hover { background: color-mix(in srgb, var(--color-accent) 10%, transparent); }
.btn-ghost:active { background: color-mix(in srgb, var(--color-accent) 18%, transparent); }
.btn-icon { width: 36px; height: 36px; padding: 0; }
.btn-block { width: 100%; margin-top: var(--space-2); }

/* — forms — */
.field > label {
  display: block; font-size: 12px; margin-bottom: 5px;
  color: color-mix(in srgb, var(--color-text) 70%, transparent);
}
.input {
  width: 100%; min-height: 36px; padding: 6px 10px; font: inherit;
  font-size: 14px; color: var(--color-text); caret-color: var(--color-accent);
  background: var(--color-surface);
  border: 1.5px solid var(--color-divider); border-radius: var(--radius-md);
}
.input:hover { border-color: color-mix(in srgb, var(--color-text) 45%, transparent); }
/* border-color change is already a clear, correctly-rounded focus
   signal on a text field — the global box-shadow ring on top of it
   (which native date/time inputs' internal calendar-icon widget also
   fights with, since that part of the control isn't stylable at all)
   is redundant noise here, so it's suppressed for .input specifically. */
.input:focus-visible { border-color: var(--color-accent); box-shadow: none; }
textarea.input { min-height: 90px; resize: vertical; }
.radio { display: inline-flex; align-items: center; gap: 8px; cursor: pointer; font-size: 14px; }
.radio input, .seg-opt input {
  position: absolute; opacity: 0; width: 0; height: 0; pointer-events: none;
}
.radio .dot {
  width: 16px; height: 16px; flex: none; border-radius: 50%;
  border: 1.5px solid var(--color-divider);
}
.radio:hover .dot { border-color: var(--color-accent); }
.radio input:checked + .dot {
  border-color: var(--color-accent); background: var(--color-accent);
  box-shadow: inset 0 0 0 4px var(--color-bg);
}
.seg {
  display: inline-flex; overflow: hidden;
  border: 1.5px solid var(--color-divider); border-radius: var(--radius-md);
}
.seg-opt {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 7px 12px; font-size: 13px; cursor: pointer;
}
.seg-opt + .seg-opt { border-left: 1px solid var(--color-divider); }
.seg-opt.active,
.seg-opt:has(input:checked) { color: var(--color-accent); box-shadow: inset 0 0 0 1px var(--color-accent); }
.seg-opt:not(.active):not(:has(input:checked)):hover { background: color-mix(in srgb, var(--color-text) 7%, transparent); }
/* .seg-opt itself is a plain square element — .seg only LOOKS like a
   rounded pill because its own overflow:hidden clips the row's outer
   corners. The active/checked ring above is an INSET box-shadow drawn
   on that square element's own straight edges; inset shadow paint sits
   fully inside the clip, so nothing about the clip trims it — it's the
   square ring's own corner, sitting just inside the container's rounded
   outer edge, that reads as a visible notch cut into what should be a
   smooth curve (confirmed on both web and native: SegmentedControl's
   grid/list toggle, arrival, screening start, visibility, all of them).
   Giving the two end buttons their own matching corner radius — sized
   to sit concentric with the container's, one border-width in — makes
   the end button's own straight edge follow the same curve the
   container's clip already does, so the inset ring finally traces a
   real rounded corner instead of a square one poking through it. */
.seg-opt:first-child { border-top-left-radius: calc(var(--radius-md) - 1.5px); border-bottom-left-radius: calc(var(--radius-md) - 1.5px); }
.seg-opt:last-child { border-top-right-radius: calc(var(--radius-md) - 1.5px); border-bottom-right-radius: calc(var(--radius-md) - 1.5px); }

/* — cards — */
.card {
  display: flex; flex-direction: column; gap: var(--space-2);
  padding: var(--space-3); border-radius: var(--radius-md); background: var(--color-surface);
}
.card-kicker { font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--color-accent); }
.card-title {
  font-family: var(--font-heading); font-weight: var(--font-heading-weight);
  font-size: 17px; line-height: 1.2;
}
.card-body { margin: 0; font-size: 13px; opacity: 0.8; flex: 1; }
.card-meta {
  display: flex; align-items: center; gap: 6px; font-size: 11px;
  color: color-mix(in srgb, var(--color-text) 50%, transparent);
}
.elev-sm { box-shadow: var(--shadow-sm); }
.elev-md { box-shadow: var(--shadow-md); }
.elev-lg { box-shadow: var(--shadow-lg); }

/* — tags — */
.tag {
  display: inline-flex; align-items: center; font-size: 11px;
  letter-spacing: 0.02em; padding: 3px 10px;
  border-radius: calc(var(--radius-md) * 0.75);
}
.tag-accent { background: var(--color-accent-800); color: var(--color-accent-100); }
.tag-neutral { background: var(--color-neutral-800); color: var(--color-neutral-100); }
.tag-outline { border: 1px solid var(--color-accent); color: var(--color-accent); }

/* — dialog — */
.dialog-backdrop {
  position: fixed; inset: 0; z-index: 300; display: grid; place-items: center;
  padding: var(--space-4);
  background: color-mix(in srgb, var(--color-neutral-900) 50%, transparent);
}
.dialog {
  width: min(440px, 100%); display: flex; flex-direction: column; gap: var(--space-3);
  padding: var(--space-4); border-radius: var(--radius-lg);
  background: var(--color-surface); box-shadow: var(--shadow-lg);
}
.dialog-title {
  font-family: var(--font-heading); font-weight: var(--font-heading-weight);
  font-size: 20px;
}
.dialog-body { font-size: 14px; opacity: 0.85; }
.dialog-actions { display: flex; justify-content: flex-end; gap: var(--space-2); margin-top: var(--space-2); }

/* ══════════════════════════════════════════════════════════════════════════
   2. App-level classes — ported verbatim from CineLog Web.dc.html <style>
   ══════════════════════════════════════════════════════════════════════ */

.clg-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
.clg-scroll::-webkit-scrollbar-thumb { background: var(--color-neutral-800); border-radius: 8px; }
.tapc { cursor: pointer; }
.poster { position: relative; border-radius: var(--radius-md); overflow: hidden; }
/* A poster whose real artwork is still resolving (catalog lookup, then
   the TMDB CDN fetch — commonly 1-3s, more on a cold backend) shows the
   same hue-gradient placeholder a log with genuinely no linked movie
   does, with nothing to tell them apart — reads as "no poster" rather
   than "give it a second". The pulse is the only signal there is that
   this placeholder is transient. */
.poster-loading { animation: clgPosterPulse 1.6s ease-in-out infinite; }
@keyframes clgPosterPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }
/* Same pulse, generic name — for any other value (a stat badge, a
   count) whose async fetch hasn't resolved yet. Shown instead of
   letting the real value just pop in unannounced, or worse, a bare 0/
   null being indistinguishable from a genuine answer. */
.pulse-loading { animation: clgPosterPulse 1.6s ease-in-out infinite; }
.lift { transition: transform .16s cubic-bezier(.2,.7,.3,1), box-shadow .16s ease; }
.lift:hover { transform: translateY(-3px); }
.gridcard .poster { transition: transform .16s cubic-bezier(.2,.7,.3,1); }
.gridcard:hover .poster { transform: scale(1.04); }
.navitem {
  display: flex; align-items: center; gap: 11px; padding: 9px 12px;
  border-radius: var(--radius-md); font-size: 14px; cursor: pointer;
  color: color-mix(in srgb, var(--color-text) 62%, transparent);
  transition: background .15s ease;
}
.navitem:hover { background: color-mix(in srgb, var(--color-text) 6%, transparent); color: var(--color-text); }
/* active nav = accent at 13% over the ground, per navItems' activeFor() style */
.navitem.active { background: color-mix(in srgb, var(--color-accent) 13%, transparent); color: var(--color-accent); }
.gridcard:hover .ov { opacity: 1; }
.ov {
  position: absolute; inset: 0; opacity: 0; transition: opacity .16s ease;
  display: flex; flex-direction: column; justify-content: flex-end; padding: 10px;
  background: linear-gradient(to top, rgba(0,0,0,.82), rgba(0,0,0,.15) 55%, transparent);
}
.tag-neutral, .mono { font-family: 'JetBrains Mono', ui-monospace, monospace; letter-spacing: .01em; }
.btn-primary { transition: box-shadow .2s ease, background .15s ease; }
.btn-primary:hover { box-shadow: 0 0 22px color-mix(in srgb, var(--color-accent) 38%, transparent); }
.glass {
  background: color-mix(in srgb, var(--color-surface) 72%, transparent);
  backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
}
.grain {
  position: fixed; inset: 0; z-index: 200; pointer-events: none; opacity: .04;
  mix-blend-mode: overlay;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}
@keyframes clgDrift {
  0%   { transform: translate(0,0) scale(1); }
  50%  { transform: translate(-4%,-3%) scale(1.06); }
  100% { transform: translate(0,0) scale(1); }
}
.cine-bg {
  position: absolute; inset: -30%; z-index: 0; filter: blur(60px);
  animation: clgDrift 18s ease-in-out infinite;
  background:
    radial-gradient(circle at 28% 30%, color-mix(in srgb, var(--color-accent) 26%, transparent), transparent 48%),
    radial-gradient(circle at 78% 62%, color-mix(in srgb, var(--color-accent) 16%, transparent), transparent 54%);
}
@keyframes clgIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
.screen-anim { animation: clgIn .3s ease both; }
@keyframes clgSpin { to { transform: rotate(360deg); } }
.ph-circle-notch, .spin { display: inline-block; animation: clgSpin 1s linear infinite; }
.mainscroll > div { margin-inline: auto; }
.sidebar { width: 236px; transition: width .22s cubic-bezier(.2,.7,.3,1); }
.sidebar.collapsed { width: 68px; }
.sidebar.collapsed .lbl { display: none; }
.sidebar.collapsed .navitem { justify-content: center; padding-inline: 0; }
.sidebar.collapsed .btn-block { padding-inline: 0; }
.sidebar.collapsed .brandrow { justify-content: center; }
.fab {
  position: absolute; right: 30px; bottom: 30px; z-index: 90;
  width: 58px; height: 58px; border-radius: 50%; border: none;
  background: var(--color-accent); color: var(--color-bg);
  display: grid; place-items: center; cursor: pointer;
  box-shadow: 0 10px 28px color-mix(in srgb, var(--color-accent) 46%, transparent);
  transition: transform .15s ease, box-shadow .2s ease;
}
.fab:hover {
  transform: scale(1.07);
  box-shadow: 0 14px 34px color-mix(in srgb, var(--color-accent) 55%, transparent);
}

/* — app shell (defined inline in the design file's root divs) — */
.app-shell { display: flex; height: 100vh; background: var(--color-bg); overflow: hidden; position: relative; }
.topbar {
  height: 62px; flex: none; display: flex; align-items: center; gap: 8px;
  padding: 0 26px; border-bottom: 1px solid var(--color-divider);
}
/* scrollbar-gutter:stable reserves the scrollbar's width whether or not
   content actually overflows — without it, a tab whose content is
   taller than the viewport (Library's grid, Profile's Logs tab) gets a
   scrollbar and one that isn't (an empty-state tab like Favorites/
   Theatres) doesn't, so .mainscroll > div's margin-inline:auto
   centers against a different available width each time — a visible
   horizontal jump switching between tabs on the same page. */
.mainscroll { flex: 1; overflow-y: auto; scrollbar-gutter: stable; }

/* ══════════════════════════════════════════════════════════════════════════
   3. Responsive — breakpoints mirror hooks/useBreakpoint.ts's BP
      (mobile:768, tablet:1120). Below "mobile", app/(app)/_layout.tsx swaps
      the whole shell from WebLayout (Sidebar) to MobileLayout (TabBar) — a
      JS-level component swap, not something CSS alone can do. What's here is
      purely the styling half: grid columns and shell padding at the widths
      WebLayout still renders at.
   ══════════════════════════════════════════════════════════════════════ */
.libgrid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 18px; }
@media (max-width: 1119px) {
  .libgrid { grid-template-columns: repeat(3, 1fr); gap: 14px; }
  .topbar { padding: 0 16px; }
}
@media (max-width: 767px) {
  .libgrid { grid-template-columns: 1fr 1fr; gap: 14px; }
  /* LibraryScreen's header row (kicker + "N films logged" + Analytics +
     grid/list toggle) is written for desktop's wide top band; at phone
     width the 34px heading and both controls fought for the same line. */
  .lib-header { flex-direction: column; align-items: flex-start !important; gap: 10px; }
  .lib-title { font-size: 27px !important; }
}
/* .ov (designed as a hover-reveal overlay, see section 2 above) has no
   hover on a touchscreen, so its title/venue/date never appeared on mobile
   web — the poster was a blank gradient rectangle. Leave it shown whenever
   there's no pointer to hover with (real touch devices) or the viewport is
   phone-width (a narrow desktop window still has hover, but matching the
   mobile design here reads better than a bare poster at that width). */
/* .lib-card-title/.lib-card-date: see the comment at their JSX call site in
   LibraryScreen.tsx — exactly one of this pair is ever shown; default to
   the desktop pairing (title shown, date hidden) and flip both together
   with .ov below, so the three rules can never fall out of sync. */
.lib-card-date { display: none; }
@media (hover: none), (max-width: 767px) {
  .ov { opacity: 1; }
  .lib-card-title { display: none; }
  .lib-card-date { display: inline; }
}
/* Guards against any fixed-width element (a grid, a nowrap row) forcing the
   page itself to scroll sideways; scoped containers keep their own
   overflow-x:auto (e.g. .clg-scroll filter rows) regardless. */
html, body { overflow-x: hidden; }
`;

/** Injects the design-system stylesheet once (web only). */
export function injectDesignSystemCss(): void {
  const doc = (globalThis as any).document;
  if (!doc) return;
  if (doc.getElementById("clg-ds")) return;
  const style = doc.createElement("style");
  style.id = "clg-ds";
  style.textContent = DESIGN_SYSTEM_CSS;
  doc.head.appendChild(style);
}
