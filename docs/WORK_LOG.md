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
