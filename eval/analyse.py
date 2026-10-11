"""Turn evaluation runs into the Part B report (M10): tables + two charts.

    backend/.venv/bin/python eval/analyse.py eval/results/<name>.csv [more.csv …] [--ratings <filled>.csv]

Writes next to the first CSV:
    <name>.report.md        the tables below, ready to paste into Chapter 4
    <name>-tradeoff.png     RQ2: hallucination rate vs median latency, one point per model (local vs cloud)
    <name>-validator.png    RQ3: hallucination rate with the validator off vs on, per model

Metrics, per model × validator setting (failed runs are counted, then left out):
- grounding accuracy  matched / checked claims per insight, mean ± sd (insights with no checkable claim excluded)
- hallucination rate  share of final insights with ≥ 1 claim not in the snapshot
- first-attempt rate  the same for the first attempt — with the validator on, this is the regeneration rate
- coverage            names the expected component(s) and condition(s)
- latency             first token and total, median and p90 (total includes a retry)

With --ratings (eval/rate.py's sheet with rater_a / rater_b filled in; its
<sheet>-key.csv must sit next to it): mean usefulness per model and Cohen's κ (quadratic-weighted) between the
raters.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import pandas as pd  # noqa: E402

# Chart colours: the validated reference palette (dataviz skill), light surface.
SURFACE, INK, INK2, GRID = "#fcfcfb", "#0b0b0b", "#52514e", "#e1e0d9"
SLOT1, SLOT2 = "#2a78d6", "#eb6834"  # blue, orange


def pct(x: float) -> str:
    return "–" if pd.isna(x) else f"{x * 100:.1f}%"


def secs(x: float) -> str:
    return "–" if pd.isna(x) else f"{x / 1000:.1f} s"


def summarise(df: pd.DataFrame) -> pd.DataFrame:
    ok = df[df["error"].isna() | (df["error"] == "")].copy()
    ok["accuracy"] = ok["matched"] / ok["checked"].where(ok["checked"] > 0)
    ok["covered"] = (ok["coversComponent"] == 1) & (ok["coversCondition"] == 1)
    g = ok.groupby(["model", "mode", "validator"])
    out = pd.DataFrame({
        "runs": g.size(),
        "accuracy_mean": g["accuracy"].mean(),
        "accuracy_sd": g["accuracy"].std(),
        "hallucination": 1 - g["grounded"].mean(),
        "first_attempt_hallucination": 1 - g["firstGrounded"].mean(),
        "coverage": g["covered"].mean(),
        "first_token_median": g["firstTokenMs"].median(),
        "first_token_p90": g["firstTokenMs"].quantile(0.9),
        "total_median": g["totalMs"].median(),
        "total_p90": g["totalMs"].quantile(0.9),
    })
    out["errors"] = df[~(df["error"].isna() | (df["error"] == ""))].groupby(["model", "mode", "validator"]).size()
    return out.fillna({"errors": 0}).reset_index()


def style(ax) -> None:
    ax.set_facecolor(SURFACE)
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)
    for side in ("left", "bottom"):
        ax.spines[side].set_color(GRID)
    ax.tick_params(colors=INK2, labelsize=9)
    ax.grid(color=GRID, linewidth=0.8)
    ax.set_axisbelow(True)


def tradeoff_chart(s: pd.DataFrame, path: Path) -> None:
    """RQ2. Uses validator-off runs where present (the model's own behaviour), else validator-on."""
    pick = s[s["validator"] == "off"]
    pick = pick if not pick.empty else s
    fig, ax = plt.subplots(figsize=(6.4, 4), facecolor=SURFACE)
    style(ax)
    for mode, colour, marker in (("local", SLOT1, "o"), ("cloud", SLOT2, "s")):
        m = pick[pick["mode"] == mode]
        if m.empty:
            continue
        ax.scatter(m["total_median"] / 1000, m["hallucination"] * 100, s=70, color=colour, marker=marker,
                   edgecolors=SURFACE, linewidths=2, label=mode, zorder=3)
        for _, r in m.iterrows():
            ax.annotate(r["model"], (r["total_median"] / 1000, r["hallucination"] * 100), xytext=(7, 4),
                        textcoords="offset points", fontsize=8.5, color=INK)
    ax.set_xlabel("Median time per insight (s)", color=INK2, fontsize=9.5)
    ax.set_ylabel("Hallucination rate (%)", color=INK2, fontsize=9.5)
    ax.set_ylim(bottom=0, top=max(5, (pick["hallucination"].max() or 0) * 110))
    ax.set_xlim(left=0)
    ax.set_title("Hallucination rate vs latency (validator off)", loc="left", color=INK, fontsize=11)
    ax.legend(frameon=False, fontsize=9, labelcolor=INK2)
    fig.tight_layout()
    fig.savefig(path, dpi=160)
    plt.close(fig)


def validator_chart(s: pd.DataFrame, path: Path) -> None:
    """RQ3: hallucination rate per model, validator off vs on (horizontal grouped bars)."""
    models = sorted(s["model"].unique())
    fig, ax = plt.subplots(figsize=(6.4, 0.9 + 0.75 * len(models)), facecolor=SURFACE)
    style(ax)
    ax.grid(axis="y", visible=False)
    h = 0.36
    for i, (setting, colour) in enumerate((("off", SLOT2), ("on", SLOT1))):
        vals = [s[(s["model"] == m) & (s["validator"] == setting)]["hallucination"].mean() * 100 for m in models]
        ys = [k + (i - 0.5) * (h + 0.04) for k in range(len(models))]
        bars = ax.barh(ys, [0 if pd.isna(v) else v for v in vals], height=h, color=colour,
                       label=f"validator {setting}", edgecolor=SURFACE, linewidth=2)
        for bar, v in zip(bars, vals):
            if not pd.isna(v):
                ax.annotate(f"{v:.0f}%", (bar.get_width(), bar.get_y() + h / 2), xytext=(4, 0),
                            textcoords="offset points", va="center", fontsize=8.5, color=INK2)
    ax.set_yticks(range(len(models)), models)
    ax.invert_yaxis()
    ax.set_xlabel("Insights with an unsupported claim (%)", color=INK2, fontsize=9.5)
    ax.set_xlim(0, 105)
    ax.set_title("Effect of the grounding validator", loc="left", color=INK, fontsize=11)
    ax.legend(frameon=False, fontsize=9, labelcolor=INK2, loc="lower right")
    fig.tight_layout()
    fig.savefig(path, dpi=160)
    plt.close(fig)


def ratings_section(path: Path, key_path: Path) -> list[str]:
    from sklearn.metrics import cohen_kappa_score  # noqa: PLC0415

    r = pd.read_csv(path).merge(pd.read_csv(key_path), on="sample")
    r = r.dropna(subset=["rater_a"])
    lines = ["## Usefulness ratings (1–5)", "", "| Model | Rated | Mean (rater A) | Mean (rater B) |", "|---|---|---|---|"]
    for model, g in r.groupby("model"):
        lines.append(f"| {model} | {len(g)} | {g['rater_a'].mean():.2f} | {g['rater_b'].mean():.2f} |")
    both = r.dropna(subset=["rater_b"])
    if len(both) >= 2:
        k = cohen_kappa_score(both["rater_a"].astype(int), both["rater_b"].astype(int), weights="quadratic")
        lines += ["", f"Inter-rater agreement: Cohen's κ (quadratic-weighted) = **{k:.2f}** on {len(both)} insights."]
    return lines + [""]


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("csv", nargs="+", type=Path)
    ap.add_argument("--ratings", type=Path, help="filled rating sheet from eval/rate.py")
    args = ap.parse_args()

    df = pd.concat([pd.read_csv(p, keep_default_na=True) for p in args.csv], ignore_index=True)
    if df.empty:
        sys.exit("no rows")
    s = summarise(df)
    base = args.csv[0].with_suffix("")
    tradeoff_chart(s, base.parent / f"{base.name}-tradeoff.png")
    validator_chart(s, base.parent / f"{base.name}-validator.png")

    lines = [f"# Insight evaluation — {', '.join(p.name for p in args.csv)}", "",
             f"{df['scenario'].nunique()} scenarios, {df['model'].nunique()} models, "
             f"{int(df['repeat'].max())} repeat(s), prompt {', '.join(df['promptVersion'].dropna().unique())}. "
             "Hallucination = the final text has at least one number, work order ID or condition not in the snapshot.", "",
             "## Per model and validator setting", "",
             "| Model | Mode | Validator | Runs | Grounding accuracy | Hallucination | First-attempt halluc. "
             "| Coverage | First token (median / p90) | Total (median / p90) | Errors |",
             "|---|---|---|---|---|---|---|---|---|---|---|"]
    for _, r in s.iterrows():
        sd = "" if pd.isna(r["accuracy_sd"]) else f" ± {r['accuracy_sd'] * 100:.1f}"
        lines.append(f"| {r['model']} | {r['mode']} | {r['validator']} | {r['runs']} | {pct(r['accuracy_mean'])}{sd} "
                     f"| {pct(r['hallucination'])} | {pct(r['first_attempt_hallucination'])} | {pct(r['coverage'])} "
                     f"| {secs(r['first_token_median'])} / {secs(r['first_token_p90'])} "
                     f"| {secs(r['total_median'])} / {secs(r['total_p90'])} | {int(r['errors'])} |")

    lines += ["", "## Validator effect (RQ3)", "",
              "| Model | Hallucination off → on | Accuracy off → on | Regeneration rate (on) | Median total off → on |",
              "|---|---|---|---|---|"]
    for model, g in s.groupby("model"):
        off, on = g[g["validator"] == "off"], g[g["validator"] == "on"]
        if off.empty or on.empty:
            continue
        o, n = off.iloc[0], on.iloc[0]
        lines.append(f"| {model} | {pct(o['hallucination'])} → {pct(n['hallucination'])} "
                     f"| {pct(o['accuracy_mean'])} → {pct(n['accuracy_mean'])} | {pct(n['first_attempt_hallucination'])} "
                     f"| {secs(o['total_median'])} → {secs(n['total_median'])} |")

    ok = df[df["error"].isna() | (df["error"] == "")]
    by_cat = ok.groupby(["category", "validator"]).agg(
        runs=("grounded", "size"), hallucination=("grounded", lambda x: 1 - x.mean()),
        coverage=("coversComponent", lambda x: ((x == 1) & (ok.loc[x.index, "coversCondition"] == 1)).mean()))
    lines += ["", "## By scenario category (all models)", "", "| Category | Validator | Runs | Hallucination | Coverage |",
              "|---|---|---|---|---|"]
    for (cat, v), r in by_cat.iterrows():
        lines.append(f"| {cat} | {v} | {r['runs']} | {pct(r['hallucination'])} | {pct(r['coverage'])} |")

    mism = ok[ok["mismatches"].notna() & (ok["mismatches"] != "")]
    if not mism.empty:
        top = mism["mismatches"].str.split("; ").explode().value_counts().head(10)
        lines += ["", "## Most frequent unsupported claims", "", "| Claim | Times |", "|---|---|"]
        lines += [f"| `{c}` | {n} |" for c, n in top.items()]

    lines += ["", f"![Trade-off]({base.name}-tradeoff.png)", "", f"![Validator effect]({base.name}-validator.png)", ""]
    if args.ratings:
        lines += ratings_section(args.ratings, args.ratings.with_name(args.ratings.stem + "-key.csv"))

    out = base.parent / f"{base.name}.report.md"
    out.write_text("\n".join(lines))
    print(f"→ {out}")


if __name__ == "__main__":
    main()
