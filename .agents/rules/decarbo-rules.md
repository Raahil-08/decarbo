---
trigger: always_on
---

# Decarbo — project rules (always on)

You are building Decarbo, a carbon "leak-point" finder and decarbonisation planner for Indian SME factories (HackOut'26, PS10). The full specification is `docs/PRD.md`. It is the single source of truth. Read the relevant PRD sections before every task.

## Workflow
- Build in the phase order of PRD §22. Never start a phase before the previous phase's acceptance criteria pass.
- After each phase, update `docs/PROGRESS.md` (phase, done, pending, known issues, how to run/test).
- Record every judgement call in `docs/DECISIONS.md` (date, decision, reason). When the PRD is ambiguous, choose the simplest option that meets the acceptance criteria.
- Verify every UI phase in the browser before marking it done.
- Prefer small, tested vertical slices over broad unfinished scaffolding.

## Stack (do not substitute without a DECISIONS.md entry)
- web/: Next.js App Router + TypeScript, Tailwind + shadcn/ui (customised tokens), TanStack Query, react-hook-form + zod, ECharts (echarts-for-react), next-intl (en, gu, hi), @supabase/ssr.
- api/: Python 3.12, FastAPI, Pydantic v2, SQLAlchemy 2 + psycopg 3, pint, pandas, openpyxl, pdfplumber, OR-Tools (pywraplp), numpy, Jinja2 + WeasyPrint, anthropic SDK behind an LLMProvider interface. Package manager: uv.
- Supabase (Mumbai region): Postgres + RLS, Auth, Storage. Schema lives in `supabase/migrations/*.sql`; SQLAlchemy models mirror it (no autogenerate).
- Tests: pytest, Vitest, Playwright. Lint: ruff, ESLint + Prettier.

## Non-negotiables
1. The LLM never calculates or invents numbers. All emissions, costs, savings, paybacks and percentages come from the Python engine. The LLM only extracts, maps, explains and translates.
2. Every emission number is traceable: record → unit conversion → factor (source, version, year) → result. Store the formula string.
3. Never hardcode emission factors, prices or intervention parameters in code. They live in seeded tables (`data/seed/*.csv`).
4. Convert all quantities with pint to canonical units before any calculation.
5. Reductions on the same pool compound; never add percentages. Apply effects in the fixed order: reduce_fraction → fuel_to_electric → shift_to_secondary → onsite_generation.
6. All business logic in FastAPI. No calculations in React. No Supabase Edge Functions.
7. The service-role key never reaches the browser. RLS on every factory table. Every factory-scoped API route uses `require_factory_access`; return 404 for non-members.
8. Money: INR with Indian grouping (₹12,34,567 / ₹12.3 L) via `web/lib/format.ts` and the Python formatter. Emissions stored in kgCO2e at full precision, shown in tCO2e with 1 decimal.
9. No hardcoded UI text. Every string goes through next-intl (en, gu, hi); English fallback.
10. Values with `verified = false` show an "estimate" badge wherever they drive a displayed number.
11. The app must fully work with `LLM_ENABLED=false` (manual mapping, manual bill entry, template explanation).
12. AI text (plan explanation, chat) passes the numeric grounding guardrail: every number in the output must come from the engine-provided set; otherwise regenerate once, then fall back to the template.

## Code conventions
- Python: type hints everywhere, pure functions in `engine/`, `interventions/effects.py` and `optimizer/`; routers stay thin and call services. Pydantic models for every request/response. No bare `except`.
- TypeScript: strict mode; API types generated from FastAPI OpenAPI via openapi-typescript into `web/lib/api-types.ts`; all fetches through `web/lib/api.ts`.
- Error body shape: `{"error": {"code", "message_key", "details"}}`.
- Deterministic tests: fixed random seeds; LLM calls mocked in tests except those marked `@pytest.mark.live`.
- Commit messages: `phase-N: <what>`.

## Design (PRD §17.4)
- Tokens: ink #1D2A45, brass #A97A2B, leaf #2D7A57, ember #B5432C, paper #F7F8FA, rule #D6DAE1, muted #5A6478. Ember = emissions, leaf = reductions/savings, brass = money spent; never colour alone.
- Fonts: IBM Plex Sans (tabular numerals for figures), Hind Vadodara (Gujarati), Hind (Devanagari), self-hosted.
- The plan Ledger is the one signature element; keep everything else quiet.
- Avoid: identical rounded card grids with the same shadow, gradient washes, all-caps eyebrow labels, arrows appended to button text, cream backgrounds.
- Sentence-case copy with plain verbs; errors say what happened and how to fix it. Mobile first (380 px). WCAG AA. "View as table" on every chart.

## Things not to build
IoT hardware, blockchain, carbon-credit trading, supplier portals, certified-audit claims, CBAM claims for brass. P2 features in PRD §4 only after all P0 and P1 items are done.
