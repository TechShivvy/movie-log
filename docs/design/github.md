repo: TechShivvy/movie-log
branch: feat/backend-hardening

## Last sync
date: 2026-08-16T15:38:00Z

### Updated in this project
- Full branch audit: read all 53 migrations + 13 routers (nothing left on plan.md alone).
- Added Stitch "Cinematic Motion" direction: Sora/Plus Jakarta Sans/JetBrains Mono fonts, Cinematic red-on-navy theme, glass + film grain + accent-glow + poster-scale motion.
- Mobile installable-PWA affordances + animated cinematic backdrop; web Movie + Theatre pages; typeface switch.

### Earlier
date: 2026-08-16T15:31:38Z

### Updated in this project
- CineLog Phase 1: mobile (`CineLog Mobile.dc.html`) + web/PWA (`CineLog Web.dc.html`) on Nocturne.
- Read latest branch commits beyond plan.md: batch extraction, auto-insert, cancelled screening, bulk import.
- Added batch AI scan (progress + auto-insert), punctuality (arrival/screening incl. cancelled), archive tier.
- Live full-palette theme switching (11 schemes) from the frontend theme tokens.

## Sync history
- 2026-08-16T15:20:38Z — initial mobile prototype from plan.md + feat/add-all frontend.

## Screen map
| Screen | Built from |
| --- | --- |
| Whole app | `plan.md`, `feat/add-all` frontend theme (`frontend/src/theme/*`), Stitch mockups (`stitch_lively_movie_logger 2/*`) |
| Library / log detail / log form | `frontend/src/components/MovieCard.tsx`, migrations (movie_logs, favorites, punctuality, fdfs) |
| Themes / settings | `frontend/src/theme/ThemeContext.tsx`, `tokens.ts` |
| Feed / profile / notifications / comments / likes | migrations (follows_blocks, feed, notifications, comments, likes) |
| Venue / movie / stats | migrations (venues, movies_catalog, punctuality_stats) |
