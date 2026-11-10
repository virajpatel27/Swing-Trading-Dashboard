"""Back-adjustment: the latest adjusted price equals the latest real price; every price before an ex-date is multiplied by
that action's factor (and volume divided by it), cumulatively going back in time. Raw data is never changed.

Factor per action type (the factor multiplies prices BEFORE the ex-date):
  split / bonus / consolidation   exact, from the NSE text (1:1 bonus = 0.5, FV 10 -> 2 = 0.2)
  rights a:b at issue price P     theoretical ex-rights price / last cum-rights close = (b*Pc + a*P) / ((a+b) * Pc); 1 if P >= Pc
  demerger                        NSE holds a special pre-open session on the ex-date: open(ex) / close(day before)
  scheme / capital reduction      same as demerger, but only when the price moved > 10 % (most schemes are amalgamations)
  dividend (ADJUST_DIVIDENDS)     1 - amount / close(day before)
A split/bonus whose price did not move on the given ex-date is looked for within 5 trading days (NSE's dates are sometimes off);
when not found it is NOT applied and listed as an issue.
"""
from __future__ import annotations

import pandas as pd

from .validate import issue

ADJ_COLS = ["date", "open", "high", "low", "close", "volume", "factor"]
EXACT = {"split", "bonus", "consolidation"}
FROM_OPEN = {"demerger", "scheme", "capital_reduction"}


def _locate(raw: pd.DataFrame, ex: pd.Timestamp) -> int | None:
    """Row number of the first trading day on/after the ex-date, if it has a day before it."""
    pos = int(raw["date"].searchsorted(ex))
    return pos if 0 < pos < len(raw) else None


def _moved_as_expected(raw: pd.DataFrame, i: int, factor: float, tol: float = 0.30) -> bool:
    r = raw["close"].iat[i] / raw["close"].iat[i - 1]
    return abs(r / factor - 1) <= tol


def factor_for(raw: pd.DataFrame, i: int, act: dict, adjust_dividends: bool) -> tuple[float | None, str]:
    """(factor, method) for one action whose ex-date is row i; factor None = not applied."""
    pc = float(raw["close"].iat[i - 1])
    t = act["type"]
    if t in EXACT:
        return float(act["factor"]), "ratio from NSE text"
    if t == "rights":
        price = act.get("amount")
        a, b = (int(x) for x in str(act["ratio"]).split(":"))
        if price is None or pd.isna(price) or pc <= 0:
            # no issue price in NSE's text: the ex-day open shows the drop; used only between the possible bounds
            # (issue price 0 .. market price) and when the price really fell (calibrated 10-Nov-2026: 8 such records)
            o = float(raw["open"].iat[i])
            f = o / pc if pc > 0 and o > 0 else None
            if f is not None and b / (a + b) <= f < 0.98:
                return f, f"rights without issue price: estimated from the ex-day open {o:g} / close before {pc:g}"
            return None, "rights without issue price"
        if price >= pc:
            return 1.0, "rights above market price: no change"
        return (b * pc + a * float(price)) / ((a + b) * pc), f"TERP, issue price {float(price):g}, close before {pc:g}"
    if t in FROM_OPEN:
        o, c = float(raw["open"].iat[i]), float(raw["close"].iat[i])
        if not (pc > 0 and o > 0):
            return None, "no open price"
        # without a special session (older years) the open is not the new price: then use the ex-day close
        # (ADANIENT 03-Jun-2015: open 573.30, close 109.75)
        p, which = (o, "open") if abs(c / o - 1) <= 0.30 else (c, "close")
        f = p / pc
        how = f"{which} {p:g} / close before {pc:g}"
        if t == "demerger":
            return (f, how) if f < 0.98 else (1.0, "price did not fall: no change")
        return (f, how) if abs(f - 1) > 0.10 else (1.0, "price did not move: no change")
    if t == "dividend":
        amt = act.get("amount")
        if not adjust_dividends:
            return 1.0, "dividends not adjusted (ADJUST_DIVIDENDS=false)"
        if amt is None or pd.isna(amt) or not 0 < float(amt) < pc:
            return 1.0, "dividend amount unknown"
        return 1 - float(amt) / pc, f"dividend {float(amt):g} / close before {pc:g}"
    return 1.0, "not a price event"


def adjust(raw: pd.DataFrame, actions: pd.DataFrame, name: str = "", adjust_dividends: bool = False
           ) -> tuple[pd.DataFrame, pd.DataFrame, list[dict]]:
    """-> (adjusted series, actions with factor/method/status filled in, issues)."""
    raw = raw.sort_values("date").reset_index(drop=True)
    acts = actions.copy().reset_index(drop=True)
    issues: list[dict] = []
    per_row = pd.Series(1.0, index=raw.index)               # product of factors whose ex-date is this row
    for k, act in acts.iterrows():
        ex = pd.Timestamp(act["ex_date"])
        if len(raw) == 0 or ex > raw["date"].iat[-1]:
            acts.loc[k, ["status", "method"]] = ["future", ""]
            continue
        i = _locate(raw, ex)
        if i is None:
            acts.loc[k, ["status", "method"]] = ["before our data", ""]
            continue
        if act["type"] in EXACT:
            # a bonus and a split on the same day move the price together
            same_day = acts[(acts["ex_date"] == act["ex_date"]) & acts["type"].isin(EXACT)]
            combo = float(pd.to_numeric(same_day["factor"]).prod())
            in_gap = (raw["date"].iat[i] - raw["date"].iat[i - 1]).days > 30     # suspended: no prices around the ex-date
            if not in_gap and not _moved_as_expected(raw, i, combo):
                near = [j for j in range(max(1, i - 5), min(len(raw), i + 6))
                        if j != i and _moved_as_expected(raw, j, combo)]
                if not near:
                    acts.loc[k, ["status", "method", "factor"]] = ["NOT APPLIED: price did not move", "", act["factor"]]
                    issues.append(issue(name, "warn", "corporate action not seen in prices",
                                        f"{act['type']} {act['ratio']}: no matching price change near the ex-date", ex))
                    continue
                j = min(near, key=lambda x: abs(x - i))
                issues.append(issue(name, "warn", "ex-date moved",
                                    f"{act['type']} {act['ratio']}: NSE ex-date {ex:%Y-%m-%d}, price changed on "
                                    f"{raw['date'].iat[j]:%Y-%m-%d}", ex))
                acts.loc[k, "status"] = f"applied on {raw['date'].iat[j]:%Y-%m-%d}"
                i = j
        f, method = factor_for(raw, i, act, adjust_dividends)
        acts.loc[k, "method"] = method
        if f is None:
            acts.loc[k, "status"] = "NOT APPLIED"
            if act["type"] != "dividend":
                issues.append(issue(name, "warn", "corporate action without factor", f"{act['type']}: {method}", ex))
            continue
        acts.loc[k, "factor"] = round(f, 10)
        if not str(acts.loc[k, "status"]).startswith("applied"):
            acts.loc[k, "status"] = "applied" if f != 1.0 else "no change"
        per_row.iat[i] *= f
    # cumulative factor for each row = product of all factors on LATER rows
    mult = per_row[::-1].cumprod()[::-1].shift(-1, fill_value=1.0)
    adj = pd.DataFrame({"date": raw["date"]})
    for c in ("open", "high", "low", "close"):
        adj[c] = raw[c] * mult
    adj["volume"] = (raw["volume"].astype("float") / mult).round().astype("Int64")
    adj["factor"] = mult
    return adj, acts, issues
