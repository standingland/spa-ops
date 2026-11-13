-- 0022_therapist_photos: a private photo per therapist, visible only to owner and manager.
alter table therapists add column photo_path text;

insert into storage.buckets (id, name, public) values ('therapist-photos', 'therapist-photos', false)
  on conflict (id) do update set public = false;

-- Only owner and manager can list, read, upload, replace or remove photos; everyone else (and anonymous visitors) gets nothing.
create policy therapist_photos_select on storage.objects for select to authenticated
  using (bucket_id = 'therapist-photos' and private.current_role() in ('owner', 'manager'));
create policy therapist_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'therapist-photos' and private.current_role() in ('owner', 'manager'));
create policy therapist_photos_update on storage.objects for update to authenticated
  using (bucket_id = 'therapist-photos' and private.current_role() in ('owner', 'manager'))
  with check (bucket_id = 'therapist-photos' and private.current_role() in ('owner', 'manager'));
create policy therapist_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'therapist-photos' and private.current_role() in ('owner', 'manager'));
