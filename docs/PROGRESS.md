# Progress

| Phase | Status | Notes |
|---|---|---|
| 0 Setup | done | Database schema & RLS applied, FastAPI with auth & health check, React (Vite) frontend with login & landing, all tests passing. |
| 1 Seed data | not started | |
| 2 Engine | not started | |
| 3 Ingestion | not started | |
| 4 Dashboard | not started | |
| 5 Optimizer | not started | |
| 6 Plan UI | not started | |
| 7 What-if | not started | |
| 8 AI explanation | not started | |
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

