"""Figures and statistics for docs/DATASET.md, computed from the summary CSV.

    cd backend && python -m ml.dataset_report

Writes docs/img/dataset_conditions_over_cycles.png and
docs/img/dataset_top_feature_by_condition.png, and prints the numbers the
documentation quotes (so they can be re-checked).
"""

from __future__ import annotations

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import pandas as pd  # noqa: E402

from . import features, labels  # noqa: E402

IMG = features.REPO / "docs" / "img"
GRADE_COLUMNS = {
    "Cooler condition (%)": "cooler_condition_pct",
    "Valve condition (%)": "valve_condition_pct",
    "Pump leakage (0 none – 2 severe)": "pump_leakage",
    "Accumulator pressure (bar)": "accumulator_bar",
}
# The feature most correlated (Spearman) with each component's condition — see main().
CLASS_COLOURS = {"Optimal": "#0ca30c", "Degraded": "#fab219", "Critical": "#d03b3b"}


def segments(s: pd.Series) -> pd.DataFrame:
    run = (s != s.shift()).cumsum()
    return s.groupby(run).agg(value="first", length="size")


def plot_conditions(df: pd.DataFrame) -> None:
    fig, axes = plt.subplots(5, 1, figsize=(10, 9), sharex=True)
    for ax, (title, col) in zip(axes, GRADE_COLUMNS.items()):
        ax.step(df.index, df[col], where="post", color="#2a78d6", linewidth=1)
        ax.set_ylabel(title, rotation=0, ha="right", va="center", fontsize=9)
        ax.spines[["top", "right"]].set_visible(False)
    ax = axes[-1]
    ax.fill_between(df.index, 0, df["stable_flag"], step="post", color="#898781", alpha=0.6)
    ax.set_ylabel("Stable flag\n(1 = not yet stable)", rotation=0, ha="right", va="center", fontsize=9)
    ax.set_yticks([0, 1])
    ax.spines[["top", "right"]].set_visible(False)
    ax.set_xlabel("Cycle (replay order)")
    fig.suptitle("Component conditions across the 2,205 cycles, in recorded order")
    fig.tight_layout()
    fig.savefig(IMG / "dataset_conditions_over_cycles.png", dpi=140)
    plt.close(fig)


def plot_top_features(df: pd.DataFrame, y: pd.DataFrame, top: dict[str, str]) -> None:
    fig, axes = plt.subplots(1, 4, figsize=(13, 3.6))
    for ax, comp in zip(axes, labels.COMPONENTS):
        feat = top[comp]
        data = [df.loc[y[comp] == k, feat] for k in range(3)]
        box = ax.boxplot(data, tick_labels=list(labels.CLASSES), patch_artist=True, widths=0.6)
        for patch, cls in zip(box["boxes"], labels.CLASSES):
            patch.set_facecolor(CLASS_COLOURS[cls])
            patch.set_alpha(0.75)
        ax.set_title(f"{comp.capitalize()}: {feat}", fontsize=10)
        ax.spines[["top", "right"]].set_visible(False)
        ax.tick_params(axis="x", labelsize=8)
    fig.suptitle("The most condition-correlated feature per component, by class")
    fig.tight_layout()
    fig.savefig(IMG / "dataset_top_feature_by_condition.png", dpi=140)
    plt.close(fig)


def main() -> None:
    IMG.mkdir(parents=True, exist_ok=True)
    df = features.load_summary()
    y = labels.load_labels()
    feats = list(features.FEATURE_NAMES)

    print(f"rows {len(df)}, columns {len(df.columns) + 1} (cycle + {len(df.columns)}), "
          f"missing {int(df.isna().sum().sum())}")
    print("stable flag:", df["stable_flag"].value_counts().sort_index().to_dict())
    for comp in labels.COMPONENTS:
        counts = [int((y[comp] == k).sum()) for k in range(3)]
        print(f"{comp:<12} classes (O/D/C) {counts}")

    print("\nsegments in recorded order (value, length):")
    for title, col in GRADE_COLUMNS.items():
        seg = segments(df[col])
        print(f"  {title:<34} {len(seg):>3} segments, lengths {seg.length.min()}–{seg.length.max()}; "
              f"first: {list(zip(seg.value.astype(int), seg.length))[:5]}")
    changes = int((df[list(GRADE_COLUMNS.values())].diff().abs().sum(axis=1) > 0).sum())
    print(f"cycles where at least one condition changes: {changes}")
    combos = df[list(GRADE_COLUMNS.values())].drop_duplicates()
    print(f"distinct condition combinations: {len(combos)}")

    constant = [c for c in feats if df[c].std() == 0]
    print(f"\nconstant features (zero variance): {constant}")
    print(f"cycles with PS4_mean == 0: {int((df['PS4_mean'] == 0).sum())}")

    print("\nmost correlated features per component (|Spearman rho| with the graded value):")
    top: dict[str, str] = {}
    varying = [c for c in feats if c not in constant]
    for comp in labels.COMPONENTS:
        col = GRADE_COLUMNS[[k for k, v in GRADE_COLUMNS.items() if v.startswith(comp)][0]]
        rho = df[varying].corrwith(df[col], method="spearman").abs().sort_values(ascending=False)
        top[comp] = rho.index[0]
        print(f"  {comp:<12} " + ", ".join(f"{f} {r:.2f}" for f, r in rho.head(4).items()))

    print("\nsensor means (min / mean / max over cycles):")
    for s in features.SENSORS:
        c = df[f"{s}_mean"]
        print(f"  {s:<5} {c.min():10.3f} {c.mean():10.3f} {c.max():10.3f}")

    plot_conditions(df)
    plot_top_features(df, y, top)
    print(f"\nwrote figures to {IMG}")


if __name__ == "__main__":
    main()
