# Manual checklist (things only Viraj can do)

Never paste or screenshot a secret value anywhere (chat, issue, screenshot). Only type it into the GitHub Secret box.

## GitHub Secrets
Where: github.com/virajpatel27/Swing-Trading-Dashboard -> Settings -> Secrets and variables -> Actions -> New repository secret

| Name | What to put | Where it comes from |
|---|---|---|
| `ANGEL_API_KEY` | the account's ONE API key (same as the old project). The SmartAPI page shows one key per account; "Add app" gives no new key | smartapi.angelone.in -> My Profile -> My Smart API & Apps -> eye icon |
| `ANGEL_CLIENT_ID` | Angel One client id, e.g. A123456 (same as the old project's `ANGEL_CLIENT_CODE`) | Angel One app / profile |
| `ANGEL_PIN` | 4-digit Angel One MPIN (same as the old project's `ANGEL_MPIN`) | you |
| `ANGEL_TOTP_SECRET` | the authenticator secret TEXT (same as the old project; it belongs to the account) | saved when TOTP was enabled |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | optional: failure messages on Telegram (bot from @BotFather) | Telegram |
| `GDRIVE_CLIENT_ID`, `GDRIVE_CLIENT_SECRET`, `GDRIVE_REFRESH_TOKEN` | weekly backup copy to Google Drive (steps below) | Google Cloud + `scripts/gdrive_auth.py` |

Angel One is used only by the Source probe (a check). The daily update does not need it.

## One-time setup
- [x] 2026-10-31 Repo published (public): https://github.com/virajpatel27/Swing-Trading-Dashboard
- [x] 2026-10-31 4 Angel Secrets added (login OK from GitHub)
- [x] 2026-10-31 Source probe run on GitHub
- [x] 2026-11-01 GitHub Pages: Settings -> Pages -> Source = GitHub Actions. Live: https://virajpatel27.github.io/Swing-Trading-Dashboard/
- [x] 2026-11-01 Branch protection (ruleset "protect main and backup", Active) for `main` and `backup`:
      Settings -> **Rules** -> **Rulesets** -> **New ruleset** -> **New branch ruleset**
      - Ruleset name: `protect main and backup`, Enforcement status: **Active**
      - Target branches -> **Add target** -> **Include by pattern** -> `main`; again -> `backup`
      - Tick **Restrict deletions** and **Block force pushes** (leave everything else unticked, so the daily bot can still save data)
      - **Create**
- [ ] Optional: Telegram (see the table above)
- [ ] Google Drive off-GitHub backup (Viraj chose it 2026-11-01). Weekly zip ~430 MB (all NSE stocks), 6 kept = ~2.6 GB of the free 15 GB.
      The app gets the narrow permission `drive.file`: it sees ONLY the files it created, nothing else in your Drive.
      1. https://console.cloud.google.com -> sign in with your Gmail -> project dropdown (top) -> **New project** ->
         name `swing-dash-backup` -> **Create** (then make sure this project is selected)
      2. **APIs & Services -> Library** -> search **Google Drive API** -> **Enable**
      3. **Google Auth Platform** (or "OAuth consent screen") -> **Get started** -> App name `Swing Dashboard Backup`,
         support email = your Gmail -> Audience **External** -> contact email -> agree -> **Create**
      4. **Audience** -> **Publish app** -> Confirm (status "In production"; otherwise Google stops the token after 7 days)
      5. **Clients** -> **Create client** -> Application type **Desktop app** -> name `swing-dash` -> **Create** ->
         **Download JSON** -> save it in the project folder as `client_secret.json`
         (`C:\Users\hello\OneDrive\Documents\Swing Trading\Swing Trading\client_secret.json`; git ignores it)
      6. Tell Claude **"Drive token banavo"**: your browser opens -> sign in -> "Google hasn't verified this app" ->
         **Advanced** -> **Go to Swing Dashboard Backup** (it is your own app) -> **Continue/Allow**
      7. GitHub Secrets (3 new): `GDRIVE_REFRESH_TOKEN` = the text in `gdrive_token.txt` (open it yourself);
         `GDRIVE_CLIENT_ID` and `GDRIVE_CLIENT_SECRET` = the `client_id` and `client_secret` values inside `client_secret.json`
      8. Delete `gdrive_token.txt` and `client_secret.json` from the PC
      9. Actions -> **Weekly backup** -> Run workflow -> in Google Drive a folder "Swing Trading Dashboard backups" appears
- [x] 2026-11-01 Git pre-commit secret check installed on the PC (`scripts/install_hooks.py`; run again on a new PC)

## Weekly
- BSE indices: tell Claude **"BSE update karo"** (runs on the PC, BSE refuses GitHub); Pull origin first, then commit what it changed.

## When something needs you
- Email / Issue "Daily update failed": open the link in the issue; usually the next run fixes it by itself. Close the issue when green again.
- Daily update warns "New stocks need history": Actions -> Backfill history -> job `stocks`, symbols = the names in the warning,
  from 2007-01-01 -> Run workflow.
- Issue "Integrity check found a problem" or "Weekly backup failed": tell Claude.
- Data looks wrong: [restore.md](../restore.md).
