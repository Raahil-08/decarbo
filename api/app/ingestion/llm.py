"""LLM provider interface and deterministic rule-based fallback for ingestion."""

import re
from typing import Any, Protocol

from pydantic import BaseModel, Field

from app.config import get_settings

# ==============================================================================
# Pydantic Schemas (PRD §9.4 and §9.5)
# ==============================================================================

class ItemMapping(BaseModel):
    source_label: str
    activity_type: str | None = None
    confidence: float = 1.0
    needs_user_input: list[str] = Field(default_factory=list)
    reason: str | None = None


class TableMappingResult(BaseModel):
    sheet: str
    header_row_index: int = 0
    layout: str = "long"  # "long" | "wide"
    columns: dict[str, str] = Field(default_factory=dict)
    item_mappings: list[ItemMapping] = Field(default_factory=list)
    questions_for_user: list[str] = Field(default_factory=list)


class BillExtractionResult(BaseModel):
    discom_name: str | None = None
    consumer_number: str | None = None
    tariff_category: str | None = None
    billing_period_start: str | None = None
    billing_period_end: str | None = None
    units_kwh: float | None = None
    units_kvah: float | None = None
    solar_export_kwh: float | None = None
    contract_demand_kva: float | None = None
    max_demand_kva: float | None = None
    power_factor: float | None = None
    energy_charges_inr: float | None = None
    fixed_or_demand_charges_inr: float | None = None
    electricity_duty_inr: float | None = None
    fuel_surcharge_inr: float | None = None
    total_amount_inr: float | None = None
    field_confidence: dict[str, float] = Field(default_factory=dict)
    notes: str | None = None


# ==============================================================================
# Provider Protocol
# ==============================================================================

class LLMProvider(Protocol):
    def propose_table_mapping(
        self,
        sheet_name: str,
        header_candidates: list[list[str]],
        sample_rows: list[list[Any]],
        distinct_items: list[str],
        canonical_activities: list[dict[str, Any]],
    ) -> TableMappingResult:
        ...

    def extract_bill_data(
        self,
        text_content: str,
        image_bytes: bytes | None = None,
    ) -> BillExtractionResult:
        ...


# ==============================================================================
# Deterministic Rule-Based Provider (Offline / LLM_ENABLED=false)
# ==============================================================================

class RuleBasedProvider:
    """Deterministic, high-accuracy offline mapper using synonym rules and regex."""

    COLUMN_CANDIDATES = {
        "date_or_month": ["date", "invoice date", "bill date", "vch date", "month", "period"],
        "item": ["particulars", "item name", "item", "description", "product", "material"],
        "quantity": ["quantity", "qty", "billed qty", "volume", "weight"],
        "unit": ["unit", "uom", "measure"],
        "cost_inr": ["gross value", "gross amount", "net amount", "amount", "total", "value", "cost"],
    }

    NON_EMISSION_KEYWORDS = [
        "stationery", "paper roll", "tea", "pantry", "cleaning", "canteen", "repair", "service", "maintenance"
    ]

    def propose_table_mapping(
        self,
        sheet_name: str,
        header_candidates: list[list[str]],
        sample_rows: list[list[Any]],
        distinct_items: list[str],
        canonical_activities: list[dict[str, Any]],
    ) -> TableMappingResult:
        # 1. Identify header row index and column mapping
        header_row_idx = 0
        best_cols: dict[str, str] = {}

        for idx, row in enumerate(header_candidates):
            matched = {}
            for col_key, candidates in self.COLUMN_CANDIDATES.items():
                for orig_cell in row:
                    if orig_cell is not None and str(orig_cell).strip().lower() in candidates:
                        matched[col_key] = str(orig_cell).strip()
                        break
            if len(matched) >= 3:
                header_row_idx = idx
                best_cols = matched
                break

        # 2. Build synonym lookup map from canonical activities
        synonym_to_key = {}
        for act in canonical_activities:
            key = act.get("key")
            label_en = act.get("label_en", "").lower()
            synonyms = act.get("synonyms", [])
            synonym_to_key[key.lower()] = key
            synonym_to_key[label_en] = key
            for syn in synonyms:
                synonym_to_key[syn.lower().strip()] = key

        # 3. Map distinct items
        item_mappings: list[ItemMapping] = []
        questions: list[str] = []
        asked_recycled_question = False

        for item in distinct_items:
            item_clean = str(item).strip()
            item_lower = item_clean.lower()

            # Check if non-emission
            if any(k in item_lower for k in self.NON_EMISSION_KEYWORDS):
                item_mappings.append(ItemMapping(
                    source_label=item_clean,
                    activity_type=None,
                    confidence=0.95,
                    reason="Non-emission office/administrative supply",
                ))
                continue

            matched_key = None
            confidence = 0.0

            # Match brass rod
            if "brass" in item_lower and any(w in item_lower for w in ["rod", "hex", "hollow", "is319", "bar"]):
                matched_key = "brass_input_primary"
                confidence = 0.88
                item_mappings.append(ItemMapping(
                    source_label=item_clean,
                    activity_type=matched_key,
                    confidence=confidence,
                    needs_user_input=["recycled_share"],
                ))
                if not asked_recycled_question:
                    questions.append("What percentage of purchased brass rod contains recycled/secondary content?")
                    asked_recycled_question = True
                continue

            # Match diesel
            if any(w in item_lower for w in ["hsd", "diesel", "high speed diesel"]):
                matched_key = "diesel"
                confidence = 0.96

            # Match furnace oil
            elif any(w in item_lower for w in ["furnace oil", "lshs", "heavy fuel oil", "fo"]):
                matched_key = "furnace_oil"
                confidence = 0.95

            # Match cutting oil
            elif any(w in item_lower for w in ["cutting oil", "servocut", "coolant", "soluble oil"]):
                matched_key = "cutting_oil"
                confidence = 0.92

            # Match packaging
            elif any(w in item_lower for w in ["carton", "corrugated", "5-ply", "7-ply", "box"]):
                matched_key = "packaging_corrugated"
                confidence = 0.90
            elif any(w in item_lower for w in ["stretch film", "ldpe", "polythene", "plastic"]):
                matched_key = "packaging_plastic"
                confidence = 0.88

            # Match freight
            elif "freight" in item_lower or "transport" in item_lower:
                if any(w in item_lower for w in ["heavy", "truck", "hgv", "container"]):
                    matched_key = "road_freight_hgv"
                    confidence = 0.85
                else:
                    matched_key = "road_freight_lcv"
                    confidence = 0.80

            # Direct synonym matching
            if not matched_key:
                for syn, act_key in synonym_to_key.items():
                    if syn in item_lower:
                        matched_key = act_key
                        confidence = 0.80
                        break

            if matched_key:
                item_mappings.append(ItemMapping(
                    source_label=item_clean,
                    activity_type=matched_key,
                    confidence=confidence,
                ))
            else:
                item_mappings.append(ItemMapping(
                    source_label=item_clean,
                    activity_type=None,
                    confidence=0.50,
                    reason="Unrecognized item label",
                ))

        return TableMappingResult(
            sheet=sheet_name,
            header_row_index=header_row_idx,
            layout="long",
            columns=best_cols,
            item_mappings=item_mappings,
            questions_for_user=questions,
        )

    def extract_bill_data(
        self,
        text_content: str,
        image_bytes: bytes | None = None,
    ) -> BillExtractionResult:
        """Extract billing parameters from GUVNL/PGVCL/Discom bill text using regex heuristics."""
        res = BillExtractionResult()
        txt = text_content or ""

        # Discom name
        if "PGVCL" in txt or "PASCHIM GUJARAT" in txt.upper():
            res.discom_name = "Paschim Gujarat Vij Company Ltd. (PGVCL)"
        elif "GUVNL" in txt:
            res.discom_name = "GUVNL"
        elif "UGVCL" in txt:
            res.discom_name = "UGVCL"
        elif "MGVCL" in txt:
            res.discom_name = "MGVCL"
        elif "DGVCL" in txt:
            res.discom_name = "DGVCL"

        # Consumer number
        c_match = re.search(r"Consumer\s*(?:No|Number|ID)[:\s]*([*•A-Z0-9\-/]+)", txt, re.IGNORECASE)
        if c_match:
            raw_c = c_match.group(1).strip()
            # Mask all but last 4 digits per PRD §9.5
            cleaned_digits = re.sub(r"[^0-9]", "", raw_c)
            last4 = cleaned_digits[-4:] if len(cleaned_digits) >= 4 else raw_c[-4:]
            res.consumer_number = "••••••" + last4
            res.field_confidence["consumer_number"] = 0.95

        # Tariff category
        t_match = re.search(r"Tariff(?:\s*Category)?[:\s]*([A-Z0-9\-]+)", txt, re.IGNORECASE)
        if t_match:
            res.tariff_category = t_match.group(1).strip()

        # Dates: YYYY-MM-DD
        dates = re.findall(r"\b(20\d\d[-/]\d\d[-/]\d\d)\b", txt)
        if len(dates) >= 2:
            res.billing_period_start = dates[0].replace("/", "-")
            res.billing_period_end = dates[1].replace("/", "-")
            res.field_confidence["billing_period"] = 0.90

        # Units kWh (Active consumption)
        # Handle "Active Energy (kWh) ... 114,904 kWh" or "Total Units: 114,904"
        u_match = re.search(
            r"(?:Active\s*Energy\s*\(kWh\)|Active\s*Consumption).*?([0-9,]+(?:\.\d+)?)\s*kWh",
            txt,
            re.IGNORECASE,
        )
        if not u_match:
            u_match = re.search(
                r"(?:Total\s*Units|Units\s*Billed|Total\s*kWh|Units\s*Consumed)[:\s]*([0-9,]+(?:\.\d+)?)",
                txt,
                re.IGNORECASE,
            )
        if u_match:
            u_str = u_match.group(1).replace(",", "")
            res.units_kwh = float(u_str)
            res.field_confidence["units_kwh"] = 0.95

        # Energy charges - match last amount on line
        ec_match = re.search(r"Energy\s*Charges.*?Rs\.?\s*([0-9,]+(?:\.\d+)?)$", txt, re.IGNORECASE | re.MULTILINE)
        if not ec_match:
            ec_match = re.search(r"Energy\s*Charges[:\s]*(?:₹|Rs\.?)?([0-9,]+(?:\.\d+)?)", txt, re.IGNORECASE)
        if ec_match:
            res.energy_charges_inr = float(ec_match.group(1).replace(",", ""))

        # Demand / Fixed charges
        dc_match = re.search(r"(?:Demand\s*/\s*Fixed|Demand|Fixed)\s*Charges.*?Rs\.?\s*([0-9,]+(?:\.\d+)?)$", txt, re.IGNORECASE | re.MULTILINE)
        if not dc_match:
            dc_match = re.search(r"(?:Fixed|Demand)\s*Charges[:\s]*(?:₹|Rs\.?)?([0-9,]+(?:\.\d+)?)", txt, re.IGNORECASE)
        if dc_match:
            res.fixed_or_demand_charges_inr = float(dc_match.group(1).replace(",", ""))

        # Electricity duty
        ed_match = re.search(r"Electricity\s*Duty.*?Rs\.?\s*([0-9,]+(?:\.\d+)?)$", txt, re.IGNORECASE | re.MULTILINE)
        if not ed_match:
            ed_match = re.search(r"Electricity\s*Duty[:\s]*(?:₹|Rs\.?)?([0-9,]+(?:\.\d+)?)", txt, re.IGNORECASE)
        if ed_match:
            res.electricity_duty_inr = float(ed_match.group(1).replace(",", ""))

        # Fuel surcharge (FPPPA)
        fpppa_match = re.search(r"(?:Fuel\s*Surcharge|FPPPA).*?Rs\.?\s*([0-9,]+(?:\.\d+)?)$", txt, re.IGNORECASE | re.MULTILINE)
        if not fpppa_match:
            fpppa_match = re.search(r"(?:Fuel\s*Surcharge|FPPPA)[:\s]*(?:₹|Rs\.?)?([0-9,]+(?:\.\d+)?)", txt, re.IGNORECASE)
        if fpppa_match:
            res.fuel_surcharge_inr = float(fpppa_match.group(1).replace(",", ""))

        # Total amount
        tot_match = re.search(
            r"(?:Total\s*Amount(?:\s*Payable)?|Net\s*Payable|Bill\s*Amount).*?Rs\.?\s*([0-9,]+(?:\.\d+)?)$",
            txt,
            re.IGNORECASE | re.MULTILINE,
        )
        if not tot_match:
            tot_match = re.search(
                r"(?:Total\s*Amount|Net\s*Payable|Bill\s*Amount)[:\s]*(?:₹|Rs\.?)?([0-9,]+(?:\.\d+)?)",
                txt,
                re.IGNORECASE,
            )
        if tot_match:
            res.total_amount_inr = float(tot_match.group(1).replace(",", ""))
            res.field_confidence["total_amount_inr"] = 0.95

        return res



# ==============================================================================
# Anthropic Claude Provider (When LLM_ENABLED=True)
# ==============================================================================

class AnthropicProvider:
    """Anthropic Claude LLM provider using structured tool calls."""

    def __init__(self):
        self.settings = get_settings()
        self.rule_provider = RuleBasedProvider()
        self.api_key = self.settings.anthropic_api_key

    def propose_table_mapping(
        self,
        sheet_name: str,
        header_candidates: list[list[str]],
        sample_rows: list[list[Any]],
        distinct_items: list[str],
        canonical_activities: list[dict[str, Any]],
    ) -> TableMappingResult:
        # If no API key or LLM disabled, use fallback
        if not self.settings.llm_enabled or not self.api_key:
            return self.rule_provider.propose_table_mapping(
                sheet_name, header_candidates, sample_rows, distinct_items, canonical_activities
            )

        try:
            import anthropic
            client = anthropic.Anthropic(api_key=self.api_key)

            tool_schema = {
                "name": "save_table_mapping",
                "description": "Propose column mapping and item activity classification for table",
                "input_schema": TableMappingResult.model_json_schema(),
            }

            prompt = (
                f"You are Decarbo's ingestion assistant. Map the following spreadsheet headers and items.\n"
                f"Sheet: {sheet_name}\n"
                f"First 15 rows: {header_candidates}\n"
                f"Sample data rows: {sample_rows[:5]}\n"
                f"Distinct items: {distinct_items[:150]}\n"
                f"Canonical activities: {[a.get('key') for a in canonical_activities]}\n"
            )

            response = client.messages.create(
                model=self.settings.llm_model_fast,
                max_tokens=2048,
                tools=[tool_schema],
                tool_choice={"type": "tool", "name": "save_table_mapping"},
                messages=[{"role": "user", "content": prompt}],
            )

            for block in response.content:
                if block.type == "tool_use" and block.name == "save_table_mapping":
                    return TableMappingResult.model_validate(block.input)

            return self.rule_provider.propose_table_mapping(
                sheet_name, header_candidates, sample_rows, distinct_items, canonical_activities
            )
        except Exception:
            return self.rule_provider.propose_table_mapping(
                sheet_name, header_candidates, sample_rows, distinct_items, canonical_activities
            )

    def extract_bill_data(
        self,
        text_content: str,
        image_bytes: bytes | None = None,
    ) -> BillExtractionResult:
        if not self.settings.llm_enabled or not self.api_key:
            return self.rule_provider.extract_bill_data(text_content, image_bytes)

        try:
            import anthropic
            client = anthropic.Anthropic(api_key=self.api_key)

            tool_schema = {
                "name": "extract_electricity_bill",
                "description": "Extract printed billing values from electricity bill",
                "input_schema": BillExtractionResult.model_json_schema(),
            }

            prompt = (
                "Extract electricity bill parameters strictly from printed text. "
                "Mask consumer number except the last 4 digits. Do not estimate.\n\n"
                f"Bill Text:\n{text_content[:4000]}"
            )

            response = client.messages.create(
                model=self.settings.llm_model_fast,
                max_tokens=1024,
                tools=[tool_schema],
                tool_choice={"type": "tool", "name": "extract_electricity_bill"},
                messages=[{"role": "user", "content": prompt}],
            )

            for block in response.content:
                if block.type == "tool_use" and block.name == "extract_electricity_bill":
                    return BillExtractionResult.model_validate(block.input)

            return self.rule_provider.extract_bill_data(text_content, image_bytes)
        except Exception:
            return self.rule_provider.extract_bill_data(text_content, image_bytes)


def get_llm_provider() -> LLMProvider:
    """Factory returning configured LLM provider (Anthropic or deterministic Rule-based)."""
    settings = get_settings()
    if settings.llm_enabled and settings.anthropic_api_key:
        return AnthropicProvider()
    return RuleBasedProvider()
