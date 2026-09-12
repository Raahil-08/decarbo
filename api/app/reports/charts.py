"""SVG Chart Generators for PDF Report using Matplotlib non-interactive Agg backend."""

import io
from typing import Any

# Ensure non-interactive backend
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

# Decarbo brand tokens per PRD §17.4
COLOR_INK = "#1D2A45"
COLOR_BRASS = "#A97A2B"
COLOR_LEAF = "#2D7A57"
COLOR_EMBER = "#B5432C"
COLOR_PAPER = "#F7F8FA"
COLOR_RULE = "#D6DAE1"
COLOR_MUTED = "#5A6478"


def render_emissions_breakdown_svg(
    scope_totals: dict[str, float],
    locale: str = "en",
) -> str:
    """Render a clean horizontal stacked bar SVG showing Scope 1, 2, 3 emissions.

    scope_totals: dict with keys "scope_1", "scope_2", "scope_3" in kgCO2e or tCO2e.
    """
    s1 = float(scope_totals.get("scope_1", 0.0))
    s2 = float(scope_totals.get("scope_2", 0.0))
    s3 = float(scope_totals.get("scope_3", 0.0))

    # Normalize to tCO2e if large
    if s1 > 1000 or s2 > 1000 or s3 > 1000:
        s1 /= 1000.0
        s2 /= 1000.0
        s3 /= 1000.0

    total = s1 + s2 + s3
    p1 = (s1 / total * 100) if total > 0 else 0
    p2 = (s2 / total * 100) if total > 0 else 0
    p3 = (s3 / total * 100) if total > 0 else 0

    loc = {
        "s1": f"Scope 1 Direct ({s1:.1f} t, {p1:.0f}%)",
        "s2": f"Scope 2 Electricity ({s2:.1f} t, {p2:.0f}%)",
        "s3": f"Scope 3 Value Chain ({s3:.1f} t, {p3:.0f}%)",
    }

    fig, ax = plt.subplots(figsize=(7.5, 1.4), dpi=150)
    fig.patch.set_facecolor("white")
    ax.set_facecolor("white")

    # Horizontal stacked bar
    left = 0.0
    for val, color, label in [
        (s1, COLOR_EMBER, loc["s1"]),
        (s2, COLOR_BRASS, loc["s2"]),
        (s3, COLOR_INK, loc["s3"]),
    ]:
        if val > 0:
            ax.barh(0, val, left=left, color=color, height=0.5, edgecolor="white", linewidth=1.5, label=label)
            left += val

    ax.set_xlim(0, max(total * 1.02, 1.0))
    ax.set_ylim(-0.5, 0.5)
    ax.axis("off")

    from matplotlib.patches import Patch
    handles = [
        Patch(facecolor=COLOR_EMBER, edgecolor="none", label=loc["s1"]),
        Patch(facecolor=COLOR_BRASS, edgecolor="none", label=loc["s2"]),
        Patch(facecolor=COLOR_INK, edgecolor="none", label=loc["s3"]),
    ]
    ax.legend(
        handles=handles,
        loc="center",
        bbox_to_anchor=(0.5, -0.4),
        ncol=3,
        frameon=False,
        fontsize=8,
        handlelength=1.2,
        handleheight=0.8,
    )

    plt.tight_layout(pad=0.2)

    buf = io.StringIO()
    plt.savefig(buf, format="svg", bbox_inches="tight", transparent=True)
    plt.close(fig)

    svg_str = buf.getvalue()
    return svg_str


def render_macc_chart_svg(
    macc_items: list[dict[str, Any]],
    selected_codes: set[str] | None = None,
    locale: str = "en",
) -> str:
    """Render a publication-quality Marginal Abatement Cost Curve (MACC) step chart SVG."""
    if not macc_items:
        return '<svg width="600" height="200"><text x="50%" y="50%" text-anchor="middle" fill="#5A6478">No MACC data</text></svg>'

    selected = selected_codes or set()

    # Sort items by cost_per_tonne_inr ascending (standard MACC order)
    sorted_items = sorted(macc_items, key=lambda x: float(x.get("cost_per_tonne_inr", 0.0)))

    fig, ax = plt.subplots(figsize=(8.0, 3.8), dpi=150)
    fig.patch.set_facecolor("white")
    ax.set_facecolor(COLOR_PAPER)

    # Grid rules
    ax.grid(True, linestyle="--", alpha=0.5, color=COLOR_RULE, zorder=0)
    ax.axhline(0, color=COLOR_INK, linewidth=1.2, zorder=3)

    current_x = 0.0
    has_negative = False
    has_positive = False

    for item in sorted_items:
        cut = max(float(item.get("tco2_cut") or item.get("reduction_tco2e") or 0.0), 0.01)
        cost = float(item.get("cost_per_tonne_inr", 0.0))
        code = str(item.get("code") or item.get("intervention_code", ""))
        is_sel = (code in selected) or bool(item.get("in_selected_plan")) or bool(item.get("is_selected"))

        if cost < 0:
            color = COLOR_LEAF
            has_negative = True
        else:
            color = COLOR_BRASS
            has_positive = True

        edgecolor = COLOR_INK if is_sel else "white"
        linewidth = 2.0 if is_sel else 0.8
        alpha = 1.0 if (not selected or is_sel) else 0.55

        ax.bar(
            x=current_x + cut / 2.0,
            height=cost,
            width=cut,
            color=color,
            edgecolor=edgecolor,
            linewidth=linewidth,
            alpha=alpha,
            zorder=4,
        )

        current_x += cut

    loc = {
        "xlabel": "Annual Emissions Abatement Potential (tCO₂e / yr)",
        "ylabel": "Abatement Cost (₹ / tCO₂e)",
        "title": "Marginal Abatement Cost Curve (MACC)",
        "leaf_legend": "Pays for itself (Net Savings)",
        "brass_legend": "Net Cost",
        "selected_legend": "In Selected Plan",
    }

    ax.set_xlabel(loc["xlabel"], fontsize=9, fontweight="medium", color=COLOR_INK, labelpad=6)
    ax.set_ylabel(loc["ylabel"], fontsize=9, fontweight="medium", color=COLOR_INK, labelpad=6)
    ax.set_title(loc["title"], fontsize=11, fontweight="bold", color=COLOR_INK, pad=10, loc="left")

    ax.set_xlim(0, max(current_x * 1.04, 10.0))
    ax.tick_params(axis="both", which="major", labelsize=8, colors=COLOR_MUTED)

    for spine in ["top", "right"]:
        ax.spines[spine].set_visible(False)
    ax.spines["left"].set_color(COLOR_RULE)
    ax.spines["bottom"].set_color(COLOR_RULE)

    from matplotlib.patches import Patch
    legend_elements = []
    if has_negative:
        legend_elements.append(Patch(facecolor=COLOR_LEAF, edgecolor="none", label=loc["leaf_legend"]))
    if has_positive:
        legend_elements.append(Patch(facecolor=COLOR_BRASS, edgecolor="none", label=loc["brass_legend"]))
    if selected:
        legend_elements.append(
            Patch(facecolor="none", edgecolor=COLOR_INK, linewidth=1.5, label=loc["selected_legend"])
        )

    if legend_elements:
        ax.legend(
            handles=legend_elements,
            loc="upper right",
            frameon=True,
            facecolor="white",
            edgecolor=COLOR_RULE,
            fontsize=8,
        )

    plt.tight_layout()

    buf = io.StringIO()
    plt.savefig(buf, format="svg", bbox_inches="tight", transparent=False)
    plt.close(fig)

    return buf.getvalue()
