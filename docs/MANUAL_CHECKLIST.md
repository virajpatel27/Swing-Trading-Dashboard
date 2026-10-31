# Manual checklist (things only Viraj can do)

Never paste or screenshot a secret value anywhere (chat, issue, screenshot). Only type it into the GitHub Secret box.

## GitHub Secrets
Where: github.com/virajpatel27/Swing-Trading-Dashboard -> Settings -> Secrets and variables -> Actions -> New repository secret

| Name | What to put | Where it comes from |
|---|---|---|
| `ANGEL_API_KEY` | the account's ONE API key (same as the old project). The new SmartAPI page (seen 2026-10-31) shows one key per account; "Add app" only adds a redirect URL / static IP, not a new key | smartapi.angelone.in -> My Profile -> My Smart API & Apps -> eye icon |
| `ANGEL_CLIENT_ID` | Angel One client id, e.g. A123456 (same as the old project's `ANGEL_CLIENT_CODE`) | Angel One app / profile |
| `ANGEL_PIN` | 4-digit Angel One MPIN (same as the old project's `ANGEL_MPIN`) | you |
| `ANGEL_TOTP_SECRET` | the authenticator secret TEXT (same as the old project; it belongs to the account, not to the app) | saved when TOTP was enabled at smartapi.angelone.in/enable-totp |

Optional later: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` (failure messages on Telegram).

## Done
- [x] 2026-10-31 Repo published (public): https://github.com/virajpatel27/Swing-Trading-Dashboard
- [ ] 4 Angel Secrets added
- [ ] Source probe run on GitHub (Actions -> Source probe -> Run workflow)
- [ ] GitHub Pages: Settings -> Pages -> Source = GitHub Actions (Phase 6)
- [ ] Branch rule on main: block force push + deletion (Phase 8)
