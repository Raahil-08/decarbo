insert into storage.buckets (id, name, public)
values ('uploads','uploads',false), ('reports','reports',false)
on conflict (id) do nothing;

create policy "members upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'uploads' and public.is_factory_member(((storage.foldername(name))[1])::uuid));

create policy "members read" on storage.objects for select to authenticated
  using (bucket_id in ('uploads','reports') and public.is_factory_member(((storage.foldername(name))[1])::uuid));
