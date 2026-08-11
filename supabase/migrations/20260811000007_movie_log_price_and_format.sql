-- Adds price/currency and format (2D/3D/4DX/IMAX/...) to movie_logs.
--
-- Kept separate from `screen`: a real ticket often prints both an
-- auditorium identifier ("Audi 5", "Screen 3") AND a presentation format
-- ("3D", "IMAX") at once — the extraction prompt used to conflate the
-- two into `screen` alone, silently losing whichever wasn't chosen.
--
-- `price` is amount + `currency` (ISO 4217-shaped, not a full membership
-- check — no need to hand-maintain that list here, malformed values are
-- already normalized to null client-side by the extraction schema, this
-- constraint is a last-resort backstop) rather than a bare number: a
-- ticket price with no currency is ambiguous the moment a user logs a
-- ticket bought in a different country than their usual one.

alter table public.movie_logs
  add column if not exists format text,
  add column if not exists price numeric(10, 2),
  add column if not exists currency text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'movie_logs_price_non_negative') then
    alter table public.movie_logs
      add constraint movie_logs_price_non_negative
      check (price is null or price >= 0);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'movie_logs_currency_shape') then
    alter table public.movie_logs
      add constraint movie_logs_currency_shape
      check (currency is null or currency ~ '^[A-Z]{3}$');
  end if;
end $$;
