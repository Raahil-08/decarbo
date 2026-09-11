"""Unit conversion and normalisation engine using pint with Indian SME aliases."""

from pint import DimensionalityError, UndefinedUnitError, UnitRegistry

ureg = UnitRegistry()

# Add Indian SME industrial aliases and units to registry
# SCM: Standard Cubic Meter
ureg.define("scm = 1 * meter ** 3 = SCM")
# Quintal: 100 kg
ureg.define("quintal = 100 * kilogram = qtl")
# Kiloliter: 1000 L
ureg.define("kiloliter = 1000 * liter = kl = KL")

# Unit aliases mapping before passing to Pint
UNIT_ALIASES: dict[str, str] = {
    "units": "kWh",
    "unit": "kWh",
    "kwh": "kWh",
    "kvah": "kVAh",
    "ltr": "L",
    "lit": "L",
    "litre": "L",
    "litres": "L",
    "liter": "L",
    "liters": "L",
    "mt": "t",
    "tonne": "t",
    "tonnes": "t",
    "ton": "t",
    "tons": "t",
    "scm": "scm",
    "SCM": "scm",
    "qtl": "quintal",
    "quintal": "quintal",
    "kl": "KL",
    "KL": "KL",
    "m3": "m**3",
    "m^3": "m**3",
    "t*km": "tonne * kilometer",
    "tkm": "tonne * kilometer",
    "t-km": "tonne * kilometer",
}


class UnitError(Exception):
    """Base unit error."""

    pass


class UnitDimensionError(UnitError):
    """Raised when converting between incompatible physical dimensions."""

    pass


class UnitParseError(UnitError):
    """Raised when unit string cannot be parsed."""

    pass


def normalize_unit_string(unit_str: str) -> str:
    """Normalize common raw string aliases before Pint parsing."""
    if not unit_str or not str(unit_str).strip():
        raise UnitParseError("Unit cannot be empty or null")

    cleaned = str(unit_str).strip()
    return UNIT_ALIASES.get(cleaned, UNIT_ALIASES.get(cleaned.lower(), cleaned))


def convert_to_canonical(quantity: float, from_unit: str, to_unit: str) -> float:
    """Convert a quantity from a source unit to the canonical unit.

    Raises:
        UnitParseError: If either unit string cannot be parsed.
        UnitDimensionError: If from_unit and to_unit have different physical dimensions.
    """
    if quantity is None:
        raise ValueError("Quantity cannot be None")

    norm_from = normalize_unit_string(from_unit)
    norm_to = normalize_unit_string(to_unit)

    try:
        qty_obj = ureg.Quantity(float(quantity), norm_from)
    except (UndefinedUnitError, Exception) as e:
        raise UnitParseError(f"Cannot parse source unit '{from_unit}': {e}") from e

    try:
        converted = qty_obj.to(norm_to)
        return float(converted.magnitude)
    except DimensionalityError as e:
        raise UnitDimensionError(
            f"Dimension mismatch: cannot convert '{from_unit}' to '{to_unit}' ({e})"
        ) from e
    except (UndefinedUnitError, Exception) as e:
        raise UnitParseError(f"Cannot parse target unit '{to_unit}': {e}") from e


def are_units_compatible(from_unit: str, to_unit: str) -> bool:
    """Check if two unit strings share the same physical dimensionality."""
    try:
        convert_to_canonical(1.0, from_unit, to_unit)
        return True
    except (UnitDimensionError, UnitParseError, ValueError):
        return False
