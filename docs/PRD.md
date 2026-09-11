# Decarbo — Product Requirements Document

**Version:** 1.0 (September 2026)
**Context:** HackOut'26, Problem Statement 10 — Industrial Emission Leak-Point Detector & Circular Alternative Recommender
**Product one-liner:** Upload your electricity bill and production/purchase data. Get the cheapest way to cut your factory's CO₂, with rupees and payback for every step.

---

## 0. Read this first (instructions for the coding agent)

This document is the single source of truth for the project. Read it fully before writing code.

**How to work**

1. Build strictly in the phase order in §22. Do not start a phase until the previous phase's acceptance criteria pass.
2. After every phase, update `docs/PROGRESS.md` with: phase number, what is done, what is pending, known issues, and how to run/test it.
3. When this PRD is ambiguous, choose the simplest option that satisfies the acceptance criteria and record the choice in `docs/DECISIONS.md` (one line per decision: date, decision, reason).
4. Prefer working, tested vertical slices over broad unfinished scaffolding.
5. Use the browser to verify every UI phase end to end before marking it done.

**Non-negotiable rules**

| ID | Rule |
|---|---|
| N1 | The LLM never calculates or invents numbers. Every emission, cost, saving, payback and percentage comes from the Python engine. The LLM only extracts data, maps columns, explains results and translates. |
| N2 | Every emission number is traceable: activity record → unit conversion → emission factor (with source name, version and year) → result. Store this provenance. |
| N3 | Emission factors are never hardcoded in code. They live in the `emission_factors` table, seeded from `data/seed/emission_factors.csv`. |
| N4 | All quantities are converted with `pint` into canonical units before any calculation. |
| N5 | Reductions from multiple interventions on the same activity compound; they never simply add (§13.3). |
| N6 | All business logic lives in the FastAPI backend. The frontend only collects input and displays results. No calculations in React and no Supabase Edge Functions. |
| N7 | The Supabase service-role key never reaches the browser. Every table holding factory data has row-level security (RLS). |
| N8 | Money is INR with Indian digit grouping (₹12,34,567, or ₹12.3 L for lakh). Emissions are stored in kgCO₂e at full precision and displayed in tCO₂e with 1 decimal. |
| N9 | Every user-facing string goes through i18n (English, Gujarati, Hindi). No hardcoded UI text. |
| N10 | Seed values marked `verified = false` must show a small "estimate" badge wherever they drive a number in the UI, until a human verifies them. |

---

## 1. Product summary

### 1.1 Problem

Indian SME factories (brass parts, castings, machining, textiles, ceramics) know their electricity bill and their production, but not where their carbon emissions come from or which practical changes would cut them at a sensible cost. Consultants are expensive; generic carbon calculators stop at a pie chart and give no costed plan. Large buyers and export customers increasingly ask suppliers for emissions data.

### 1.2 What the product does

```
INGEST  →  CALCULATE  →  FIND LEAK POINTS  →  MATCH FIXES  →  BUILD PLAN  →  TRACK
bills,     activity ×     ranked hotspots,     intervention     budget + target  before / target /
Excel,     emission       flow chart,          library,         → best set of    current, with
Tally      factor         drift alerts         rules + AI       fixes, payback   real savings
```

### 1.3 Why this is not "ChatGPT with a prompt"

The product works even if the LLM is switched off. Underneath the chat and explanations sit: the factory's real data, a versioned emission-factor database, a deterministic calculation engine, a structured intervention library with cost and effect models, and a mathematical optimizer. The LLM is only the interface.

### 1.4 Hackathon success criteria

- The 90-second demo (§24.1) runs end to end on real or realistic factory data without manual fixes.
- Every number on screen can be clicked to show its formula, factor and source.
- "Build my plan" returns three plans in under 3 seconds.
- The Gujarati PDF report renders correctly (proper Gujarati text shaping).

### 1.5 Non-goals (do not build)

- Certified GHG audits or third-party verification.
- IoT hardware, sensors or machine integrations (listed as a later feature only).
- Blockchain, tokens or carbon-credit trading.
- A supplier portal for buyers (later feature).
- Claims that the EU carbon border tax (CBAM) applies to brass products. CBAM covers steel, aluminium, cement, fertiliser, hydrogen and electricity; do not mention it for brass in UI copy.

---

## 2. Glossary (plain words)

| Term | Meaning in this product |
|---|---|
| tCO₂e | Tonnes of carbon dioxide equivalent. One number that combines all greenhouse gases by their warming effect. |
| Activity data | Something the factory used or did, with a quantity: 12,000 kWh of electricity, 800 litres of diesel, 60 t of brass rod. |
| Emission factor | How much CO₂e one unit of an activity causes. Example: 0.710 kgCO₂e per kWh of Indian grid electricity. |
| Scope 1 | Emissions from fuel burned on site (diesel generator, furnace oil, LPG, gas). |
| Scope 2 | Emissions from purchased electricity. |
| Scope 3 | Emissions caused elsewhere because of the factory: purchased materials, transport, waste disposal. |
| Leak point / hotspot | An activity responsible for a disproportionately large share of emissions. |
| Intervention / fix | A practical change: rooftop solar, fixing compressed-air leaks, buying higher recycled-content brass. |
| Capex | One-time money spent to make a change (the investment). |
| Annual savings | Money saved per year after the change (lower bills, cheaper material). |
| Payback | How long until the savings repay the investment. Payback in months = capex ÷ (annual savings ÷ 12). |
| Cost per tonne | Net yearly cost of a fix divided by tonnes of CO₂e it cuts per year. Negative means the fix saves money while cutting CO₂. |
| MACC chart | Bar chart of all fixes ordered by cost per tonne. Bar width = tonnes cut, bar height = cost per tonne. Left side (below zero) are fixes that pay for themselves. |
| Intensity | Emissions or energy per unit of output, e.g. tCO₂e per tonne of product. Lets you compare months with different production. |
| Circularity | How much of the factory's material and waste is kept in use (recycled input, scrap recovered, waste reused) instead of wasted. |
| Pool | Internal term: a bucket of activity that interventions act on (e.g. all grid electricity, all virgin brass input). |

---

## 3. Users and journeys

### 3.1 Personas

**P1 — Factory owner (primary).** Owns a brass components unit in Jamnagar with ~40 CNC machines and a small in-house melting line. Uses a phone more than a laptop. Prefers Gujarati for reading reports, English is fine for numbers. Cares about the electricity bill, material cost and what big customers are asking. Has no ESG team.

**P2 — Operations / accounts manager.** Has the Tally export, bills and production register. Does the data upload.

**P3 — Sustainability consultant (secondary).** Manages several SME clients, wants fast inventories and a professional report per client.

### 3.2 Core journeys

| ID | Journey | Steps |
|---|---|---|
| J1 | Onboard | Sign up → create factory profile (industry, city, main products, annual output, unit) → land on empty dashboard with "Add your first data" prompt. |
| J2 | Add data | Upload bill photos/PDFs and an Excel/CSV/Tally export → confirm the auto-mapped fields → fix flagged rows → confirm. |
| J3 | See leak points | Dashboard shows total tCO₂e, intensity per tonne, flow chart, ranked hotspots, drift alerts. Click any number to see how it was calculated. |
| J4 | Build a plan | Enter budget, target % cut, time horizon, priority sliders → see three plans → pick one → see ledger of fixes in order with payback and ranges. |
| J5 | Explore what-if | Move sliders (recycled content %, solar size, fix leaks on/off) → totals update instantly. |
| J6 | Share | Download the plan as PDF in English, Gujarati or Hindi. |
| J7 | Track | Mark fixes as started/done, upload new monthly data, see progress towards the target based on emissions per tonne. |

---

## 4. Feature list and priorities

P0 = required for the hackathon demo. P1 = build if time allows. P2 = later / startup roadmap (do not build during the hackathon unless everything else is done).

| ID | Feature | Priority |
|---|---|---|
| F-01 | Auth (email magic link + Google) via Supabase | P0 |
| F-02 | Factory profile onboarding wizard | P0 |
| F-03 | Excel/CSV upload using the standard template | P0 |
| F-04 | LLM-assisted column mapping for non-template Excel/CSV/Tally exports, with user confirmation | P0 |
| F-05 | Electricity bill extraction from photo/PDF using a vision LLM, with user confirmation | P0 |
| F-06 | Validation and cleaning (units, duplicates, outliers, missing months) | P0 |
| F-07 | Editable activity data table | P0 |
| F-08 | Calculation engine with versioned emission factors and provenance | P0 |
| F-09 | Dashboard: totals, scope split, intensity, Sankey flow chart, ranked hotspots | P0 |
| F-10 | Provenance drawer: click any number to see formula, factor, source | P0 |
| F-11 | Intervention library (seeded) and applicability matching | P0 |
| F-12 | "Build my plan" optimizer with three plans | P0 |
| F-13 | Plan ledger view (the signature screen) | P0 |
| F-14 | MACC chart | P0 |
| F-15 | What-if simulator | P0 |
| F-16 | AI plan explanation in en/gu/hi | P0 |
| F-17 | PDF report in en/gu/hi | P1 |
| F-18 | Priority sliders (CO₂ vs savings vs low investment vs circularity) | P1 |
| F-19 | Uncertainty ranges (Monte Carlo P10/P50/P90) and probability of hitting target | P1 |
| F-20 | Energy-intensity drift alert and monthly anomaly flags | P1 |
| F-21 | Budget frontier chart ("what more money buys") | P1 |
| F-22 | Circularity score with transparent formula | P1 |
| F-23 | Adoption tracking and progress towards target | P1 |
| F-24 | "Ask Decarbo" chat that answers using engine tools only | P1 |
| F-25 | Multi-factory view for consultants | P2 |
| F-26 | Cluster benchmarking ("you vs similar Jamnagar brass units") | P2 |
| F-27 | Supplier emissions report for big buyers | P2 |
| F-28 | Machine-level energy data from CNC monitoring | P2 |
| F-29 | Green-loan-ready savings report for banks | P2 |
| F-30 | Semantic search over intervention case studies (pgvector) | P2 |

---

## 5. System architecture

```
                         ┌──────────────────────────────┐
                         │  React.js web app (browser)  │
                         │  - Supabase Auth (login)     │
                         │  - Direct upload to Storage  │
                         │  - Calls FastAPI with JWT    │
                         └──────────────┬───────────────┘
                                        │ HTTPS, Authorization: Bearer <Supabase JWT>
                         ┌──────────────▼───────────────┐
                         │        FastAPI backend       │
                         │ ┌──────────────────────────┐ │
                         │ │ auth: verify JWT, check  │ │
                         │ │ factory membership       │ │
                         │ ├──────────────────────────┤ │
                         │ │ ingestion: parse xlsx/csv│ │
                         │ │ bills (LLM vision), map, │ │
                         │ │ validate, normalize(pint)│ │
                         │ ├──────────────────────────┤ │
                         │ │ engine: emissions,       │ │
                         │ │ hotspots, drift, score   │ │
                         │ ├──────────────────────────┤ │
                         │ │ interventions: matching, │ │
                         │ │ effect models            │ │
                         │ ├──────────────────────────┤ │
                         │ │ optimizer: OR-Tools MILP,│ │
                         │ │ exact re-evaluation,     │ │
                         │ │ Monte Carlo (numpy)      │ │
                         │ ├──────────────────────────┤ │
                         │ │ ai: provider interface,  │ │
                         │ │ tool-calling, prompts    │ │
                         │ ├──────────────────────────┤ │
                         │ │ reports: Jinja2 + Weasy- │ │
                         │ │ Print (Gujarati shaping) │ │
                         │ └──────────────────────────┘ │
                         └───────┬───────────────┬──────┘
                                 │ SQL           │ HTTPS
                  ┌──────────────▼─────┐   ┌─────▼──────────────┐
                  │ Supabase (Mumbai)  │   │ LLM API (Claude by │
                  │ Postgres + RLS     │   │ default; swappable)│
                  │ Storage (uploads,  │   └────────────────────┘
                  │ reports) Auth      │
                  └────────────────────┘
```

**Request flow for "Build my plan":** browser POSTs budget/target/weights → API verifies JWT and factory access → loads latest confirmed calculation run → matches applicable interventions → builds pools and combinations → solves MILP three times (three modes) → re-evaluates each plan with the exact sequential model → runs Monte Carlo on each plan → stores plan + items → returns JSON → browser renders ledger and MACC → browser separately requests AI explanation (streamed) for the chosen plan.

---

## 6. Tech stack

Use the latest stable versions at build time unless a version is stated.

| Layer | Choice | Notes |
|---|---|---|
| Frontend framework | React.js (Vite) + TypeScript | `web/` folder |
| Styling | Tailwind CSS + shadcn/ui | Customise tokens per §17.4; do not ship default shadcn look |
| Data fetching | TanStack Query | All API calls through a typed client in `web/lib/api.ts` |
| Forms | react-hook-form + zod | |
| Charts | Apache ECharts via `echarts-for-react` | Sankey, MACC (custom bar widths), line, bar |
| i18n | next-intl | Locales: `en`, `gu`, `hi` |
| Auth client | `@supabase/ssr` + `@supabase/supabase-js` | Auth and Storage uploads only |
| Backend | Python 3.12, FastAPI, Pydantic v2 | `api/` folder, package manager `uv` |
| DB access | SQLAlchemy 2.x + psycopg 3 | Connect via Supabase **session pooler** connection string (IPv4 friendly) |
| Units | `pint` | Custom unit definitions in `api/app/engine/units.py` |
| Parsing | pandas, openpyxl, pdfplumber, Pillow | |
| Optimizer | Google OR-Tools (`pywraplp` with SCIP or CBC) | |
| Uncertainty | numpy (vectorised Monte Carlo, fixed seed) | |
| LLM | Anthropic Python SDK (`anthropic`) behind a provider interface | Default models: `claude-sonnet-5` (bill extraction, explanations, chat) and `claude-haiku-4-5-20251001` (column mapping, UI string translation). Configurable by env var. Docs: https://docs.claude.com/en/api/overview |
| PDF | Jinja2 + WeasyPrint | WeasyPrint uses Pango/HarfBuzz, which shapes Gujarati correctly. Do not use react-pdf for Gujarati. |
| Fonts | IBM Plex Sans (Latin), Hind Vadodara (Gujarati), Hind (Devanagari) | Self-host font files in `web/public/fonts` and `api/app/reports/fonts` |
| Database / Auth / Storage | Supabase, region **Mumbai (ap-south-1)** | |
| Migrations | Supabase CLI SQL migrations in `supabase/migrations` | SQLAlchemy models mirror the SQL; do not autogenerate |
| Tests | pytest (API), Vitest (web units), Playwright (end-to-end) | |
| Lint/format | ruff (Python), ESLint + Prettier (TS) | |
| Deploy | Docker Compose (api + web + Caddy) on a VPS, or Vercel (web) + Railway/Render (api) | §23 |

---

## 7. Repository structure

```
decarbo/
├── .agents/
│   ├── rules/decarbo-rules.md        # always-on rules for the coding agent
│   └── workflows/next-phase.md           # /next-phase slash command
├── docs/
│   ├── PRD.md                            # this file
│   ├── PROGRESS.md                       # updated after every phase
│   └── DECISIONS.md                      # one line per decision
├── data/
│   ├── seed/
│   │   ├── emission_factors.csv
│   │   ├── interventions.csv
│   │   ├── activity_types.csv
│   │   └── benchmarks.csv
│   ├── templates/decarbo_template.xlsx   # standard upload template
│   └── demo/                             # generated demo factory data + sample bills
├── supabase/
│   ├── migrations/                       # 0001_init.sql, 0002_rls.sql, 0003_storage.sql ...
│   └── seed.sql                          # optional; prefer scripts/seed.py
├── api/
│   ├── pyproject.toml
│   ├── Dockerfile
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py                     # pydantic-settings, env vars
│   │   ├── db.py
│   │   ├── auth.py                       # JWT verification, factory access dependency
│   │   ├── models/                       # SQLAlchemy models
│   │   ├── schemas/                      # Pydantic request/response models
│   │   ├── routers/                      # factories, uploads, activities, calc, hotspots,
│   │   │                                 # interventions, plans, simulate, macc, reports,
│   │   │                                 # tracking, chat, factors, health
│   │   ├── ingestion/                    # template_parser, mapper, bill_extractor, validator
│   │   ├── engine/                       # units, factors, calculator, hotspots, drift, score
│   │   ├── interventions/                # effects, matcher, pools
│   │   ├── optimizer/                    # combos, milp, evaluate, montecarlo, frontier, macc
│   │   ├── ai/                           # provider.py, anthropic_provider.py, prompts/, tools.py
│   │   ├── reports/                      # templates/, fonts/, render.py
│   │   └── i18n/                         # server-side strings for reports (en, gu, hi)
│   └── tests/
├── web/
│   ├── app/[locale]/...                  # routes per §17.1
│   ├── components/
│   ├── lib/                              # api client, supabase client, formatters
│   ├── messages/                         # en.json, gu.json, hi.json
│   └── public/fonts/
├── scripts/
│   ├── seed.py                           # loads data/seed/*.csv into DB
│   ├── generate_demo_data.py             # §19
│   └── make_template.py                  # builds the standard xlsx template
├── docker-compose.yml
├── Caddyfile
├── .env.example
└── README.md
```

---

## 8. Data model (Supabase Postgres)

### 8.1 Migration `0001_init.sql`

```sql
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
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name) values (new.id, new.raw_user_meta_data->>'full_name');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();
```

### 8.2 Migration `0002_rls.sql`

```sql
create function public.is_factory_member(fid uuid) returns boolean
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

-- Same pattern for every table with factory_id:
-- uploads, activity_records, calc_runs, plans, adoptions, targets, reports
alter table uploads enable row level security;
create policy "members" on uploads for all using (is_factory_member(factory_id)) with check (is_factory_member(factory_id));
-- repeat for activity_records, calc_runs, plans, adoptions, targets, reports

-- Child tables: check through parent
alter table emission_results enable row level security;
create policy "members" on emission_results for select using (
  exists (select 1 from calc_runs c where c.id = calc_run_id and is_factory_member(c.factory_id)));
alter table plan_items enable row level security;
create policy "members" on plan_items for select using (
  exists (select 1 from plans p where p.id = plan_id and is_factory_member(p.factory_id)));

-- Reference tables: readable by any signed-in user, writable only by service role
alter table activity_types   enable row level security;
alter table emission_factors enable row level security;
alter table interventions    enable row level security;
alter table benchmarks       enable row level security;
create policy "read" on activity_types   for select to authenticated using (true);
create policy "read" on emission_factors for select to authenticated using (true);
create policy "read" on interventions    for select to authenticated using (true);
create policy "read" on benchmarks       for select to authenticated using (true);
```

### 8.3 Migration `0003_storage.sql`

Create two **private** buckets: `uploads` and `reports`. Object path always starts with the factory id.

```sql
insert into storage.buckets (id, name, public) values ('uploads','uploads',false), ('reports','reports',false);

create policy "members upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'uploads' and public.is_factory_member(((storage.foldername(name))[1])::uuid));
create policy "members read" on storage.objects for select to authenticated
  using (bucket_id in ('uploads','reports') and public.is_factory_member(((storage.foldername(name))[1])::uuid));
```

### 8.4 Important: RLS and the API

The API connects to Postgres as a privileged role, so **RLS does not protect API queries**. Every API route that takes a `factory_id` must use the `require_factory_access(factory_id, min_role)` dependency (§16.1), which checks `factory_members` for the user id from the verified JWT. RLS protects anything the browser does directly (Storage uploads, and any direct reads). Write a test that user B gets 404 on user A's factory for every router.

---

## 9. Data ingestion

### 9.1 Supported inputs

| Input | Kind | How it's handled |
|---|---|---|
| Standard template (`decarbo_template.xlsx` or CSV) | `template_xlsx` | Deterministic parser, no LLM |
| Any other Excel/CSV, including Tally exports (purchase register, stock summary) | `generic_table` | LLM proposes a column/item mapping → user confirms → deterministic parser applies it |
| Electricity bill photo (jpg/png/heic) or PDF | `bill_image` / `bill_pdf` | Vision LLM extracts fields into a strict schema → user confirms |

Upload flow: browser uploads the file directly to Storage bucket `uploads` at `{factory_id}/{upload_id}/{filename}` → calls `POST /factories/{id}/uploads` to register it → calls `POST /uploads/{id}/parse` → UI polls `GET /uploads/{id}` until status is `needs_review` → user reviews → `POST /uploads/{id}/confirm` creates `activity_records` with `status = confirmed`.

### 9.2 Standard template (long format, one row per activity per month)

| Column | Required | Example | Notes |
|---|---|---|---|
| `month` | yes | 2026-04 | YYYY-MM |
| `activity` | yes | grid_electricity | Canonical key or any synonym from `activity_types` |
| `quantity` | yes | 95000 | |
| `unit` | yes | kWh | Any pint-parsable unit or known alias (§9.6) |
| `cost_inr` | no | 812000 | Money spent on this activity that month |
| `recycled_share` | materials only | 0.2 | 0–1; purchase rows are split into primary/secondary records |
| `distance_km` | transport only | 600 | If present with `quantity` in tonnes, engine computes t·km |
| `vehicle` | transport only | hgv | `hgv` or `lcv` |
| `notes` | no | | |

`scripts/make_template.py` generates the xlsx with a data-validation dropdown for `activity`, a second sheet "How to fill" in English and Gujarati, and 3 example rows.

### 9.3 Canonical activity types (seed `data/seed/activity_types.csv`)

| key | category | canonical unit | scope |
|---|---|---|---|
| grid_electricity | electricity | kWh | scope2 |
| solar_onsite_generation | electricity | kWh | — (informational, zero emissions) |
| diesel | fuel | L | scope1 |
| petrol | fuel | L | scope1 |
| furnace_oil | fuel | kg | scope1 |
| lpg | fuel | kg | scope1 |
| natural_gas | fuel | m**3 | scope1 |
| coal | fuel | kg | scope1 |
| biomass_briquettes | fuel | kg | scope1 |
| brass_input_primary | material | kg | scope3 |
| brass_input_secondary | material | kg | scope3 |
| copper_input | material | kg | scope3 |
| steel_input | material | kg | scope3 |
| aluminium_input_primary | material | kg | scope3 |
| aluminium_input_secondary | material | kg | scope3 |
| packaging_corrugated | material | kg | scope3 |
| packaging_plastic | material | kg | scope3 |
| cutting_oil | material | kg | scope3 |
| road_freight_hgv | transport | t*km | scope3 |
| road_freight_lcv | transport | t*km | scope3 |
| waste_metal_scrap_recycled | waste | kg | scope3 |
| waste_paper_recycled | waste | kg | scope3 |
| waste_general_landfill | waste | kg | scope3 |
| waste_hazardous_incineration | waste | kg | scope3 |
| water_supply | water | m**3 | scope3 |
| production_output | production | t (seed value; the engine uses `factories.output_unit`) | — |

Add sensible `synonyms` per row (English, Gujarati and Hindi transliterations, e.g. `{'units','kwh','bijli','વીજળી','बिजली'}` for grid electricity; `{'hsd','high speed diesel','dg fuel'}` for diesel; `{'fo','lshs'}` for furnace oil).

### 9.4 LLM column mapping (generic tables)

**Input to the LLM** (never the whole file): sheet names; for each sheet the first 15 rows as a grid; 5 sample data rows; the list of distinct values in any column that looks like an item/description column (max 200); the canonical activity types with units and synonyms.

**Output** — force a single tool call whose `input_schema` is this JSON schema (validate with Pydantic; on validation failure retry once with the error message; on second failure fall back to the manual mapping UI):

```json
{
  "sheet": "Purchase Register",
  "header_row_index": 3,
  "layout": "long",                          // "long" = one row per item; "wide" = months as columns
  "columns": {
    "date_or_month": "Date",
    "item": "Particulars",
    "quantity": "Qty",
    "unit": "Unit",
    "cost_inr": "Value"
  },
  "item_mappings": [
    {"source_label": "Brass Rod 12mm IS319", "activity_type": "brass_input_primary", "confidence": 0.82,
     "needs_user_input": ["recycled_share"]},
    {"source_label": "HSD", "activity_type": "diesel", "confidence": 0.95},
    {"source_label": "Office Stationery", "activity_type": null, "confidence": 0.9, "reason": "not an emission-relevant activity"}
  ],
  "questions_for_user": ["What share of your brass rod is made from recycled scrap?"]
}
```

The review UI shows every item mapping with a dropdown to change it, highlights confidence < 0.7 in amber, and asks the listed questions. Unmapped (`null`) items are ignored but listed. The confirmed mapping is saved in `uploads.mapping` and reused for future uploads with the same headers (match by header signature hash) so the user maps a Tally format only once.

### 9.5 Electricity bill extraction

Send the image/PDF to the vision model with a forced tool call using this schema:

```json
{
  "discom_name": "string|null",
  "consumer_number": "string|null",
  "tariff_category": "string|null",
  "billing_period_start": "YYYY-MM-DD|null",
  "billing_period_end": "YYYY-MM-DD|null",
  "units_kwh": "number|null",
  "units_kvah": "number|null",
  "solar_export_kwh": "number|null",
  "contract_demand_kva": "number|null",
  "max_demand_kva": "number|null",
  "power_factor": "number|null",
  "energy_charges_inr": "number|null",
  "fixed_or_demand_charges_inr": "number|null",
  "electricity_duty_inr": "number|null",
  "fuel_surcharge_inr": "number|null",
  "total_amount_inr": "number|null",
  "field_confidence": {"units_kwh": 0.0},
  "notes": "string|null"
}
```

Rules:
- Prompt: extract only values printed on the bill; use null when a field is not visible; never estimate.
- Review screen shows the bill image next to the extracted fields; low-confidence fields highlighted; user must confirm.
- Consumer number is shown masked except the last 4 digits.
- Monthly assignment: if the billing period sits within one month, assign to that month. If it spans two months, split kWh and charges proportionally by days (P1; for P0 assign to the month containing the period end).
- **Variable tariff** for savings calculations = (energy charges + electricity duty + fuel surcharge) ÷ kWh. Fixed/demand charges are excluded because efficiency fixes usually do not reduce them. Store the 12-month average on `factories.electricity_tariff_inr_per_kwh` (user-editable). If no bill exists, default to ₹8.0/kWh with `verified=false` badge.
- Sanity checks: kWh > 0; if both energy charges and kWh exist, implied ₹/kWh must be between 3 and 20, otherwise flag.

### 9.6 Validation and normalisation (all uploads)

| Check | Action |
|---|---|
| Unit missing or unparsable | Block row, ask user |
| Unit dimension mismatch (e.g. "kg" for electricity) | Block row |
| Known aliases | Map before pint: `units`→kWh, `ltr/lit/litre`→L, `MT/tonne/ton`→t, `scm/SCM`→m**3, `qtl/quintal`→100 kg, `KL`→1000 L |
| Negative or zero quantity | Flag |
| Duplicate (same month + activity + same value from different uploads) | Flag, suggest keeping one |
| Outlier: value > 3× or < ⅓× the median of the same activity | Flag as "check this" |
| Missing months in a 12-month window | Warn on dashboard; annualise from available months and label it |
| Transport given in tonnes + distance | Convert to t*km |
| Material purchase with `recycled_share` | Split into `_primary` and `_secondary` records |

All flags go into `uploads.issues` as `{row, field, code, message_key, severity}`; messages are i18n keys.

---

## 10. Calculation engine

### 10.1 Core formula

For every confirmed activity record in the period:

```
kgCO2e = quantity_canonical × emission_factor.kgco2e_per_unit
```

Store one `emission_results` row per record with a human-readable `formula` string using Indian number formatting.

### 10.2 Factor lookup (deterministic)

1. Candidate factors: same `activity_type`, `per_unit` equals the activity's canonical unit.
2. Region precedence: factory-specific region (e.g. `IN-GJ`) → `IN` → `GLOBAL`.
3. Within a region: the version whose `valid_from ≤ period_month` and (`valid_to` is null or `≥ period_month`), latest `valid_from` wins.
4. No factor found → record is excluded from totals and the dashboard shows "1 activity has no emission factor" with a fix link. Never guess.

Important: use one factor version consistently within a calculation run and across baseline vs progress comparisons (store factor ids in results).

### 10.3 Period and annualisation

Default period = the latest 12 consecutive months with any confirmed data. If fewer than 12 months exist, annual figures = sum × 12 ÷ months, and every annual number shows "annualised from N months".

### 10.4 Outputs (`calc_runs.summary`)

```json
{
  "total_kgco2e": 3123456.0,
  "annualised": false,
  "months": 12,
  "by_scope": {"scope1": 0, "scope2": 0, "scope3": 0},
  "by_category": {"electricity": 0, "fuel": 0, "material": 0, "transport": 0, "waste": 0, "water": 0},
  "by_activity": [{"activity_type": "brass_input_primary", "kgco2e": 0, "share": 0.0, "quantity": 0, "unit": "kg"}],
  "output_quantity": 540.0, "output_unit": "t",
  "intensity_kgco2e_per_output": 0,
  "energy_kwh_total": 0, "kwh_per_output": 0,
  "renewable_kwh": 0,
  "sankey": {"nodes": [{"name": "Scope 3"}], "links": [{"source": "Scope 3", "target": "Materials", "value": 0}]},
  "monthly": [{"month": "2026-04", "kgco2e": 0, "output": 0, "kwh": 0}],
  "unverified_factor_share": 0.0
}
```

`unverified_factor_share` = share of total emissions computed with `verified=false` factors; shown as a small note on the dashboard.

### 10.5 Seed emission factors (`data/seed/emission_factors.csv`)

**All values below are starting estimates for development. The team must verify at least the five largest drivers for the demo factory against the named sources and then set `verified = true`.** Fuel values are derived from IPCC 2006 default CO₂ factors × default net calorific values; confirm and add CH₄/N₂O if needed.

| activity_type | region | kgCO₂e per unit | unit | Source to verify against | verified |
|---|---|---|---|---|---|
| grid_electricity | IN | 0.710 | kWh | CEA CO₂ Baseline Database v21.0, FY2024-25 weighted average (provisional); confirm exact value on cea.nic.in | false |
| solar_onsite_generation | GLOBAL | 0 | kWh | by definition | true |
| diesel | GLOBAL | 2.68 | L | IPCC 2006 (74.1 tCO₂/TJ, NCV 43 GJ/t, density 0.84) | false |
| petrol | GLOBAL | 2.29 | L | IPCC 2006 | false |
| furnace_oil | GLOBAL | 3.13 | kg | IPCC 2006 residual fuel oil (77.4 tCO₂/TJ, NCV 40.4 GJ/t) | false |
| lpg | GLOBAL | 2.98 | kg | IPCC 2006 (63.1 tCO₂/TJ, NCV 47.3 GJ/t) | false |
| natural_gas | GLOBAL | 2.02 | m**3 | IPCC 2006 (56.1 tCO₂/TJ); depends on gas NCV | false |
| coal | IN | 1.55 | kg | IPCC 2006 (94.6 tCO₂/TJ) × typical Indian coal NCV; varies a lot, ask the user for GCV | false |
| biomass_briquettes | GLOBAL | 0.03 | kg | CH₄/N₂O only (biogenic CO₂ reported separately) | false |
| brass_input_primary | GLOBAL | 4.0 | kg | Placeholder; verify with ICE database / copper and zinc producer LCA data | false |
| brass_input_secondary | GLOBAL | 1.0 | kg | Placeholder; verify with ICE database / recycled brass supplier data | false |
| copper_input | GLOBAL | 3.8 | kg | Placeholder; verify with ICE / International Copper Association | false |
| steel_input | IN | 2.5 | kg | Placeholder for blast-furnace-heavy Indian steel; verify | false |
| aluminium_input_primary | IN | 18.0 | kg | Placeholder for coal-powered smelting; verify | false |
| aluminium_input_secondary | GLOBAL | 0.6 | kg | Placeholder; verify | false |
| packaging_corrugated | GLOBAL | 0.9 | kg | Placeholder; verify with DEFRA/ICE | false |
| packaging_plastic | GLOBAL | 2.3 | kg | Placeholder; verify | false |
| cutting_oil | GLOBAL | 1.5 | kg | Placeholder; verify | false |
| road_freight_hgv | GLOBAL | 0.10 | t*km | UK DEFRA conversion factors (HGV average laden); Indian-specific value preferred | false |
| road_freight_lcv | GLOBAL | 0.45 | t*km | DEFRA; verify | false |
| waste_metal_scrap_recycled | GLOBAL | 0.021 | kg | DEFRA (recycling, closed loop) | false |
| waste_paper_recycled | GLOBAL | 0.021 | kg | DEFRA | false |
| waste_general_landfill | GLOBAL | 0.47 | kg | DEFRA commercial & industrial waste to landfill | false |
| waste_hazardous_incineration | GLOBAL | 0.6 | kg | Placeholder; verify | false |
| water_supply | GLOBAL | 0.15 | m**3 | DEFRA; verify | false |

Also seed an older grid factor row (`IN`, 0.727, FY2023-24, CEA v20.0, `valid_to` = 2025-03-31) so factor versioning is visibly working.

---

## 11. Leak-point (hotspot) detection

### 11.1 Ranking

1. Rank activity types by kgCO₂e for the period.
2. `share = kg / total`; `cumulative_share` in rank order.
3. Leak points = the smallest set of top activities whose cumulative share reaches 80% (Pareto), capped at 5.
4. Severity label: share ≥ 25% → "major"; 10–25% → "significant"; else "minor".
5. For each hotspot, attach `fixes_available` = number of applicable interventions (§12.4) and the top one by cost per tonne.
6. If a benchmark exists for the factory's industry, show intensity vs benchmark band (low / typical / high) with "indicative" badge.

### 11.2 Energy-intensity drift (P1)

Series: monthly kWh per output unit.
- **Drift:** mean of the last 3 months vs mean of the 9 months before them. Flag if the increase is ≥ 10%. Message: "Electricity per tonne is up 14% in the last 3 months. Common causes: compressed-air leaks, idle machines left running, worn tooling."
- **Monthly anomaly:** robust z-score = 0.6745 × (x − median) ÷ MAD; flag |z| > 3.5.
- Apply the same to fuel per output unit when fuel data exists.

### 11.3 Circularity score (P1)

Each sub-score is 0–100. Show the formula in a tooltip.

| Sub-score | Formula | Weight |
|---|---|---|
| Material circularity | 100 × (secondary metal input kg + scrap remelted in-house kg) ÷ total metal input kg | 35 |
| Waste recovery | 100 × (recycled waste kg) ÷ (total waste kg) | 20 |
| Renewable energy | 100 × solar/renewable kWh ÷ total kWh used | 25 |
| Carbon intensity | min(100, 100 × benchmark typical intensity ÷ factory intensity); skip and re-weight if no benchmark | 20 |

Overall = weighted average of available sub-scores. Also show "biggest opportunity" = the sub-score with the largest (weight × (100 − score)).

---

## 12. Intervention library

### 12.1 Principles

- Interventions are **data, not code**: each row in `interventions` describes what it acts on (pool), how (effect type + parameters), what it costs (capex model), what it saves (savings model), with low / most-likely / high values for every uncertain number.
- The Python effect functions are generic and few (§12.3). Adding an intervention must never require new code unless it needs a new effect type.
- Every seeded intervention is `verified = false` until the team checks costs and effects against a real source (BEE/TERI SME cluster energy-audit reports, vendor quotes, the demo factory's own records).

### 12.2 Pools

A pool is a bucket of activity quantity that interventions act on. Pools are computed from the baseline calculation run.

| Pool key | Built from activity types | Unit |
|---|---|---|
| `grid_kwh` | grid_electricity | kWh |
| `melting_fuel` | furnace_oil, lpg, natural_gas, coal (whichever exist; energy content tracked in GJ using the NCVs used for the factors) | GJ (and per-fuel quantities) |
| `dg_diesel` | diesel | L |
| `brass_input` | brass_input_primary + brass_input_secondary (track `secondary_share`) | kg |
| `cutting_oil` | cutting_oil | kg |
| `hazardous_waste` | waste_hazardous_incineration | kg |
| `packaging` | packaging_corrugated + packaging_plastic | kg |
| `freight` | road_freight_hgv + road_freight_lcv | t*km |

### 12.3 Effect types (generic Python functions in `api/app/interventions/effects.py`)

Each function takes the current pool state and parameters (already sampled or set to mode) and returns the new pool state plus side effects. All are pure functions so the optimizer, the what-if simulator and Monte Carlo share the same code.

| effect_type | What it does | Key params |
|---|---|---|
| `reduce_fraction` | `qty ← qty × (1 − share_of_pool × reduction)` | `share_of_pool`, `reduction` |
| `fuel_to_electric` | Removes `fraction` of the pool's fuel; adds electricity `kWh = GJ_removed × fuel_efficiency ÷ electric_efficiency ÷ 0.0036` to `grid_kwh` | `fraction`, `fuel_efficiency`, `electric_efficiency` |
| `shift_to_secondary` | Sets `secondary_share ← min(0.95, max(current, level))` for level-based options, or `+ delta` for additive options | `levels` or `delta`, `price_diff_inr_per_kg` |
| `onsite_generation` | `generation = kWp × yield`; `offset = min(generation, remaining grid_kwh)`; reduces `grid_kwh` by `offset` and adds `solar_onsite_generation` | `levels_kwp`, `yield_kwh_per_kwp`, `max_kwp` (from roof area ÷ 10 m² per kWp if known) |

Side effects are listed in `effect_params.side_effects`, e.g. `{"pool": "grid_kwh", "per_unit_removed": 3.0}` for replacing diesel-generator power with grid-charged batteries.

**Fixed application order** (so results are deterministic and physically sensible): 1) all `reduce_fraction`, 2) `fuel_to_electric`, 3) `shift_to_secondary`, 4) `onsite_generation` last (solar is sized against the load that remains after efficiency fixes). Within the same step, apply in intervention code order.

### 12.4 Applicability rules (`api/app/interventions/matcher.py`)

An intervention is applicable to a factory if all hold:
1. `industries` contains `'*'` or the factory's industry.
2. Its pool exists with quantity > 0.
3. The pool's emissions are ≥ `applicability.min_pool_share` (default 1%) of total.
4. Every activity in `applicability.requires_activity` exists (e.g. induction furnace needs a melting fuel).
5. Level-based options only include levels above the current state (e.g. recycled share levels above the current share; solar levels ≤ `max_kwp`).

The matcher returns each applicable intervention with its standalone effect at mode values (reduction, capex, savings, payback, cost per tonne), used for the hotspot cards and MACC.

### 12.5 Savings models

| type | Annual savings formula |
|---|---|
| `energy_kwh` | kWh saved × factory variable tariff (§9.5) − `annual_opex_inr` |
| `fuel` | fuel units saved × fuel price (from the factory's own `cost_inr ÷ quantity` if available, else default price, badge "estimate") |
| `fuel_to_electric` | fuel cost removed − added kWh × tariff − `annual_opex_inr` |
| `material_price_diff` | kg shifted × `price_diff_inr_per_kg` (positive = cheaper) + `scrap_value_gain_inr_per_kg` × scrap kg where relevant |
| `cost_share` | pool's annual `cost_inr` × fraction removed (packaging, freight) |

Default fuel prices (all `verified=false`, prefer the factory's own data): diesel ₹90/L, furnace oil ₹55/kg, commercial LPG ₹75/kg, natural gas ₹50/m³.

### 12.6 Seed interventions (`data/seed/interventions.csv`)

Values are mode (low–high). Capex in ₹. **Starting estimates for a ~40-CNC brass components unit; verify before the demo.**

| code | Title | Pool / effect | Key effect params | Capex | Life (yr) | Difficulty | Circularity pts | Conflicts |
|---|---|---|---|---|---|---|---|---|
| CA_LEAK_FIX | Find and fix compressed-air leaks | grid_kwh / reduce_fraction | share 0.15 (0.10–0.25), reduction 0.20 (0.10–0.30) | 40k (20k–80k) | 2 | 1 | 0 | |
| CA_VFD_PRESSURE | Variable-speed compressor and lower line pressure | grid_kwh / reduce_fraction | share 0.15 (0.10–0.25), reduction 0.15 (0.08–0.25) | 3.5L (2.5L–5L) | 10 | 2 | 0 | |
| CNC_IDLE_STANDBY | Auto-standby for idle CNC machines, chip conveyors and coolant pumps | grid_kwh / reduce_fraction | share 0.45 (0.35–0.60), reduction 0.08 (0.04–0.12) | 1.5L (80k–3L) | 8 | 2 | 0 | |
| IE3_MOTORS | Replace old pump/compressor motors with IE3/IE4 | grid_kwh / reduce_fraction | share 0.20 (0.15–0.30), reduction 0.05 (0.03–0.08) | 3L (2L–4.5L) | 15 | 2 | 0 | |
| LED_LIGHTING | LED lighting with daylight sensors | grid_kwh / reduce_fraction | share 0.05 (0.03–0.08), reduction 0.50 (0.40–0.60) | 1.2L (80k–2L) | 8 | 1 | 0 | |
| SOLAR_ROOFTOP | Rooftop solar for own use | grid_kwh / onsite_generation | levels 25/50/75/100/150/200/300 kWp, yield 1500 (1350–1650) kWh/kWp/yr, O&M ₹500/kWp/yr | ₹45k per kWp (40k–55k) | 25 | 2 | 2 | |
| FURNACE_INSULATION | Better refractory, lids and insulation on the melting furnace | melting_fuel / reduce_fraction | share 1.0, reduction 0.12 (0.08–0.20) | 1.5L (1L–2.5L) | 5 | 2 | 0 | INDUCTION_FURNACE |
| FURNACE_HEAT_RECOVERY | Pre-heat combustion air or charge with furnace waste heat | melting_fuel / reduce_fraction | share 1.0, reduction 0.15 (0.10–0.25) | 4L (3L–6L) | 10 | 3 | 1 | INDUCTION_FURNACE |
| INDUCTION_FURNACE | Switch oil-fired melting to an induction furnace | melting_fuel / fuel_to_electric | fraction 1.0, fuel_eff 0.20 (0.15–0.30), electric_eff 0.65 (0.55–0.75) | 18L (12L–25L) | 15 | 4 | 0 | FURNACE_INSULATION, FURNACE_HEAT_RECOVERY |
| RECYCLED_BRASS_ROD | Buy higher recycled-content brass rod | brass_input / shift_to_secondary | levels 0.4 / 0.6 / 0.8, price_diff ₹0/kg (−₹10 to +₹15) | 50k (25k–1L) (supplier trials, testing) | 5 | 2 | 8 | |
| SWARF_SEGREGATION_LOOP | Segregate clean brass swarf by alloy and return it to the rod supplier (buy-back loop) | brass_input / shift_to_secondary | delta +0.15 (0.10–0.25), scrap value gain ₹20/kg (₹10–40) on swarf kg | 2L (1.2L–3L) (bins, chip wringer) | 8 | 2 | 10 | |
| CHIP_WRINGER_OIL | Centrifuge swarf to recover cutting oil | cutting_oil / reduce_fraction | share 1.0, reduction 0.30 (0.20–0.50) | 2.5L (1.5L–4L) | 10 | 2 | 6 | |
| COOLANT_RECYCLING | Coolant filtration and skimming to extend coolant life | hazardous_waste / reduce_fraction | share 1.0, reduction 0.40 (0.25–0.60) | 1.5L (1L–2.5L) | 8 | 2 | 6 | |
| REUSABLE_CRATES | Returnable crates for regular customers instead of cartons | packaging / reduce_fraction | share 0.5 (0.3–0.7), reduction 0.8 (0.6–0.9) | 1.5L (1L–2.5L) | 5 | 2 | 7 | |
| FREIGHT_CONSOLIDATION | Consolidate dispatches into fuller truckloads | freight / reduce_fraction | share 1.0, reduction 0.12 (0.05–0.20) | 20k (10k–50k) | 3 | 1 | 0 | |
| DG_REDUCTION | Battery backup for critical loads to cut diesel-generator running | dg_diesel / reduce_fraction | share 1.0, reduction 0.5 (0.3–0.7), side effect +3.0 kWh grid per litre removed | 6L (4L–9L) | 8 | 3 | 0 | |

Store Gujarati and Hindi titles/descriptions (generate with the LLM once, mark for human review).

---

## 13. Optimizer ("Build my plan")

### 13.1 Inputs

```json
{
  "budget_inr": 1000000,
  "target_reduction_pct": 20,            // optional
  "horizon_months": 24,                  // plans are for this window; used for payback filter
  "max_payback_months": 36,              // optional
  "max_difficulty": 4,                   // optional
  "weights": {"co2": 0.5, "savings": 0.3, "low_capex": 0.1, "circularity": 0.1},   // P1 sliders
  "excluded_codes": [], "forced_codes": []
}
```

### 13.2 Three plans returned

| Plan | Solver mode | Label in UI |
|---|---|---|
| A | `best_value`: maximise weighted score within budget (and target if given) | "Best value" |
| B | `min_capex_for_target`: minimise capex while reaching the target | "Lowest investment" (only if a target is set) |
| C | `max_reduction_in_budget`: maximise CO₂ cut within budget | "Biggest cut" |

Deduplicate identical plans and say so ("Best value and Biggest cut are the same plan").

### 13.3 Why it's not a simple sum (the core technical idea)

Two fixes on the same pool compound: cutting electricity 20% and then another 20% leaves 64%, a 36% cut, not 40%. Solar sized after efficiency fixes has less load to offset. Switching to an induction furnace removes oil but adds electricity. A naive sum overstates savings; this engine never does that.

### 13.4 Formulation

**Step 1 — Per-pool combinations.** For each pool, enumerate every feasible combination of its applicable interventions and levels (including "none"), respecting within-pool conflicts and requirements. For each combination compute, exactly and at mode values, using the effect functions: CO₂ reduction (kg), capex, annual savings, circularity points, max difficulty. Cap at 2,000 combinations per pool; if more, drop dominated combinations (another combination has ≥ reduction, ≥ savings and ≤ capex).

**Step 2 — MILP (OR-Tools `pywraplp`, SCIP or CBC).**

- Binary variable `y[p,c]` = 1 if combination `c` is chosen for pool `p`.
- Exactly one combination per pool: `Σ_c y[p,c] = 1`.
- Budget: `Σ capex[p,c] · y[p,c] ≤ budget`.
- Target (when used): `Σ red[p,c] · y[p,c] ≥ target_pct/100 × baseline_kg`.
- Payback filter (linear form): `Σ capex · y ≤ (max_payback_months / 12) × Σ savings · y`.
- Difficulty: exclude combinations containing interventions above `max_difficulty`.
- Cross-pool conflicts (a, b): `Σ_{c∋a} y + Σ_{c∋b} y ≤ 1`. Cross-pool requirement a needs b: `Σ_{c∋a} y ≤ Σ_{c∋b} y`.
- Forced/excluded codes: fix the corresponding sums to 1 or 0.
- Cross-pool side effects (e.g. induction furnace adds kWh) are included linearly in the combination's numbers using the baseline grid factor and tariff.

Objectives:
- `max_reduction_in_budget`: maximise `Σ red · y`.
- `min_capex_for_target`: minimise `Σ capex · y`.
- `best_value`: maximise `Σ y · (w_co2·red/R + w_sav·sav/S − w_capex·capex/B + w_circ·circ/C)` where R, S, B, C normalise each term by its maximum possible value.

**Step 3 — Exact re-evaluation.** Apply the chosen interventions to the baseline pools with the full sequential model (§12.3 order), including cross-pool side effects and the solar cap. These exact numbers are what the API returns and the UI shows. If the exact reduction misses the target, tighten the MILP target by the shortfall and re-solve (max 3 iterations); if still short, return the best result with `feasible = false`.

**Step 4 — Ledger ordering.** Order chosen interventions for implementation: lowest payback first (quick wins), respecting `requires`, and always solar after efficiency fixes on `grid_kwh`. Compute each item's **marginal** reduction and savings by applying items one at a time in that order, so the item values add up exactly to the plan total.

**Infeasible target.** If the target cannot be met within budget, return: the best reduction achievable within budget, and the minimum budget needed to reach the target (solve `min_capex_for_target` without the budget constraint). Message example: "A 20% cut needs about ₹14.2 L. With ₹10 L the biggest cut is 16.8%."

Performance goal: all three plans + re-evaluation in < 2 s for 20 interventions.

### 13.5 Uncertainty (Monte Carlo, P1)

For each returned plan: draw N = 1,000 samples (numpy, `seed = 42`) of every uncertain parameter from a triangular distribution (low, mode, high). Evaluate the exact sequential model vectorised. Report P10 / P50 / P90 for reduction, annual savings, capex and payback, and `prob_target_met` = share of samples meeting the target. UI shows ranges like "cuts 410–560 t a year (most likely 480 t)" and "82% chance of reaching your 20% target".

### 13.6 Budget frontier (P1)

Solve `max_reduction_in_budget` for 10 budgets from 0 to 150% of the user's budget. Return points `{budget, reduction_pct, annual_savings}` for a step chart titled "What more budget buys". Mark the user's budget.

---

## 14. MACC chart, what-if simulator, tracking

### 14.1 MACC chart

- For each applicable intervention, pick the level with the lowest cost per tonne (standalone on baseline).
- For conflicting pairs keep the cheaper per tonne.
- Sort by standalone cost per tonne, then compute **marginal** reduction and cost sequentially in that order (avoids double counting).
- `cost_per_tonne = (capex ÷ lifetime_years + annual_opex − annual_gross_savings) ÷ annual_tCO2_cut`. (Simple straight-line; discounting is P2.)
- Render with ECharts custom series: x = cumulative tCO₂ cut per year, bar width = that item's tCO₂, bar height = ₹ per tonne; bars below zero in leaf green ("pays for itself"), above zero in brass. Tooltip: title, t cut, ₹ per tonne, capex, payback.
- Highlight bars belonging to the currently selected plan.

### 14.2 What-if simulator

- Endpoint `POST /factories/{id}/simulate` takes lever settings, e.g. `{"SOLAR_ROOFTOP": {"kwp": 100}, "RECYCLED_BRASS_ROD": {"level": 0.6}, "CA_LEAK_FIX": true}` and optional direct overrides such as `{"brass_input.secondary_share": 0.5}`.
- Uses exactly the same effect functions as the optimizer.
- Returns before/after totals by category, total tCO₂e, intensity, capex, annual savings, payback.
- UI: one control per applicable lever (toggle, stepped slider for levels), debounced 300 ms, animated number change on the totals only.
- Button "Find the cheapest way below X t" calls the optimizer in `min_capex_for_target` mode with an absolute target.

### 14.3 Tracking (P1)

- User marks plan items as planned / in progress / done / dropped, with optional actual capex and dates.
- Progress uses **intensity** (kgCO₂e per output unit), so a busy month does not look like failure: `progress = (baseline_intensity − current_intensity) ÷ (baseline_intensity − target_intensity)`, clamped 0–100%. Current intensity = latest 3 months of confirmed data.
- Show a note when production in the latest 3 months differs from baseline by more than 20%.
- Chart: monthly intensity line with baseline and target lines, and markers where fixes were completed.

---

## 15. AI layer

### 15.1 Provider interface (`api/app/ai/provider.py`)

```python
class LLMProvider(Protocol):
    async def extract(self, *, task: str, system: str, content: list[ContentPart],
                      schema: type[BaseModel], model: str) -> BaseModel: ...
    async def stream_text(self, *, system: str, messages: list[Message], model: str) -> AsyncIterator[str]: ...
    async def chat_with_tools(self, *, system: str, messages: list[Message], tools: list[ToolSpec],
                              executor: Callable[[str, dict], Awaitable[dict]], model: str) -> AsyncIterator[ChatEvent]: ...
```

- Default implementation: `AnthropicProvider` using the `anthropic` SDK. Structured extraction = a single tool whose `input_schema` is the Pydantic model's JSON schema, with `tool_choice` forcing that tool; validate the tool input with Pydantic. Images and PDFs are sent as base64 content blocks.
- A second provider (e.g. Gemini) may be added by implementing the same interface; select with `LLM_PROVIDER`.
- Models come from env: `LLM_MODEL_SMART` (default `claude-sonnet-5`) and `LLM_MODEL_FAST` (default `claude-haiku-4-5-20251001`).

### 15.2 Tasks

| Task | Model | Input | Output | Fallback |
|---|---|---|---|---|
| T1 Column mapping | fast | Table preview (§9.4) | Mapping JSON | Manual mapping UI |
| T2 Bill extraction | smart | Bill image/PDF | Bill JSON (§9.5) | Manual entry form prefilled with nothing |
| T3 Plan explanation | smart | Plan JSON with pre-formatted numbers, top hotspots, locale | ≤ 180 words, plain language | Jinja template explanation |
| T4 Ask Decarbo chat (P1) | smart | User question + tools | Streamed answer | "I can't answer that from your data" |
| T5 Translation (offline script) | fast | UI strings, intervention text | gu / hi JSON | English |

### 15.3 Numeric grounding guardrail (applies to T3 and T4)

1. The engine formats every number it gives the LLM (Indian grouping, units) and keeps the set of allowed number strings.
2. System prompt: "Use only the numbers provided, copied exactly. Never compute, round differently, or add new numbers. If a number you need is not provided, say you don't have it."
3. After generation, extract all numbers from the output with a regex (Latin and Gujarati/Devanagari digits normalised to Latin). Every number must match an allowed number (ignoring grouping) or be a small ordinal (1–10) used for list order.
4. On failure: regenerate once with the offending numbers listed; on second failure use the template explanation. Log the event.

### 15.4 Plan explanation prompt (T3), outline

- Role: explain a factory decarbonisation plan to an Indian SME owner in `{locale}`; no jargon; if a technical term is needed, explain it in the same sentence.
- Structure: (1) where most CO₂ comes from, (2) what to do first and why (quick wins), (3) what the whole plan costs, saves and cuts, with the range, (4) one practical caution (e.g. trial recycled rod on one product line first).
- Tone: practical, respectful, like a trusted consultant; no hype, no emojis.

### 15.5 Chat tools (T4)

`get_inventory_summary()`, `get_hotspots()`, `get_applicable_interventions()`, `run_plan(budget_inr, target_pct?, max_payback_months?)`, `simulate(levers)`, `explain_number(emission_result_id)`. Tools call the same services the API uses. The chat only answers about the signed-in user's selected factory.

### 15.6 Privacy and cost controls

- Before the first upload, show a consent screen (DPDP): what is processed, that files are sent to an AI provider for extraction, how to delete data. Store `factories.consent_at`.
- Send the LLM only what the task needs. Never send consumer numbers or personal names to T3/T4.
- Cache T3 per plan and locale in `plans.explanation`.
- Rate limit LLM endpoints per user (e.g. 30 calls per hour) with a simple in-memory or Postgres counter.

---

## 16. API specification (FastAPI)

### 16.1 Conventions

- Base path `/api/v1`. JSON everywhere; streams use Server-Sent Events.
- Auth header `Authorization: Bearer <Supabase access token>`. Verify with the project's JWKS (`{SUPABASE_URL}/auth/v1/.well-known/jwks.json`, asymmetric keys) or, for legacy projects, the HS256 JWT secret; select by config. Check `aud = "authenticated"` and expiry.
- Dependency `require_factory_access(factory_id, min_role="viewer")` on every factory-scoped route; return 404 (not 403) when the user is not a member.
- Routes keyed by a child id (`/uploads/{id}`, `/activities/{id}`, `/plans/{id}`, `/adoptions/{id}`, `/emission-results/{id}`) first load the parent factory id, then apply the same check.
- Error body: `{"error": {"code": "UPLOAD_PARSE_FAILED", "message_key": "errors.upload_parse_failed", "details": {}}}`.
- Money in API responses: plain numbers in INR (no formatting). Formatting happens in the UI and in AI prompts via Python formatters.
- OpenAPI schema generated by FastAPI; generate the TypeScript client types with `openapi-typescript` into `web/lib/api-types.ts`.

### 16.2 Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | /health | Liveness + DB check |
| POST | /factories | Create factory (creator becomes owner) |
| GET | /factories | List my factories |
| GET / PATCH | /factories/{id} | Read / update profile, tariff, roof area |
| DELETE | /factories/{id} | Delete factory, all its rows and storage objects (owner only) |
| POST | /factories/{id}/uploads | Register an uploaded file `{storage_path, original_filename, kind}` |
| POST | /uploads/{id}/parse | Start parsing (background task) |
| GET | /uploads/{id} | Status, proposed mapping/extraction, issues |
| PUT | /uploads/{id}/mapping | Save user-edited mapping/extracted fields |
| POST | /uploads/{id}/confirm | Create confirmed activity records |
| GET / POST | /factories/{id}/activities | List (filter by month range, type) / create manual record |
| PATCH / DELETE | /activities/{id} | Edit / delete record |
| POST | /factories/{id}/calculate | Create calc run for a period (default last 12 months) |
| GET | /factories/{id}/calc-runs/latest | Latest run with summary |
| GET | /emission-results/{id} | Provenance: record, conversion, factor, formula |
| GET | /factories/{id}/hotspots | Ranked leak points with fixes available |
| GET | /factories/{id}/drift | Intensity series, drift and anomaly flags |
| GET | /factories/{id}/circularity | Score and sub-scores with formulas |
| GET | /interventions | Library (localised titles) |
| GET | /factories/{id}/interventions/applicable | Applicable fixes with standalone effects |
| POST | /factories/{id}/plans | Run optimizer; returns up to three plans and frontier |
| GET | /factories/{id}/plans | Plan history |
| GET | /plans/{id} | Plan with items |
| POST | /plans/{id}/select | Mark as the chosen plan; creates adoptions (planned) and a target |
| GET | /plans/{id}/explanation?locale=gu | Stream AI explanation (cached after first run) |
| GET | /factories/{id}/macc | MACC data |
| POST | /factories/{id}/simulate | What-if evaluation |
| POST | /plans/{id}/report | Render PDF `{locale}` → `{report_id, signed_url}` |
| GET / POST | /factories/{id}/adoptions | List / create |
| PATCH | /adoptions/{id} | Update status, dates, actual capex |
| GET | /factories/{id}/progress | Baseline, target, current intensity, progress % |
| POST | /factories/{id}/chat | Stream chat answer (P1) |
| GET | /emission-factors | Factor list with sources (for methodology page) |

### 16.3 Example: `POST /factories/{id}/plans` response

```json
{
  "baseline": {"total_kgco2e": 3950000, "intensity_kgco2e_per_output": 7315, "output_unit": "t"},
  "plans": [
    {
      "id": "…", "mode": "best_value", "feasible": true, "message": null,
      "totals": {
        "capex_inr": 780000, "annual_savings_inr": 410000, "payback_months": 22.8,
        "reduction_kgco2e": 812000, "reduction_pct": 20.6,
        "reduction_p10_pct": 16.9, "reduction_p90_pct": 24.1, "prob_target_met": 0.71
      },
      "items": [
        {"sequence": 1, "code": "CA_LEAK_FIX", "level": null, "capex_inr": 40000,
         "annual_savings_inr": 205000, "reduction_kgco2e": 18200, "payback_months": 2.3,
         "cost_per_tonne_inr": -10165, "cumulative_reduction_pct": 0.5, "verified": false}
      ]
    }
  ],
  "frontier": [{"budget_inr": 0, "reduction_pct": 0.0, "annual_savings_inr": 0}],
  "dedup_note": null
}
```
(Numbers are illustrative only.)

---

## 17. Frontend specification (React.js + Vite)

### 17.1 Routes (all under `/[locale]`, locales `en`, `gu`, `hi`)

| Route | Screen |
|---|---|
| `/` | Short landing page: the one-liner, a sample ledger screenshot, "Start free" |
| `/login` | Magic link + Google |
| `/onboarding` | 3-step wizard: factory basics → output unit & annual output → consent |
| `/f/[factoryId]` | Dashboard |
| `/f/[factoryId]/data` | Uploads, activity table, month coverage grid |
| `/f/[factoryId]/data/review/[uploadId]` | Review extracted bill or mapping |
| `/f/[factoryId]/inventory` | Full breakdown with provenance drawer |
| `/f/[factoryId]/plan` | Build my plan form + results |
| `/f/[factoryId]/plan/[planId]` | Plan detail: ledger, MACC, explanation, report download |
| `/f/[factoryId]/simulate` | What-if |
| `/f/[factoryId]/progress` | Tracking (P1) |
| `/f/[factoryId]/settings` | Profile, tariff, roof area, language, delete all data |

### 17.2 Key screens

**Dashboard.** Top strip: annual tCO₂e, tCO₂e per tonne of output, kWh per tonne, and (if any) "N% of this uses estimated factors". Below: Sankey flow chart (Scope → category → activity). Beside it on desktop, below on mobile: the ranked leak-point list as rows (not a card grid) — rank, name, share bar, t per year, severity, and the best fix with its payback ("Fix compressed-air leaks, pays back in ~2 months"). Drift banner when flagged. Primary action: "Build my plan". Empty state: "Add one electricity bill to see your first number" with the upload button.

**Data.** Two upload targets side by side: "Electricity bill (photo or PDF)" and "Excel, CSV or Tally export", plus "Download template". Upload history with status chips. A 12-month × category coverage grid (filled / missing). Editable activity table (TanStack Table) with filters.

**Review.** For bills: bill image left, extracted fields right, low-confidence fields outlined in amber, "Confirm" disabled until required fields are set. For tables: mapping table (source label → activity dropdown → confidence), unit column check, questions from the mapper, rows with issues listed with fixes.

**Provenance drawer.** Opens from any emission number: the records included, each formula line (`95,000 kWh × 0.710 kgCO₂e/kWh = 67,450 kgCO₂e`), factor source, version, year, and the "estimate" badge if unverified.

**Plan.** Form: budget (input accepts "10 L" or "10,00,000"), target % slider (optional), horizon, advanced (max payback, max difficulty, priority sliders). Results: three plan tabs with headline totals; the **Ledger** (§17.4); MACC chart; budget frontier; AI explanation with language switch; actions "Choose this plan" and "Download report".

**Simulate.** Left: levers grouped by pool. Right: before/after totals and category bars, capex, savings, payback. "Find the cheapest way below X t" button.

### 17.3 Frontend rules

- All API calls through `web/lib/api.ts` (typed from OpenAPI) with TanStack Query; attach the Supabase access token.
- Number formatting only via `web/lib/format.ts`: `formatINR(n)` (₹12,34,567), `formatLakh(n)` (₹12.3 L), `formatTonnes(kg)` (1 decimal t), with `Intl.NumberFormat('en-IN')`. Gujarati/Hindi locales keep Latin digits for numbers (clearer for business users); this is a setting in `format.ts`.
- Every chart has a "View as table" toggle (accessibility and judges who want the numbers).
- Mobile first: all core flows must work at 380 px width.

### 17.4 Design system

**Subject:** a ledger for a factory's carbon, used by practical business owners. The look is calm, precise and trustworthy, like good accounting software, with one memorable element: the plan ledger.

| Token | Hex | Use |
|---|---|---|
| `ink` | #1D2A45 | Primary text, navigation, primary buttons |
| `brass` | #A97A2B | Money figures, selected states, MACC positive-cost bars |
| `leaf` | #2D7A57 | Reductions, savings, "pays for itself" |
| `ember` | #B5432C | Emission hotspots, alerts |
| `paper` | #F7F8FA | App background |
| `rule` | #D6DAE1 | Borders and table rules |
| `muted` | #5A6478 | Secondary text |

- **Type:** IBM Plex Sans (400/500/600) for Latin with `font-variant-numeric: tabular-nums` on all figures; Hind Vadodara for Gujarati, Hind for Devanagari, both with line-height 1.6. Type scale 13 / 16 / 20 / 25 / 31 / 39 px.
- **Layout:** left-aligned content, max width 1200 px; desktop left navigation rail; mobile bottom tab bar (Dashboard, Data, Plan, Progress). Radius 6 px for inputs/buttons, 10 px for panels, 0 for the ledger.
- **Signature element — the Ledger:** the plan is shown as a ledger-style table. Columns: order, fix, invest (₹), saves per year (₹), cuts (t CO₂e per year), payback, running total cut (%). The running-total column carries a thin bar filling toward a target marker. The totals row is double-ruled like a ledger closing line. Each row expands to show why this fix, assumptions, range and source badge. Large tabular figures; everything else on the page stays quiet.
- **Colour meaning is consistent:** ember = emissions, leaf = reductions/savings, brass = money spent. Never rely on colour alone; pair with labels or icons.
- **Avoid:** grids of identical rounded cards with the same shadow, gradient washes, all-caps eyebrow labels, arrows appended to button text, cream backgrounds.
- **Copy:** sentence case, plain verbs that say what happens ("Upload bill", "Build my plan", "Download report in Gujarati"); the same action keeps the same name through the flow; errors say what happened and how to fix it; no apologies, no filler.
- **Motion:** only two moments — headline totals count up when a plan is built, and what-if totals animate on change. Respect `prefers-reduced-motion`.
- **Quality floor:** WCAG AA contrast, visible keyboard focus, all inputs labelled, works at 380 px.

---

## 18. PDF report (P1)

- Rendered server-side: Jinja2 HTML templates → WeasyPrint → uploaded to `reports/{factory_id}/{report_id}.pdf` → signed URL returned.
- Charts for the PDF are rendered as SVG with matplotlib (Sankey simplified to a stacked bar, MACC, category bars) so the PDF has no browser dependency.
- Pages: (1) cover: factory, period, date; (2) summary: total, intensity, top 3 leak points; (3) the plan ledger with totals and ranges; (4) MACC chart; (5) AI explanation in the chosen language; (6) methodology: formula, factor table with source/version/year, estimates flagged; (7) disclaimer: "Indicative estimate, not a certified audit."
- Fonts embedded with `@font-face` from `api/app/reports/fonts`. Acceptance test: Gujarati conjuncts such as "ક્ષ", "દ્ર", "શ્ર" render joined, not as separate glyphs (visually check a generated PDF and add a snapshot image test).
- Docker image for the API must include Pango and HarfBuzz system packages required by WeasyPrint.

---

## 19. Demo data (`scripts/generate_demo_data.py`)

Generates 12 months (Sep 2025 – Aug 2026) of monthly data for a **fictional** factory, writes `data/demo/demo_factory.xlsx` in the standard template format, 3 sample electricity bill PDFs with a generic layout (no real DISCOM logos or branding), and a Tally-style purchase register CSV for testing the mapper. Use a fixed random seed.

| Parameter | Value |
|---|---|
| Factory | "Sample Brass Components (demo)", Jamnagar, industry `brass_components`, 40 CNC machines, output unit `t` |
| Output | 45 t/month finished parts, −25% in Oct–Nov (festival season), ±8% noise |
| Brass rod purchase | 65 t/month, `recycled_share` 0.2 (set to the real factory's value when using real data) |
| Swarf sold | ≈ purchase − output, ~95% recovered → `waste_metal_scrap_recycled` |
| Grid electricity | 2,100 kWh per t output; **last 3 months +14% per t** (to trigger the drift alert: compressed-air-leak story) |
| Electricity cost | variable tariff ₹7.8/kWh (demo value) |
| DG diesel | 1,500 L/month, +30% in Jul–Aug (monsoon outages) |
| Furnace oil (small in-house casting line) | 1,100 kg/month |
| Cutting oil | 600 kg/month |
| Coolant/sludge waste (hazardous) | 900 kg/month |
| Packaging | corrugated 2,500 kg/month, plastic 400 kg/month |
| Freight | outbound HGV: output t × 550 km; inbound LCV: rod t × 40 km |
| General landfill waste | 1,200 kg/month |
| Roof area | 2,500 m² (solar cap ≈ 250 kWp) |

Expected shape with the seed factors: purchased brass is the largest leak point, electricity second, everything else small. **Do not tune emission factors to make the story look better.** Material factors dominate this factory's total, so verify them first. If the real factory already buys mostly recycled brass (common in Jamnagar), use the real share; the plan will then lean on energy fixes, and real numbers beat a pretty story.

For the event, prefer the real partner factory's data with the owner's written permission; mask the consumer number on bills.

---

## 20. Non-functional requirements

| Area | Requirement |
|---|---|
| Performance | Dashboard API < 500 ms; calculate < 2 s for 12 months × 30 activities; three plans < 3 s; what-if < 500 ms; bill extraction < 20 s with progress shown |
| Security | RLS on all factory tables; `require_factory_access` on all routes; CORS limited to the web origin; uploads ≤ 10 MB and only xlsx/csv/pdf/jpg/png/heic; signed URLs expire in 10 minutes; secrets only in server env |
| Privacy (DPDP) | Consent before first upload; "Delete all my factory data" removes rows and storage objects; Supabase region Mumbai; minimal data to LLMs; no personal names or consumer numbers in AI prompts |
| Reliability | Parsing runs as a background task with status; confirm is idempotent; engine functions are pure and deterministic |
| Observability | Structured JSON logs with request id; log each LLM call's task, model, latency, token counts and guardrail result, without file contents |
| i18n | next-intl messages for en/gu/hi; missing keys fall back to English; server-side report strings in `api/app/i18n` |
| Accessibility | WCAG AA, keyboard navigation, labelled inputs, "View as table" for every chart |

---

## 21. Testing

**API (pytest)**
- Units: `1 MWh → 1,000 kWh`; `qtl → 100 kg`; `KL → 1,000 L`; dimension mismatch raises.
- Calculator golden values: `1,000 kWh × 0.710 = 710 kgCO₂e`; `100 L diesel × 2.68 = 268 kgCO₂e`; factor precedence `IN-GJ > IN > GLOBAL`; version selection by month; missing factor excluded and reported.
- Effects: two 20% `reduce_fraction` on one pool → 36% total; solar offset capped at remaining load; `fuel_to_electric` energy balance; secondary share capped at 0.95.
- Optimizer: on random instances with ≤ 12 interventions and no cross-pool side effects, MILP optimum equals brute-force optimum; infeasible target returns best-in-budget and minimum budget needed; ledger items sum exactly to plan totals; three plans in < 3 s for 20 interventions.
- Monte Carlo: reproducible with seed; P10 ≤ P50 ≤ P90; if low = mode = high, result equals the deterministic value.
- Ingestion: template fixture; unit aliases; Tally-like fixture with the LLM mocked (recorded JSON); bill extraction with mocked provider; one optional live test marked `@pytest.mark.live`.
- Guardrail: output containing an unlisted number is rejected; Gujarati digits normalised.
- Auth: for every router, user B gets 404 on user A's factory.

**Web**
- Vitest: `formatINR(1234567) === "₹12,34,567"`, `formatLakh(1250000) === "₹12.5 L"`, crore formatting.
- Playwright hero flow: sign in (test user) → onboarding → upload demo template → confirm → dashboard total visible → build plan (₹10 L, 20%) → ledger visible → switch to Gujarati → download PDF.

---

## 22. Build phases and acceptance criteria

Time estimates assume a 3–4 person team in a ~36-hour event. **Definition of done for every phase:** tests for that phase pass, lint passes, `docs/PROGRESS.md` updated, and UI phases are verified in the browser.

| Phase | Scope | Acceptance criteria | Est. |
|---|---|---|---|
| 0 Setup | Repo structure (§7), `.env.example`, Supabase project in Mumbai, migrations 0001–0003, FastAPI `/health`, React.js (Vite) with login, lint config | Sign in works; `/health` returns DB ok; an RLS test shows user B cannot read user A's factory | 1.5 h |
| 1 Seed data | Seed CSVs (§9.3, §10.5, §12.6), `seed.py` (idempotent), `generate_demo_data.py`, `make_template.py` | Seeding twice gives identical counts; demo xlsx, sample bills and Tally CSV generated | 1 h |
| 2 Engine | Units, factor lookup, calculator, calc runs, provenance, hotspots | Golden tests pass; demo factory total computed; every result has a formula string | 3 h |
| 3 Ingestion | Template parser, validation, LLM mapper, bill extractor, review screens, activity table, coverage grid | Demo template → confirmed records; Tally fixture ≥ 90% items mapped correctly; sample bill → correct kWh and period; issues visible and fixable | 4 h |
| 4 Dashboard | Top strip, Sankey, leak-point list, provenance drawer, empty states, i18n scaffolding | Browser-verified; UI numbers equal API numbers; "View as table" works | 3 h |
| 5 Optimizer | Pools, effects, matcher, combinations, MILP, exact re-evaluation, ordering, infeasible handling, plans API | All optimizer tests pass; three plans < 3 s; ledger sums exactly to totals | 5 h |
| 6 Plan UI | Plan form, three plan tabs, Ledger, MACC, choose plan | Browser-verified full flow; MACC shows below-zero bars for money-saving fixes | 3 h |
| 7 What-if | Simulate API + UI | Lever changes update in < 500 ms; same selection gives the same numbers as the plan | 2 h |
| 8 AI explanation | Provider interface, T3 explanation streaming en/gu/hi, guardrail, template fallback | Explanation streams in Gujarati; guardrail tests pass; app fully works with `LLM_ENABLED=false` | 2 h |
| 9 PDF report | WeasyPrint templates, charts, fonts, download | Gujarati PDF renders joined conjuncts; methodology page lists factor sources | 2 h |
| 10 P1 extras | In this order: Monte Carlo ranges → priority sliders → drift alert → budget frontier → circularity score → tracking → chat | Each item browser-verified before starting the next | remaining time |
| 11 Deploy & rehearse | Deploy (§23), seed demo on prod, Playwright on deployed URL, README | Hero flow passes on the deployed URL; demo rehearsed 3 times under 90 s | 2 h |

---

## 23. Environment and deployment

### 23.1 Environment variables (`.env.example`)

```
# api
DATABASE_URL=postgresql+psycopg://...        # Supabase session pooler connection string
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_JWT_MODE=jwks                        # jwks | secret
SUPABASE_JWT_SECRET=                          # only if mode=secret (legacy projects)
SUPABASE_SERVICE_ROLE_KEY=                    # server only: storage signed URLs, admin tasks
ANTHROPIC_API_KEY=
LLM_PROVIDER=anthropic
LLM_ENABLED=true
LLM_MODEL_SMART=claude-sonnet-5
LLM_MODEL_FAST=claude-haiku-4-5-20251001
CORS_ORIGINS=http://localhost:3000
RATE_LIMIT_LLM_PER_HOUR=30
DEFAULT_TARIFF_INR_PER_KWH=8.0

# web
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=               # or the project's publishable key
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
```

### 23.2 Deployment options

- **Option A (VPS):** `docker-compose.yml` with `api` (uvicorn, 2 workers; image includes Pango/HarfBuzz for WeasyPrint), `web` (`next start`), and `caddy` (automatic HTTPS; `/api/*` → api, everything else → web).
- **Option B (managed):** web on Vercel, api on Railway or Render (Docker), same env vars.
- Supabase free projects pause after a period of inactivity; open the project the day before judging or use a paid tier during the event.

---

## 24. Demo, pitch and moat

### 24.1 90-second demo script

1. Upload a real bill photo → fields appear → confirm (15 s).
2. Upload the Excel/Tally export → mapping confirmed → dashboard fills in (15 s).
3. "Purchased brass is 70% of your footprint; electricity per tonne is up 14% in three months." Click a number → formula and source (15 s).
4. Build my plan: ₹10 L budget, 20% target → three plans → the Ledger with payback and ranges (20 s).
5. MACC: "these fixes pay for themselves" (10 s).
6. What-if: drag recycled-rod share → totals move (10 s).
7. Switch to Gujarati → download the PDF (5 s).

### 24.2 Pitch lines

- "Give us your bills and your budget. We tell you the cheapest way to cut your factory's CO₂."
- "Every number is traceable to a government or IPCC factor. Turn the AI off and the product still works."
- "Built with a real Jamnagar brass unit's data."

### 24.3 Moat (for the startup story)

1. India-specific intervention library that improves with every real before/after result.
2. Cluster benchmarks that only exist with many factories on the platform.
3. Integrations SMEs already use (Tally, DISCOM bills, ERP, machine data) that make switching painful.
4. Distribution through large buyers who need supplier emissions data.
5. Verified savings that can later unlock green loans or carbon credits.

---

## 25. Risks and open questions

| Risk | Mitigation |
|---|---|
| Hackathon rules may forbid code written before the event | Check HackOut'26 rules. If pre-built code is not allowed, prepare only research, seed CSVs, factor verification and this PRD beforehand |
| Seed factors or costs are wrong | `verified` flags, estimate badges, verify the top drivers before the demo, show sources on every number |
| LLM misreads a bill or mapping | Mandatory human confirmation, confidence highlighting, sanity checks, manual fallback |
| Gujarati translations sound unnatural | A native speaker reviews UI strings and the report template before the demo |
| Real factory data permission | Written permission from the owner; mask identifiers; fall back to the generated demo factory |
| Carbon trading (CCTS) and buyer-reporting rules change | Verify current status before quoting any regulation in the pitch; keep regulatory claims out of UI copy |
| Scope creep | P0 first; P1 in the listed order only after P0 is demo-ready |
