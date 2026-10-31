# Work log

Newest at the bottom. Each entry: what was done, why, what is next.

## 2026-10-31
- Viraj gave his rules (GitHub Desktop only, ask before commit/push, no secrets in chat, public repo, old project read-only,
  avoid the old 17:00 IST job, keep CLAUDE.md + this log) and the full spec for a Swing Trading Dashboard.
- Read the old Stock-Live-Dashboard (read-only) for Angel One login, rate limits, NSE/BSE behaviour and its job times.
- Checked equitytimer.com: robots.txt allows all, but Terms forbid scraping + redistribution -> not used; NSE official classification instead.
- Wrote `docs/PLAN.md` (phases, decisions, folder structure, size estimate ~160 MB start / ~50 MB per year, manual list) and `CLAUDE.md`.
- NEXT: Viraj's OK on the plan (especially daily time 20:15 IST). Then Phase 2: create the repo with GitHub Desktop, then the source probe.
- Viraj: "Ha, continue" (plan + 20:15 IST OK). Phase 2 started.
- Python 3.11 venv at `C:\Users\hello\venvs\swing-trading` (outside OneDrive so OneDrive does not sync thousands of package files).
- Skeleton: .gitignore, .env.example, requirements, README, `swingdash/http.py` (polite session: pause per site, retry + exponential
  backoff), `scripts/check_secrets.py`, `scripts/probe_sources.py`, workflows `tests.yml` + `probe.yml` (manual), 11 tests green.
- PC probe: 18 of 21 checks OK. Found working NSE index history (`historicalOR/indicesHistory`), BSE index list (`FillddlIndex`) and
  BSE history (`IndexArchDaily?index=SENSEX`). niftyindices old address dead. Summary in `docs/SOURCES.md`.
- NEXT: Viraj creates + publishes the repo with GitHub Desktop (public), adds the 4 Secrets, runs "Source probe" on GitHub.
- GitHub Desktop "Add local repository -> create a repository" made a NESTED folder `Swing Trading\Swing Trading` (only .gitattributes,
  commit "Initial commit"). Fixed by moving all project files into it. **Repo folder = `C:\Users\hello\OneDrive\Documents\Swing Trading\Swing Trading`.**
  Lesson: for an existing folder, use File -> New repository with Local path = the PARENT folder and Name = the folder's name.
- Viraj committed ("phase 2") and published: https://github.com/virajpatel27/Swing-Trading-Dashboard (public). Tests run on GitHub: green.
- Added `docs/MANUAL_CHECKLIST.md` (secret names, where they come from; old project uses a SmartAPI app of type "Historical Data").
- NEXT: Viraj adds the 4 Secrets, runs Actions -> Source probe; then I read its Summary and finish Phase 2.
- SmartAPI site now shows ONE API key per account ("Add app" gives no new key) -> same key as the old project. Checklist updated.
- Viraj added the Secrets and ran Source probe (run 41192953532): failed before writing a report. Cause: `smartapi-python` imports
  `logzero` and `websocket` but does not install them. Fixed: both in requirements.txt, a test that imports the SDK, and the SDK import +
  login moved inside the check (a broken install is now a "NO" row, not a crash). Actions bumped to checkout@v5 / setup-python@v6 /
  upload-artifact@v5 (Node 20 deprecation warning). Job logs need admin rights; annotations + step results are readable without a token.
- NEXT: Viraj commits + pushes, runs Source probe again.
- Pushed "Fix probe: Angel SDK libraries" (15b1d1b); Tests green; Source probe run 41193655907 = success. But its Summary page and the
  artifact are visible only to a signed-in user. -> probe now also prints its whole table as ONE `::notice` annotation, readable via
  `api.github.com/repos/.../check-runs/<job id>/annotations` without a token. upload-artifact -> v6 (v5 still Node 20). 13 tests green.
- NEXT: Viraj commits + pushes this, runs Source probe again; I read the annotation and close Phase 2.
