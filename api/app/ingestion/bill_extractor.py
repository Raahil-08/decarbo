"""Electricity bill extraction and tariff computation engine per PRD §9.5."""

from io import BytesIO
from typing import Any

import pdfplumber

from app.ingestion.llm import BillExtractionResult, LLMProvider, get_llm_provider


def extract_bill_document(
    file_bytes: bytes,
    filename: str,
    provider: LLMProvider | None = None,
) -> tuple[BillExtractionResult, dict[str, Any] | None, list[dict[str, Any]]]:
    """Extract electricity bill fields, compute variable tariff, and build proposed activity record.

    Returns:
        (BillExtractionResult, proposed_activity_record, issues_list)
    """
    if provider is None:
        provider = get_llm_provider()

    text_content = ""
    issues: list[dict[str, Any]] = []

    # 1. Extract text from PDF
    if filename.lower().endswith(".pdf"):
        try:
            with pdfplumber.open(BytesIO(file_bytes)) as pdf:
                pages_text = [page.extract_text() or "" for page in pdf.pages]
                text_content = "\n".join(pages_text)
        except Exception as e:
            return (
                BillExtractionResult(),
                None,
                [{"row": 0, "field": "file", "code": "PDF_READ_ERROR", "message_key": "errors.pdf_read_error", "severity": "block", "details": str(e)}],
            )
    else:
        # Image or text
        text_content = file_bytes.decode("utf-8", errors="replace")

    # 2. Extract structured fields via LLM or rule-based fallback
    extraction = provider.extract_bill_data(text_content=text_content)

    # 3. Sanity checks on extracted data
    if not extraction.units_kwh or extraction.units_kwh <= 0:
        issues.append({
            "row": 0,
            "field": "units_kwh",
            "code": "MISSING_KWH",
            "message_key": "errors.units_kwh_not_found",
            "severity": "block",
        })
        return extraction, None, issues

    # 4. Compute variable tariff: (energy charges + electricity duty + fuel surcharge) / kWh
    kwh = float(extraction.units_kwh)
    energy_chg = float(extraction.energy_charges_inr or 0.0)
    duty = float(extraction.electricity_duty_inr or 0.0)
    fuel_sur = float(extraction.fuel_surcharge_inr or 0.0)

    var_charges = energy_chg + duty + fuel_sur
    implied_tariff = (var_charges / kwh) if (var_charges > 0 and kwh > 0) else None

    # Fallback to total amount / kwh if individual breakdown not itemised
    if implied_tariff is None and extraction.total_amount_inr and extraction.total_amount_inr > 0:
        implied_tariff = float(extraction.total_amount_inr) / kwh

    # Sanity checks: implied ₹/kWh must be between 3 and 20
    if implied_tariff is not None:
        if implied_tariff < 3.0 or implied_tariff > 20.0:
            issues.append({
                "row": 0,
                "field": "tariff",
                "code": "TARIFF_OUT_OF_RANGE",
                "message_key": "warnings.implied_tariff_out_of_range",
                "severity": "flag",
                "details": {"implied_tariff": round(implied_tariff, 2)},
            })
    else:
        implied_tariff = 8.0  # Default fallback per PRD §9.5

    # 5. Determine period month (assign to month containing period end)
    p_end = extraction.billing_period_end or extraction.billing_period_start or "2026-04-30"
    month_str = p_end[:7].replace("/", "-")

    # 6. Build proposed draft activity record
    total_cost = float(extraction.total_amount_inr or var_charges or (kwh * implied_tariff))

    proposed_record = {
        "period_month": f"{month_str}-01",
        "activity_type": "grid_electricity",
        "quantity": kwh,
        "unit": "kWh",
        "quantity_canonical": kwh,
        "cost_inr": round(total_cost, 2),
        "source_note": f"Electricity bill {extraction.discom_name or ''} {extraction.consumer_number or ''}".strip(),
        "confidence": extraction.field_confidence.get("units_kwh", 0.90),
        "attributes": {
            "discom_name": extraction.discom_name,
            "consumer_number": extraction.consumer_number,
            "billing_period_start": extraction.billing_period_start,
            "billing_period_end": extraction.billing_period_end,
            "variable_tariff_inr_per_kwh": round(implied_tariff, 2) if implied_tariff else None,
            "total_bill_amount_inr": extraction.total_amount_inr,
        },
    }

    return extraction, proposed_record, issues
