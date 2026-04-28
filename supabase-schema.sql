-- Supabase schema for Bus Role Call

create table students (
  id serial primary key,
  name text not null,
  bus_number integer check (bus_number between 1 and 3),
  checked_in boolean not null default false,
  is_added_manually boolean not null default false,
  created_at timestamptz not null default now()
);
