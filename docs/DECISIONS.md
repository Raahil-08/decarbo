# Decisions

| Date | Decision | Reason |
|---|---|---|
| 2026-09-11 | Shift frontend framework from Next.js (App Router) to React.js SPA (Vite) | User preference, simpler single-page architecture for Hackathon. |
| 2026-09-12 | Use reportlab in Python API for demo bill PDF generation | Enables deterministic, programmatic generation of realistic GUVNL/PGVCL electricity bill PDFs with accurate consumption tables and tariff structures. |
| 2026-09-12 | Add unique constraint on benchmarks(industry, metric) in migration 0004 | Ensures idempotent upsert in seed script and seed.sql without duplicating benchmark metrics. |
| 2026-09-12 | Define custom units (scm, quintal, kiloliter) in Pint registry | Supports standard Indian SME industrial unit abbreviations without string scaling syntax issues. |
| 2026-09-12 | Store leak points, drift analysis, and circularity directly in calc_runs.summary | Allows sub-500ms dashboard retrieval in a single DB query while keeping raw provenance in emission_results. |

