# Restore - data pachho lavvo (step by step)

Data 4 jagya e surakshit chhe:

| Backup | Kya | Ketlo juno |
|---|---|---|
| Git history | darek daily commit (`data: daily ...`) | roj no, sharuat thi |
| Weekly release | GitHub -> Releases -> `data-YYYY-MM-DD` (zip + SHA-256) | chhella 12 athvadiya |
| `backup` branch | GitHub -> branch `backup` | dar shanivare aagal vadhe chhe |
| Google Drive (off-GitHub) | tamari Drive -> folder "Swing Trading Dashboard backups" (setup pachhi) | chhella 12 athvadiya |

Google Drive ni zip vaparvi hoy to: zip download karo, `data/` folder ni jagyae ema nu badhu unzip karo
(pehla juno `data/` folder bija naam e rakho), pachhi `python scripts/validate_data.py --no-baseline`, pachhi commit.

## A. Saro ane saral rasto: GitHub par ek click (PC ni jarur nathi)

1. Repo -> **Releases** kholo ane yogya tarikh no backup naam jou, jem ke `data-2026-11-07`.
   (Ke pachhi **Actions** ma chhello saro "Daily update" run kholi ne teno commit id jou, jem ke `ec8a88c`.)
2. **Actions -> Restore data -> Run workflow** dabavo
3. **source** ma lakho: `data-2026-11-07` (release), ke commit id, ke `backup`
4. Green **Run workflow** dabavo
5. Workflow data pachho mukshe, data check chalavshe, ane check pass thay to j commit karshe ane website pharithi banavshe.
6. Pachhi GitHub Desktop ma **Fetch origin -> Pull origin** karo.

Data check fail thay to kai save nathi thatu. Juno data jem chhe tem j rahe chhe.

## B. Tamara PC thi (Claude ne kaho, athva jate)

Project folder ma (`C:\Users\hello\OneDrive\Documents\Swing Trading\Swing Trading`):

```
C:\Users\hello\venvs\swing-trading\Scripts\python restore.py --list
C:\Users\hello\venvs\swing-trading\Scripts\python restore.py --from-release data-2026-11-07
C:\Users\hello\venvs\swing-trading\Scripts\python restore.py --from-commit ec8a88c
C:\Users\hello\venvs\swing-trading\Scripts\python restore.py --from-backup-branch
```

- Hal no `data/` folder pehla `data_before_restore_<samay>/` ma khasedai jay chhe. Kai delete nathi thatu.
- Release zip no SHA-256 check thay chhe. Download bagdel hoy to kai nathi badaltu.
- Pachhi data check jate chale chhe.
- Pachhi GitHub Desktop: **Pull origin** -> Summary `data: restore from ...` -> **Commit to main** -> **Push origin**.
- Badhu barabar lage pachhi `data_before_restore_...` folder jate delete kari shako chho.

## C. Aakhu repo j gayu hoy to (bahu bhagye j)

1. GitHub par navo khali repo banavo (GitHub Desktop: File -> New repository, pachhi Publish).
2. Juna repo ni koi pan copy (PC no folder, `backup` branch, ke off-GitHub copy) mathi code + `data/` navo repo ma mukho.
3. GitHub Secrets pharithi nakho (`docs/MANUAL_CHECKLIST.md` jou), ane Pages chalu karo.
4. Data na hoy to: `python scripts/backfill.py --job all` (lagbhag 3-6 kalak, vachche atke to tyathi aagal vadhe chhe).

## Kasoti

Restore pachhi website par "Data as of ..." ane "data check: 0 errors" jou. Shanka hoy to **Actions -> Monthly integrity check -> Run workflow**.
