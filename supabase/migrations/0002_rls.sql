create or replace function public.is_factory_member(fid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from factory_members where factory_id = fid and user_id = auth.uid());
$$;

alter table profiles enable row level security;
create policy "own profile" on profiles for all using (id = auth.uid()) with check (id = auth.uid());

alter table factories enable row level security;
create policy "members read factory"   on factories for select using (is_factory_member(id));
create policy "creator inserts factory" on factories for insert with check (created_by = auth.uid());
create policy "members update factory" on factories for update using (is_factory_member(id));

alter table factory_members enable row level security;
create policy "see own memberships" on factory_members for select using (user_id = auth.uid());

-- Tables with factory_id
alter table uploads enable row level security;
create policy "members uploads" on uploads for all using (is_factory_member(factory_id)) with check (is_factory_member(factory_id));

alter table activity_records enable row level security;
create policy "members activity_records" on activity_records for all using (is_factory_member(factory_id)) with check (is_factory_member(factory_id));

alter table calc_runs enable row level security;
create policy "members calc_runs" on calc_runs for all using (is_factory_member(factory_id)) with check (is_factory_member(factory_id));

alter table plans enable row level security;
create policy "members plans" on plans for all using (is_factory_member(factory_id)) with check (is_factory_member(factory_id));

alter table adoptions enable row level security;
create policy "members adoptions" on adoptions for all using (is_factory_member(factory_id)) with check (is_factory_member(factory_id));

alter table targets enable row level security;
create policy "members targets" on targets for all using (is_factory_member(factory_id)) with check (is_factory_member(factory_id));

alter table reports enable row level security;
create policy "members reports" on reports for all using (is_factory_member(factory_id)) with check (is_factory_member(factory_id));

-- Child tables: check through parent
alter table emission_results enable row level security;
create policy "members emission_results" on emission_results for select using (
  exists (select 1 from calc_runs c where c.id = calc_run_id and is_factory_member(c.factory_id)));

alter table plan_items enable row level security;
create policy "members plan_items" on plan_items for select using (
  exists (select 1 from plans p where p.id = plan_id and is_factory_member(p.factory_id)));

-- Reference tables: readable by any signed-in user, writable only by service role
alter table activity_types   enable row level security;
alter table emission_factors enable row level security;
alter table interventions    enable row level security;
alter table benchmarks       enable row level security;

create policy "read activity_types"   on activity_types   for select to authenticated using (true);
create policy "read emission_factors" on emission_factors for select to authenticated using (true);
create policy "read interventions"    on interventions    for select to authenticated using (true);
create policy "read benchmarks"       on benchmarks       for select to authenticated using (true);
