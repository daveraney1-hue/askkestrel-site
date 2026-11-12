-- =====================================================================
-- Kestrel portal — migration 011: extra questions ($10 a month each)
-- Run once in the Supabase SQL editor (after migration_010).
--
-- * clients.extra_questions / signups.extra_questions: paid extra
--   questions on top of the plan's included ones (Track and Fix & Track
--   include 3, Grow 10). Track tops out at 6 questions (3 extras).
-- * question_requests.kind: 'change' (as before) or 'add'. A client can
--   ask to add a question: it fills an included or already-paid slot,
--   or, with adds_extra = true, buys one more extra ($10 a month).
--   Dave approves on Telegram, as with changes.
-- * Dave can set the paid extras, add questions directly and remove
--   questions on the client's admin page.
-- * Positions now go up to 40, since Grow can have more than 10.
-- Extra areas keep using the first three questions (the n8n workflow
-- only takes those), so extra questions apply to the home area only.
-- =====================================================================

alter table public.clients
  add column if not exists extra_questions smallint not null default 0;
alter table public.signups
  add column if not exists extra_questions smallint not null default 0;

alter table public.clients drop constraint if exists clients_extra_questions_check;
alter table public.clients add constraint clients_extra_questions_check check (extra_questions between 0 and 30);
alter table public.signups drop constraint if exists signups_extra_questions_check;
alter table public.signups add constraint signups_extra_questions_check check (extra_questions between 0 and 30);

alter table public.client_questions drop constraint if exists client_questions_position_check;
alter table public.client_questions add constraint client_questions_position_check check (position between 1 and 40);
alter table public.question_requests drop constraint if exists question_requests_position_check;
alter table public.question_requests add constraint question_requests_position_check check (position between 1 and 40);

alter table public.question_requests
  add column if not exists kind text not null default 'change',
  add column if not exists adds_extra boolean not null default false;
alter table public.question_requests drop constraint if exists question_requests_kind_check;
alter table public.question_requests add constraint question_requests_kind_check check (kind in ('change', 'add'));
-- An 'add' has no current question.
alter table public.question_requests alter column current_question drop not null;

-- ---------------------------------------------------------------------
-- How many questions a client gets
-- ---------------------------------------------------------------------
create or replace function public.included_questions(p_package public.package_tier)
returns int language sql immutable as $$
  select case when p_package = 'grow' then 10 else 3 end;
$$;

-- Most extras a plan can have. Track: 3 (6 questions in all).
create or replace function public.max_extra_questions(p_package public.package_tier)
returns int language sql immutable as $$
  select case when p_package = 'track' then 3 else 30 end;
$$;

create or replace function public.client_question_limit(p_client uuid)
returns int language sql stable security definer set search_path = public as $$
  select public.included_questions(package) + extra_questions from public.clients where id = p_client;
$$;

create or replace function public.clients_check_extra_questions()
returns trigger language plpgsql as $$
begin
  if new.extra_questions > public.max_extra_questions(new.package) then
    raise exception 'Track includes up to 6 questions (3 extra). To track more, the client needs Fix & Track or Grow.';
  end if;
  return new;
end;
$$;

drop trigger if exists clients_check_extra_questions on public.clients;
create trigger clients_check_extra_questions
  before insert or update of extra_questions, package on public.clients
  for each row execute function public.clients_check_extra_questions();

-- ---------------------------------------------------------------------
-- Sign-ups carry their extra questions to the new client
-- ---------------------------------------------------------------------
create or replace function public.create_client_from_signup(p_signup uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  s public.signups;
  v_client uuid;
begin
  if not public.is_admin_or_service() then raise exception 'Not allowed'; end if;

  select * into s from public.signups where id = p_signup for update;
  if not found then raise exception 'Sign-up not found'; end if;
  if s.client_id is not null then return s.client_id; end if;

  insert into public.clients (business_name, package, town, subscription_status,
                              contact_name, contact_email, contact_phone, website, business_type, extra_questions)
  values (s.business, s.plan, s.town, 'pending_payment',
          s.name, s.email, s.phone, nullif(s.website, ''), s.business_type,
          least(greatest(coalesce(s.extra_questions, 0), 0), public.max_extra_questions(s.plan)))
  returning id into v_client;

  update public.signups
     set client_id = v_client, status = 'client created', updated_at = now()
   where id = p_signup;

  return v_client;
end;
$$;

-- ---------------------------------------------------------------------
-- Dave (admin page)
-- ---------------------------------------------------------------------

-- Set how many paid extra questions a client has.
create or replace function public.set_extra_questions(p_client uuid, p_count int)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_pkg public.package_tier;
  v_active int;
begin
  if not public.is_admin_or_service() then raise exception 'Not allowed'; end if;
  select package into v_pkg from public.clients where id = p_client;
  if not found then raise exception 'Client not found'; end if;
  if p_count < 0 then raise exception 'Extra questions can''t be negative'; end if;
  select count(*) into v_active from public.client_questions where client_id = p_client and active;
  if v_active > public.included_questions(v_pkg) + p_count then
    raise exception 'They are tracking % questions. Remove questions first, then lower the extras.', v_active;
  end if;
  update public.clients set extra_questions = p_count where id = p_client;
end;
$$;

-- Change a question, or add one at the next position (within their limit).
create or replace function public.replace_client_question(p_client uuid, p_position int, p_question text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_max int;
  v_active int;
begin
  if not public.is_admin_or_service() then raise exception 'Not allowed'; end if;
  select coalesce(max(position), 0), count(*) into v_max, v_active
    from public.client_questions where client_id = p_client and active;
  if not exists (select 1 from public.client_questions where client_id = p_client and position = p_position and active) then
    if p_position <> v_max + 1 then raise exception 'No question at that position'; end if;
    if v_active >= public.client_question_limit(p_client) then
      raise exception 'Their plan covers % questions. Add a paid extra question first.', public.client_question_limit(p_client);
    end if;
  end if;
  perform public.swap_client_question(p_client, p_position, p_question, 'admin');
  update public.question_requests
     set status = 'replaced', decided_at = now(), decision_note = 'Kestrel changed this question directly'
   where client_id = p_client and position = p_position and status = 'pending';
  update public.clients set questions_status = 'awaiting_client'
   where id = p_client and questions_status = 'none';
end;
$$;

-- Stop asking a question. Keeps at least three.
create or replace function public.remove_client_question(p_client uuid, p_position int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin_or_service() then raise exception 'Not allowed'; end if;
  if (select count(*) from public.client_questions where client_id = p_client and active) <= 3 then
    raise exception 'Every client keeps at least three questions. Change this one instead.';
  end if;
  update public.client_questions
     set active = false, ended_on = current_date
   where client_id = p_client and position = p_position and active;
  if not found then raise exception 'No question at that position'; end if;
  update public.question_requests
     set status = 'replaced', decided_at = now(), decision_note = 'Kestrel removed this question'
   where client_id = p_client and position = p_position and status = 'pending';
end;
$$;

-- First set of suggested questions (now limited by the plan, not 10).
create or replace function public.set_initial_client_questions(p_client uuid, p_questions text[], p_source text default 'admin')
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_list text[];
  i int;
begin
  if not public.is_admin_or_service() then raise exception 'Not allowed'; end if;
  if not exists (select 1 from public.clients where id = p_client) then raise exception 'Client not found'; end if;
  if exists (select 1 from public.client_questions where client_id = p_client and active) then return false; end if;

  select array_agg(q order by n) into v_list
    from (select public.clean_question(x) as q, n from unnest(p_questions) with ordinality as t(x, n)) s
   where q is not null and char_length(q) >= 5;
  if coalesce(array_length(v_list, 1), 0) = 0 then raise exception 'No questions given'; end if;
  if array_length(v_list, 1) > public.client_question_limit(p_client) then
    raise exception 'At most % questions on their plan', public.client_question_limit(p_client);
  end if;

  for i in 1 .. array_length(v_list, 1) loop
    insert into public.client_questions (client_id, position, question, source)
    values (p_client, i, v_list[i], coalesce(nullif(p_source, ''), 'admin'));
  end loop;

  update public.clients
     set questions_status = 'awaiting_client', questions_confirmed_at = null
   where id = p_client and questions_status = 'none';
  return true;
end;
$$;

-- ---------------------------------------------------------------------
-- The client: ask to add a question
-- ---------------------------------------------------------------------
-- Fills a free slot if they have one (included or already paid for).
-- Otherwise p_paid must be true (they agreed to $10 a month more), and
-- Track can't go past 6. Dave approves on Telegram.
create or replace function public.request_question_add(p_question text, p_reason text default null,
                                                       p_paid boolean default false, p_client uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_client   uuid := coalesce(p_client, public.my_client_id());
  v_pkg      public.package_tier;
  v_extra    int;
  v_q        text := public.clean_question(p_question);
  v_active   int;
  v_max      int;
  v_pending  int;
  v_paid     int;
  v_pmax     int;
  v_extra_needed boolean;
  v_name     text;
  v_email    text;
  v_id       uuid;
begin
  if v_client is null then raise exception 'Not allowed'; end if;
  if not public.is_admin() and v_client is distinct from public.my_client_id() then raise exception 'Not allowed'; end if;
  if v_q is null or char_length(v_q) < 10 then raise exception 'Please write the full question you would like us to ask'; end if;

  select package, extra_questions into v_pkg, v_extra from public.clients where id = v_client;
  if not found then raise exception 'Client not found'; end if;
  select count(*), coalesce(max(position), 0) into v_active, v_max
    from public.client_questions where client_id = v_client and active;
  if v_active = 0 then raise exception 'Your first questions are still being prepared. You can add more once they appear.'; end if;
  if exists (select 1 from public.client_questions where client_id = v_client and active and lower(question) = lower(v_q))
     or exists (select 1 from public.question_requests where client_id = v_client and status = 'pending'
                   and lower(proposed_question) = lower(v_q)) then
    raise exception 'That question is already on your list';
  end if;

  select count(*), count(*) filter (where adds_extra), coalesce(max(position), 0)
    into v_pending, v_paid, v_pmax
    from public.question_requests where client_id = v_client and kind = 'add' and status = 'pending';

  -- A free slot (included in the plan or already paid for)?
  v_extra_needed := v_active + v_pending >= public.included_questions(v_pkg) + v_extra;
  if v_extra_needed then
    if v_extra + v_paid + 1 > public.max_extra_questions(v_pkg) then
      raise exception 'Track includes up to 6 questions. To track more, move to Fix & Track or Grow.';
    end if;
    if not coalesce(p_paid, false) then
      raise exception 'Adding this question adds $10 a month to your plan. Please tick the box to agree.';
    end if;
  end if;

  select coalesce(full_name, email), email into v_name, v_email from public.profiles where id = auth.uid();

  insert into public.question_requests (client_id, position, current_question, proposed_question, reason,
                                        requested_by, requested_by_name, requested_by_email, kind, adds_extra)
  values (v_client, greatest(v_max, v_pmax) + 1, null, v_q, nullif(left(trim(coalesce(p_reason, '')), 500), ''),
          auth.uid(), v_name, v_email, 'add', v_extra_needed)
  returning id into v_id;
  return v_id;
end;
$$;

-- Approve or decline a change or an addition. Returns what n8n needs to
-- email the client. An approved paid addition adds 1 to extra_questions.
create or replace function public.decide_question_request(p_request uuid, p_approve boolean,
                                                          p_note text default null, p_question text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r public.question_requests;
  v_final text;
  v_pos int;
  v_pkg public.package_tier;
  v_extra int;
begin
  if not public.is_admin_or_service() then raise exception 'Not allowed'; end if;
  select * into r from public.question_requests where id = p_request for update;
  if not found then raise exception 'Request not found'; end if;
  if r.status <> 'pending' then
    return jsonb_build_object('already_decided', true, 'status', r.status, 'kind', r.kind);
  end if;

  v_pos := r.position;
  if p_approve then
    v_final := coalesce(public.clean_question(p_question), r.proposed_question);
    if r.kind = 'add' then
      if r.adds_extra then
        update public.clients set extra_questions = extra_questions + 1 where id = r.client_id;
      elsif (select count(*) from public.client_questions where client_id = r.client_id and active)
            >= public.client_question_limit(r.client_id) then
        -- The free slot was used up in the meantime: this one becomes a paid extra.
        update public.clients set extra_questions = extra_questions + 1 where id = r.client_id;
        update public.question_requests set adds_extra = true where id = r.id;
        r.adds_extra := true;
      end if;
      select coalesce(max(position), 0) + 1 into v_pos from public.client_questions where client_id = r.client_id and active;
      perform public.swap_client_question(r.client_id, v_pos, v_final, 'client_request');
    else
      perform public.swap_client_question(r.client_id, r.position, v_final, 'client_request');
    end if;
  end if;

  update public.question_requests
     set status = case when p_approve then 'approved' else 'declined' end,
         position = v_pos,
         final_question = v_final,
         decided_at = now(),
         decision_note = nullif(trim(coalesce(p_note, '')), '')
   where id = p_request;

  select package, extra_questions into v_pkg, v_extra from public.clients where id = r.client_id;

  return jsonb_build_object(
    'already_decided', false,
    'status', case when p_approve then 'approved' else 'declined' end,
    'kind', r.kind,
    'adds_extra', r.adds_extra,
    'extra_questions', v_extra,
    'plan', v_pkg,
    'client_id', r.client_id,
    'business_name', (select business_name from public.clients where id = r.client_id),
    'position', v_pos,
    'old_question', r.current_question,
    'proposed_question', r.proposed_question,
    'final_question', v_final,
    'note', nullif(trim(coalesce(p_note, '')), ''),
    'email', r.requested_by_email,
    'name', r.requested_by_name);
end;
$$;

-- New requests for n8n to send to Dave. Each is handed out once.
drop function if exists public.claim_question_requests();
create function public.claim_question_requests()
returns table (id uuid, client_id uuid, business_name text, plan public.package_tier, question_position smallint,
               current_question text, proposed_question text, reason text,
               requested_by_name text, requested_by_email text, created_at timestamptz,
               kind text, adds_extra boolean, extra_questions smallint, questions_now bigint, question_limit int)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin_or_service() then raise exception 'Not allowed'; end if;
  return query
    with claimed as (
      update public.question_requests q
         set notified_at = now()
       where q.status = 'pending' and q.notified_at is null
      returning q.*
    )
    select c.id, c.client_id, cl.business_name, cl.package, c.position, c.current_question,
           c.proposed_question, c.reason, c.requested_by_name, c.requested_by_email, c.created_at,
           c.kind, c.adds_extra, cl.extra_questions,
           (select count(*) from public.client_questions x where x.client_id = c.client_id and x.active),
           public.included_questions(cl.package) + cl.extra_questions
      from claimed c join public.clients cl on cl.id = c.client_id
     order by c.created_at;
end;
$$;

-- ---------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------
revoke all on function public.client_question_limit(uuid), public.set_extra_questions(uuid, int),
  public.remove_client_question(uuid, int), public.request_question_add(text, text, boolean, uuid),
  public.claim_question_requests()
  from public, anon;
grant execute on function public.included_questions(public.package_tier), public.max_extra_questions(public.package_tier),
  public.client_question_limit(uuid), public.set_extra_questions(uuid, int), public.remove_client_question(uuid, int),
  public.request_question_add(text, text, boolean, uuid), public.claim_question_requests(),
  public.replace_client_question(uuid, int, text), public.decide_question_request(uuid, boolean, text, text),
  public.set_initial_client_questions(uuid, text[], text), public.create_client_from_signup(uuid)
  to authenticated, service_role;
