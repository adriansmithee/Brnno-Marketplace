-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New query).
-- Step 1: Create the accounts table.

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  domain text,
  city text,
  state text,
  country text,
  source text,
  ae_owner text,
  sdr_owner text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Step 2: Create the account_contacts table.

create table if not exists public.account_contacts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  first_name text,
  last_name text,
  email text,
  phone text,
  role text,
  is_primary boolean default false,
  created_at timestamptz default now()
);

-- Optional: index for faster lookups
create index if not exists idx_account_contacts_account_id on public.account_contacts(account_id);

-- Enable RLS later if you want; for now tables are open for your anon key.
-- alter table public.accounts enable row level security;
-- alter table public.account_contacts enable row level security;
