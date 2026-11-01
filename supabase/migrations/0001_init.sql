-- Soirée schema. Only the server, using the secret key, reads or writes. RLS is on with no policies.
create extension if not exists pgcrypto;

create table plans (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  edit_token_hash text not null,
  event_type text not null check (event_type in ('wedding','birthday','community')),
  input jsonb not null,
  current_version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '90 days')
);
create index plans_expires_at_idx on plans (expires_at);

create table plan_versions (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references plans(id) on delete cascade,
  version int not null,
  rev int not null default 1,
  is_applied boolean not null default false,
  scenario text,
  input_patch jsonb,
  budget_total bigint not null,
  lines jsonb not null, phases jsonb not null, vendors jsonb not null, ideas jsonb not null,
  narrative text,
  created_at timestamptz not null default now(),
  unique (plan_id, version)
);
create unique index one_draft_per_plan on plan_versions (plan_id) where is_applied = false;

create table rate_limits (
  key text not null, window_start timestamptz not null, count int not null default 0,
  primary key (key, window_start)
);

create or replace function increment_rate_limit(p_key text, p_window timestamptz)
returns int language plpgsql set search_path = public as $$
declare c int;
begin
  insert into rate_limits (key, window_start, count) values (p_key, p_window, 1)
  on conflict (key, window_start) do update set count = rate_limits.count + 1
  returning count into c;
  return c;
end $$;

-- One round trip per read: the plan, its current version and applied-version history. Null when missing or expired.
create or replace function get_plan(p_slug text)
returns jsonb language sql stable set search_path = public as $$
  select jsonb_build_object(
    'id', p.id, 'slug', p.slug, 'tokenHash', p.edit_token_hash, 'input', p.input,
    'current', (select to_jsonb(v) - 'plan_id' - 'id' from plan_versions v where v.plan_id = p.id and v.version = p.current_version),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object('version', h.version, 'createdAt', h.created_at, 'scenario', h.scenario) order by h.version)
      from plan_versions h where h.plan_id = p.id and h.is_applied
    ), '[]'::jsonb)
  )
  from plans p where p.slug = p_slug and p.expires_at > now();
$$;

-- Promote a draft atomically. The caller merged progress (done tasks, vendor status/notes, ideas) from the
-- current version into p_phases/p_vendors/p_ideas; p_expected_rev guards against edits made after that merge.
create or replace function apply_version(
  p_plan_id uuid, p_version int, p_expected_rev int, p_phases jsonb, p_vendors jsonb, p_ideas jsonb
) returns text language plpgsql set search_path = public as $$
declare patch jsonb; cur int;
begin
  select current_version into cur from plans where id = p_plan_id for update;
  if cur = p_version then return 'already_applied'; end if;
  if not exists (select 1 from plan_versions where plan_id = p_plan_id and version = cur and rev = p_expected_rev) then
    return 'stale';                                  -- service re-merges and retries (max 3), then 409
  end if;
  update plan_versions
     set is_applied = true, rev = rev + 1, phases = p_phases, vendors = p_vendors, ideas = p_ideas
   where plan_id = p_plan_id and version = p_version and is_applied = false
   returning input_patch into patch;
  if not found then return 'no_draft'; end if;
  -- Bump the old current version so an edit that read it before this apply fails its compare-and-set.
  update plan_versions set rev = rev + 1 where plan_id = p_plan_id and version = cur;
  update plans set current_version = p_version,
         input = case when patch is null then input else input || patch end, updated_at = now()
   where id = p_plan_id;
  return 'applied';
end $$;

-- Retention: expired plans (versions cascade), IP-window rows older than 2 hours, and quota rows of deleted plans.
-- Per-plan quota rows use the epoch as a fixed window, so they live exactly as long as their plan.
create or replace function cleanup_expired()
returns jsonb language plpgsql set search_path = public as $$
declare n_plans int; n_rates int;
begin
  delete from plans where expires_at < now();
  get diagnostics n_plans = row_count;
  delete from rate_limits r
   where (r.window_start > 'epoch'::timestamptz and r.window_start < now() - interval '2 hours')
      or (r.key like 'plan:%' and not exists (select 1 from plans p where p.id::text = split_part(r.key, ':', 2)));
  get diagnostics n_rates = row_count;
  return jsonb_build_object('plans', n_plans, 'rateRows', n_rates);
end $$;

revoke all on function increment_rate_limit(text, timestamptz) from public, anon, authenticated;
revoke all on function get_plan(text) from public, anon, authenticated;
revoke all on function apply_version(uuid, int, int, jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke all on function cleanup_expired() from public, anon, authenticated;
grant execute on function increment_rate_limit(text, timestamptz), get_plan(text),
  apply_version(uuid, int, int, jsonb, jsonb, jsonb), cleanup_expired() to service_role;

alter table plans enable row level security;
alter table plan_versions enable row level security;
alter table rate_limits enable row level security;
revoke all on all tables in schema public from anon, authenticated;
-- No policies on purpose: only the server, with the secret key, reads or writes.
