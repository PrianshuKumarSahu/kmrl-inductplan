from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from app.database import get_supabase
import io
import re
from datetime import datetime
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

router = APIRouter(prefix="/reports", tags=["Reports"])

def clean_text(text: str) -> str:
    """Strip emojis and non-ascii unicode symbols that cause PDF font crashes."""
    if not text:
        return ""
    # Replace common emoji indicators with text
    t = text.replace("✅", "[OK] ").replace("❌", "[NO] ").replace("⚠️", "[WARN] ").replace("⏸", "[STANDBY] ")
    t = t.replace("📢", "[BRAND] ").replace("⚖️", "[BAL] ").replace("🚉", "[BAY] ")
    # Keep printable ascii
    return re.sub(r'[^\x20-\x7E]', '', t).strip()

@router.get("/{date}")
def generate_report(date: str):
    """
    Generate an official KMRL AI-Driven Train Induction Report (PDF).
    Publicly downloadable for official records and audit compliance.
    """
    supabase = get_supabase()
    
    # 1. Fetch schedule
    res = supabase.table("schedules").select("*").eq("schedule_date", date).execute()
    schedule = res.data[0] if (res.data and len(res.data) > 0) else None
    
    if not schedule:
        # Fallback to latest schedule if date is today or missing
        latest = supabase.table("schedules").select("*").order("schedule_date", desc=True).limit(1).execute()
        if latest.data and len(latest.data) > 0:
            schedule = latest.data[0]
            date = schedule.get("schedule_date", date)
            
    if not schedule:
        raise HTTPException(status_code=404, detail=f"No schedule found for {date}. Please generate a schedule first.")
        
    induction_list = schedule.get("induction_list") or []
    inducted_trains = [t for t in induction_list if t.get("inducted")]
    standby_trains = [t for t in induction_list if not t.get("inducted")]
    
    # 2. Build PDF Document with ReportLab
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=36,
        leftMargin=36,
        topMargin=36,
        bottomMargin=36
    )
    
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        'TitleStyle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=18,
        leading=22,
        textColor=colors.HexColor("#1e1b4b"),
        alignment=0
    )
    subtitle_style = ParagraphStyle(
        'SubtitleStyle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=10,
        leading=14,
        textColor=colors.HexColor("#475569")
    )
    heading_style = ParagraphStyle(
        'HeadingStyle',
        parent=styles['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=12,
        leading=16,
        textColor=colors.HexColor("#1e1b4b"),
        spaceBefore=10,
        spaceAfter=6
    )
    cell_style = ParagraphStyle(
        'CellStyle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8,
        leading=10,
        textColor=colors.HexColor("#1e293b")
    )
    cell_bold = ParagraphStyle(
        'CellBold',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8,
        leading=10,
        textColor=colors.HexColor("#0f172a")
    )
    
    elements = []
    
    # Header & Branding
    elements.append(Paragraph("KOCHI METRO RAIL LIMITED (KMRL)", title_style))
    elements.append(Paragraph("AI-Driven Trainset Induction Planning & Scheduling System", subtitle_style))
    elements.append(Spacer(1, 10))
    
    # Summary Info Table
    gen_time = schedule.get("generated_at", "")[:19].replace("T", " ") if schedule.get("generated_at") else datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
    is_final_str = "FINAL / APPROVED" if schedule.get("is_final") else "DRAFT PROPOSAL"
    
    summary_data = [
        [
            Paragraph("<b>Target Schedule Date:</b> " + date, cell_style),
            Paragraph("<b>Optimization Status:</b> " + is_final_str, cell_style)
        ],
        [
            Paragraph("<b>Generated Timestamp:</b> " + gen_time + " UTC", cell_style),
            Paragraph("<b>Solver Engine:</b> Google OR-Tools CP-SAT (" + str(schedule.get("solver_time_ms", 450)) + " ms)", cell_style)
        ],
        [
            Paragraph("<b>Total Inducted for Service:</b> " + str(len(inducted_trains)) + " Trainsets", cell_style),
            Paragraph("<b>Standby Reserve:</b> " + str(len(standby_trains)) + " Trainsets", cell_style)
        ]
    ]
    summary_table = Table(summary_data, colWidths=[270, 270])
    summary_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor("#f1f5f9")),
        ('BOX', (0, 0), (-1, -1), 1, colors.HexColor("#cbd5e1")),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
    ]))
    elements.append(summary_table)
    elements.append(Spacer(1, 14))
    
    # Section: Inducted Fleet
    elements.append(Paragraph(f"Approved Induction Turnout List ({len(inducted_trains)} Trainsets)", heading_style))
    
    table_headers = [
        Paragraph("Rank", cell_bold),
        Paragraph("Rake #", cell_bold),
        Paragraph("Train Name", cell_bold),
        Paragraph("Score", cell_bold),
        Paragraph("Bay", cell_bold),
        Paragraph("Decision & Constraint Rationale", cell_bold)
    ]
    
    table_rows = [table_headers]
    for idx, t in enumerate(inducted_trains, start=1):
        num = clean_text(t.get("number", "KM-XX"))
        name = clean_text(t.get("name", "Metro Rake"))[:24]
        score = f"{float(t.get('score') or 70.0):.1f}"
        bay = clean_text(t.get("bay_position", "IBL-A1"))
        exp = clean_text(t.get("explanation", "Inducted based on optimal fitness and branding SLA"))
        
        table_rows.append([
            Paragraph(str(t.get("rank") or idx), cell_bold),
            Paragraph(num, cell_bold),
            Paragraph(name, cell_style),
            Paragraph(score + " pts", cell_style),
            Paragraph(bay, cell_style),
            Paragraph(exp[:110], cell_style)
        ])
        
    ind_table = Table(table_rows, colWidths=[30, 45, 105, 50, 45, 265])
    ind_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#e0e7ff")),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.HexColor("#1e1b4b")),
        ('ALIGN', (0, 0), (0, -1), 'CENTER'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
    ]))
    elements.append(ind_table)
    elements.append(Spacer(1, 14))
    
    # Section: Standby Fleet (if any)
    if standby_trains:
        elements.append(Paragraph(f"Standby Reserve & Maintenance Bay Lines ({len(standby_trains)} Trainsets)", heading_style))
        standby_headers = [
            Paragraph("Rake #", cell_bold),
            Paragraph("Train Name", cell_bold),
            Paragraph("Score", cell_bold),
            Paragraph("Bay", cell_bold),
            Paragraph("Standby Reason / Conflicts", cell_bold)
        ]
        standby_rows = [standby_headers]
        for t in standby_trains:
            num = clean_text(t.get("number", "KM-XX"))
            name = clean_text(t.get("name", "Metro Rake"))[:24]
            score = f"{float(t.get('score') or 50.0):.1f}"
            bay = clean_text(t.get("bay_position", "IBL-F1"))
            exp = clean_text(t.get("explanation", "Held in reserve standby"))
            if t.get("conflicts"):
                exp = clean_text("; ".join([str(c) for c in t.get("conflicts")]))
            
            standby_rows.append([
                Paragraph(num, cell_bold),
                Paragraph(name, cell_style),
                Paragraph(score + " pts", cell_style),
                Paragraph(bay, cell_style),
                Paragraph(exp[:120], cell_style)
            ])
            
        st_table = Table(standby_rows, colWidths=[45, 105, 50, 45, 295])
        st_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#f1f5f9")),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
            ('TOPPADDING', (0, 0), (-1, -1), 3),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
        ]))
        elements.append(st_table)
        elements.append(Spacer(1, 14))
        
    # Signoff Block
    elements.append(Spacer(1, 10))
    sign_data = [
        [
            Paragraph("<b>Prepared by:</b> KMRL AI Scheduling Engine", cell_style),
            Paragraph("<b>Verified by:</b> Rolling Stock Controller", cell_style),
            Paragraph("<b>Approved by:</b> Chief Operations Manager", cell_style)
        ]
    ]
    sign_table = Table(sign_data, colWidths=[180, 180, 180])
    sign_table.setStyle(TableStyle([
        ('LINEABOVE', (0, 0), (-1, 0), 1, colors.HexColor("#94a3b8")),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
    ]))
    elements.append(sign_table)
    
    # Build Document
    doc.build(elements)
    
    pdf_bytes = buffer.getvalue()
    buffer.close()
    
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename=KMRL_Induction_Report_{date}.pdf",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Expose-Headers": "Content-Disposition"
        }
    )
