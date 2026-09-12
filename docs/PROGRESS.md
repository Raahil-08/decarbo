# Progress

| Phase | Status | Notes |
|---|---|---|
| 0 Setup | done | Database schema & RLS applied, FastAPI with auth & health check, React (Vite) frontend with login & landing, all tests passing. |
| 1 Seed data | done | 26 activity types (EN/GU/HI), 26 emission factors (CEA FY24-25 & FY23-24 versioned), 16 interventions, 4 benchmarks. Idempotent scripts/seed.py + supabase/seed.sql. Standard upload template decarbo_template.xlsx with dropdown data validation and bilingual guide. scripts/generate_demo_data.py generates 12-month demo_factory.xlsx (with Diwali dip & +14% electricity drift), tally_purchase_register.csv, and 3 realistic electricity bill PDFs. |
| 2 Engine | done | Pure deterministic engine: unit conversion with pint & SME aliases; factor resolution with region precedence (IN-GJ > IN > GLOBAL) & version validity; emissions calculation with formula strings (Indian grouping) and provenance; 80% Pareto leak-point finder; energy-intensity drift & MAD anomaly detector; 4-pillar circularity score; intervention effects with compounding & ordering; calc runs API. 18 automated tests passing in 0.35s with zero LLM calls. |
| 3 Ingestion | done | Template parser with unit validation, recycled split & transport t*km; generic table parser for Tally exports (≥90% offline mapping accuracy); electricity bill extractor (PDF kWh, billing period, masked consumer number, variable tariff calculation); uploads & parsing API with monthly record aggregation; UploadModal, ReviewScreen (template table, Tally item mapping, bill receipt ledger), 12-month CoverageGrid, and ActivityRecordsTable with Indian number formatting and verification badges. 22 pytest tests passing. |
| 4 Dashboard | done | TopStrip (annual tCO2e, carbon intensity, kWh/t, estimated factor share badge); ECharts Sankey flow diagram (Scope → Category → Activity) with dedicated "View as table" toggle; ranked Pareto 80% leak-point rows with recommended fixes & payback periods; energy intensity drift alert banner (+14% electricity drift); ProvenanceDrawer displaying exact formula strings, CEA/IPCC factor sources, versions & years; EmptyDashboard with one-click bill upload & demo seed; full multilingual scaffolding (English, Gujarati, Hindi). 24 pytest tests passing. |
| 5 Optimizer | done | Applicability matcher (`matcher.py`), per-pool combinations with compounding & dominance filtering (`combinations.py`), Google OR-Tools MILP SCIP solver (`solver.py`) with 3 plans (Best value, Lowest investment, Biggest cut) & shortfall messages, exact sequential re-evaluation loop with iterative target tightening, implementation Ledger with quick-wins ordering & marginal calculations (items sum exactly to plan totals with 0.00% gap), MACC curve generator (`macc.py`), and Plans API router (`plans.py`) with tenant isolation. 31/31 backend tests passing in < 0.6s. |
| 6 Plan UI | done | PlanForm with Indian budget parsing (`10 L`, `1.5 Cr`), target reduction slider, horizon selector, advanced params (max payback, difficulty filter, priority weights). PlanResults with 3 plan selector tabs (Best Value, Lowest Investment, Biggest Cut), headline totals cards (Investment, CO2 Cut, Savings, Payback, 5-Year Net ROI), shortfall/duplicate alerts. Signature PlanLedger with radius 0, tabular numerals, running-total fill bar with target marker, expandable detail rows (level, marginal cost/tonne, added grid kWh, precise kgCO2e), double-ruled closing totals. MaccChart (ECharts) with below-zero money-saving bars in leaf green ("Pays for itself") and above-zero bars in brass, rich tooltip, highlight for selected plan items, "View as table" toggle. "Choose this plan" with PATCH persistence and active badge. GET `/factories/{id}/macc` endpoint. Full i18n (en, gu, hi). 31 backend tests passing, frontend builds clean, 0 lint errors. |
| 7 What-if | done | Dedicated `POST /factories/{id}/simulate` endpoint executing exact compounding effect functions in fixed sequence (efficiency → fuel-to-electric → secondary-share → solar). Sub-20ms execution times (4.4 ms – 18.4 ms, beating <500ms SLA). WhatIfPage UI with category filters, master toggle switches, stepped capacity pills (50–100 kWp, recycled %), standalone impact tooltips, and bulk actions (Turn on all / Reset all). Real-time KPI outcome cards (Emissions cut, Projected footprint, Capex, Savings, Payback, 20% target bar, speed badge), Scope 1/2/3 and pool before/after comparisons with "View as table" toggle, and direct CTA to Decarbonisation Planner. 40/40 pytest tests passing in 0.73s, 0 ruff errors, 0 TS build errors, verified in browser. |
| 8 AI explanation | done | Provider abstraction (`LLMProvider`, `AnthropicProvider`, `MockProvider`) with `LLM_ENABLED=false` offline mode. Strict numeric grounding guardrail normalizing Gujarati (`૦-૯`) & Devanagari (`०-९`) digits, validating all extracted figures against engine-allowed numbers. Multilingual 4-part plan explanation (en, gu, hi) with Jinja2 deterministic template fallback. SSE streaming (`GET /plans/{id}/explanation`), user rate-limiting (30/hr), and DB caching in `plans.explanation`. PlanExplanationCard with language toggle, live SSE stream, provenance badges (Verified Grounded / Deterministic Template / Cached), and manual regenerate. 49 pytest tests passing, 0 ruff errors, 0 TS errors. |
| 9 PDF report | not started | |
| 10 P1 extras | not started | |
| 11 Deploy & rehearse | not started | |

## Known issues
None.

## How to run

### Backend
```bash
cd api
uv run pytest
uv run ruff check .
uv run uvicorn app.main:app --reload
```

### Frontend
```bash
cd web
pnpm lint
pnpm build
pnpm dev
```

