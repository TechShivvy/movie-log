---
name: run-frontend
description: Launch and drive the CineLog Expo web frontend for manual/visual verification — start the dev server, sign in with a throwaway Supabase account, and screenshot or inspect screens at real mobile/desktop viewports with Playwright. Use this whenever a task needs to actually see the app render (mobile-responsiveness checks, CSS/layout bugs, visual regressions) rather than just reading the code.
---

# Running the CineLog frontend

This is an Expo (SDK 57) app rendering to `react-native-web` for the
browser/PWA target. Read `frontend/AGENTS.md` first — Expo APIs drift
between versions, and that file pins the exact docs to check.

## 1. Start (or reuse) the dev server

```bash
cd frontend
curl -s -o /dev/null -w "%{http_code}" http://localhost:8081   # 200 = already running, skip start
npm run web   # expo start --web --host 0.0.0.0 — only if the check above didn't return 200
```

It binds port **8081**. Cold start (Metro bundling) can take 20-30s
before it answers; first navigation to any given route also compiles
that route's chunk lazily, so give the *first* hit to a fresh route
3-6s before deciding it's stuck (see the wait times below — a spinner
that hasn't resolved by 2-3s isn't necessarily broken, it may just be
mid-bundle).

## 2. Driving it with Playwright

No `playwright` package is installed in `frontend/node_modules` — don't
try to `require("playwright")` relative to the repo. `npx playwright`
works but resolves out of npm's `_npx` cache, e.g.:

```bash
npx --no-install playwright --version   # confirms it's cached and prints the resolvable path pattern
```

Find the actual module path once per machine and reuse it in any
Node driver script:

```bash
find "$(npm config get cache)/_npx" -maxdepth 4 -iname playwright -type d
# → .../_npx/<hash>/node_modules/playwright
```

For a **single** screenshot with no interaction, the CLI is enough —
faster than writing a script:

```bash
npx --no-install playwright screenshot --viewport-size=390,844 --wait-for-timeout=3000 \
  "http://localhost:8081/<route>" "<scratchpad>/shot.png"
```

For anything needing login, navigation, or DOM inspection, write a
throwaway Node script in the scratchpad that does
`require("<the _npx path found above>/playwright")` — see the auth
pattern below. Always pass an **explicit absolute output path** (with
forward slashes) into `page.screenshot({ path: ... })`; a missing/undefined
path segment fails silently different ways depending on how it's built,
and is a bigger time-sink to debug than it looks.

## 3. Auth for verification

There's no seeded test account — mint and discard a real one per session
via Supabase's admin API (needs the backend checkout's service-role key):

```bash
cd ../movie-log-backend/backend   # sibling checkout, separate repo
SUPA_URL=$(grep -E "^SUPABASE_URL" .env | cut -d= -f2- | tr -d '"\r')
SERVICE_KEY=$(grep -E "^SUPABASE_SERVICE_ROLE_KEY" .env | cut -d= -f2- | tr -d '"\r')
curl -s -X POST "$SUPA_URL/auth/v1/admin/users" \
  -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"audit_<ts>@example.com","password":"TestPass123!","email_confirm":true}'
```

Sign in on `/` with `input[placeholder="you@email.com"]` /
`input[type="password"]` / `text=Sign in`. **A brand-new account always
lands on `/onboarding`** (the `(app)` layout redirects there until a
username is set) — fill `input[placeholder="lowercase_letters_digits"]`,
wait ~1.2s for the debounced availability check, then click `text=Continue`
before navigating anywhere else, or every other route just bounces back
to onboarding.

**Always delete what you created** — the same admin endpoint with
`DELETE /auth/v1/admin/users/{id}`, and any inserted rows (e.g. a
throwaway `movie_logs` row made directly via `POST /rest/v1/movie_logs`
with the service key, to get a real log to view without the API's
theatre-required validation) via `DELETE /rest/v1/<table>?id=eq.<id>`.
Don't leave audit accounts/rows behind.

## 4. Mobile-responsiveness audit pattern

This app's #1 recurring class of mobile bug: a screen checks only
`Platform.OS === "web"` for its desktop-styled branch, with no width
exclusion — since `Platform.OS` is `"web"` at *any* browser width, that
branch renders unconditionally, even on a real phone. The correct,
established pattern (`hooks/useBreakpoint.ts`'s `isMobile`, true below
768px) is `Platform.OS === "web" && !isMobile`, letting real mobile
widths fall through to the native-styled branch (which has its own
`ScrollView`, correct font sizes, single-column layout).

When auditing: grep every `screens/*.tsx` for
`if (Platform.OS === "web") {` vs `if (Platform.OS === "web" && !isMobile) {`
to find screens missing the exclusion — but check each hit's context
first. Two false positives to filter out before "fixing" a match:
- **Sub-components** invoked from within an already-branched parent
  (e.g. a card/badge/row component) correctly use bare `Platform.OS`
  checks — they mirror whatever the parent already decided and don't
  need their own `isMobile` awareness, *unless* the sub-component is a
  genuinely reusable, differently-styled-per-platform widget (like
  `SegmentedControl`) that gets dropped into a "native-styled" branch
  while still running in an actual web browser — those need the same
  `!isMobile` fix as a full screen, because `Platform.OS` alone can't
  tell them apart from a desktop context.
- **CSS-class-based (not RN StyleSheet) desktop styling** can still
  render wrong on mobile *inside a correctly-branched native section*,
  because react-native-web injects its own reset stylesheet late in
  the cascade — a tie in specificity between an app CSS class and RNW's
  reset goes to source order, not to the class. If a `className`-styled
  element behaves differently than its plain CSS rule says it should
  (e.g. `display:inline-flex` not actually shrinking to content), check
  `getComputedStyle(el)` against the CSS source before assuming the
  rule itself is wrong — pin sizing with an explicit property
  (`width: fit-content`, not just a `display` value) rather than fighting
  the cascade.

Verify by screenshotting/inspecting at **390×844** (a real phone width,
not a resized desktop browser) signed into a throwaway account, per
the pattern above — resizing a desktop Chrome window is not equivalent
to `Platform.OS === "web"` at a phone's actual dimensions for anything
gated on `useWindowDimensions()`.

## 5. Typecheck before calling anything done

```bash
cd frontend
node --stack-size=10000 ./node_modules/typescript/lib/tsc.js --noEmit
```

No output = clean. This repo's TS project is large enough that the
default stack size can overflow mid-check without `--stack-size`.
