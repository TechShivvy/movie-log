-- Missed in 20260817000001_extraction_batches.sql: extraction_batch_items
-- has an updated_at column but no trigger to bump it, unlike every other
-- table in this schema (reports, movie_logs, ...), which all reuse this
-- same set_updated_at_timestamp() function. Caught while writing the
-- application code that PATCHes this table per item.

drop trigger if exists trg_extraction_batch_items_updated_at on public.extraction_batch_items;
create trigger trg_extraction_batch_items_updated_at
before update on public.extraction_batch_items
for each row
execute function public.set_updated_at_timestamp();
