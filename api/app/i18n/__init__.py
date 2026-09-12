"""Server-side i18n dictionary loader for reports."""

import json
from functools import lru_cache
from pathlib import Path

I18N_DIR = Path(__file__).resolve().parent


@lru_cache
def _load_strings(locale: str) -> dict[str, str]:
    file_path = I18N_DIR / f"{locale}.json"
    if not file_path.exists():
        file_path = I18N_DIR / "en.json"
    try:
        with open(file_path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def get_i18n(locale: str = "en") -> dict[str, str]:
    """Get translation mapping for locale with English fallback for missing keys."""
    en_dict = _load_strings("en")
    if locale == "en":
        return en_dict

    loc_dict = _load_strings(locale)
    # Merge with English fallback
    merged = dict(en_dict)
    merged.update(loc_dict)
    return merged
