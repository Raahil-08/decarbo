"""Indian number and currency formatting utilities."""

import math


def format_indian_number(value: float, decimals: int | None = None) -> str:
    """Format a number according to the Indian numbering system (e.g. 12,34,567.89)."""
    if value is None:
        return "0"

    is_negative = value < 0
    val = abs(value)

    if decimals is not None:
        val_rounded = round(val, decimals)
        if decimals > 0:
            formatted_str = f"{val_rounded:.{decimals}f}"
            int_part, dec_part = formatted_str.split(".")
        else:
            int_part = str(int(val_rounded))
            dec_part = ""
    else:
        # Auto format: if it's close to integer, no decimals; else up to 3 decimals
        if math.isclose(val, round(val), abs_tol=1e-5):
            int_part = str(int(round(val)))
            dec_part = ""
        else:
            # strip trailing zeros after decimal
            dec_part_val = f"{val - int(val):.3f}"[2:].rstrip("0")
            int_part = str(int(val))
            dec_part = dec_part_val

    # Indian grouping for integer part
    if len(int_part) <= 3:
        grouped = int_part
    else:
        last3 = int_part[-3:]
        remaining = int_part[:-3]
        groups = []
        while len(remaining) > 2:
            groups.insert(0, remaining[-2:])
            remaining = remaining[:-2]
        if remaining:
            groups.insert(0, remaining)
        groups.append(last3)
        grouped = ",".join(groups)

    result = f"{grouped}.{dec_part}" if dec_part else grouped
    return f"-{result}" if is_negative else result


def format_inr(amount: float, decimals: int = 0) -> str:
    """Format money in INR: e.g. ₹12,34,567."""
    formatted = format_indian_number(amount, decimals=decimals)
    return f"₹{formatted}"


def format_lakh(amount: float) -> str:
    """Format money in Lakh: e.g. ₹12.3 L."""
    lakhs = amount / 100000.0
    return f"₹{lakhs:.1f} L"


def format_crore(amount: float) -> str:
    """Format money in Crore: e.g. ₹1.2 Cr."""
    crores = amount / 10000000.0
    return f"₹{crores:.2f} Cr"


def format_emissions_t(kgco2e: float) -> str:
    """Format kgCO2e as tCO2e with 1 decimal: e.g. 12.3 tCO2e."""
    t = kgco2e / 1000.0
    return f"{t:.1f} tCO2e"
