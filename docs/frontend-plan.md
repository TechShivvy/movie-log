# CineLog — React Expo Frontend Plan

## Context
Building the complete CineLog frontend as a React Expo app from the design handoff bundle (`CineLog Web.dc.html` + `CineLog Mobile.dc.html`) AND all features shipped in PR #11 (`feat/backend-hardening`, 97 commits). The app targets Android (APK), Web (PWA), and iOS. Code goes exclusively in `frontend/` on branch `claude/frontend-hardening-react-expo-6l8r1y`, which must be based on `origin/main` (SHA `4a05b4d0`). Backend folder is untouched.

The `frontend/` directory is already bootstrapped with `create-expo-app blank-typescript` (Expo SDK 57, React 19.2.3, RN 0.86.2). The `AGENTS.md` file inside instructs: **read docs.expo.dev/versions/v57.0.0/ before writing any Expo-specific code**.

---

## Design System (from HTML prototypes)

**Fonts:** Sora (headings) · Plus Jakarta Sans (body) · JetBrains Mono (mono)  
**Font options:** "Cinematic" (Sora+PJS), "Inter", "System" — toggled in Settings, applied globally  
**Icons:** `phosphor-react-native` (cross-platform Phosphor set)  
**Overlay effects:** SVG film-grain (fixed, pointer-events:none) + animated radial-gradient backdrop (18s loop)  
**Glass morphism:** semi-transparent surface cards with backdrop blur  

**12 Themes (exact hex from HTML):**

| Key | Label | bg | surface | text | accent |
|---|---|---|---|---|---|
| `cinematic` | Cinematic | #0b1326 | #0f1b33 | #e8eaf0 | #e50914 |
| `nocturne` | Nocturne | #0a0a0f | #111118 | #e5e5f0 | #7c6aed |
| `cinema` | Cinema | #1a0a00 | #241200 | #f0e8dc | #ff6b1a |
| `indigo-dusk` | Indigo Dusk | #0d0f1a | #13162a | #dde1f5 | #5c73f2 |
| `amber-glow` | Amber Glow | #1a1400 | #241c00 | #f5eed8 | #ffb800 |
| `nord` | Nord | #1e2430 | #252d3b | #d8dee9 | #88c0d0 |
| `sakura` | Sakura | #1a0f14 | #24141c | #f5dde8 | #f06292 |
| `forest` | Forest | #0a1a0f | #0f2414 | #d8f0e0 | #4caf7a |
| `sunset` | Sunset | #1a0f0a | #24140f | #f5e0d8 | #ff7043 |
| `crimson` | Crimson | #1a0008 | #24000f | #f5d8e0 | #d50032 |
| `champagne` | Champagne | #f5f0e8 | #fffdf8 | #1a1510 | #b8860b |
| `monochrome` | Monochrome | #0a0a0a | #141414 | #e5e5e5 | #ffffff |

**Derived CSS tokens (computed in JS, injected as CSS vars on web):**
- `--color-accent-900` = blend(accent 15% over bg)
- `--color-divider` = rgba(text, 0.15)
- `--color-neutral-800` = blend(text 13% over bg)

---

## Backend API Surface (from PR #11 body + 20 comments)

**Base:** `EXPO_PUBLIC_API_URL` (default `http://localhost:8000`)  
**Auth header:** `Authorization: Bearer <supabase_access_token>`

### Auth
- `GET /auth/me` → `{id, username, display_name, avatar_url, bio, created_at}`

### Movie Logs (CRUD + Archive)
- `GET /movie-logs` params: `?user_id=&archived=false&visibility=`
- `POST /movie-logs` → create log
- `GET /movie-logs/{id}` 
- `PUT /movie-logs/{id}` → update (sets `edited_at`)
- `DELETE /movie-logs/{id}`
- `POST /movie-logs/{id}/archive` + `DELETE /movie-logs/{id}/archive`
- **Visibility:** `public` · `followers_only` · `private` (archive = separate tier, excluded from all aggregates)
- **Log fields:** `movie_title`, `movie_poster_url`, `venue_id`, `screen_number`, `seat`, `format` (IMAX/4DX/Dolby/Standard/etc.), `rating` (0–5 stars), `notes`, `visibility`, `arrived_at`, `screening_started_at`, `is_fdfs` (first-day-first-show), `ticket_url`, `used_provider`, `used_model`

### Ticket Extraction
- `POST /extract` body: `{image_base64}` → single photo OCR
- `POST /extract-from-link` body: `{url}` → URL-based
- `POST /movie-metadata/extract-batch` body: `{images: [...base64], auto_insert: bool}` → async job (≤20 images)
- `GET /movie-metadata/extract-batch/{job_id}` → `{status: "pending"|"processing"|"done"|"stalled", items: [{image_index, status, result, error}]}`
- Result fields: `movie_title`, `venue_name`, `date`, `format`, `seat`, `is_ticket` (bool), `rejection_reason`
- Error: `422 NOT_A_TICKET` when image isn't a ticket (fails-open = show error toast, don't block)
- **`X-LLM-API-Key` header** for BYO provider key override on all extraction calls
- `used_provider` + `used_model` always populated on response (provenance)

### LLM Key Management
- `PUT /public/me/llm-keys/{provider}` body: `{api_key}` → encrypted server storage
- `GET /public/me/llm-keys` → `[{provider, masked_key, created_at, is_active}]`
- `DELETE /public/me/llm-keys/{provider}` → deletes AND opts out of server storage
- Providers: `openrouter` · `openai` · `gemini`
- `llm_key_storage_preference`: `"server"` | `"local"` (persisted per user)
- Auto-fallback chain: stored provider key → OpenRouter shared free key
- Local alternative: `expo-secure-store` for keys (used when preference = `"local"`)

### Social
- `POST /users/{username}/follow` + `DELETE /users/{username}/follow`
- `POST /users/{username}/block` + `DELETE /users/{username}/block`
- `GET /feed/entries` → paginated social feed (log_like, new_comment, new_log, follow events)
- `GET /users/{username}/profile` → `{user, stats, logs, followers_count, following_count, is_following, is_blocked}`

### Comments & Likes
- `POST /movie-logs/{id}/comments` body: `{content, parent_comment_id?}` → 1-level nesting
- `GET /movie-logs/{id}/comments` → tree (comment + replies array)
- `POST /movie-logs/{id}/comments/{cid}/like` + `DELETE .../like`
- `POST /movie-logs/{id}/like` + `DELETE /movie-logs/{id}/like`

### Notifications
- `GET /notifications` → paginated list
- `GET /notifications/unread-count` → `{count}`
- `POST /notifications/{id}/read` → grey-out only, **no dismiss/delete**
- 8 types: `follow` · `unfollow` · `new_comment` · `comment_reply` · `log_like` · `comment_like` · `report_resolved` · `system`
- Enriched: `actor_username`, `movie` (title string), `comment_preview` (50-char truncated)

### Search & Favorites
- `GET /search/movies?q=` → movie search results
- `GET /search/users?q=` → user search results
- `GET /search/favorites` → up to 4 favorite movie slots
- `POST /search/favorites` body: `{movie_id}` + `DELETE /search/favorites/{movie_id}`

### Venues
- `GET /venues` + `GET /venues/{id}` → `{id, name, address, lat, lng, status: "open"|"closed", last_verified}`

---

## Architecture

```
frontend/
  app/                         # Expo Router v4 file-based routes
    _layout.tsx                # Root — fonts, QueryClient, ThemeProvider, AuthProvider
    (auth)/
      _layout.tsx
      index.tsx                # Login screen (redirect if authed)
    (app)/
      _layout.tsx              # Sidebar (web) OR Tabs (mobile) — Platform.OS branch
      index.tsx                # → LibraryScreen
      feed.tsx                 # → FeedScreen
      search.tsx               # → SearchScreen
      profile.tsx              # → ProfileScreen (own profile)
      stats.tsx                # → StatsScreen
      notifications.tsx        # → NotificationsScreen
      settings.tsx             # → SettingsScreen
      log/
        new.tsx                # → LogFormScreen
        [id].tsx               # → LogDetailScreen
      movie/[id].tsx           # → MovieScreen
      venue/[id].tsx           # → VenueScreen
      profile/[username].tsx   # → ProfileScreen (other user)
  components/
    ui/
      Button.tsx               # Variants: primary/secondary/icon/ghost
      Card.tsx                 # Glass morphism card wrapper
      Tag.tsx                  # Variants: accent/outline/neutral
      Input.tsx                # TextInput with label + error state
      SegmentedControl.tsx     # Multi-option toggle
      Avatar.tsx               # Gradient initials avatar + image fallback
      PosterCard.tsx           # 2:3 poster + star badge + hover scale (web)
      StarRating.tsx           # Interactive 0–5 star picker
      Badge.tsx                # Notification badge, "Active" badge
    layout/
      Sidebar.tsx              # Web only — 236px→68px collapsible, nav items
      TabBar.tsx               # Mobile — 5 tabs + center FAB
      TopBar.tsx               # Web — search field + PWA install button
      FilmGrain.tsx            # SVG noise, position:fixed, pointer-events:none
      CinematicBg.tsx          # Animated radial-gradient, absolute fill
  modals/
    AITicketModal.tsx          # Ticket scan: Single/Batch tabs, progress, item list
    AddLLMKeyModal.tsx         # Add/replace provider key form
  screens/
    LibraryScreen.tsx
    FeedScreen.tsx
    LogFormScreen.tsx
    LogDetailScreen.tsx
    StatsScreen.tsx
    ProfileScreen.tsx
    SettingsScreen.tsx
    NotificationsScreen.tsx
    SearchScreen.tsx
    MovieScreen.tsx
    VenueScreen.tsx
    LoginScreen.tsx
  context/
    ThemeContext.tsx           # 12 themes + font pref; CSS var injection on web
    AuthContext.tsx            # Supabase session, user object, signOut
  lib/
    supabase.ts               # createClient; AsyncStorage session persistence
    api.ts                    # Axios instance; auth header interceptor; LLM key header
    mockData.ts               # Demo data (8 films, 3 feed posts, etc.)
  constants/
    themes.ts                 # 12 theme objects with hex values
    fonts.ts                  # 3 font family definitions
  types/
    index.ts                  # MovieLog, Venue, User, Notification, LLMKey, etc.
  hooks/
    useAuth.ts
    useTheme.ts
    useMovieLogs.ts           # TanStack Query CRUD hooks
    useFeed.ts
    useNotifications.ts
    useSocial.ts              # follow/block/comments/likes
    useSearch.ts
    useLLMKeys.ts
    useExtractTicket.ts       # single/link/batch extraction + polling
```

---

## Dependencies

```json
{
  "expo-router": "~4.0.0",
  "expo-linking": "~7.0.0",
  "expo-constants": "~17.0.0",
  "expo-font": "~13.0.0",
  "@expo-google-fonts/sora": "^0.2.3",
  "@expo-google-fonts/plus-jakarta-sans": "^0.2.3",
  "phosphor-react-native": "^2.0.1",
  "react-native-svg": "^15.0.0",
  "react-native-reanimated": "~3.18.0",
  "expo-linear-gradient": "~14.0.0",
  "expo-blur": "~14.0.0",
  "react-native-safe-area-context": "5.0.0",
  "react-native-screens": "~4.4.0",
  "react-native-gesture-handler": "~2.24.0",
  "@react-navigation/native": "^7.0.0",
  "@react-navigation/bottom-tabs": "^7.0.0",
  "@supabase/supabase-js": "^2.50.0",
  "@tanstack/react-query": "^5.60.0",
  "axios": "^1.7.0",
  "zustand": "^5.0.0",
  "expo-image-picker": "~16.0.0",
  "expo-secure-store": "~14.0.0",
  "expo-web-browser": "~14.0.0",
  "@react-native-async-storage/async-storage": "2.1.0"
}
```

---

## Phase-by-Phase Breakdown

All 8 phases combined = complete app matching designs + all PR #11 features.

---

### Phase 1 — Foundation & Auth
**Goal:** Project skeleton, theme system, Supabase auth, login screen.

**Files to create/modify:**
- `package.json` — add all deps above
- `app.json` — add expo-router main entry, scheme, PWA fields, Android package `com.techshivvy.cinelog`
- `constants/themes.ts` — 12 theme definitions with hex values
- `constants/fonts.ts` — 3 font family configs
- `types/index.ts` — all TypeScript interfaces
- `lib/supabase.ts` — `createClient` with AsyncStorage session adapter
- `lib/api.ts` — Axios with auth interceptor + `X-LLM-API-Key` injection hook
- `lib/mockData.ts` — demo data: 8 films, 3 feed posts, 2 users, 3 notifications
- `context/ThemeContext.tsx` — theme state; on web: inject CSS vars via `document.documentElement.style.setProperty`; on native: provide plain JS theme object
- `context/AuthContext.tsx` — `supabase.auth.onAuthStateChange` listener, `signOut`, `user`
- `hooks/useAuth.ts` + `hooks/useTheme.ts`
- `components/layout/FilmGrain.tsx` — SVG feTurbulence noise filter, web: CSS fixed position; native: react-native-svg absolute
- `components/layout/CinematicBg.tsx` — animated radial gradient (react-native-reanimated or CSS animation)
- `app/_layout.tsx` — load fonts (useFonts), wrap with QueryClientProvider + ThemeProvider + AuthProvider + GestureHandlerRootView
- `app/(auth)/_layout.tsx` — redirect to `(app)` if session exists
- `app/(auth)/index.tsx` + `screens/LoginScreen.tsx` — Google OAuth via `expo-web-browser`, magic link input, email/password form; CinematicBg + FilmGrain + glass card

**Deliverable:** App loads login screen with correct theme, Google OAuth opens browser, redirect on success.

---

### Phase 2 — Navigation & Library
**Goal:** Main nav working, Library screen browsable with mock data.

**Files:**
- `components/ui/Button.tsx`, `Card.tsx`, `Tag.tsx`, `Avatar.tsx`, `PosterCard.tsx`, `StarRating.tsx`, `Badge.tsx`
- `components/layout/Sidebar.tsx` — web: fixed 236px, collapse toggle → 68px (icons only); active route highlight; nav items: Library, Feed, Search, Profile, Stats, Notifications, Settings; FAB at bottom
- `components/layout/TabBar.tsx` — mobile: `@react-navigation/bottom-tabs` with custom TabBarButton for center FAB; 5 tabs: Library · Feed · [FAB] · Search · Profile
- `components/layout/TopBar.tsx` — web: search input (routes to search screen) + PWA install prompt button
- `app/(app)/_layout.tsx` — `Platform.OS === 'web'` ? `<WebLayout>` (Sidebar + TopBar + ScrollView) : `<Tabs>` (TabBar)
- `app/(app)/index.tsx` → `screens/LibraryScreen.tsx` — film count header, "Analytics" chip → stats; horizontal filter chips (All/IMAX/4DX/Dolby/etc.); grid/list toggle; `Platform.OS === 'web'` → 5 col grid, mobile → 2 col; PosterCard with hue-based gradient bg + star badge; empty state

**Deliverable:** Navigate all tabs/sidebar, Library shows poster grid, theme switches instantly.

---

### Phase 3 — Movie Log CRUD
**Goal:** Full log creation + detail viewing.

**Files:**
- `components/ui/Input.tsx` — labeled text input, error state
- `components/ui/SegmentedControl.tsx` — multi-option toggle pill
- `app/(app)/log/new.tsx` → `screens/LogFormScreen.tsx`:
  - Web: 2-col (poster preview left, form grid right); Mobile: stacked
  - Movie search autocomplete (`GET /search/movies`)
  - Star rating picker (interactive `StarRating`)
  - Format chip selector: IMAX · 4DX · Dolby · Standard · ScreenX · etc.
  - Venue picker (search `GET /venues`)
  - Screen number + seat input
  - FDFS toggle switch
  - `arrived_at` segmented: Early/On-time/Late
  - `screening_started_at` field (time picker)
  - Visibility segmented: Public/Followers/Private
  - Notes textarea
  - Ticket URL input
  - AI Scan button → opens `AITicketModal` (Phase 4)
  - Submit → `POST /movie-logs`
- `app/(app)/log/[id].tsx` → `screens/LogDetailScreen.tsx`:
  - Mobile: full-width poster hero with gradient overlay
  - Web: fixed-width poster column + content right
  - Meta grid cards: Date · Theatre · Screen · Format · Seats · Ticket · Punctuality
  - `edited_at` badge if log was edited
  - `used_provider`/`used_model` extraction provenance chip
  - Visibility badge
  - Archive toggle (move to/from archive tier)
  - Like button (animated heart) + like count
  - Share button
  - Comments section: list with 1-level replies + compose input + reply composer
- `hooks/useMovieLogs.ts` — `useMovieLogs()`, `useMovieLog(id)`, `useCreateLog()`, `useUpdateLog()`, `useDeleteLog()`, `useArchiveLog()` — all TanStack Query, fallback to mockData when `EXPO_PUBLIC_API_URL` unset

**Deliverable:** Create a log with all fields, view log detail with meta cards and comments.

---

### Phase 4 — AI Ticket Extraction
**Goal:** Photo scan, link scan, and batch scan (≤20) all working.

**Files:**
- `modals/AITicketModal.tsx`:
  - `SegmentedControl` tabs: Single | Batch | Link
  - Single: pick one photo (`expo-image-picker`) → `POST /extract` (base64 body) with `X-LLM-API-Key` if set
  - Link: URL text input → `POST /extract-from-link`
  - Batch: pick up to 20 photos → `POST /movie-metadata/extract-batch` → get `job_id` → poll `GET /movie-metadata/extract-batch/{job_id}` every 1.5s
  - Progress bar: animated width based on `done/total` count
  - Item list: each image → Ticket icon + extracted movie title + status chip (Queued/Reading.../Read/Error)
  - STALLED state: show warning "Taking longer than expected"
  - Non-ticket: toast "`rejection_reason`" + mark item as Error
  - Auto-insert toggle: when batch done, optionally call `POST /movie-logs` for each extracted item
  - "Add N logs" button enabled when at least 1 success
  - `used_provider`/`used_model` attribution shown at bottom of modal
- `hooks/useExtractTicket.ts` — all extraction mutations, batch polling loop
- `lib/api.ts` — `setLLMKeyHeader(key)` utility that adds `X-LLM-API-Key` to Axios instance headers

**Deliverable:** Tap AI Scan → pick photos → progress bar fills → fills log form fields.

---

### Phase 5 — Social Features
**Goal:** Feed, profiles, follow/block, comments, likes, notifications.

**Files:**
- `screens/FeedScreen.tsx`:
  - Feed cards: avatar + actor name + action description + timestamp
  - Types: `new_log` (PosterCard inline), `log_like`, `new_comment` (comment preview), `follow`
  - Infinite scroll (`useInfiniteQuery`)
  - Pull-to-refresh
- `screens/ProfileScreen.tsx`:
  - Header: avatar, display_name, @username, bio
  - Stats row: Films · Following · Followers
  - Follow/Unfollow button (own profile: Edit Profile instead)
  - Block button (3-dot menu)
  - Log grid (2-col mobile, 4-col web) — filtered by visibility level
  - `is_following`/`is_blocked` state management
- `app/(app)/profile/[username].tsx` — dynamic user profile
- `screens/NotificationsScreen.tsx`:
  - Notification list (paginated)
  - 8 type icons: follow → PersonSimple, log_like → Heart, comment/reply → ChatCircle, report_resolved → CheckCircle, system → Bell
  - `actor_username` + `movie` title + `comment_preview`
  - Tap to read: `POST /notifications/{id}/read` → grey-out text/icon (no delete)
  - Unread badge on TabBar/Sidebar nav item (from `GET /notifications/unread-count`)
- Log detail: wire comment compose (`POST /movie-logs/{id}/comments`), reply compose (with `parent_comment_id`), comment like button
- `hooks/useFeed.ts`, `hooks/useNotifications.ts`, `hooks/useSocial.ts`

**Deliverable:** View feed, visit profiles, follow users, like logs, compose comments, notifications grey out on read.

---

### Phase 6 — Search, Movies & Venues
**Goal:** Movie discovery, venue detail pages, search with 4-slot favorites.

**Files:**
- `screens/SearchScreen.tsx`:
  - Search bar (debounced 300ms) → concurrent `GET /search/movies` + `GET /search/users`
  - Toggle between Movies and People results
  - Favorites section: 4 fixed slots for pinned movies (drag-to-reorder on web); `GET/POST/DELETE /search/favorites`
  - Recent searches (local AsyncStorage)
  - User result card: avatar, username, followers count, follow button inline
  - Movie result card: poster thumbnail, title, year, "View" button
- `screens/MovieScreen.tsx`:
  - Poster + title + year + genres
  - Watchlist toggle
  - "Logs from others" section (public logs for this movie from followed users)
  - "Add to log" FAB
- `screens/VenueScreen.tsx`:
  - Name, address, status badge (Open/Closed + `last_verified`)
  - Map embed (web: Google Maps iframe; native: link to Maps app)
  - Recent logs at this venue
- `hooks/useSearch.ts`

**Deliverable:** Search movies/users, pin 4 favorites, visit movie and venue detail pages.

---

### Phase 7 — Stats & Settings
**Goal:** Analytics dashboard, full settings management.

**Files:**
- `screens/StatsScreen.tsx`:
  - 4 stat tiles: Total Films · This Year · Avg Rating · Venues Visited
  - Monthly bar chart: div/View height-% bars — no external chart lib; animated on mount
  - Rating distribution: horizontal flex bars 1–5 stars
  - Genre breakdown: list with count + percentage bar
  - Format breakdown: IMAX/4DX/Dolby/Standard percentages
  - Punctuality big-number: X% On-time (derived from `arrived_at` vs `screening_started_at`)
  - FDFS count + time-of-day breakdown (morning/afternoon/evening/night)
  - Archive exclusion: stats never include archived logs
- `screens/SettingsScreen.tsx`:
  - **Typeface** segmented control: Cinematic · Inter · System → updates `ThemeContext` font preference, applies globally in < 100ms
  - **Theme grid**: 12 tiles, each with 3-swatch color preview row + check-circle on active; tap → instant theme switch
  - **LLM Keys** section:
    - Provider list: OpenRouter · OpenAI · Gemini
    - Each row: provider name, masked key (`sk-...xxxx`), "Active" badge, trash icon
    - "Add / Replace Key" → `AddLLMKeyModal` (text input + provider picker + server/local toggle)
    - Storage preference toggle: Server (encrypted) / Local (device secure store)
    - Deleting server key opts out of server storage → preference flips to Local
    - Key rotation: add same provider replaces existing
  - **Danger zone**: "Delete Account" → confirm dialog → `DELETE /auth/me` + supabase.auth.signOut
- `modals/AddLLMKeyModal.tsx` — provider picker, key input, storage preference, save button
- `hooks/useLLMKeys.ts` — list/add/delete via API + `expo-secure-store` for local path

**Deliverable:** Switch themes live, pick font, add/delete LLM keys in both storage modes, view stats with charts.

---

### Phase 8 — Polish, PWA & Android APK
**Goal:** Production-ready, offline-graceful, build targets configured.

**Files:**
- `app.json` — complete:
  ```json
  "web": { "output": "static", "bundler": "metro", "pwa": { "name": "CineLog", "short_name": "CineLog", "description": "Your cinema diary", "theme_color": "#e50914", "background_color": "#0b1326", "display": "standalone" } },
  "android": { "package": "com.techshivvy.cinelog", "permissions": ["CAMERA", "READ_EXTERNAL_STORAGE"] }
  ```
- `eas.json` — profiles: `preview` (APK) and `production` (AAB)
- **Archive tier UI** — archive/unarchive from log detail, archive chip filter in Library
- **Error boundaries** — API failure → show skeleton placeholders + "Demo mode" banner when no `EXPO_PUBLIC_API_URL`
- **Loading skeletons** — poster grid, feed, profile screens
- **PWA install prompt** — TopBar "Install App" button (web only); `beforeinstallprompt` event on web
- **Performance** — `React.memo` on PosterCard, `FlatList`/`FlashList` for long lists, `useCallback` on handlers
- **Deep links** — `expo-linking` config: `cinelog://log/:id`, `cinelog://movie/:id`, `cinelog://profile/:username`
- **`expo-secure-store`** — used for LLM keys local path + any cached session data

**Deliverable:** `npm run web` → PWA installable; `eas build --platform android --profile preview` → APK; all screens offline-graceful with mock fallback.

---

## Navigation Strategy

- **Web** (`Platform.OS === 'web'`): Fixed `Sidebar` (236px, collapses to 68px icon-only rail) + sticky `TopBar` with search + `ScrollView` main area. Expo Router's `<Stack>` for sub-routes (log/movie/venue).
- **Mobile**: `@react-navigation/bottom-tabs` Tabs with custom `TabBar` — Library · Feed · [FAB center] · Search · Profile. FAB opens `LogFormScreen` via push.
- `app/(app)/_layout.tsx` checks `Platform.OS` and renders the appropriate layout.

---

## Key Env Vars

```
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
EXPO_PUBLIC_API_URL=http://localhost:8000
```

Demo mode activates automatically when `EXPO_PUBLIC_API_URL` is unset (all hooks return `mockData`).

---

## Verification

- `cd frontend && npx expo start --web` → all 12 screens navigable, theme toggle works, font toggle works
- All 12 themes apply instantly without remount
- Font toggle (Cinematic/Inter/System) updates globally in <100ms
- AI scan modal: pick 2 photos → progress bar → titles extracted → fills form
- Auth: Google sign-in opens browser → redirects back → lands on Library
- Demo mode: set `EXPO_PUBLIC_API_URL=` (empty) → all screens show mock data, no errors
- `eas build --platform android --profile preview` → APK file
- PWA: Chrome → "Install CineLog" in address bar → standalone app with offline splash
