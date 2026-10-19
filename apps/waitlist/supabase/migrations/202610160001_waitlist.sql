begin;

create table public.waitlist_members (
  user_id uuid primary key references auth.users(id) on delete restrict,
  username text not null check (username ~ '^[A-Za-z0-9_.-]{3,24}$'),
  referral_code text not null unique check (referral_code ~ '^[A-Z0-9]{8}$'),
  referred_by uuid references public.waitlist_members(user_id) on delete restrict,
  joined_at timestamptz not null default clock_timestamp(),
  constraint waitlist_no_self_referral check (referred_by is distinct from user_id)
);
create unique index waitlist_username_unique on public.waitlist_members (lower(username));
create index waitlist_referral_activity on public.waitlist_members (referred_by, joined_at desc, user_id);
alter table public.waitlist_members enable row level security;
revoke all on public.waitlist_members from public, anon, authenticated;
grant select, insert on public.waitlist_members to service_role;

-- No email copies and no counters: every credited referral is a verified membership.
create view public.waitlist_ranking with (security_invoker = true) as
select m.user_id, m.username, m.referral_code, m.joined_at,
       count(r.user_id)::integer as referral_count,
       row_number() over (order by count(r.user_id) desc, m.joined_at, m.user_id)::integer as rank
from public.waitlist_members m
left join public.waitlist_members r on r.referred_by = m.user_id
group by m.user_id;
revoke all on public.waitlist_ranking from public, anon, authenticated;
grant select on public.waitlist_ranking to service_role;

create function public.create_waitlist_membership(p_user_id uuid, p_username text, p_referral_code text default null)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  inviter uuid;
  candidate text;
  violation text;
begin
  -- Serialize retries for this identity, including requests from different devices/functions.
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  if exists (select 1 from public.waitlist_members where user_id = p_user_id) then return; end if;
  if not exists (select 1 from auth.users where id = p_user_id and email_confirmed_at is not null) then
    raise exception 'unverified_user';
  end if;
  if p_username is null or p_username !~ '^[A-Za-z0-9_.-]{3,24}$' then raise exception 'invalid_username'; end if;
  select user_id into inviter from public.waitlist_members
    where referral_code = p_referral_code and user_id <> p_user_id;
  for attempt in 1..10 loop
    candidate := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    begin
      insert into public.waitlist_members(user_id, username, referral_code, referred_by)
      values (p_user_id, p_username, candidate, inviter);
      return;
    exception when unique_violation then
      get stacked diagnostics violation = CONSTRAINT_NAME;
      if violation = 'waitlist_username_unique' then raise exception 'username_taken'; end if;
      if violation <> 'waitlist_members_referral_code_key' then raise; end if;
    end;
  end loop;
  raise exception 'code_generation_failed';
end;
$$;

create function public.waitlist_me(p_user_id uuid, p_offset integer default 0, p_limit integer default 5)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'member', (select jsonb_build_object('username', username, 'code', referral_code,
      'joinedAt', joined_at, 'count', referral_count, 'rank', rank)
      from public.waitlist_ranking where user_id = p_user_id),
    'activity', jsonb_build_object(
      'items', coalesce((select jsonb_agg(jsonb_build_object('at', joined_at) order by joined_at desc, user_id)
        from (select joined_at, user_id from public.waitlist_members where referred_by = p_user_id
          order by joined_at desc, user_id limit least(greatest(p_limit, 1), 25) offset greatest(p_offset, 0)) a), '[]'::jsonb),
      'nextOffset', case when (select count(*) from public.waitlist_members where referred_by = p_user_id) > greatest(p_offset, 0) + least(greatest(p_limit, 1), 25)
        then greatest(p_offset, 0) + least(greatest(p_limit, 1), 25) else null end));
$$;

create function public.waitlist_leaderboard(p_user_id uuid, p_offset integer default 0, p_limit integer default 25)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(jsonb_build_object('username', username, 'count', referral_count,
      'rank', rank, 'isYou', user_id = p_user_id) order by rank)
      from (select * from public.waitlist_ranking order by rank
        limit least(greatest(p_limit, 1), 25) offset greatest(p_offset, 0)) b), '[]'::jsonb),
    'nextOffset', case when (select count(*) from public.waitlist_members) > greatest(p_offset, 0) + least(greatest(p_limit, 1), 25)
      then greatest(p_offset, 0) + least(greatest(p_limit, 1), 25) else null end);
$$;

-- Only server functions may invoke these operations. No browser role can choose a user ID.
revoke all on function public.create_waitlist_membership(uuid, text, text) from public, anon, authenticated;
revoke all on function public.waitlist_me(uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.waitlist_leaderboard(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.create_waitlist_membership(uuid, text, text) to service_role;
grant execute on function public.waitlist_me(uuid, integer, integer) to service_role;
grant execute on function public.waitlist_leaderboard(uuid, integer, integer) to service_role;
commit;
