-- job_applications: applications from the public /careers page, plus the team's follow-up with each applicant.
-- Written by server code with the service role only; owner and manager read and manage them.

create table job_applications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  full_name text not null check (char_length(btrim(full_name)) between 1 and 120),
  age int not null check (age between 20 and 65),
  contact text not null check (char_length(btrim(contact)) between 1 and 120),
  experience text not null check (experience in ('none', 'under_1', '1_3', '3_5', '5_plus')),
  has_certificate boolean not null default false,
  work_type text not null check (work_type in ('full_time', 'part_time')),
  skills text check (skills is null or char_length(skills) <= 1000),
  locale text not null default 'th' check (locale in ('en', 'th')),
  status text not null default 'new' check (status in ('new', 'contacted', 'interview', 'trial', 'hired', 'declined')),
  correspondence text check (correspondence is null or char_length(correspondence) <= 4000)  -- the team's notes on contact with the applicant
);
create index job_applications_created_at on job_applications (created_at desc);
create index job_applications_status on job_applications (status, created_at desc);

create function private.job_applications_touch() returns trigger
  language plpgsql set search_path = public, pg_temp
as $$ begin new.updated_at := now(); return new; end $$;
create trigger job_applications_touch before update on job_applications
  for each row execute function private.job_applications_touch();

alter table job_applications enable row level security;
revoke all on job_applications from anon, authenticated;
grant select, update, delete on job_applications to authenticated;
-- No insert policy or grant: the public page inserts through the service role, which bypasses RLS.
create policy job_applications_select on job_applications for select to authenticated
  using (private.current_role() in ('owner', 'manager'));
create policy job_applications_update on job_applications for update to authenticated
  using (private.current_role() in ('owner', 'manager'))
  with check (private.current_role() in ('owner', 'manager'));
create policy job_applications_delete on job_applications for delete to authenticated
  using (private.current_role() in ('owner', 'manager'));
