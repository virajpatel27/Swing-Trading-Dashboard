# cron-job.org: badha jobs (step by step)

Viraj nu schedule (21-Nov-2026). Badha runs **faqt cron-job.org thi** chalu thay chhe: GitHub nu potanu schedule have nathi.
Etle jo cron-job.org ma job na hoy to e run **nahi chale**.

Kul **9 jobs**:

| # | Job | Kyare (India time) | Navo ke juno? |
|---|---|---|---|
| 1 | GitHub daily 17:10 (Run 1) | Som-Shukra 17:10 | **juno** job badalvo |
| 2 | GitHub daily 23:40 (Run 2) | Som-Shukra 23:40 | **juno "16:45"** job badalvo |
| 3 | GitHub backup 05:00 | Mangal-Shani 05:00 | navo |
| 4 | GitHub weekly catch-up 07:00 | Shanivar 07:00 | navo |
| 5 | GitHub weekly backup 07:05 | Shanivar 07:05 | navo |
| 6 | GitHub results 13:00 | roj 13:00 | navo |
| 7 | GitHub results 16:00 | roj 16:00 | navo |
| 8 | GitHub results 19:30 | roj 19:30 | navo |
| 9 | GitHub integrity 11:00 | dar mahine 1 tarikh 11:00 | navo |

---

## A. Pehla: token copy karo (ek j vaar)

Token (`Bearer ...`) **kyarey chat ma na mokalta.** E juna job ma pehle thi chhe:

1. cron-job.org -> **Cronjobs** -> **"GitHub daily 17:10"** par click (Edit).
2. **ADVANCED** tab -> **Headers** ma **Authorization** vali line.
3. Eni **value** (`Bearer github_pat_...` thi sharu thay) aakhi select karo -> **Ctrl+C**.
4. Ene Notepad ma paste kari rakho (kam puru thay pachhi Notepad **save karya vagar band** karjo).

Juna job ma na male to: GitHub -> Settings -> Developer settings -> Fine-grained tokens -> **cron-job-daily** ->
Regenerate, ane navi value aagal `Bearer ` (B moto, pachhi ek space) lagavine vaparo.

---

## B. Dar NAVA job ma sarkhu (jobs 3 thi 9)

**Create cronjob** dabavo, pachhi:

### COMMON tab
1. **Title**: job nu naam (niche dar job ma aapyu chhe).
2. **URL**: niche dar job ma aapeli link paste karo.
3. **Enable job**: chalu (naranghi).
4. **Save responses in job history**: **chalu** karo (pachhi 204 javab joi shakay).
5. **Execution schedule**: **Custom** pasand karo, ane niche dar job ma lakhya pramane Days / Hours / Minutes pasand karo.
   Pachhi niche **Crontab expression** box ma je dekhay e dar job ma aapela "Crontab" sathe **sarkhu** hovu joie.

### NOTIFICATIONS tab
6. **execution of the cronjob fails**: **chalu**, Notify after **1** failure.
7. **execution of the cronjob succeeds after it failed before**: chalu (marji).
8. **the cronjob will be disabled because of too many failures**: chalu (jem chhe tem).
9. Notify via: **all notification channels**.

### ADVANCED tab
10. **Headers** -> **+ ADD** dabavo, 3 vaar (3 headers):

    | Key | Value |
    |---|---|
    | `Accept` | `application/vnd.github+json` |
    | `Authorization` | Notepad ma rakheli value (`Bearer github_pat_...`) |
    | `X-GitHub-Api-Version` | `2022-11-28` |

11. **Time zone**: `Asia/Kolkata` pasand karo (**UTC nahi**, nahi to samay 5.5 kalak khoto thashe).
12. **Request method**: `POST`.
13. **Request body**: niche dar job ma aapelu lakhan paste karo.
14. **Timeout**: 30 seconds (jem chhe tem).

### Chhelle
15. **TEST RUN** dabavo -> javab **204** aavvo joie. (204 = GitHub e run chalu karyo. 401 = token khoto, 404 = URL khoti.)
    TEST RUN GitHub par saacho run chalu kare chhe: e saaru j chhe.
16. **CREATE** dabavo.

---

## Job 1 - GitHub daily 17:10 (Run 1) - JUNO job badalvo

Shu kare: stocks no bhav + delivery %, website update.

1. **Cronjobs** -> **"GitHub daily 17:10"** -> Edit.
2. COMMON: Title `GitHub daily 17:10`, schedule **Custom**: Days of week **Monday-Friday**, Hours **17**, Minutes **10**.
   - Crontab: `10 17 * * 1-5`
3. URL (jem chhe tem hovi joie):
   ```
   https://api.github.com/repos/virajpatel27/Swing-Trading-Dashboard/actions/workflows/daily.yml/dispatches
   ```
4. ADVANCED: Time zone `Asia/Kolkata`, method `POST`, headers 3 (jem chhe tem). **Request body** badli ne:
   ```
   {"ref":"main","inputs":{"mode":"full"}}
   ```
5. NOTIFICATIONS: B na step 6-9 pramane.
6. **TEST RUN** -> 204 -> **SAVE**.

## Job 2 - GitHub daily 23:40 (Run 2) - JUNO "16:45" job badalvo

Shu kare: NSE indices na official close + corporate actions, website update.

1. **Cronjobs** -> **"GitHub daily 16:45"** -> Edit.
2. COMMON: Title badli ne `GitHub daily 23:40`. Schedule **Custom**: Days of week **Monday-Friday**, Hours **23**, Minutes **40**.
   - Crontab: `40 23 * * 1-5`
3. URL (jem chhe tem):
   ```
   https://api.github.com/repos/virajpatel27/Swing-Trading-Dashboard/actions/workflows/daily.yml/dispatches
   ```
4. ADVANCED: Time zone `Asia/Kolkata`, method `POST`, headers 3 (jem chhe tem). **Request body**:
   ```
   {"ref":"main","inputs":{"mode":"full"}}
   ```
5. NOTIFICATIONS: B na step 6-9.
6. **TEST RUN** -> 204 -> **SAVE**.

## Job 3 - GitHub backup 05:00 - NAVO

Shu kare: raat no run chuki gayo hoy ke data baki hoy to j kaam kare; nahi to ~1 minute ma band.

- Title:
  ```
  GitHub backup 05:00
  ```
- URL:
  ```
  https://api.github.com/repos/virajpatel27/Swing-Trading-Dashboard/actions/workflows/daily.yml/dispatches
  ```
- Schedule **Custom**: Days of week **Tuesday, Wednesday, Thursday, Friday, Saturday**, Hours **5**, Minutes **0**.
  - Crontab: `0 5 * * 2-6`
- Request body:
  ```
  {"ref":"main","inputs":{"mode":"backup"}}
  ```
- Baki badhu: **B** pramane (headers 3, Asia/Kolkata, POST, notifications). TEST RUN -> 204 -> CREATE.

## Job 4 - GitHub weekly catch-up 07:00 - NAVO

Shu kare: aathvadiya no koi data rahi gayo hoy to lave (chhella 5 trading divaso fari vanche).

- Title:
  ```
  GitHub weekly catch-up 07:00
  ```
- URL:
  ```
  https://api.github.com/repos/virajpatel27/Swing-Trading-Dashboard/actions/workflows/daily.yml/dispatches
  ```
- Schedule **Custom**: Days of week **Saturday**, Hours **7**, Minutes **0**.
  - Crontab: `0 7 * * 6`
- Request body:
  ```
  {"ref":"main","inputs":{"mode":"full"}}
  ```
- Baki badhu: **B** pramane. TEST RUN -> 204 -> CREATE.

## Job 5 - GitHub weekly backup 07:05 - NAVO

Shu kare: aakha data no zip backup (GitHub Release) + "backup" branch. 07:00 vado run puro thay eni raah jove chhe.

- Title:
  ```
  GitHub weekly backup 07:05
  ```
- URL (**weekly-backup.yml**):
  ```
  https://api.github.com/repos/virajpatel27/Swing-Trading-Dashboard/actions/workflows/weekly-backup.yml/dispatches
  ```
- Schedule **Custom**: Days of week **Saturday**, Hours **7**, Minutes **5**.
  - Crontab: `5 7 * * 6`
- Request body:
  ```
  {"ref":"main"}
  ```
- Baki badhu: **B** pramane. TEST RUN -> 204 -> CREATE. (TEST RUN ek backup Release banavshe: koi vandho nathi.)

## Job 6 - GitHub results 13:00 - NAVO

Shu kare: quarterly results (faqt 10 Jul-14 Aug, 10 Oct-14 Nov, 10 Jan-14 Feb, 15 Apr-30 May; baki divase ~1 minute ma band).

- Title:
  ```
  GitHub results 13:00
  ```
- URL (**fundamentals-nightly.yml**):
  ```
  https://api.github.com/repos/virajpatel27/Swing-Trading-Dashboard/actions/workflows/fundamentals-nightly.yml/dispatches
  ```
- Schedule **Custom**: Days of week **badha (every day)**, Hours **13**, Minutes **0**.
  - Crontab: `0 13 * * *`
- Request body:
  ```
  {"ref":"main","inputs":{"mode":"season"}}
  ```
- Baki badhu: **B** pramane. TEST RUN -> 204 -> CREATE.

## Job 7 - GitHub results 16:00 - NAVO

- Title:
  ```
  GitHub results 16:00
  ```
- URL:
  ```
  https://api.github.com/repos/virajpatel27/Swing-Trading-Dashboard/actions/workflows/fundamentals-nightly.yml/dispatches
  ```
- Schedule **Custom**: every day, Hours **16**, Minutes **0**.
  - Crontab: `0 16 * * *`
- Request body:
  ```
  {"ref":"main","inputs":{"mode":"season"}}
  ```
- Baki badhu: **B** pramane. TEST RUN -> 204 -> CREATE.

## Job 8 - GitHub results 19:30 - NAVO

- Title:
  ```
  GitHub results 19:30
  ```
- URL:
  ```
  https://api.github.com/repos/virajpatel27/Swing-Trading-Dashboard/actions/workflows/fundamentals-nightly.yml/dispatches
  ```
- Schedule **Custom**: every day, Hours **19**, Minutes **30**.
  - Crontab: `30 19 * * *`
- Request body:
  ```
  {"ref":"main","inputs":{"mode":"season"}}
  ```
- Baki badhu: **B** pramane. TEST RUN -> 204 -> CREATE.

## Job 9 - GitHub integrity 11:00 - NAVO

Shu kare: aakha data ni undi tapas (kai badlatu nathi; gadbad male to GitHub Issue + email).

- Title:
  ```
  GitHub integrity 11:00
  ```
- URL (**monthly-integrity.yml**):
  ```
  https://api.github.com/repos/virajpatel27/Swing-Trading-Dashboard/actions/workflows/monthly-integrity.yml/dispatches
  ```
- Schedule: **"Every 1. of the month at 11 : 00"** (trijo vikalp) athva Custom: Days of month **1**, Hours **11**, Minutes **0**.
  - Crontab: `0 11 1 * *`
- Request body:
  ```
  {"ref":"main"}
  ```
- Baki badhu: **B** pramane. TEST RUN -> 204 -> CREATE.

---

## Chhelle tapaso

- **Cronjobs** list ma **9 jobs** dekhava joie, badha **enabled**.
- Dar job no "Next execution" India time pramane saacho dekhavo joie (ex. Job 1: aavta kaam na divase 17:10).
- GitHub -> Actions ma TEST RUN vala runs dekhashe: "Daily update", "Weekly backup", "Results season",
  "Monthly integrity check". Results season ane backup na runs ~1 minute ma "skip" kari ne puraa thashe: e barabar chhe.
- Token **02-Nov-2027** pehla badalvano chhe: tyare **9-ey** jobs ma Authorization value badalvi (docs/MANUAL_CHECKLIST.md).
