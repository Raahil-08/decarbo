create extension if not exists "pgcrypto";

-- Enums
create type activity_category as enum ('electricity','fuel','material','transport','waste','production','water');
create type record_status     as enum ('draft','confirmed','rejected');
create type upload_kind       as enum ('template_xlsx','generic_table','bill_image','bill_pdf');
create type upload_status     as enum ('uploaded','parsing','needs_review','confirmed','failed');
create type scope_type        as enum ('scope1','scope2','scope3');
create type adoption_status   as enum ('planned','in_progress','done','dropped');
create type member_role       as enum ('owner','editor','viewer');

-- Users
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  preferred_locale text not null default 'en' check (preferred_locale in ('en','gu','hi')),
  created_at timestamptz not null default now()
);

-- Factories
create table factories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  industry text not null,               -- e.g. 'brass_components', 'foundry', 'textile', 'ceramics', 'other'
  products text,
  city text,
  state text default 'Gujarat',
  cluster text,                         -- e.g. 'Jamnagar brass'
  grid_region text not null default 'IN', -- key into emission_factors.region
  output_unit text not null default 't', -- unit of production output: 't', 'pieces', 'm', ...
  annual_output numeric,                -- self-declared, used until production data exists
  electricity_tariff_inr_per_kwh numeric, -- derived from bills, user-editable
  consent_at timestamptz,               -- DPDP consent for processing uploaded data
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table factory_members (
  factory_id uuid references factories(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role member_role not null default 'owner',
  primary key (factory_id, user_id)
);

-- Canonical activity types (seeded from data/seed/activity_types.csv)
create table activity_types (
  key text primary key,                 -- e.g. 'grid_electricity', 'diesel', 'brass_rod_virgin'
  category activity_category not null,
  canonical_unit text not null,         -- pint unit string: 'kWh', 'L', 'kg', 't*km', 'm**3'
  scope scope_type,                     -- null for production
  label_en text not null, label_gu text, label_hi text,
  synonyms text[] not null default '{}' -- helps column mapping: {'units consumed','kwh','bijli'}
);

-- Uploads (files live in Supabase Storage bucket 'uploads')
create table uploads (
  id uuid primary key default gen_random_uuid(),
  factory_id uuid not null references factories(id) on delete cascade,
  storage_path text not null,           -- '{factory_id}/{upload_id}/{filename}'
  original_filename text not null,
  kind upload_kind not null,
  status upload_status not null default 'uploaded',
  mapping jsonb,                        -- proposed/confirmed column mapping or extracted bill fields
  issues jsonb not null default '[]',   -- validation issues
  error text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- Activity data (one row per activity per month)
create table activity_records (
  id uuid primary key default gen_random_uuid(),
  factory_id uuid not null references factories(id) on delete cascade,
  period_month date not null,           -- first day of month
  activity_type text not null references activity_types(key),
  quantity numeric not null,            -- as entered
  unit text not null,                   -- as entered
  quantity_canonical numeric not null,  -- converted with pint
  cost_inr numeric,                     -- money spent on this activity in the month, if known
  attributes jsonb not null default '{}', -- e.g. {"recycled_share":0.2,"distance_km":600,"vehicle":"hgv"}
  source_upload_id uuid references uploads(id) on delete set null,
  source_note text,                     -- 'bill p1', 'row 14', 'manual'
  confidence numeric,                   -- 0..1 for LLM-extracted values
  status record_status not null default 'draft',
  created_at timestamptz not null default now(),
  unique (factory_id, period_month, activity_type, source_upload_id)
);
create index on activity_records (factory_id, period_month);

-- Emission factors (seeded; versioned; never hardcoded)
create table emission_factors (
  id uuid primary key default gen_random_uuid(),
  activity_type text not null references activity_types(key),
  region text not null default 'GLOBAL', -- 'IN', 'IN-GJ', 'GLOBAL'
  kgco2e_per_unit numeric not null,
  per_unit text not null,               -- must equal activity_types.canonical_unit
  source_name text not null,
  source_url text,
  source_version text,
  reference_year text,                  -- e.g. 'FY2024-25'
  valid_from date, valid_to date,
  verified boolean not null default false,
  notes text,
  unique (activity_type, region, source_version)
);

-- Calculation runs and results
create table calc_runs (
  id uuid primary key default gen_random_uuid(),
  factory_id uuid not null references factories(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  total_kgco2e numeric not null,
  output_quantity numeric,              -- production in period (canonical output unit)
  intensity_kgco2e_per_output numeric,
  summary jsonb not null,               -- by scope, category, activity_type; sankey nodes/links
  created_at timestamptz not null default now()
);

create table emission_results (
  id uuid primary key default gen_random_uuid(),
  calc_run_id uuid not null references calc_runs(id) on delete cascade,
  activity_record_id uuid not null references activity_records(id) on delete cascade,
  emission_factor_id uuid not null references emission_factors(id),
  scope scope_type not null,
  kgco2e numeric not null,
  formula text not null                 -- '95,000 kWh × 0.710 kgCO2e/kWh = 67,450 kgCO2e'
);

-- Intervention library (seeded)
create table interventions (
  code text primary key,                -- 'SOLAR_ROOFTOP', 'CA_LEAK_FIX'
  title_en text not null, title_gu text, title_hi text,
  description_en text not null, description_gu text, description_hi text,
  category text not null,               -- 'energy_efficiency','renewable','material_circularity',
                                        -- 'waste_circularity','process','transport','fuel_switch'
  industries text[] not null,           -- {'*'} = all
  pool text not null,                   -- pool key it acts on (§12.2)
  effect_type text not null,            -- §12.3
  effect_params jsonb not null,         -- low/mode/high values, share_of_pool, levels, side effects
  capex_model jsonb not null,           -- {"type":"fixed","low":..,"mode":..,"high":..} or per-level
  savings_model jsonb not null,         -- how annual ₹ savings are computed
  lifetime_years numeric not null,
  difficulty smallint not null check (difficulty between 1 and 5),
  downtime_days numeric not null default 0,
  circularity_points smallint not null default 0, -- 0..10
  requires text[] not null default '{}',    -- intervention codes that must also be chosen
  conflicts text[] not null default '{}',   -- codes that cannot be chosen together
  applicability jsonb not null default '{}', -- rules, e.g. {"min_pool_share":0.02,"requires_activity":["furnace_oil"]}
  source_name text, source_url text,
  verified boolean not null default false
);

-- Benchmarks (seeded, indicative)
create table benchmarks (
  id uuid primary key default gen_random_uuid(),
  industry text not null,
  metric text not null,                 -- 'kwh_per_t_output', 'kgco2e_per_t_output'
  value_low numeric, value_mode numeric, value_high numeric,
  source_name text, verified boolean not null default false
);

-- Plans
create table plans (
  id uuid primary key default gen_random_uuid(),
  factory_id uuid not null references factories(id) on delete cascade,
  calc_run_id uuid not null references calc_runs(id),
  mode text not null,                   -- 'best_value' | 'min_capex_for_target' | 'max_reduction_in_budget'
  inputs jsonb not null,                -- budget, target_pct, horizon_months, weights, max_payback_months
  totals jsonb not null,                -- capex, annual_savings, reduction_kg, reduction_pct, payback_months, p10/p50/p90, prob_target
  feasible boolean not null,
  message text,                         -- e.g. 'Target needs ₹14.2 L; best within ₹10 L is 16.8%'
  is_selected boolean not null default false,
  explanation jsonb,                    -- {"en": "...", "gu": "..."} cached AI text
  created_at timestamptz not null default now()
);

create table plan_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references plans(id) on delete cascade,
  intervention_code text not null references interventions(code),
  sequence smallint not null,           -- implementation order (quick wins first)
  level jsonb,                          -- chosen level, e.g. {"kwp":150} or {"recycled_share":0.6}
  capex_inr numeric not null,
  annual_savings_inr numeric not null,
  reduction_kgco2e numeric not null,    -- marginal reduction given items before it
  reduction_p10 numeric, reduction_p90 numeric,
  payback_months numeric,               -- null if savings <= 0
  cost_per_tonne_inr numeric
);

-- Tracking
create table adoptions (
  id uuid primary key default gen_random_uuid(),
  factory_id uuid not null references factories(id) on delete cascade,
  plan_item_id uuid references plan_items(id) on delete set null,
  intervention_code text not null references interventions(code),
  status adoption_status not null default 'planned',
  started_on date, completed_on date,
  actual_capex_inr numeric,
  notes text,
  updated_at timestamptz not null default now()
);

create table targets (
  id uuid primary key default gen_random_uuid(),
  factory_id uuid not null references factories(id) on delete cascade,
  baseline_calc_run_id uuid not null references calc_runs(id),
  baseline_intensity numeric not null,  -- kgCO2e per output unit
  target_intensity numeric not null,
  target_date date not null,
  created_at timestamptz not null default now()
);

create table reports (
  id uuid primary key default gen_random_uuid(),
  factory_id uuid not null references factories(id) on delete cascade,
  plan_id uuid references plans(id) on delete set null,
  locale text not null,
  storage_path text not null,
  created_at timestamptz not null default now()
);

-- Profile row on signup
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name) values (new.id, new.raw_user_meta_data->>'full_name');
  return new;
end $$;
create or replace trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();
