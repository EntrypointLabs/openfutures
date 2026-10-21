begin;

-- service_role holds usage on auth but no read grant on auth.users, so the
-- verification check runs through this narrowly scoped privileged helper.
create or replace function public.waitlist_user_is_verified(p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.users where id = p_user_id and email_confirmed_at is not null);
$$;

create or replace function public.create_waitlist_membership(p_user_id uuid, p_username text, p_referral_code text default null)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  inviter uuid;
  candidate text;
  violation text;
begin
  -- Serialize retries for this identity, including requests from different devices/functions.
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  if exists (select 1 from public.waitlist_members where user_id = p_user_id) then return; end if;
  if not public.waitlist_user_is_verified(p_user_id) then
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


revoke all on function public.waitlist_user_is_verified(uuid) from public, anon, authenticated;
grant execute on function public.waitlist_user_is_verified(uuid) to service_role;

commit;
