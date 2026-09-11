---
description: Build the next Decarbo phase from docs/PRD.md, test it, and update progress
---

1. Read `docs/PROGRESS.md` to find the last completed phase. If the file is empty or missing, the next phase is Phase 0.
2. Read PRD §22 for the next phase's scope and acceptance criteria, then read every PRD section that phase depends on.
3. Write a short implementation plan (files to create/change, tests to write) as an artifact and wait for approval before coding.
4. Implement the phase in small steps. Write the tests listed in PRD §21 for this phase alongside the code.
5. Run the full test suite and linters (`uv run pytest`, `uv run ruff check`, `pnpm test`, `pnpm lint`). Fix all failures.
6. For UI phases, open the app in the browser and walk through the acceptance criteria. Capture screenshots.
7. Check the non-negotiables in `.agents/rules/decarbo-rules.md` against the new code (hardcoded factors, math in React, missing i18n, missing access checks).
8. Update `docs/PROGRESS.md` (phase, done, pending, known issues, how to run/test) and add any judgement calls to `docs/DECISIONS.md`.
9. Commit with the message `phase-N: <summary>` and report what was built, test results, and anything that needs a human decision.
