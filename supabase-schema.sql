-- Bus Role Call schema reset
-- Run this in a fresh Supabase SQL editor session, or drop the old app tables first.

create extension if not exists pgcrypto;

drop table if exists attendance_audit_log cascade;
drop table if exists attendance_records cascade;
drop table if exists attendance_sessions cascade;
drop table if exists buses cascade;
drop table if exists students cascade;
drop table if exists group_members cascade;
drop table if exists groups cascade;
drop table if exists app_keepalive cascade;

drop function if exists normalize_student_name(text) cascade;
drop function if exists current_user_group_role(uuid) cascade;
drop function if exists is_group_member(uuid) cascade;
drop function if exists is_group_admin(uuid) cascade;
drop function if exists get_group_by_code(text) cascade;
drop function if exists create_group_with_owner(text, text) cascade;
drop function if exists public_get_session_for_checkin(uuid, text) cascade;
drop function if exists public_check_in_student(uuid, text, uuid, uuid, text, boolean) cascade;
drop function if exists public_check_out_student(uuid, text, uuid, text) cascade;
drop function if exists public_add_walk_on_student(uuid, text, text, uuid, text) cascade;
drop function if exists admin_reset_open_session(uuid) cascade;
drop function if exists admin_end_session(uuid) cascade;
drop function if exists keepalive_ping() cascade;

create table groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 160),
  group_code text not null unique check (group_code ~ '^[A-Z0-9]{6}$'),
  owner_id uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  user_id uuid not null,
  role text not null check (role in ('owner', 'admin', 'helper')),
  inserted_at timestamptz not null default now(),
  unique(group_id, user_id)
);

create table buses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  label text not null check (length(trim(label)) between 1 and 80),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table students (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 160),
  normalized_name text not null,
  registered_for_programme boolean not null default true,
  imported_at timestamptz,
  imported_by uuid,
  created_by uuid,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(group_id, normalized_name)
);

create table attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  status text not null default 'open' check (status in ('open', 'closed')),
  public_checkin_token text not null unique default encode(gen_random_bytes(32), 'hex'),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'open' and ended_at is null) or (status = 'closed' and ended_at is not null))
);

create unique index attendance_sessions_one_open_per_group
  on attendance_sessions(group_id)
  where status = 'open';

create table attendance_records (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references attendance_sessions(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  bus_id uuid not null references buses(id),
  bus_label_snapshot text not null,
  checked_in_at timestamptz not null default now(),
  checked_in_by_user uuid,
  checked_in_by_name text,
  updated_at timestamptz not null default now(),
  unique(session_id, student_id)
);

create table attendance_audit_log (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  session_id uuid references attendance_sessions(id) on delete cascade,
  student_id uuid references students(id) on delete set null,
  bus_id uuid references buses(id) on delete set null,
  action text not null check (action in ('check_in', 'check_out', 'move', 'walk_on_add', 'reset', 'end_session')),
  actor_user_id uuid,
  actor_name text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table app_keepalive (
  id integer primary key default 1 check (id = 1),
  last_ping_at timestamptz not null default now(),
  ping_count integer not null default 0
);

insert into app_keepalive(id) values (1);

create index students_group_id_idx on students(group_id);
create index students_group_normalized_idx on students(group_id, normalized_name);
create index buses_group_id_idx on buses(group_id);
create index attendance_sessions_group_status_idx on attendance_sessions(group_id, status);
create index attendance_records_session_id_idx on attendance_records(session_id);
create unique index attendance_records_session_student_idx on attendance_records(session_id, student_id);
create index attendance_records_bus_id_idx on attendance_records(bus_id);
create index attendance_audit_session_idx on attendance_audit_log(session_id, created_at desc);

alter table groups enable row level security;
alter table group_members enable row level security;
alter table buses enable row level security;
alter table students enable row level security;
alter table attendance_sessions enable row level security;
alter table attendance_records enable row level security;
alter table attendance_audit_log enable row level security;
alter table app_keepalive enable row level security;

create function normalize_student_name(value text)
returns text
language sql
immutable
as $$
  select regexp_replace(lower(trim(coalesce(value, ''))), '\s+', ' ', 'g');
$$;

create function current_user_group_role(target_group_id uuid)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select gm.role
  from group_members gm
  where gm.group_id = target_group_id
    and gm.user_id = auth.uid()
  order by case gm.role when 'owner' then 1 when 'admin' then 2 else 3 end
  limit 1;
$$;

create function is_group_member(target_group_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from group_members gm
    where gm.group_id = target_group_id
      and gm.user_id = auth.uid()
  );
$$;

create function is_group_admin(target_group_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from group_members gm
    where gm.group_id = target_group_id
      and gm.user_id = auth.uid()
      and gm.role in ('owner', 'admin')
  );
$$;

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger groups_set_updated_at before update on groups
  for each row execute function set_updated_at();
create trigger buses_set_updated_at before update on buses
  for each row execute function set_updated_at();
create trigger students_set_updated_at before update on students
  for each row execute function set_updated_at();
create trigger attendance_sessions_set_updated_at before update on attendance_sessions
  for each row execute function set_updated_at();

create or replace function add_group_owner_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into group_members(group_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (group_id, user_id) do update set role = 'owner';
  return new;
end;
$$;

create trigger groups_add_owner_member after insert on groups
  for each row execute function add_group_owner_member();

create policy groups_read_members on groups
  for select to authenticated
  using (is_group_member(id));

create policy groups_insert_authenticated on groups
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy groups_update_admins on groups
  for update to authenticated
  using (is_group_admin(id))
  with check (is_group_admin(id));

create policy group_members_read_members on group_members
  for select to authenticated
  using (is_group_member(group_id));

create policy group_members_manage_admins on group_members
  for all to authenticated
  using (is_group_admin(group_id))
  with check (is_group_admin(group_id));

create policy buses_read_members on buses
  for select to authenticated
  using (is_group_member(group_id));

create policy buses_manage_admins on buses
  for all to authenticated
  using (is_group_admin(group_id))
  with check (is_group_admin(group_id));

create policy students_read_members on students
  for select to authenticated
  using (is_group_member(group_id));

create policy students_manage_admins on students
  for all to authenticated
  using (is_group_admin(group_id))
  with check (is_group_admin(group_id));

create policy sessions_read_members on attendance_sessions
  for select to authenticated
  using (is_group_member(group_id));

create policy sessions_manage_admins on attendance_sessions
  for all to authenticated
  using (is_group_admin(group_id))
  with check (is_group_admin(group_id));

create policy records_read_members on attendance_records
  for select to authenticated
  using (
    exists (
      select 1 from attendance_sessions s
      where s.id = attendance_records.session_id
        and is_group_member(s.group_id)
    )
  );

create policy records_write_members_open on attendance_records
  for all to authenticated
  using (
    exists (
      select 1 from attendance_sessions s
      where s.id = attendance_records.session_id
        and s.status = 'open'
        and is_group_member(s.group_id)
        and exists (
          select 1 from students st
          where st.id = attendance_records.student_id
            and st.group_id = s.group_id
        )
        and exists (
          select 1 from buses b
          where b.id = attendance_records.bus_id
            and b.group_id = s.group_id
        )
    )
  )
  with check (
    exists (
      select 1 from attendance_sessions s
      where s.id = attendance_records.session_id
        and s.status = 'open'
        and is_group_member(s.group_id)
        and exists (
          select 1 from students st
          where st.id = attendance_records.student_id
            and st.group_id = s.group_id
        )
        and exists (
          select 1 from buses b
          where b.id = attendance_records.bus_id
            and b.group_id = s.group_id
        )
    )
  );

create policy audit_read_admins on attendance_audit_log
  for select to authenticated
  using (is_group_admin(group_id));

create policy keepalive_no_direct_access on app_keepalive
  for select using (false);

create function get_group_by_code(group_code text)
returns groups
language sql
security definer
stable
set search_path = public
as $$
  select *
  from groups
  where groups.group_code = upper(trim(group_code))
    and is_group_member(groups.id)
  limit 1;
$$;

create function create_group_with_owner(programme_name text, requested_group_code text)
returns groups
language plpgsql
security definer
set search_path = public
as $$
declare
  created_group groups%rowtype;
  clean_name text := trim(coalesce(programme_name, ''));
  clean_code text := upper(trim(coalesce(requested_group_code, '')));
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'You must be signed in to create a programme.' using errcode = 'P0001';
  end if;

  if length(clean_name) < 1 or length(clean_name) > 160 then
    raise exception 'Programme name is required and must be 160 characters or fewer.' using errcode = 'P0001';
  end if;

  if clean_code !~ '^[A-Z0-9]{6}$' then
    raise exception 'Programme code must be exactly 6 letters or numbers.' using errcode = 'P0001';
  end if;

  insert into groups(name, group_code, owner_id)
  values (clean_name, clean_code, current_user_id)
  returning * into created_group;

  insert into group_members(group_id, user_id, role)
  values (created_group.id, current_user_id, 'owner')
  on conflict (group_id, user_id) do update set role = 'owner';

  return created_group;
end;
$$;

create function public_get_session_for_checkin(session_id uuid, public_checkin_token text)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  session_row attendance_sessions%rowtype;
  group_row groups%rowtype;
begin
  select * into session_row
  from attendance_sessions s
  where s.id = public_get_session_for_checkin.session_id
    and s.public_checkin_token = public_get_session_for_checkin.public_checkin_token;

  if not found then
    raise exception 'Invalid or expired check-in link' using errcode = 'P0001';
  end if;

  select * into group_row from groups where id = session_row.group_id;

  return jsonb_build_object(
    'group', jsonb_build_object(
      'id', group_row.id,
      'name', group_row.name,
      'group_code', group_row.group_code
    ),
    'session', jsonb_build_object(
      'id', session_row.id,
      'group_id', session_row.group_id,
      'name', session_row.name,
      'status', session_row.status,
      'started_at', session_row.started_at,
      'ended_at', session_row.ended_at
    ),
    'buses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id,
        'group_id', b.group_id,
        'label', b.label,
        'sort_order', b.sort_order,
        'active', b.active
      ) order by b.sort_order, b.label)
      from buses b
      where b.group_id = session_row.group_id
        and (b.active or exists (
          select 1 from attendance_records ar
          where ar.session_id = session_row.id and ar.bus_id = b.id
        ))
    ), '[]'::jsonb),
    'students', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', st.id,
        'group_id', st.group_id,
        'name', st.name,
        'normalized_name', st.normalized_name,
        'registered_for_programme', st.registered_for_programme,
        'created_by_name', st.created_by_name,
        'created_at', st.created_at
      ) order by st.name)
      from students st
      where st.group_id = session_row.group_id
    ), '[]'::jsonb),
    'attendance', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ar.id,
        'session_id', ar.session_id,
        'student_id', ar.student_id,
        'bus_id', ar.bus_id,
        'bus_label_snapshot', ar.bus_label_snapshot,
        'checked_in_at', ar.checked_in_at,
        'checked_in_by_name', ar.checked_in_by_name,
        'updated_at', ar.updated_at
      ) order by ar.checked_in_at desc)
      from attendance_records ar
      where ar.session_id = session_row.id
    ), '[]'::jsonb),
    'server_time', now()
  );
end;
$$;

create function public_check_in_student(
  session_id uuid,
  public_checkin_token text,
  student_id uuid,
  bus_id uuid,
  helper_name text,
  override_existing boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  session_row attendance_sessions%rowtype;
  student_row students%rowtype;
  bus_row buses%rowtype;
  existing_row attendance_records%rowtype;
  clean_helper text := left(trim(coalesce(helper_name, '')), 120);
  action_name text := 'check_in';
begin
  if clean_helper = '' then
    raise exception 'Helper name is required' using errcode = 'P0001';
  end if;

  select * into session_row
  from attendance_sessions s
  where s.id = public_check_in_student.session_id
    and s.public_checkin_token = public_check_in_student.public_checkin_token
    and s.status = 'open'
  for update;

  if not found then
    raise exception 'Session is not open or link is invalid' using errcode = 'P0001';
  end if;

  select * into student_row
  from students st
  where st.id = public_check_in_student.student_id
    and st.group_id = session_row.group_id;

  if not found then
    raise exception 'Student does not belong to this programme' using errcode = 'P0001';
  end if;

  select * into bus_row
  from buses b
  where b.id = public_check_in_student.bus_id
    and b.group_id = session_row.group_id
    and b.active;

  if not found then
    raise exception 'Bus is not active for this programme' using errcode = 'P0001';
  end if;

  select * into existing_row
  from attendance_records ar
  where ar.session_id = session_row.id
    and ar.student_id = student_row.id
  for update;

  if found then
    if existing_row.bus_id <> bus_row.id and not override_existing then
      return jsonb_build_object(
        'status', 'conflict',
        'student_id', student_row.id,
        'current_bus_id', existing_row.bus_id,
        'current_bus_label', existing_row.bus_label_snapshot,
        'requested_bus_id', bus_row.id,
        'requested_bus_label', bus_row.label
      );
    end if;

    if existing_row.bus_id <> bus_row.id then
      action_name := 'move';
    end if;

    update attendance_records
    set bus_id = bus_row.id,
        bus_label_snapshot = bus_row.label,
        checked_in_by_name = clean_helper,
        updated_at = now()
    where id = existing_row.id;
  else
    insert into attendance_records(
      session_id,
      student_id,
      bus_id,
      bus_label_snapshot,
      checked_in_by_name
    )
    values (
      session_row.id,
      student_row.id,
      bus_row.id,
      bus_row.label,
      clean_helper
    );
  end if;

  insert into attendance_audit_log(group_id, session_id, student_id, bus_id, action, actor_name, details)
  values (
    session_row.group_id,
    session_row.id,
    student_row.id,
    bus_row.id,
    action_name,
    clean_helper,
    jsonb_build_object('bus_label', bus_row.label, 'override_existing', override_existing)
  );

  return jsonb_build_object('status', action_name, 'student_id', student_row.id, 'bus_id', bus_row.id, 'bus_label', bus_row.label);
exception
  when unique_violation then
    return public_check_in_student(session_id, public_checkin_token, student_id, bus_id, helper_name, override_existing);
end;
$$;

create function public_check_out_student(
  session_id uuid,
  public_checkin_token text,
  student_id uuid,
  helper_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  session_row attendance_sessions%rowtype;
  deleted_row attendance_records%rowtype;
  clean_helper text := left(trim(coalesce(helper_name, '')), 120);
begin
  if clean_helper = '' then
    raise exception 'Helper name is required' using errcode = 'P0001';
  end if;

  select * into session_row
  from attendance_sessions s
  where s.id = public_check_out_student.session_id
    and s.public_checkin_token = public_check_out_student.public_checkin_token
    and s.status = 'open'
  for update;

  if not found then
    raise exception 'Session is not open or link is invalid' using errcode = 'P0001';
  end if;

  delete from attendance_records ar
  where ar.session_id = session_row.id
    and ar.student_id = public_check_out_student.student_id
  returning * into deleted_row;

  if found then
    insert into attendance_audit_log(group_id, session_id, student_id, bus_id, action, actor_name, details)
    values (
      session_row.group_id,
      session_row.id,
      deleted_row.student_id,
      deleted_row.bus_id,
      'check_out',
      clean_helper,
      jsonb_build_object('bus_label', deleted_row.bus_label_snapshot)
    );
  end if;

  return jsonb_build_object('status', 'checked_out', 'student_id', public_check_out_student.student_id);
end;
$$;

create function public_add_walk_on_student(
  session_id uuid,
  public_checkin_token text,
  name text,
  bus_id uuid,
  helper_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  session_row attendance_sessions%rowtype;
  bus_row buses%rowtype;
  student_row students%rowtype;
  clean_name text := left(trim(coalesce(name, '')), 160);
  clean_helper text := left(trim(coalesce(helper_name, '')), 120);
  normalized text := normalize_student_name(name);
  checkin_result jsonb;
begin
  if clean_name = '' or length(clean_name) > 160 then
    raise exception 'Walk-on name is required and must be 160 characters or fewer' using errcode = 'P0001';
  end if;

  if clean_helper = '' then
    raise exception 'Helper name is required' using errcode = 'P0001';
  end if;

  select * into session_row
  from attendance_sessions s
  where s.id = public_add_walk_on_student.session_id
    and s.public_checkin_token = public_add_walk_on_student.public_checkin_token
    and s.status = 'open'
  for update;

  if not found then
    raise exception 'Session is not open or link is invalid' using errcode = 'P0001';
  end if;

  select * into bus_row
  from buses b
  where b.id = public_add_walk_on_student.bus_id
    and b.group_id = session_row.group_id
    and b.active;

  if not found then
    raise exception 'Bus is not active for this programme' using errcode = 'P0001';
  end if;

  insert into students(group_id, name, normalized_name, registered_for_programme, created_by_name)
  values (session_row.group_id, clean_name, normalized, false, clean_helper)
  on conflict (group_id, normalized_name) do update
    set name = students.name
  returning * into student_row;

  if student_row.registered_for_programme then
    raise exception 'A registered student with this name already exists' using errcode = 'P0001';
  end if;

  insert into attendance_audit_log(group_id, session_id, student_id, bus_id, action, actor_name, details)
  values (
    session_row.group_id,
    session_row.id,
    student_row.id,
    bus_row.id,
    'walk_on_add',
    clean_helper,
    jsonb_build_object('name', student_row.name, 'normalized_name', student_row.normalized_name)
  );

  checkin_result := public_check_in_student(session_id, public_checkin_token, student_row.id, bus_row.id, clean_helper, true);

  return jsonb_build_object('status', 'walk_on_added', 'student_id', student_row.id, 'checkin', checkin_result);
end;
$$;

create function admin_reset_open_session(session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  session_row attendance_sessions%rowtype;
  deleted_count integer := 0;
begin
  select * into session_row
  from attendance_sessions s
  where s.id = admin_reset_open_session.session_id
    and s.status = 'open'
  for update;

  if not found then
    raise exception 'Open session not found' using errcode = 'P0001';
  end if;

  if not is_group_admin(session_row.group_id) then
    raise exception 'Only programme admins can reset attendance' using errcode = 'P0001';
  end if;

  delete from attendance_records ar
  where ar.session_id = session_row.id;

  get diagnostics deleted_count = row_count;

  insert into attendance_audit_log(group_id, session_id, action, actor_user_id, actor_name, details)
  values (
    session_row.group_id,
    session_row.id,
    'reset',
    auth.uid(),
    null,
    jsonb_build_object('deleted_records', deleted_count)
  );

  return jsonb_build_object('status', 'reset', 'deleted_records', deleted_count);
end;
$$;

create function admin_end_session(session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  session_row attendance_sessions%rowtype;
begin
  select * into session_row
  from attendance_sessions s
  where s.id = admin_end_session.session_id
    and s.status = 'open'
  for update;

  if not found then
    raise exception 'Open session not found' using errcode = 'P0001';
  end if;

  if not is_group_admin(session_row.group_id) then
    raise exception 'Only programme admins can end sessions' using errcode = 'P0001';
  end if;

  update attendance_sessions
  set status = 'closed',
      ended_at = now()
  where id = session_row.id;

  insert into attendance_audit_log(group_id, session_id, action, actor_user_id, actor_name)
  values (session_row.group_id, session_row.id, 'end_session', auth.uid(), null);

  return jsonb_build_object('status', 'closed', 'session_id', session_row.id);
end;
$$;

create function keepalive_ping()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  row_data app_keepalive%rowtype;
begin
  update app_keepalive
  set last_ping_at = now(),
      ping_count = ping_count + 1
  where id = 1
  returning * into row_data;

  return jsonb_build_object('ok', true, 'last_ping_at', row_data.last_ping_at, 'ping_count', row_data.ping_count);
end;
$$;

grant execute on function get_group_by_code(text) to authenticated;
grant execute on function create_group_with_owner(text, text) to authenticated;
grant execute on function public_get_session_for_checkin(uuid, text) to anon, authenticated;
grant execute on function public_check_in_student(uuid, text, uuid, uuid, text, boolean) to anon, authenticated;
grant execute on function public_check_out_student(uuid, text, uuid, text) to anon, authenticated;
grant execute on function public_add_walk_on_student(uuid, text, text, uuid, text) to anon, authenticated;
grant execute on function admin_reset_open_session(uuid) to authenticated;
grant execute on function admin_end_session(uuid) to authenticated;
grant execute on function keepalive_ping() to anon, authenticated;

grant select, insert, update on table groups to authenticated;
