-- Web app support migration for early-stage booking flow.
-- Run after 03_marketplace_mvp.sql

alter table if exists public.bookings
  alter column detailer_id drop not null;

alter table if exists public.bookings
  add column if not exists detailer_label text,
  add column if not exists scheduled_for timestamptz;
