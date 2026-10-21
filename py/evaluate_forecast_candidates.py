#!/usr/bin/env python3
"""Compare point-forecast candidates on identical walk-forward splits."""
import csv
import statistics
from collections import defaultdict
from datetime import date
from pathlib import Path

HISTORY = Path("data/history.csv")

def main():
    groups = defaultdict(list)
    with HISTORY.open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            groups[row["merchant"]].append(
                (date.fromisoformat(row["billing_date"]), float(row["total_due"]))
            )

    errors = defaultdict(list)
    per_merchant = defaultdict(lambda: defaultdict(list))

    for merchant, rows in sorted(groups.items()):
        rows.sort(key=lambda item: item[0])
        values = [value for _, value in rows]

        for k in range(3, len(values)):
            past, actual = values[:k], values[k]
            predictions = {
                "last_value": past[-1],
                "rolling_median_2": statistics.median(past[-2:]),
                "rolling_median_4": statistics.median(past[-4:]),
            }
            for name, prediction in predictions.items():
                error = abs(actual - prediction)
                errors[name].append(error)
                per_merchant[merchant][name].append(error)

    if not errors or not errors["last_value"]:
        raise SystemExit("Not enough historical rows for walk-forward evaluation.")

    print(f"History: {HISTORY}")
    print(f"Walk-forward test cases: {len(errors['last_value'])}")
    print("All candidates use the same splits and only earlier bills.")
    print()
    print(f"{'Candidate':22} {'MAE ($)':>10} {'Median AE ($)':>15}")
    print("-" * 50)
    for name, values in errors.items():
        print(
            f"{name:22} {statistics.mean(values):10.2f} "
            f"{statistics.median(values):15.2f}"
        )

    print("\nPer-merchant MAE ($):")
    for merchant, candidates in sorted(per_merchant.items()):
        print(f"  {merchant}")
        for name, values in candidates.items():
            print(f"    {name}: {statistics.mean(values):.2f} (n={len(values)})")

if __name__ == "__main__":
    main()
