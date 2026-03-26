-- Brnno CRM: Per-user leads storage + RLS
-- Run in Supabase SQL editor.

-- 1) Per-user leads blob table (v2)
create table if not exists public.brnno_leads_v2 (
  username text primary key,           -- user email
  data     text not null default '{}', -- serialized app state blob
  updated_at timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_brnno_leads_v2_touch on public.brnno_leads_v2;
create trigger trg_brnno_leads_v2_touch
before update on public.brnno_leads_v2
for each row execute function public.touch_updated_at();

-- 2) RLS on brnno_accounts (profile table)
alter table public.brnno_accounts enable row level security;

-- Users can read their own profile
drop policy if exists brnno_accounts_select_self on public.brnno_accounts;
create policy brnno_accounts_select_self
on public.brnno_accounts for select
to authenticated
using (username = auth.email());

-- Admins can read all profiles
drop policy if exists brnno_accounts_select_admin on public.brnno_accounts;
create policy brnno_accounts_select_admin
on public.brnno_accounts for select
to authenticated
using (
  exists (
    select 1 from public.brnno_accounts a
    where a.username = auth.email()
      and a.is_admin = true
  )
);

-- Users can update limited fields on their own profile (role/admin changes should be server-side)
drop policy if exists brnno_accounts_update_self on public.brnno_accounts;
create policy brnno_accounts_update_self
on public.brnno_accounts for update
to authenticated
using (username = auth.email())
with check (username = auth.email());

-- 3) RLS on brnno_leads_v2
alter table public.brnno_leads_v2 enable row level security;

-- Owner can select their row
drop policy if exists brnno_leads_v2_select_self on public.brnno_leads_v2;
create policy brnno_leads_v2_select_self
on public.brnno_leads_v2 for select
to authenticated
using (username = auth.email());

-- Owner can insert their row
drop policy if exists brnno_leads_v2_insert_self on public.brnno_leads_v2;
create policy brnno_leads_v2_insert_self
on public.brnno_leads_v2 for insert
to authenticated
with check (username = auth.email());

-- Owner can update their row
drop policy if exists brnno_leads_v2_update_self on public.brnno_leads_v2;
create policy brnno_leads_v2_update_self
on public.brnno_leads_v2 for update
to authenticated
using (username = auth.email())
with check (username = auth.email());

-- Admin can select all rows (for ops/support)
drop policy if exists brnno_leads_v2_select_admin on public.brnno_leads_v2;
create policy brnno_leads_v2_select_admin
on public.brnno_leads_v2 for select
to authenticated
using (
  exists (
    select 1 from public.brnno_accounts a
    where a.username = auth.email()
      and a.is_admin = true
  )
);

