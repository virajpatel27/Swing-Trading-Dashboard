"""Corporate actions and adjusted prices, with REAL examples taken from NSE bhavcopies (prices as traded):
RELIANCE 1:1 bonus (ex 28-Oct-2024), IRCTC 1:5 split (ex 28-Oct-2021), RELIANCE demerger of Jio Financial (ex 20-Jul-2023)."""
import sys
from pathlib import Path

import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from swingdash import adjust, corporate_actions as ca  # noqa: E402


def raw(rows):
    return pd.DataFrame(rows, columns=["date", "open", "high", "low", "close", "volume"]).assign(
        date=lambda d: pd.to_datetime(d["date"]))


def actions(*rows):
    out = []
    for ex, subject, fv in rows:
        for a in ca.parse_subject(subject, fv):
            out.append({"ex_date": pd.Timestamp(ex), "type": a["type"], "ratio": a.get("ratio", ""), "factor": a.get("factor"),
                        "amount": a.get("amount"), "method": "", "status": "", "subject": subject, "source": "NSE"})
    return pd.DataFrame(out, columns=ca.CA_COLS)


RELIANCE_BONUS = raw([("2024-10-23", 2675.0, 2714.95, 2670.0, 2677.05, 8607371), ("2024-10-24", 2670.55, 2687.4, 2646.25, 2679.6, 11077967),
                      ("2024-10-25", 2687.0, 2688.7, 2644.0, 2655.7, 9298748), ("2024-10-28", 1337.0, 1353.0, 1322.1, 1334.35, 10824350),
                      ("2024-10-29", 1328.1, 1343.2, 1320.3, 1340.0, 12008361), ("2024-10-30", 1335.0, 1350.0, 1325.35, 1343.9, 11984423)])
IRCTC_SPLIT = raw([("2021-10-25", 4685.0, 4685.0, 3961.1, 4022.35, 7773301), ("2021-10-26", 4068.0, 4400.0, 4051.0, 4189.5, 8202241),
                   ("2021-10-27", 4250.5, 4334.8, 4033.75, 4130.15, 5358793), ("2021-10-28", 817.0, 983.0, 810.0, 913.5, 59298778),
                   ("2021-10-29", 822.15, 906.45, 639.45, 845.7, 82848030), ("2021-11-01", 874.2, 885.0, 809.25, 855.45, 29989312)])
RELIANCE_DEMERGER = raw([("2023-07-17", 2747.0, 2815.05, 2728.0, 2796.7, 10254545), ("2023-07-18", 2817.0, 2837.45, 2793.0, 2820.45, 11937761),
                         ("2023-07-19", 2830.0, 2856.0, 2797.0, 2841.85, 18054869), ("2023-07-20", 2580.0, 2630.95, 2580.0, 2619.85, 19358812),
                         ("2023-07-21", 2609.0, 2614.9, 2523.6, 2538.75, 15124619), ("2023-07-24", 2481.0, 2514.95, 2469.3, 2487.4, 11863933)])


def biggest_move(adj):
    return float(adj["close"].pct_change().abs().max())


# ---------------------------------------------------------------- the three real examples
def test_reliance_bonus_1_1():
    adj, acts, issues = adjust.adjust(RELIANCE_BONUS, actions(("2024-10-28", "Bonus 1:1", 10)), "RELIANCE")
    assert acts.loc[0, "factor"] == 0.5 and acts.loc[0, "status"] == "applied" and issues == []
    assert adj["close"].iat[-1] == RELIANCE_BONUS["close"].iat[-1]                 # last adjusted close = last raw close
    assert adj.loc[adj["date"] == "2024-10-25", "close"].iat[0] == pytest.approx(1327.85)   # = yfinance Close that day
    assert adj.loc[adj["date"] == "2024-10-25", "volume"].iat[0] == 9298748 * 2
    assert biggest_move(adj) < 0.02                                                # continuous: no 50 % drop any more
    assert biggest_move(RELIANCE_BONUS) > 0.49


def test_irctc_split_1_5():
    adj, acts, _ = adjust.adjust(IRCTC_SPLIT, actions(("2021-10-28", "Face Value Split (Sub-Division) - From Rs 10/- Per Share To Rs 2/- Per Share", 2)))
    assert acts.loc[0, "factor"] == pytest.approx(0.2) and acts.loc[0, "ratio"] == "FV 10->2"
    assert adj["close"].iat[-1] == IRCTC_SPLIT["close"].iat[-1]
    assert adj["close"].iat[2] == pytest.approx(826.03)                            # 4130.15 / 5
    # the ex-day itself moved +10.6 % after adjusting (a real market move that day), nothing like the raw -78 %
    assert biggest_move(adj) < 0.15 and biggest_move(IRCTC_SPLIT) > 0.75


def test_reliance_demerger_uses_special_session_open():
    adj, acts, _ = adjust.adjust(RELIANCE_DEMERGER, actions(("2023-07-20", "Demerger", 10)))
    f = 2580.0 / 2841.85                                                           # NSE's discovered price / last close
    assert acts.loc[0, "factor"] == pytest.approx(f) and "open 2580" in acts.loc[0, "method"]
    assert adj["close"].iat[-1] == RELIANCE_DEMERGER["close"].iat[-1]
    assert adj["close"].iat[2] == pytest.approx(2580.0)                            # the day before = discovered price
    assert biggest_move(adj) < 0.04


def test_cumulative_factors_multiply_back_in_time():
    both = pd.concat([RELIANCE_DEMERGER, RELIANCE_BONUS], ignore_index=True)
    adj, acts, _ = adjust.adjust(both, actions(("2023-07-20", "Demerger", 10), ("2024-10-28", "Bonus 1:1", 10)))
    f = 2580.0 / 2841.85
    assert adj["factor"].iat[0] == pytest.approx(f * 0.5)                          # before both events
    assert adj["factor"].iat[6] == pytest.approx(0.5)                              # between them
    assert adj["factor"].iat[-1] == 1.0
    assert adj["close"].iat[-1] == both["close"].iat[-1]


# ---------------------------------------------------------------- rules
def test_wrong_ex_date_is_moved_to_the_day_the_price_changed():
    adj, acts, issues = adjust.adjust(RELIANCE_BONUS, actions(("2024-10-24", "Bonus 1:1", 10)))
    assert acts.loc[0, "status"] == "applied on 2024-10-28"
    assert [i["check"] for i in issues] == ["ex-date moved"]
    assert biggest_move(adj) < 0.02


def test_action_not_seen_in_prices_is_not_applied():
    adj, acts, issues = adjust.adjust(RELIANCE_DEMERGER, actions(("2023-07-20", "Bonus 1:1", 10)))
    assert acts.loc[0, "status"].startswith("NOT APPLIED")
    assert issues[0]["check"] == "corporate action not seen in prices"
    assert (adj["close"] == RELIANCE_DEMERGER["close"]).all()


def test_rights_terp():
    # 1:5 rights at 100 (FV 10 + premium 90) with the last close at 2841.85
    adj, acts, _ = adjust.adjust(RELIANCE_DEMERGER, actions(("2023-07-20", "Rights 1:5 @ Premium Rs 90/-", 10)))
    pc = 2841.85
    assert acts.loc[0, "factor"] == pytest.approx((5 * pc + 1 * 100) / (6 * pc))
    adj2, acts2, _ = adjust.adjust(RELIANCE_DEMERGER, actions(("2023-07-20", "Rights 1:5 @ Premium Rs 5000/-", 10)))
    assert acts2.loc[0, "factor"] == 1.0                                           # issue price above market: no change


def test_dividends_only_when_switched_on():
    acts = actions(("2024-10-28", "Dividend - Rs 10 Per Share", 10))
    adj, done, _ = adjust.adjust(RELIANCE_BONUS, acts, adjust_dividends=False)
    assert (adj["close"] == RELIANCE_BONUS["close"]).all() and done.loc[0, "factor"] == 1.0
    adj, done, _ = adjust.adjust(RELIANCE_BONUS, acts, adjust_dividends=True)
    assert done.loc[0, "factor"] == pytest.approx(1 - 10 / 2655.7)


def test_future_and_before_data_actions_are_skipped():
    adj, acts, issues = adjust.adjust(RELIANCE_BONUS, actions(("2030-01-01", "Bonus 1:1", 10), ("2020-01-01", "Bonus 1:1", 10)))
    assert sorted(acts["status"]) == ["before our data", "future"] and issues == []
    assert (adj["close"] == RELIANCE_BONUS["close"]).all()


def test_bonus_and_split_on_same_day_are_checked_together():
    r = raw([("2020-01-01", 100, 100, 100, 1000, 10), ("2020-01-02", 50, 50, 50, 50, 10)])   # 1000 -> 50 = 0.5 * 0.1
    adj, acts, issues = adjust.adjust(r, actions(("2020-01-02", "Bonus 1:1 And Face Value Split From Rs.10/- To Re.1/-", 10)))
    assert sorted(acts["type"]) == ["bonus", "split"] and issues == []
    assert adj["close"].iat[0] == pytest.approx(50)


# ---------------------------------------------------------------- subject parser
@pytest.mark.parametrize("subject,fv,expect", [
    ("Bonus 1:1", 10, [("bonus", 0.5)]),
    ("Bonus-3:2", 10, [("bonus", 0.4)]),
    ("Fv Split Rs.10/- To Re.1/", 10, [("split", 0.1)]),
    ("Face Value Split From Rs 5 To Re 1", 5, [("split", 0.2)]),
    ("Bonus 1:1 And Face Value Split From Rs.10/- To Re.1/-", 10, [("split", 0.1), ("bonus", 0.5)]),
    ("Capital Reduction Rs 10 To Rs 3.30 / Consolidation Rs 3.30 To Rs.10", 10, [("consolidation", 10 / 3.3)]),
    ("Scheme Of Arrangement - Bonus Ncrps 1:1", 10, [("scheme", None)]),
    ("Demerger", 10, [("demerger", None)]),
    ("Fv Splt Frm Rs 10 To Re 1", 10, [("split", 0.1)]),                      # abbreviated old NSE texts (JSWSTEEL 2017)
    ("Fv Spl-Rs10tore1/Bon-1:1", 10, [("split", 0.1), ("bonus", 0.5)]),          # VEDL 2008
    ("Div-Rs.5.50 Pr Sh/Bon 5:1purpose Revised", 10, [("bonus", 1 / 6), ("dividend", None)]),   # JINDALSTEL 2009
    ("Agm/Div-Rs.2/Fv Rs10tors5", 10, [("split", 0.5)]),                        # BHARTIARTL 2009 (no "per share": amount unknown)
    ("Agm/Div Fin-40% + Spl-20%", 10, [("dividend", None)]),                    # SPL = special dividend, not a split
    ("Bonus 1 Dvr : 10 Eq Share", 10, []),                                       # DVR shares, not an equity bonus
    ("Face Value Split (Sub-Division) - From Rs 10/- Per Share To Rs 2/- Per Share", 10, [("split", 0.2)]),   # not a dividend
    ("Bonus 1 : 1 / Face Value Split From Rs 10/- Each To Rs 2/- Each", 2, [("split", 0.2), ("bonus", 0.5)]),   # DEEPAKNTR 2014
    ("Bonus-1:1 Spl-Rs 5/ To 2/", 2, [("split", 0.4), ("bonus", 0.5)]),          # BSOFT 2007
    ("Annual General Meeting", 10, []),
    ("Buy Back", 10, []),
])
def test_parse_subject(subject, fv, expect):
    got = [(a["type"], a["factor"]) for a in ca.parse_subject(subject, fv)]
    assert [t for t, _ in got] == [t for t, _ in expect]
    for (_, f), (_, e) in zip(got, expect):
        assert f == pytest.approx(e) if e is not None else f is None


def test_parse_rights_and_dividends():
    r = ca.parse_subject("Rights 1:5 @ Premium Rs 90/-", 10)[0]
    assert (r["type"], r["ratio"], r["amount"]) == ("rights", "1:5", 100.0)          # issue price = FV + premium
    assert ca.parse_subject("Dividend - Rs 5 Per Share & Special Dividend - Rs 2 Per Share", 10)[0]["amount"] == 7.0
    assert ca.parse_subject("AGM/Dividend - 40%", 10)[0]["amount"] == 4.0            # 40 % of face value 10
    assert ca.parse_subject("Interim Dividend - Rs 62..50 Per Share", 10)[0]["amount"] == 62.5


def test_records_under_old_symbol_go_to_current_symbol():
    history = {"NEWX": [("OLDX", pd.Timestamp("2020-01-01"))]}
    raw_rows = [{"symbol": "OLDX", "series": "EQ", "exDate": "05-Jan-2019", "subject": "Bonus 1:1", "faceVal": "10"},
                {"symbol": "OLDX", "series": "EQ", "exDate": "05-Jan-2021", "subject": "Bonus 1:1", "faceVal": "10"},   # after rename: not ours
                {"symbol": "NEWX", "series": "EQ", "exDate": "05-Jan-2022", "subject": "Bonus 1:2", "faceVal": "10"},
                {"symbol": "NEWX", "series": "GS", "exDate": "05-Jan-2022", "subject": "Bonus 1:1", "faceVal": "10"}]   # not equity
    got = ca.to_actions(raw_rows, ["NEWX"], history)["NEWX"]
    assert got["ex_date"].dt.year.tolist() == [2019, 2022] and got["ratio"].tolist() == ["1:1", "1:2"]


def test_adjusted_vs_raw_consistency_check():
    from swingdash import meta
    r = RELIANCE_BONUS.assign(prev_close=0.0, value=0.0, series="EQ")
    adj, _, _ = adjust.adjust(RELIANCE_BONUS, actions(("2024-10-28", "Bonus 1:1", 10)))
    assert meta.check_adjusted_vs_raw("X", adj, r) == []
    bad = adj.copy()
    bad.loc[bad.index[-1], "close"] = 1.0
    assert meta.check_adjusted_vs_raw("X", bad, r)[0]["check"] == "last adjusted close != last raw close"
    assert meta.check_adjusted_vs_raw("X", adj.iloc[1:], r)[0]["check"] == "adjusted/raw days differ"


def test_scheme_without_special_session_uses_the_ex_day_close():
    # ADANIENT 03-Jun-2015 (real): open 573.30 was still the old price; the stock closed at 109.75
    r = raw([("2015-06-01", 709.0, 709.0, 630.0, 633.05, 10966199), ("2015-06-02", 638.0, 640.0, 630.0, 637.0, 17253576),
             ("2015-06-03", 573.3, 573.3, 105.0, 109.75, 48863342), ("2015-06-04", 112.0, 118.0, 110.0, 116.55, 14787561)])
    adj, acts, _ = adjust.adjust(r, actions(("2015-06-03", "Scheme Of Arrangement", 1)))
    assert acts.loc[0, "factor"] == pytest.approx(109.75 / 637.0) and acts.loc[0, "method"].startswith("close 109.75")
    assert adj["close"].pct_change().abs().max() < 0.07


def test_manual_override_is_added_and_applied(tmp_path):
    p = tmp_path / "ov.csv"
    p.write_text("symbol,ex_date,type,ratio,factor,note\nX,2020-01-02,split,price-derived,0.5,NSE text incomplete\n")
    per = ca.add_overrides({"X": actions(("2020-01-02", "Bonus 1:1", 10))}, p)
    assert per["X"]["source"].tolist() == ["NSE", "manual override"]
    r = raw([("2020-01-01", 100, 100, 100, 100, 10), ("2020-01-02", 25, 25, 25, 25, 40)])      # x0.25 = bonus 1:1 x split 0.5
    adj, acts, issues = adjust.adjust(r, per["X"])
    assert issues == [] and adj["close"].iat[0] == pytest.approx(25)
