-- Mobile detailing marketplace MVP schema (web-first).
-- Run this AFTER your existing scripts in Supabase SQL Editor.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------
-- Core profiles (customer + detailer in one table)
-- ---------------------------------------------------------
create table if not exists public.marketplace_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('customer', 'detailer', 'admin')),
  full_name text,
  phone text,
  referral_code text unique,
  referral_credit_cents integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------
-- Customer data
-- ---------------------------------------------------------
create table if not exists public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.marketplace_profiles(id) on delete cascade,
  label text, -- Home, Work, etc
  line1 text not null,
  line2 text,
  city text,
  state text,
  postal_code text,
  country text default 'US',
  latitude numeric(9,6),
  longitude numeric(9,6),
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_customer_addresses_customer on public.customer_addresses(customer_id);

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.marketplace_profiles(id) on delete cascade,
  vin text,
  license_plate text,
  plate_state text,
  year integer,
  make text,
  model text,
  trim text,
  color text,
  body_type text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_vehicles_customer on public.vehicles(customer_id);

-- ---------------------------------------------------------
-- Detailer supply data
-- ---------------------------------------------------------
create table if not exists public.detailers (
  id uuid primary key references public.marketplace_profiles(id) on delete cascade,
  business_name text not null,
  bio text,
  rating numeric(3,2) default 5.0,
  verified boolean not null default false,
  active boolean not null default true,
  base_latitude numeric(9,6),
  base_longitude numeric(9,6),
  service_radius_miles integer not null default 25
);

create table if not exists public.service_tiers (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,         -- basic, interior, full, premium
  display_name text not null,
  base_duration_minutes integer not null,
  active boolean not null default true
);

create table if not exists public.detailer_tier_prices (
  id uuid primary key default gen_random_uuid(),
  detailer_id uuid not null references public.detailers(id) on delete cascade,
  tier_id uuid not null references public.service_tiers(id) on delete cascade,
  price_cents integer not null,
  unique (detailer_id, tier_id)
);

create table if not exists public.detailer_addons (
  id uuid primary key default gen_random_uuid(),
  detailer_id uuid not null references public.detailers(id) on delete cascade,
  name text not null,
  description text,
  price_cents integer not null,
  active boolean not null default true
);

create table if not exists public.detailer_availability_slots (
  id uuid primary key default gen_random_uuid(),
  detailer_id uuid not null references public.detailers(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  is_booked boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_detailer_slots_detailer on public.detailer_availability_slots(detailer_id, starts_at);

-- ---------------------------------------------------------
-- Booking + operations
-- ---------------------------------------------------------
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.marketplace_profiles(id) on delete restrict,
  detailer_id uuid not null references public.detailers(id) on delete restrict,
  vehicle_id uuid not null references public.vehicles(id) on delete restrict,
  address_id uuid not null references public.customer_addresses(id) on delete restrict,
  tier_id uuid not null references public.service_tiers(id) on delete restrict,
  slot_id uuid references public.detailer_availability_slots(id) on delete set null,
  status text not null check (status in ('pending', 'confirmed', 'en_route', 'arrived', 'in_progress', 'completed', 'cancelled')) default 'pending',
  dirt_level text check (dirt_level in ('standard', 'moderate', 'heavy')),
  dirt_upcharge_cents integer not null default 0,
  tier_price_cents integer not null,
  addons_total_cents integer not null default 0,
  total_cents integer not null,
  eta_minutes integer,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_bookings_customer on public.bookings(customer_id, created_at desc);
create index if not exists idx_bookings_detailer on public.bookings(detailer_id, created_at desc);

create table if not exists public.booking_addons (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  addon_id uuid not null references public.detailer_addons(id) on delete restrict,
  price_cents integer not null
);

create table if not exists public.booking_messages (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  sender_id uuid not null references public.marketplace_profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_booking_messages_booking on public.booking_messages(booking_id, created_at);

create table if not exists public.booking_tracking (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  detailer_id uuid not null references public.detailers(id) on delete cascade,
  latitude numeric(9,6) not null,
  longitude numeric(9,6) not null,
  recorded_at timestamptz not null default now()
);

create index if not exists idx_booking_tracking_booking on public.booking_tracking(booking_id, recorded_at desc);

-- ---------------------------------------------------------
-- Referrals
-- ---------------------------------------------------------
create table if not exists public.referral_redemptions (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.marketplace_profiles(id) on delete cascade,
  referred_user_id uuid not null references public.marketplace_profiles(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete set null,
  credit_cents integer not null default 2000,
  created_at timestamptz not null default now(),
  unique (referred_user_id)
);

-- ---------------------------------------------------------
-- Trigger for updated_at
-- ---------------------------------------------------------
create or replace function public.touch_marketplace_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_marketplace_profiles_touch on public.marketplace_profiles;
create trigger trg_marketplace_profiles_touch
before update on public.marketplace_profiles
for each row execute function public.touch_marketplace_updated_at();

-- ---------------------------------------------------------
-- Minimal seed service tiers
-- ---------------------------------------------------------
insert into public.service_tiers (slug, display_name, base_duration_minutes)
values
  ('basic', 'Basic Wash', 60),
  ('interior', 'Interior Detail', 90),
  ('full', 'Full Detail', 150),
  ('premium', 'Premium / Ceramic', 210)
on conflict (slug) do nothing;

-- ---------------------------------------------------------
-- MVP RLS policy starter set
-- ---------------------------------------------------------
alter table public.marketplace_profiles enable row level security;
alter table public.customer_addresses enable row level security;
alter table public.vehicles enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_messages enable row level security;

drop policy if exists marketplace_profiles_select_self on public.marketplace_profiles;
create policy marketplace_profiles_select_self
on public.marketplace_profiles for select
to authenticated
using (id = auth.uid());

drop policy if exists marketplace_profiles_update_self on public.marketplace_profiles;
create policy marketplace_profiles_update_self
on public.marketplace_profiles for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists customer_addresses_owner_all on public.customer_addresses;
create policy customer_addresses_owner_all
on public.customer_addresses
for all
to authenticated
using (customer_id = auth.uid())
with check (customer_id = auth.uid());

drop policy if exists vehicles_owner_all on public.vehicles;
create policy vehicles_owner_all
on public.vehicles
for all
to authenticated
using (customer_id = auth.uid())
with check (customer_id = auth.uid());

drop policy if exists bookings_customer_read_write on public.bookings;
create policy bookings_customer_read_write
on public.bookings
for all
to authenticated
using (customer_id = auth.uid())
with check (customer_id = auth.uid());

drop policy if exists booking_messages_participants on public.booking_messages;
create policy booking_messages_participants
on public.booking_messages
for all
to authenticated
using (
  exists (
    select 1
    from public.bookings b
    where b.id = booking_id
      and (b.customer_id = auth.uid() or b.detailer_id = auth.uid())
  )
)
with check (
  sender_id = auth.uid()
  and exists (
    select 1
    from public.bookings b
    where b.id = booking_id
      and (b.customer_id = auth.uid() or b.detailer_id = auth.uid())
  )
);
