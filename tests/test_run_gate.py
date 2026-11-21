"""swingdash/run_gate.py (21-Nov-2026): the backup run works only when the last session is incomplete, the results runs
only in the results seasons."""
import json
from datetime import date

from swingdash import run_gate as g


def _meta(tmp_path, days, idx_last):
    m = tmp_path / "meta"
    (m / "checkpoints").mkdir(parents=True)
    (m / "trading_days.csv").write_text("date\n" + "\n".join(days) + "\n", encoding="utf-8")
    (m / "checkpoints" / "nse_indices.json").write_text(json.dumps({"files_last_day": idx_last}), encoding="utf-8")
    return m


def test_results_seasons():
    yes = [date(2026, 7, 10), date(2026, 8, 14), date(2026, 10, 10), date(2026, 11, 14), date(2027, 1, 10),
           date(2027, 2, 14), date(2027, 4, 15), date(2027, 5, 30)]
    no = [date(2026, 7, 9), date(2026, 8, 15), date(2026, 11, 15), date(2027, 2, 15), date(2027, 4, 14), date(2027, 5, 31),
          date(2026, 12, 20)]
    assert all(g.in_results_season(d) for d in yes)
    assert not any(g.in_results_season(d) for d in no)


def test_backup_runs_only_when_needed(tmp_path):
    sat = date(2026, 11, 21)                                      # the previous weekday is Fri 20-Nov
    assert g.previous_weekday(sat) == date(2026, 11, 20) and g.previous_weekday(date(2026, 11, 24)) == date(2026, 11, 23)
    ok = _meta(tmp_path / "a", ["2026-11-19", "2026-11-20"], "2026-11-20")
    assert g.backup_needed(ok, sat)[0] is False                   # prices + official index file complete: skip
    no_idx = _meta(tmp_path / "b", ["2026-11-19", "2026-11-20"], "2026-11-19")
    assert g.backup_needed(no_idx, sat)[0] is True                # the 23:40 run missed: index file not read
    no_px = _meta(tmp_path / "c", ["2026-11-18", "2026-11-19"], "2026-11-19")
    assert g.backup_needed(no_px, sat)[0] is True                 # Friday's prices missing
    assert g.decide("full", ok, sat)[0] is True and g.decide("season", ok, sat)[0] is False
