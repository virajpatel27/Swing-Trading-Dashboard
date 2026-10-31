# CLAUDE.md - Swing Trading Dashboard (read this first, every session)

## The person you work for
Viraj. **Not a programmer.** Answer in Gujarati-English mix (Latin letters), short, step by step, exact click paths.
**One question at a time.** Work in phases: after each phase summarize, run tests, wait for his "continue".

## Hard rules
1. **Git:** Viraj commits and pushes with **GitHub Desktop** (terminal push fails on his PC). Never `git push` / `gh` CLI. Repo is created with GitHub Desktop too.
   Always ask before a commit/push. (The bot commits of the daily Action are part of the design.)
2. **Secrets:** never ask for a secret (API key, PIN, TOTP) in chat. Only say which GitHub Secret name to fill; he types the value himself.
   Never in code, logs, reports. `.env` locally (git-ignored), `.env.example` in the repo.
3. **Repo is PUBLIC** (free Pages + free Actions minutes): only public market data in it.
4. **Old project** `C:\Users\hello\OneDrive\Documents\GitHub\Stock-Live-Dashboard`: read it to learn (Angel One login, rate limits, NSE/BSE fetch),
   **never change anything in that folder**.
5. **Same Angel One account** as the old project. Its jobs: weekdays 17:00 IST (can start 30-90 min late, run up to 2.5 h), 23:00 and 04:00 IST daily,
   09:00 IST instrument master, Sunday 02:00 IST backup. Our daily job: **20:15 IST** (`45 14 * * 1-5` UTC). Never schedule at 17:00 IST.
6. **equitytimer.com is not used**: its Terms (sections 7 + 8) forbid scraping and redistribution. Sectors come from NSE's official classification.
7. Never overwrite good data with empty/failed data. Validate before every data commit.
8. Indicators always on ADJUSTED prices. Raw data is never changed by adjustment.
9. Keep `docs/WORK_LOG.md` (dated entry after each finished task: what, why, next) and `docs/PLAN.md` current.

## Where things are
- Plan, decisions, folder structure, size estimate: `docs/PLAN.md`
- Work history: `docs/WORK_LOG.md`

## Facts learned from the old project (2026-10-31)
- Angel One: login client code + MPIN + TOTP (no browser). Daily candles: max ~2,000 days per call. Safe pace ~3/s and 70/min
  (it blocked a run at ~4,790 calls/hour). Gateway blocks at random mostly 09:15-15:30 IST; smooth at night.
- Angel One history changes after a split/bonus -> it behaves as already adjusted (to be confirmed in Phase 2).
- BSE refuses GitHub servers (HTTP 403) for ListofScripData / ComHeadernew; answers a home PC.
- NSE archives (`nsearchives.nseindia.com`) answer GitHub without cookies. On a holiday NSE serves the previous day's bhavcopy
  under the holiday's name: the file's own date column decides. Day's bhavcopy appears ~18:30-19:05 IST.

## Commands (from the project folder)
- Python: `C:\Users\hello\venvs\swing-trading\Scripts\python` (3.11 venv, outside OneDrive).
- Tests (must be green before every push): `<python> -m pytest -q`. Secret check: `<python> scripts/check_secrets.py`.
- Source probe (read-only): `<python> scripts/probe_sources.py` -> `reports/probe_pc.md`.
- Data sources and their fallbacks: `docs/SOURCES.md`.

## Status
Phase 1 plan approved 2026-10-31 (daily 20:15 IST OK). Phase 2: skeleton + PC probe done; repo not created yet.
