"""Generate deterministic demo factory data, sample electricity bills, and Tally export."""

import csv
import math
import os
import random
from pathlib import Path
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side

BASE_DIR = Path(__file__).resolve().parent.parent
DEMO_DIR = BASE_DIR / "data" / "demo"
BILLS_DIR = DEMO_DIR / "bills"


def generate_demo_factory_xlsx():
    DEMO_DIR.mkdir(parents=True, exist_ok=True)
    xlsx_path = DEMO_DIR / "demo_factory.xlsx"

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Template"

    header_fill = PatternFill(start_color="1D2A45", end_color="1D2A45", fill_type="solid")
    header_font = Font(name="Arial", size=11, bold=True, color="FFFFFF")
    border_thin = Border(
        left=Side(style="thin", color="D6DAE1"),
        right=Side(style="thin", color="D6DAE1"),
        top=Side(style="thin", color="D6DAE1"),
        bottom=Side(style="thin", color="D6DAE1"),
    )

    headers = [
        ("month", 14),
        ("activity", 28),
        ("quantity", 14),
        ("unit", 12),
        ("cost_inr", 16),
        ("recycled_share", 18),
        ("distance_km", 16),
        ("vehicle", 16),
        ("notes", 30),
    ]

    for col_idx, (col_name, width) in enumerate(headers, start=1):
        cell = ws.cell(row=1, column=col_idx, value=col_name)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center")
        cell.border = border_thin
        ws.column_dimensions[openpyxl.utils.get_column_letter(col_idx)].width = width

    random.seed(42)

    months = [
        "2025-09", "2025-10", "2025-11", "2025-12",
        "2026-01", "2026-02", "2026-03", "2026-04",
        "2026-05", "2026-06", "2026-07", "2026-08",
    ]

    rows = []
    bill_data = []

    for idx, month in enumerate(months):
        is_last_3_months = idx >= 9  # Jun, Jul, Aug 2026

        # Output base 45 t; -25% in Oct/Nov; +/-8% noise
        noise = random.uniform(-0.08, 0.08)
        season_factor = 0.75 if month in ("2025-10", "2025-11") else 1.0
        output_t = round(45.0 * season_factor * (1.0 + noise), 1)

        # Brass rod purchase ~65 t base, scaled with output
        brass_rod_t = round(output_t * (65.0 / 45.0) * (1.0 + random.uniform(-0.04, 0.04)), 1)
        brass_kg = round(brass_rod_t * 1000.0)

        # Swarf scrap recovered ≈ 95% of (purchase - output)
        swarf_kg = round((brass_kg - (output_t * 1000.0)) * 0.95)

        # Grid electricity: baseline 2,100 kWh/t; +14% for last 3 months
        kwh_per_t = 2100.0 * (1.14 if is_last_3_months else 1.0)
        grid_kwh = round(output_t * kwh_per_t * (1.0 + random.uniform(-0.02, 0.02)))
        elec_cost = round(grid_kwh * 7.8)

        # Diesel: 1,500 L/month; +30% in Jul-Aug (monsoon)
        diesel_l = round(1500.0 * (1.30 if month in ("2026-07", "2026-08") else 1.0) * (1.0 + random.uniform(-0.05, 0.05)))
        diesel_cost = round(diesel_l * 90.0)

        # Furnace oil: 1,100 kg/month
        fo_kg = round(1100.0 * (1.0 + random.uniform(-0.05, 0.05)))
        fo_cost = round(fo_kg * 55.0)

        # Cutting oil: 600 kg/month
        cutting_oil_kg = round(600.0 * (1.0 + random.uniform(-0.05, 0.05)))
        cutting_oil_cost = round(cutting_oil_kg * 140.0)

        # Hazardous waste (coolant sludge): 900 kg/month
        haz_waste_kg = round(900.0 * (1.0 + random.uniform(-0.05, 0.05)))

        # Packaging: corrugated 2,500 kg; plastic 400 kg
        corrugated_kg = round(2500.0 * (output_t / 45.0))
        plastic_kg = round(400.0 * (output_t / 45.0))

        # Freight: outbound HGV: output_t * 550 km; inbound LCV: brass_rod_t * 40 km
        hgv_tkm = round(output_t * 550.0)
        lcv_tkm = round(brass_rod_t * 40.0)

        # General landfill waste: 1,200 kg
        landfill_kg = round(1200.0 * (1.0 + random.uniform(-0.05, 0.05)))

        # Record monthly data for the 3 bill PDFs
        if is_last_3_months:
            bill_data.append({
                "month": month,
                "kwh": grid_kwh,
                "cost": elec_cost,
                "rate": 7.8,
            })

        # Append template rows
        rows.append((month, "production_output", output_t, "t", "", "", "", "", "Finished brass precision turned components"))
        rows.append((month, "grid_electricity", grid_kwh, "kWh", elec_cost, "", "", "", "Main industrial HT power supply"))
        rows.append((month, "diesel", diesel_l, "L", diesel_cost, "", "", "", "Backup generator fuel"))
        rows.append((month, "furnace_oil", fo_kg, "kg", fo_cost, "", "", "", "Casting melting line fuel"))
        rows.append((month, "brass_input_primary", brass_kg, "kg", brass_kg * 420, 0.2, "", "", "Purchased brass extruded rod IS319"))
        rows.append((month, "waste_metal_scrap_recycled", swarf_kg, "kg", swarf_kg * 350, "", "", "", "Clean brass swarf sold back to supplier"))
        rows.append((month, "cutting_oil", cutting_oil_kg, "kg", cutting_oil_cost, "", "", "", "Neat cutting oil and water-soluble coolant"))
        rows.append((month, "waste_hazardous_incineration", haz_waste_kg, "kg", 18000, "", "", "", "Spent coolant and grinding sludge"))
        rows.append((month, "packaging_corrugated", corrugated_kg, "kg", corrugated_kg * 65, "", "", "", "Dispatch outer cartons"))
        rows.append((month, "packaging_plastic", plastic_kg, "kg", plastic_kg * 120, "", "", "", "Protective LDPE wraps and bags"))
        rows.append((month, "road_freight_hgv", hgv_tkm, "t*km", round(hgv_tkm * 4.5), "", 550, "hgv", "Outbound finished dispatches to Pune/NCR"))
        rows.append((month, "road_freight_lcv", lcv_tkm, "t*km", round(lcv_tkm * 9.0), "", 40, "lcv", "Local raw material logistics Jamnagar GIDC"))
        rows.append((month, "waste_general_landfill", landfill_kg, "kg", 3500, "", "", "", "Plant canteen and general refuse"))

    for row_idx, r_data in enumerate(rows, start=2):
        for col_idx, val in enumerate(r_data, start=1):
            cell = ws.cell(row=row_idx, column=col_idx, value=val)
            cell.border = border_thin
            if col_idx in (1, 4, 8):
                cell.alignment = Alignment(horizontal="center", vertical="center")
            elif col_idx in (3, 5, 6, 7):
                cell.alignment = Alignment(horizontal="right", vertical="center")
            else:
                cell.alignment = Alignment(horizontal="left", vertical="center")

    wb.save(xlsx_path)
    print(f"Generated demo factory dataset at: {xlsx_path}")
    return bill_data


def generate_tally_purchase_register():
    csv_path = DEMO_DIR / "tally_purchase_register.csv"
    headers = ["Date", "Particulars", "Voucher Type", "Voucher No", "Quantity", "Unit", "Rate", "Gross Value"]
    
    entries = [
        ("2026-06-02", "Brass Rod 12mm IS319 Gr.1", "Purchase", "PUR-2026-0142", 18500, "kg", 420.0, 7770000),
        ("2026-06-04", "HSD High Speed Diesel", "Purchase", "PUR-2026-0143", 750, "L", 91.5, 68625),
        ("2026-06-08", "Corrugated Cartons 5-Ply 400x300x250", "Purchase", "PUR-2026-0144", 1200, "kg", 68.0, 81600),
        ("2026-06-12", "Neat Cutting Oil ServoCut S", "Purchase", "PUR-2026-0145", 300, "kg", 145.0, 43500),
        ("2026-06-15", "Furnace Oil LSHS Grade", "Purchase", "PUR-2026-0146", 1150, "kg", 56.0, 64400),
        ("2026-06-18", "Brass Hex Bar 19mm IS319", "Purchase", "PUR-2026-0147", 24000, "kg", 422.0, 10128000),
        ("2026-06-22", "LDPE Stretch Film Roll 23 Micron", "Purchase", "PUR-2026-0148", 220, "kg", 125.0, 27500),
        ("2026-06-25", "HSD High Speed Diesel", "Purchase", "PUR-2026-0149", 800, "L", 91.5, 73200),
        ("2026-06-28", "Office Stationery & Computer Paper", "Purchase", "PUR-2026-0150", 15, "pkt", 350.0, 5250),
        ("2026-07-03", "Brass Rod 16mm IS319", "Purchase", "PUR-2026-0151", 22000, "kg", 419.0, 9218000),
        ("2026-07-06", "Soluble Cutting Oil Semi-Synthetic", "Purchase", "PUR-2026-0152", 320, "kg", 150.0, 48000),
        ("2026-07-11", "HSD High Speed Diesel", "Purchase", "PUR-2026-0153", 1050, "L", 92.0, 96600),
        ("2026-07-16", "Furnace Oil LSHS Grade", "Purchase", "PUR-2026-0154", 1080, "kg", 55.5, 59940),
        ("2026-07-20", "Heavy Truck Freight Jamnagar-Gurugram", "Purchase", "PUR-2026-0155", 24500, "t*km", 4.4, 107800),
        ("2026-07-26", "Brass Hollow Rod 25mm", "Purchase", "PUR-2026-0156", 21500, "kg", 425.0, 9137500),
        ("2026-08-04", "Brass Rod 10mm IS319", "Purchase", "PUR-2026-0157", 26000, "kg", 421.0, 10946000),
        ("2026-08-09", "HSD High Speed Diesel", "Purchase", "PUR-2026-0158", 950, "L", 92.0, 87400),
        ("2026-08-14", "Corrugated Cartons 7-Ply Heavy", "Purchase", "PUR-2026-0159", 1400, "kg", 72.0, 100800),
        ("2026-08-20", "Tea and Pantry Provisions", "Purchase", "PUR-2026-0160", 1, "lot", 4200.0, 4200),
        ("2026-08-25", "Furnace Oil LSHS Grade", "Purchase", "PUR-2026-0161", 1120, "kg", 55.0, 61600),
    ]

    with open(csv_path, mode="w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(headers)
        writer.writerows(entries)

    print(f"Generated Tally purchase register CSV at: {csv_path}")


def generate_sample_bill_pdfs(bill_data):
    try:
        from reportlab.lib.pagesizes import letter
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib import colors
    except ImportError:
        print("reportlab not installed, skipping PDF generation")
        return

    BILLS_DIR.mkdir(parents=True, exist_ok=True)

    discom_name = "PASCHIM GUJARAT VIJ COMPANY LIMITED (PGVCL)"
    sub_title = "HT INDUSTRIAL ELECTRICITY CONSUMPTION BILL"

    month_dates = {
        "2026-06": ("2026-06-01", "2026-06-30", "2026-07-15", "BILL-2026-06-8812"),
        "2026-07": ("2026-07-01", "2026-07-31", "2026-08-15", "BILL-2026-07-9241"),
        "2026-08": ("2026-08-01", "2026-08-31", "2026-09-15", "BILL-2026-08-9654"),
    }

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "DiscomTitle",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=13,
        textColor=colors.HexColor("#1D2A45"),
        alignment=1,
    )
    sub_style = ParagraphStyle(
        "DiscomSub",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9,
        textColor=colors.HexColor("#5A6478"),
        alignment=1,
    )
    cell_style = ParagraphStyle(
        "CellNormal",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9,
        textColor=colors.HexColor("#1D2A45"),
    )
    cell_bold = ParagraphStyle(
        "CellBold",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=9,
        textColor=colors.HexColor("#1D2A45"),
    )

    for b in bill_data:
        m = b["month"]
        if m not in month_dates:
            continue
        start_date, end_date, due_date, bill_no = month_dates[m]
        pdf_path = BILLS_DIR / f"electricity_bill_{m}.pdf"

        doc = SimpleDocTemplate(
            str(pdf_path),
            pagesize=letter,
            rightMargin=36,
            leftMargin=36,
            topMargin=36,
            bottomMargin=36,
        )

        elements = []
        elements.append(Paragraph(discom_name, title_style))
        elements.append(Spacer(1, 4))
        elements.append(Paragraph(sub_title, sub_style))
        elements.append(Spacer(1, 14))

        # Consumer & Bill Metadata
        meta_data = [
            [Paragraph("<b>Consumer Name:</b> Sample Brass Components (demo)", cell_style),
             Paragraph(f"<b>Bill Number:</b> {bill_no}", cell_style)],
            [Paragraph("<b>Consumer No:</b> ******4182", cell_style),
             Paragraph(f"<b>Billing Period:</b> {start_date} to {end_date}", cell_style)],
            [Paragraph("<b>Tariff Category:</b> HTP-1 Industrial", cell_style),
             Paragraph(f"<b>Due Date:</b> {due_date}", cell_style)],
            [Paragraph("<b>Contract Demand:</b> 350 kVA", cell_style),
             Paragraph("<b>Recorded Max Demand:</b> 312 kVA", cell_style)],
        ]
        meta_table = Table(meta_data, colWidths=[270, 270])
        meta_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F7F8FA")),
            ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#D6DAE1")),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#EAECEF")),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ]))
        elements.append(meta_table)
        elements.append(Spacer(1, 16))

        # Meter Reading
        kwh = b["kwh"]
        reading_data = [
            [Paragraph("Parameter", cell_bold), Paragraph("Previous", cell_bold), Paragraph("Current", cell_bold), Paragraph("Multiplier", cell_bold), Paragraph("Billed Units", cell_bold)],
            [Paragraph("Active Energy (kWh)", cell_style), Paragraph("412500", cell_style), Paragraph(str(412500 + kwh), cell_style), Paragraph("1.0", cell_style), Paragraph(f"<b>{kwh:,} kWh</b>", cell_style)],
            [Paragraph("Apparent Energy (kVAh)", cell_style), Paragraph("425000", cell_style), Paragraph(str(425000 + int(kwh * 1.02)), cell_style), Paragraph("1.0", cell_style), Paragraph(f"{int(kwh * 1.02):,} kVAh", cell_style)],
            [Paragraph("Average Power Factor", cell_style), Paragraph("-", cell_style), Paragraph("-", cell_style), Paragraph("-", cell_style), Paragraph("0.98", cell_style)],
        ]
        reading_table = Table(reading_data, colWidths=[150, 95, 95, 95, 105])
        reading_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1D2A45")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#D6DAE1")),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#D6DAE1")),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]))
        elements.append(reading_table)
        elements.append(Spacer(1, 16))

        # Charges breakdown (PRD §9.5 variable tariff components)
        energy_charges = round(kwh * 5.20)
        demand_charges = round(312 * 350)  # fixed demand charge ₹350/kVA
        fpppa_charges = round(kwh * 2.10)  # Fuel surcharge
        duty = round((energy_charges + fpppa_charges) * 0.15)  # 15% Electricity duty
        total_amount = energy_charges + demand_charges + fpppa_charges + duty

        charges_data = [
            [Paragraph("Particulars of Charge", cell_bold), Paragraph("Rate / Basis", cell_bold), Paragraph("Amount (INR)", cell_bold)],
            [Paragraph("Energy Charges", cell_style), Paragraph(f"Rs. 5.20 per kWh x {kwh:,}", cell_style), Paragraph(f"Rs. {energy_charges:,}", cell_style)],
            [Paragraph("Demand / Fixed Charges", cell_style), Paragraph("Rs. 350 / kVA x 312 kVA", cell_style), Paragraph(f"Rs. {demand_charges:,}", cell_style)],
            [Paragraph("Fuel Surcharge (FPPPA)", cell_style), Paragraph(f"Rs. 2.10 per kWh x {kwh:,}", cell_style), Paragraph(f"Rs. {fpppa_charges:,}", cell_style)],
            [Paragraph("Electricity Duty", cell_style), Paragraph("15% on Energy + Fuel Charges", cell_style), Paragraph(f"Rs. {duty:,}", cell_style)],
            [Paragraph("<b>Total Amount Payable</b>", cell_bold), Paragraph(f"<b>Due by {due_date}</b>", cell_bold), Paragraph(f"<b>Rs. {total_amount:,}</b>", cell_bold)],
        ]
        charges_table = Table(charges_data, colWidths=[240, 180, 120])
        charges_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#EAECEF")),
            ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#F7F8FA")),
            ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#D6DAE1")),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#D6DAE1")),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ]))
        elements.append(charges_table)

        doc.build(elements)
        print(f"Generated sample electricity bill PDF at: {pdf_path}")


def run():
    print("Generating demo factory dataset...")
    bill_data = generate_demo_factory_xlsx()
    print("Generating Tally purchase register...")
    generate_tally_purchase_register()
    print("Generating sample electricity bill PDFs...")
    generate_sample_bill_pdfs(bill_data)
    print("Demo data generation completed!")


if __name__ == "__main__":
    run()
