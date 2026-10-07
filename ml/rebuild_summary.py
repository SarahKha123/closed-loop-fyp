"""Recompute the summary CSV from the raw UCI files, and compare it with the committed one.

Only needed to verify or regenerate `data/hydraulic_condition_monitoring_summary.csv`
(needs the 531 MB raw files: `bash ml/get_data.sh`).

    python -m ml.rebuild_summary            # compare only
    python -m ml.rebuild_summary --write    # overwrite the CSV with the rebuilt one
"""

from __future__ import annotations

import sys

from . import features


def main() -> None:
    rebuilt = features.build_summary()
    if features.SUMMARY_CSV.exists():
        current = features.load_summary()
        diff = (rebuilt - current).abs().max().max()
        # Both sides are rounded to 4 decimals, so the same value can land one unit apart in the last place.
        tolerance = 10**-features.DECIMALS + 1e-9
        verdict = "matches" if diff <= tolerance else "DIFFERS from"
        print(f"rebuilt summary {verdict} {features.SUMMARY_CSV.name} (max abs difference {diff:.6f})")
    if "--write" in sys.argv:
        rebuilt.to_csv(features.SUMMARY_CSV, float_format=f"%.{features.DECIMALS}f")
        print(f"wrote {features.SUMMARY_CSV}")


if __name__ == "__main__":
    main()
