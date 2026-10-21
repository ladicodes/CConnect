-- Connect-Ask database schema.
--
-- Run as the database owner (on Supabase: the `postgres` role, via the SQL
-- editor, `supabase db push`, or `npm run db:migrate`).
--
-- Security model
-- ==============
-- * Every table lives in the `app` schema, which is NOT exposed through the
--   Supabase Data API. The browser never talks to the database.
-- * The Next.js server connects as `connect_ask_app`, a login role with no
--   privileges of its own. Each transaction switches to exactly one of:
--     - connect_ask_public: anonymous members. May only read the public_*
--       views and call narrow submission/support functions. Moderation fields
--       are always set by the database, never by the caller.
--     - connect_ask_staff: signed-in church staff. Table access is filtered by
--       row level security using the verified Supabase user id that the server
--       sets with set_config('app.user_id', ..., true).
-- * Staff roles: `moderator` (questions, context, sessions, presentation) and
--   `admin` (everything, including private prayer requests and testimonies).

begin;

create schema if not exists app;
revoke all on schema app from public;
alter default privileges in schema app revoke execute on functions from public;

-- ---------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'connect_ask_public') then
    create role connect_ask_public nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'connect_ask_staff') then
    create role connect_ask_staff nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'connect_ask_app') then
    -- Given a password (and LOGIN) during setup; see docs/SETUP.md.
    create role connect_ask_app nologin noinherit;
  end if;
end
$$;

grant connect_ask_public to connect_ask_app;
grant connect_ask_staff to connect_ask_app;
grant usage on schema app to connect_ask_public, connect_ask_staff;

-- ---------------------------------------------------------------------------
-- Staff
-- ---------------------------------------------------------------------------
create table app.staff_members (
  user_id uuid primary key,
  email text not null,
  display_name text check (display_name is null or char_length(display_name) between 1 and 80),
  role text not null check (role in ('admin', 'moderator')),
  created_at timestamptz not null default now()
);

-- On Supabase, tie staff rows to real auth users. Local development and tests
-- run without the auth schema, so the constraint is added only when available.
do $$
begin
  if to_regclass('auth.users') is not null then
    alter table app.staff_members
      add constraint staff_members_user_fk foreign key (user_id) references auth.users (id) on delete cascade;
  end if;
end
$$;

-- The verified user id for this transaction, set by the server after it has
-- validated the Supabase session. Empty for public transactions.
create function app.current_user_id() returns uuid
language sql stable
set search_path = ''
as $$
  select nullif(current_setting('app.user_id', true), '')::uuid
$$;

create function app.staff_role() returns text
language sql stable security definer
set search_path = ''
as $$
  select s.role from app.staff_members s where s.user_id = app.current_user_id()
$$;

create function app.require_staff() returns text
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_role text := app.staff_role();
begin
  if v_role is null then
    raise exception 'staff access required' using errcode = '42501';
  end if;
  return v_role;
end
$$;

-- ---------------------------------------------------------------------------
-- Service sessions
-- ---------------------------------------------------------------------------
create table app.service_sessions (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 2 and 80 and title = btrim(title)),
  kind text not null default 'sunday' check (kind in ('sunday', 'midweek', 'youth', 'special', 'other')),
  service_date date not null,
  status text not null default 'draft' check (status in ('draft', 'active', 'closed', 'archived')),
  activated_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint active_has_timestamp check (status <> 'active' or activated_at is not null)
);

-- At most one active session, enforced by the database itself.
create unique index service_sessions_one_active on app.service_sessions (status) where status = 'active';
create index service_sessions_date_idx on app.service_sessions (service_date desc, created_at desc);

-- ---------------------------------------------------------------------------
-- Questions
-- ---------------------------------------------------------------------------
-- Moderation (`visibility`) and answering (`answer_status`) are independent.
create table app.questions (
  id uuid primary key default gen_random_uuid(),
  client_submission_id uuid not null unique,
  session_id uuid references app.service_sessions (id) on delete set null,
  body text not null check (char_length(body) between 3 and 1000 and body = btrim(body)),
  visibility text not null default 'pending' check (visibility in ('pending', 'public', 'private', 'hidden')),
  answer_status text not null default 'open' check (answer_status in ('open', 'addressing', 'answered')),
  support_count integer not null default 0 check (support_count >= 0),
  published_at timestamptz,
  answered_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint answered_at_matches_status check ((answer_status = 'answered') = (answered_at is not null)),
  constraint public_has_published_at check (visibility <> 'public' or published_at is not null)
);

create index questions_public_idx on app.questions (published_at desc) where visibility = 'public' and archived_at is null;
create index questions_public_support_idx on app.questions (support_count desc, published_at desc) where visibility = 'public' and archived_at is null;
create index questions_session_idx on app.questions (session_id);
create index questions_admin_idx on app.questions (visibility, created_at desc);

create table app.question_supports (
  question_id uuid not null references app.questions (id) on delete cascade,
  -- HMAC of the browser's anonymous id; the raw id never reaches the database.
  supporter_hash text not null check (supporter_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  primary key (question_id, supporter_hash)
);
create index question_supports_supporter_idx on app.question_supports (supporter_hash);

-- ---------------------------------------------------------------------------
-- Context contributions
-- ---------------------------------------------------------------------------
-- question_id null = independent context. Linking is a real foreign key.
create table app.context_notes (
  id uuid primary key default gen_random_uuid(),
  client_submission_id uuid not null unique,
  question_id uuid references app.questions (id) on delete set null,
  session_id uuid references app.service_sessions (id) on delete set null,
  body text not null check (char_length(body) between 3 and 1000 and body = btrim(body)),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'hidden')),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index context_notes_question_idx on app.context_notes (question_id, status);
create index context_notes_status_idx on app.context_notes (status, created_at desc);

-- ---------------------------------------------------------------------------
-- Prayer requests (always private; there is deliberately no public path)
-- ---------------------------------------------------------------------------
create table app.prayer_requests (
  id uuid primary key default gen_random_uuid(),
  client_submission_id uuid not null unique,
  body text not null check (char_length(body) between 3 and 2000 and body = btrim(body)),
  status text not null default 'new' check (status in ('new', 'prayed', 'addressed')),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index prayer_requests_status_idx on app.prayer_requests (status, created_at desc);

-- ---------------------------------------------------------------------------
-- Thanksgiving and testimonies
-- ---------------------------------------------------------------------------
create table app.testimonies (
  id uuid primary key default gen_random_uuid(),
  client_submission_id uuid not null unique,
  kind text not null check (kind in ('thanksgiving', 'testimony')),
  body text not null check (char_length(body) between 3 and 2000 and body = btrim(body)),
  display_name text check (display_name is null or (char_length(display_name) between 1 and 60 and display_name = btrim(display_name))),
  share_consent boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'published', 'private', 'rejected')),
  published_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Admin approval can never override a missing consent.
  constraint publish_requires_consent check (status <> 'published' or share_consent),
  constraint published_has_timestamp check (status <> 'published' or published_at is not null)
);
create index testimonies_status_idx on app.testimonies (status, created_at desc);
create index testimonies_public_idx on app.testimonies (published_at desc) where status = 'published' and archived_at is null;

-- ---------------------------------------------------------------------------
-- Presentation (what the projector shows)
-- ---------------------------------------------------------------------------
create table app.presentation_state (
  id smallint primary key default 1 check (id = 1),
  mode text not null default 'qr' check (mode in ('qr', 'question', 'blank')),
  question_id uuid references app.questions (id) on delete set null,
  show_context boolean not null default false,
  updated_by uuid,
  updated_at timestamptz not null default now()
);
insert into app.presentation_state (id) values (1);

-- ---------------------------------------------------------------------------
-- Activity log (no submission content is ever copied here)
-- ---------------------------------------------------------------------------
create table app.activity_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  entity text not null check (entity in ('question', 'context', 'prayer', 'testimony', 'session', 'presentation')),
  entity_id uuid,
  action text not null check (char_length(action) <= 80),
  created_at timestamptz not null default now()
);
create index activity_log_created_idx on app.activity_log (created_at desc);

-- ---------------------------------------------------------------------------
-- Rate limiting (keys are HMACs; windows are discarded after a day)
-- ---------------------------------------------------------------------------
create table app.rate_limits (
  bucket text not null check (char_length(bucket) <= 120),
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (bucket, window_start)
);

-- ===========================================================================
-- Triggers
-- ===========================================================================
create function app.log_activity(p_entity text, p_entity_id uuid, p_action text) returns void
language sql security definer
set search_path = ''
as $$
  insert into app.activity_log (actor_id, entity, entity_id, action)
  values (app.current_user_id(), p_entity, p_entity_id, p_action)
$$;

create function app.questions_before_update() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.visibility = 'public' and new.published_at is null then
    new.published_at := now();
  end if;
  if new.answer_status = 'answered' and old.answer_status <> 'answered' then
    new.answered_at := now();
  elsif new.answer_status <> 'answered' then
    new.answered_at := null;
  end if;
  if (new.visibility, new.answer_status, new.archived_at, new.session_id)
     is distinct from (old.visibility, old.answer_status, old.archived_at, old.session_id) then
    new.updated_at := now();
  end if;
  return new;
end
$$;
create trigger questions_before_update before update on app.questions
for each row execute function app.questions_before_update();

create function app.questions_after_change() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform app.log_activity('question', old.id, 'deleted');
    return old;
  end if;
  if new.visibility is distinct from old.visibility then
    perform app.log_activity('question', new.id, 'visibility:' || new.visibility);
  end if;
  if new.answer_status is distinct from old.answer_status then
    perform app.log_activity('question', new.id, 'answer:' || new.answer_status);
  end if;
  if new.archived_at is distinct from old.archived_at then
    perform app.log_activity('question', new.id, case when new.archived_at is null then 'restored' else 'archived' end);
  end if;
  return new;
end
$$;
create trigger questions_after_change after update or delete on app.questions
for each row execute function app.questions_after_change();

-- Support counts are maintained atomically by the database.
create function app.question_supports_count() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update app.questions set support_count = support_count + 1 where id = new.question_id;
    return new;
  end if;
  update app.questions set support_count = greatest(support_count - 1, 0) where id = old.question_id;
  return old;
end
$$;
create trigger question_supports_count after insert or delete on app.question_supports
for each row execute function app.question_supports_count();

create function app.context_before_update() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status and new.status <> 'pending' then
    new.reviewed_at := now();
  end if;
  new.updated_at := now();
  return new;
end
$$;
create trigger context_before_update before update on app.context_notes
for each row execute function app.context_before_update();

create function app.context_after_change() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform app.log_activity('context', old.id, 'deleted');
    return old;
  end if;
  if new.status is distinct from old.status then
    perform app.log_activity('context', new.id, 'status:' || new.status);
  end if;
  if new.question_id is distinct from old.question_id then
    perform app.log_activity('context', new.id, case when new.question_id is null then 'unlinked' else 'linked' end);
  end if;
  return new;
end
$$;
create trigger context_after_change after update or delete on app.context_notes
for each row execute function app.context_after_change();

create function app.prayer_before_update() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end
$$;
create trigger prayer_before_update before update on app.prayer_requests
for each row execute function app.prayer_before_update();

create function app.prayer_after_change() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform app.log_activity('prayer', old.id, 'deleted');
    return old;
  end if;
  if new.status is distinct from old.status then
    perform app.log_activity('prayer', new.id, 'status:' || new.status);
  end if;
  if new.archived_at is distinct from old.archived_at then
    perform app.log_activity('prayer', new.id, case when new.archived_at is null then 'restored' else 'archived' end);
  end if;
  return new;
end
$$;
create trigger prayer_after_change after update or delete on app.prayer_requests
for each row execute function app.prayer_after_change();

create function app.testimonies_before_update() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'published' and new.published_at is null then
    new.published_at := now();
  end if;
  new.updated_at := now();
  return new;
end
$$;
create trigger testimonies_before_update before update on app.testimonies
for each row execute function app.testimonies_before_update();

create function app.testimonies_after_change() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform app.log_activity('testimony', old.id, 'deleted');
    return old;
  end if;
  if new.status is distinct from old.status then
    perform app.log_activity('testimony', new.id, 'status:' || new.status);
  end if;
  if new.archived_at is distinct from old.archived_at then
    perform app.log_activity('testimony', new.id, case when new.archived_at is null then 'restored' else 'archived' end);
  end if;
  return new;
end
$$;
create trigger testimonies_after_change after update or delete on app.testimonies
for each row execute function app.testimonies_after_change();

create function app.sessions_before_update() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end
$$;
create trigger sessions_before_update before update on app.service_sessions
for each row execute function app.sessions_before_update();

-- ===========================================================================
-- Public read model
-- ===========================================================================
-- Views run with their owner's rights and expose only approved content and
-- safe columns. Privacy is re-checked on every read: hiding a question removes
-- it, its context and its presentation everywhere at once.
create view app.public_questions with (security_barrier = true) as
select
  q.id,
  q.body,
  q.answer_status,
  q.support_count,
  q.published_at,
  q.answered_at,
  q.session_id,
  s.title as session_title,
  s.service_date as session_date,
  (s.status = 'active') as session_is_active,
  (
    select count(*)::integer
    from app.context_notes c
    where c.question_id = q.id and c.status = 'approved'
  ) as context_count
from app.questions q
left join app.service_sessions s on s.id = q.session_id
where q.visibility = 'public' and q.archived_at is null;

create view app.public_context with (security_barrier = true) as
select c.id, c.question_id, c.body, c.reviewed_at as approved_at
from app.context_notes c
join app.questions q on q.id = c.question_id
where c.status = 'approved' and q.visibility = 'public' and q.archived_at is null;

create view app.public_testimonies with (security_barrier = true) as
select t.id, t.kind, t.body, t.display_name, t.published_at
from app.testimonies t
where t.status = 'published' and t.share_consent and t.archived_at is null;

create view app.public_active_session with (security_barrier = true) as
select s.id, s.title, s.kind, s.service_date
from app.service_sessions s
where s.status = 'active';

grant select on app.public_questions, app.public_context, app.public_testimonies, app.public_active_session
  to connect_ask_public, connect_ask_staff;

-- ===========================================================================
-- Public write functions (the only way anonymous members can write)
-- ===========================================================================
create function app.active_session_id() returns uuid
language sql stable security definer
set search_path = ''
as $$
  select id from app.service_sessions where status = 'active' limit 1
$$;

-- Each submission carries a client-generated id. Retrying the same submission
-- returns the original row instead of creating a duplicate.
create function app.submit_question(p_client_id uuid, p_body text) returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into app.questions (client_submission_id, body, session_id)
  values (p_client_id, p_body, app.active_session_id())
  on conflict (client_submission_id) do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from app.questions where client_submission_id = p_client_id;
  end if;
  return v_id;
end
$$;

create function app.submit_context(p_client_id uuid, p_question_id uuid, p_body text) returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_session uuid;
begin
  if p_question_id is not null then
    select q.session_id into v_session
    from app.questions q
    where q.id = p_question_id and q.visibility = 'public' and q.archived_at is null;
    if not found then
      raise exception 'question unavailable' using errcode = 'CA404';
    end if;
  else
    v_session := app.active_session_id();
  end if;

  insert into app.context_notes (client_submission_id, question_id, session_id, body)
  values (p_client_id, p_question_id, v_session, p_body)
  on conflict (client_submission_id) do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from app.context_notes where client_submission_id = p_client_id;
  end if;
  return v_id;
end
$$;

create function app.submit_prayer(p_client_id uuid, p_body text) returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into app.prayer_requests (client_submission_id, body)
  values (p_client_id, p_body)
  on conflict (client_submission_id) do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from app.prayer_requests where client_submission_id = p_client_id;
  end if;
  return v_id;
end
$$;

create function app.submit_testimony(
  p_client_id uuid,
  p_kind text,
  p_body text,
  p_display_name text,
  p_share_consent boolean
) returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into app.testimonies (client_submission_id, kind, body, display_name, share_consent)
  values (p_client_id, p_kind, p_body, nullif(btrim(p_display_name), ''), coalesce(p_share_consent, false))
  on conflict (client_submission_id) do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from app.testimonies where client_submission_id = p_client_id;
  end if;
  return v_id;
end
$$;

-- "I have this question too". Idempotent in both directions; only public
-- questions can be supported.
create function app.set_support(p_question_id uuid, p_supporter text, p_supported boolean)
returns table (supported boolean, support_count integer)
language plpgsql security definer
set search_path = ''
as $$
begin
  perform 1 from app.questions q
  where q.id = p_question_id and q.visibility = 'public' and q.archived_at is null;
  if not found then
    raise exception 'question unavailable' using errcode = 'CA404';
  end if;

  if p_supported then
    insert into app.question_supports (question_id, supporter_hash)
    values (p_question_id, p_supporter)
    on conflict do nothing;
  else
    delete from app.question_supports
    where question_id = p_question_id and supporter_hash = p_supporter;
  end if;

  return query
  select exists (
    select 1 from app.question_supports s
    where s.question_id = p_question_id and s.supporter_hash = p_supporter
  ), q.support_count
  from app.questions q where q.id = p_question_id;
end
$$;

create function app.supported_question_ids(p_supporter text, p_ids uuid[]) returns setof uuid
language sql stable security definer
set search_path = ''
as $$
  select s.question_id from app.question_supports s
  where s.supporter_hash = p_supporter and s.question_id = any (p_ids)
$$;

-- Fixed-window counter. Returns true while the bucket is within its limit.
create function app.rate_limit_hit(p_bucket text, p_limit integer, p_window_seconds integer) returns boolean
language plpgsql security definer
set search_path = ''
as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_hits integer;
begin
  insert into app.rate_limits (bucket, window_start, hits)
  values (p_bucket, v_window, 1)
  on conflict (bucket, window_start) do update set hits = app.rate_limits.hits + 1
  returning hits into v_hits;

  -- Opportunistic cleanup keeps the table small without a scheduler.
  if random() < 0.01 then
    delete from app.rate_limits where window_start < now() - interval '1 day';
  end if;

  return v_hits <= p_limit;
end
$$;

-- Postgres lets everyone execute new functions by default, and a per-schema
-- default cannot remove that. Revoke explicitly, then grant precisely.
revoke execute on all functions in schema app from public;

grant execute on function
  app.submit_question(uuid, text),
  app.submit_context(uuid, uuid, text),
  app.submit_prayer(uuid, text),
  app.submit_testimony(uuid, text, text, text, boolean),
  app.set_support(uuid, text, boolean),
  app.supported_question_ids(text, uuid[]),
  app.rate_limit_hit(text, integer, integer)
to connect_ask_public;

-- ===========================================================================
-- Staff access
-- ===========================================================================
create function app.whoami()
returns table (user_id uuid, email text, display_name text, role text)
language sql stable security definer
set search_path = ''
as $$
  select s.user_id, s.email, s.display_name, s.role
  from app.staff_members s where s.user_id = app.current_user_id()
$$;

alter table app.staff_members enable row level security;
alter table app.service_sessions enable row level security;
alter table app.questions enable row level security;
alter table app.question_supports enable row level security;
alter table app.context_notes enable row level security;
alter table app.prayer_requests enable row level security;
alter table app.testimonies enable row level security;
alter table app.presentation_state enable row level security;
alter table app.activity_log enable row level security;
alter table app.rate_limits enable row level security;

-- Moderators and admins: questions, context, sessions, presentation.
create policy staff_questions on app.questions to connect_ask_staff
  using ((select app.staff_role()) is not null) with check ((select app.staff_role()) is not null);
create policy staff_context on app.context_notes to connect_ask_staff
  using ((select app.staff_role()) is not null) with check ((select app.staff_role()) is not null);
create policy staff_sessions on app.service_sessions to connect_ask_staff
  using ((select app.staff_role()) is not null) with check ((select app.staff_role()) is not null);
create policy staff_presentation on app.presentation_state for select to connect_ask_staff
  using ((select app.staff_role()) is not null);

-- Admins only: private prayer requests and testimonies.
create policy admin_prayers on app.prayer_requests to connect_ask_staff
  using ((select app.staff_role()) = 'admin') with check ((select app.staff_role()) = 'admin');
create policy admin_testimonies on app.testimonies to connect_ask_staff
  using ((select app.staff_role()) = 'admin') with check ((select app.staff_role()) = 'admin');

-- Activity about prayers and testimonies is visible to admins only.
create policy staff_activity on app.activity_log for select to connect_ask_staff
  using (
    (select app.staff_role()) = 'admin'
    or ((select app.staff_role()) = 'moderator' and entity not in ('prayer', 'testimony'))
  );

-- Column-level grants: staff can moderate, never rewrite what members wrote.
grant select, delete on app.questions to connect_ask_staff;
grant update (visibility, answer_status, archived_at, session_id) on app.questions to connect_ask_staff;

grant select, delete on app.context_notes to connect_ask_staff;
grant update (status, question_id) on app.context_notes to connect_ask_staff;

grant select on app.service_sessions to connect_ask_staff;
grant insert (title, kind, service_date) on app.service_sessions to connect_ask_staff;
grant update (title, kind, service_date) on app.service_sessions to connect_ask_staff;

grant select, delete on app.prayer_requests to connect_ask_staff;
grant update (status, archived_at) on app.prayer_requests to connect_ask_staff;

grant select, delete on app.testimonies to connect_ask_staff;
grant update (status, archived_at) on app.testimonies to connect_ask_staff;

grant select on app.presentation_state to connect_ask_staff;
grant select on app.activity_log to connect_ask_staff;

-- Session lifecycle. Activation is serialised with an advisory lock so two
-- leaders pressing "Activate" at once still leave exactly one active session.
create function app.activate_session(p_session_id uuid) returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  perform app.require_staff();
  perform pg_advisory_xact_lock(hashtext('connect_ask.active_session'));

  perform 1 from app.service_sessions where id = p_session_id and status <> 'archived';
  if not found then
    raise exception 'session unavailable' using errcode = 'CA404';
  end if;

  update app.service_sessions
  set status = 'closed', closed_at = now()
  where status = 'active' and id <> p_session_id;

  update app.service_sessions
  set status = 'active', activated_at = now(), closed_at = null
  where id = p_session_id and status <> 'active';

  perform app.log_activity('session', p_session_id, 'activated');
end
$$;

create function app.close_session(p_session_id uuid) returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  perform app.require_staff();
  update app.service_sessions
  set status = 'closed', closed_at = now()
  where id = p_session_id and status in ('active', 'draft');
  if found then
    perform app.log_activity('session', p_session_id, 'closed');
  end if;
end
$$;

create function app.archive_session(p_session_id uuid, p_archived boolean) returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  perform app.require_staff();
  if p_archived then
    update app.service_sessions
    set status = 'archived', closed_at = coalesce(closed_at, now())
    where id = p_session_id and status <> 'archived';
  else
    update app.service_sessions set status = 'closed' where id = p_session_id and status = 'archived';
  end if;
  if found then
    perform app.log_activity('session', p_session_id, case when p_archived then 'archived' else 'restored' end);
  end if;
end
$$;

-- Presentation. Only a public question can be put on screen, and the
-- presentation view re-checks that on every read.
create function app.present_question(p_question_id uuid, p_show_context boolean) returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  perform app.require_staff();
  perform 1 from app.questions
  where id = p_question_id and visibility = 'public' and archived_at is null;
  if not found then
    raise exception 'only public questions can be presented' using errcode = 'CA409';
  end if;
  insert into app.presentation_state (id, mode, question_id, show_context, updated_by, updated_at)
  values (1, 'question', p_question_id, coalesce(p_show_context, false), app.current_user_id(), now())
  on conflict (id) do update
  set mode = excluded.mode, question_id = excluded.question_id, show_context = excluded.show_context,
      updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  perform app.log_activity('presentation', p_question_id, 'presented');
end
$$;

create function app.present_mode(p_mode text) returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  perform app.require_staff();
  if p_mode not in ('qr', 'blank') then
    raise exception 'invalid presentation mode' using errcode = '22023';
  end if;
  insert into app.presentation_state (id, mode, question_id, show_context, updated_by, updated_at)
  values (1, p_mode, null, false, app.current_user_id(), now())
  on conflict (id) do update
  set mode = excluded.mode, question_id = null, show_context = false,
      updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  perform app.log_activity('presentation', null, 'mode:' || p_mode);
end
$$;

create function app.presentation_current()
returns table (
  mode text,
  question_id uuid,
  body text,
  answer_status text,
  support_count integer,
  show_context boolean,
  updated_at timestamptz
)
language sql stable security definer
set search_path = ''
as $$
  select
    case when p.mode = 'question' and q.id is null then 'qr' else p.mode end,
    q.id, q.body, q.answer_status, q.support_count, p.show_context, p.updated_at
  from app.presentation_state p
  left join app.questions q
    on q.id = p.question_id and q.visibility = 'public' and q.archived_at is null
  where p.id = 1 and app.staff_role() is not null
$$;

create function app.presentation_context(p_question_id uuid)
returns table (id uuid, body text)
language sql stable security definer
set search_path = ''
as $$
  select c.id, c.body
  from app.public_context c
  join app.presentation_state p on p.question_id = c.question_id and p.show_context
  where c.question_id = p_question_id and app.staff_role() is not null
  order by c.approved_at
$$;

-- Dashboard feed: staff actions plus new submissions, filtered by role, with
-- no submission content.
create function app.recent_activity(p_limit integer)
returns table (entity text, entity_id uuid, action text, actor text, created_at timestamptz)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_role text := app.require_staff();
begin
  return query
  select feed.entity, feed.entity_id, feed.action, feed.actor, feed.created_at
  from (
    (select l.entity, l.entity_id, l.action, coalesce(s.display_name, s.email) as actor, l.created_at
     from app.activity_log l
     left join app.staff_members s on s.user_id = l.actor_id
     where v_role = 'admin' or l.entity not in ('prayer', 'testimony')
     order by l.created_at desc limit 50)
    union all
    (select 'question'::text, q.id, 'received'::text, null::text, q.created_at
     from app.questions q order by q.created_at desc limit 50)
    union all
    (select 'context'::text, c.id, 'received'::text, null::text, c.created_at
     from app.context_notes c order by c.created_at desc limit 50)
    union all
    (select 'prayer'::text, p.id, 'received'::text, null::text, p.created_at
     from app.prayer_requests p where v_role = 'admin' order by p.created_at desc limit 50)
    union all
    (select 'testimony'::text, t.id, 'received'::text, null::text, t.created_at
     from app.testimonies t where v_role = 'admin' order by t.created_at desc limit 50)
  ) feed
  where v_role = 'admin' or feed.entity not in ('prayer', 'testimony')
  order by feed.created_at desc
  limit least(greatest(p_limit, 1), 50);
end
$$;

grant execute on function
  app.recent_activity(integer),
  app.whoami(),
  app.staff_role(),
  app.activate_session(uuid),
  app.close_session(uuid),
  app.archive_session(uuid, boolean),
  app.present_question(uuid, boolean),
  app.present_mode(text),
  app.presentation_current(),
  app.presentation_context(uuid),
  app.active_session_id()
to connect_ask_staff;

-- Nothing else in the schema is callable by the application roles. Functions
-- created after the earlier revoke are covered here.
revoke execute on all functions in schema app from public;
grant execute on function app.current_user_id() to connect_ask_staff;

commit;
