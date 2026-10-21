#!/usr/bin/env python3
"""SlothBank forecaster: reads data/history.csv, prints one JSON document to stdout.

Per merchant it does two things with a tabular foundation model (TabPFN, run locally):
  1. Walk-forward anomaly check: for each bill with >= MIN_HISTORY earlier bills, fit on the past only,
     predict this bill's distribution, flag it if it falls outside the 5-95% band AND is >= MIN_DEV off.
  2. Next-month forecast (10/50/90% quantiles).
Also backtests the engine's median against a naive "same as last month" rule, so you can report it honestly.

Engines: tabpfn (default) | baseline (median/MAD rule; no ML deps, used for tests and as a comparison).
"""
import argparse, csv, json, statistics, sys
from collections import defaultdict
from datetime import date

MIN_HISTORY = 3
MIN_DEV = 0.05
CHECK_QS = [0.05, 0.5, 0.95]
FCST_QS = [0.1, 0.5, 0.9]


def parse_date(s):
    y, m, d = (int(x) for x in s.split("-"))
    return date(y, m, d)


def midx(d):
    return d.year * 12 + d.month - 1


def load(path):
    by = defaultdict(list)
    with open(path, newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            by[r["merchant"]].append(
                {"date": parse_date(r["billing_date"]), "value": float(r["total_due"]), "source_file": r["source_file"]}
            )
    for rows in by.values():
        rows.sort(key=lambda x: x["date"])
    return by


class Baseline:
    name = "baseline-median-mad"
    Z = {0.05: -1.645, 0.1: -1.2816, 0.5: 0.0, 0.9: 1.2816, 0.95: 1.645}

    def predict(self, X_tr, y_tr, X_te, qs):
        recent = y_tr[-4:]
        m = statistics.median(recent)
        mad = statistics.median([abs(v - m) for v in recent])
        s = max(1.4826 * mad, 0.02 * abs(m), 0.01)
        return [[m + self.Z[q] * s for q in qs] for _ in X_te]


class TabPFN:
    def __init__(self, version):
        from tabpfn import TabPFNRegressor  # imported lazily so --engine baseline needs no torch
        from tabpfn.constants import ModelVersion

        self.name = f"tabpfn-{version.lstrip('v')}"
        self.reg = TabPFNRegressor.create_default_for_version(ModelVersion(version))

    def predict(self, X_tr, y_tr, X_te, qs):
        import numpy as np

        self.reg.fit(np.array(X_tr, dtype=float), np.array(y_tr, dtype=float))
        out = self.reg.predict(np.array(X_te, dtype=float), output_type="quantiles", quantiles=[float(q) for q in qs])
        # TabPFN returns one array per quantile; we want one list of quantile values per test row.
        return [[float(out[j][i]) for j in range(len(qs))] for i in range(len(X_te))]


def r2(x):
    return None if x is None else round(float(x), 2)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--history", required=True)
    ap.add_argument("--engine", default="tabpfn", choices=["tabpfn", "baseline"])
    ap.add_argument("--model-version", default="v3.5")
    ap.add_argument("--forecast-method", choices=["engine", "last_value"], default="engine")
    a = ap.parse_args()

    try:
        by = load(a.history)
    except FileNotFoundError:
        sys.exit(f"history file not found: {a.history} (run `npm run seed` or process some bills first)")
    if not by:
        sys.exit("history is empty")

    eng = Baseline() if a.engine == "baseline" else TabPFN(a.model_version)
    as_of = max(r["date"] for rows in by.values() for r in rows)
    err_engine, err_naive, merchants, total = [], [], [], 0.0

    for merchant, rows in sorted(by.items()):
        base = midx(rows[0]["date"])
        X = [[midx(r["date"]) - base, r["date"].month] for r in rows]
        y = [r["value"] for r in rows]

        checks = []
        for k in range(MIN_HISTORY, len(rows)):
            lo, med, hi = sorted(eng.predict(X[:k], y[:k], [X[k]], CHECK_QS)[0])
            actual = y[k]
            dev = (actual - med) / med if med else 0.0
            flagged = (actual > hi or actual < lo) and abs(dev) >= MIN_DEV
            err_engine.append(abs(actual - med))
            err_naive.append(abs(actual - y[k - 1]))
            checks.append({
                "billing_date": rows[k]["date"].isoformat(), "source_file": rows[k]["source_file"],
                "actual": r2(actual), "p05": r2(lo), "median": r2(med), "p95": r2(hi),
                "deviation_pct": round(dev * 100, 1), "flagged": bool(flagged),
            })

        forecast = None
        if len(rows) >= MIN_HISTORY:
            last = rows[-1]["date"]
            ny, nm = last.year + last.month // 12, last.month % 12 + 1
            lo, engine_med, hi = sorted(eng.predict(X, y, [[(ny * 12 + nm - 1) - base, nm]], FCST_QS)[0])
            med = y[-1] if a.forecast_method == "last_value" else engine_med
            forecast = {
                "month": f"{ny}-{nm:02d}",
                "p10": r2(lo),
                "median": r2(med),
                "p90": r2(hi),
            }
            total += med

        merchants.append({
            "merchant": merchant, "n": len(rows),
            "series": [{"date": r["date"].isoformat(), "value": r2(r["value"]), "source_file": r["source_file"]} for r in rows],
            "forecast": forecast, "checks": checks,
        })

    n = len(err_engine)
    print(json.dumps({
        "engine": eng.name, "as_of": as_of.isoformat(),
        "config": {"min_history": MIN_HISTORY, "min_dev": MIN_DEV, "check_band": [0.05, 0.95]},
        "next_month_total_median": r2(total) if any(m["forecast"] for m in merchants) else None,
        "backtest": {"n": n, "engine_mae": r2(sum(err_engine) / n) if n else None,
                     "naive_last_mae": r2(sum(err_naive) / n) if n else None},
        "merchants": merchants,
    }))


if __name__ == "__main__":
    main()
