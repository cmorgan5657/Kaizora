from reportlab.lib.pagesizes import letter
from reportlab.lib.colors import HexColor, white
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable
)
from reportlab.lib.enums import TA_CENTER

BG = HexColor("#0A0A0A")
RED = HexColor("#DC2626")
RED_LIGHT = HexColor("#F87171")
DARK_CARD = HexColor("#141414")
BORDER = HexColor("#2A2A2A")
TEXT_WHITE = HexColor("#F5F5F5")
TEXT_GRAY = HexColor("#9CA3AF")
TEXT_DIM = HexColor("#6B7280")

OUTPUT = r"D:\Kaizora\kaizora-nextjs\KAIZORA_Commerce_Automation_Report.pdf"

class Dark:
    @staticmethod
    def on_page(canvas, doc):
        canvas.saveState()
        canvas.setFillColor(BG)
        canvas.rect(0, 0, letter[0], letter[1], fill=1, stroke=0)
        canvas.setFillColor(TEXT_DIM)
        canvas.setFont("Helvetica", 7)
        canvas.drawString(72, 30, "KAIZORA — Confidential | April 2026")
        canvas.setStrokeColor(RED)
        canvas.setLineWidth(2)
        canvas.line(72, letter[1] - 50, letter[0] - 72, letter[1] - 50)
        canvas.restoreState()

s_title = ParagraphStyle("T", fontName="Helvetica-Bold", fontSize=22, textColor=TEXT_WHITE, spaceAfter=4, leading=28)
s_sub = ParagraphStyle("S", fontName="Helvetica", fontSize=11, textColor=TEXT_GRAY, spaceAfter=20)
s_h1 = ParagraphStyle("H1", fontName="Helvetica-Bold", fontSize=14, textColor=RED_LIGHT, spaceBefore=18, spaceAfter=8, leading=18)
s_body = ParagraphStyle("B", fontName="Helvetica", fontSize=9.5, textColor=TEXT_GRAY, spaceAfter=6, leading=14)
s_step = ParagraphStyle("ST", fontName="Helvetica", fontSize=9.5, textColor=TEXT_WHITE, spaceAfter=4, leading=14, leftIndent=14)

def tbl(headers, rows, widths):
    t = Table([headers] + rows, colWidths=widths, repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), RED),
        ("TEXTCOLOR", (0, 0), (-1, 0), white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 9),
        ("BACKGROUND", (0, 1), (-1, -1), DARK_CARD),
        ("TEXTCOLOR", (0, 1), (-1, -1), TEXT_GRAY),
        ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 1), (-1, -1), 8.5),
        ("ALIGN", (0, 0), (-1, -1), "LEFT"),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [DARK_CARD, HexColor("#111111")]),
    ]))
    return t

def build():
    doc = SimpleDocTemplate(OUTPUT, pagesize=letter, topMargin=70, bottomMargin=55, leftMargin=72, rightMargin=72)
    story = []
    W = letter[0] - 144

    # Title
    story.append(Spacer(1, 40))
    story.append(Paragraph("KAIZORA", ParagraphStyle("L", fontName="Helvetica-Bold", fontSize=12, textColor=RED, spaceAfter=16)))
    story.append(Paragraph("Commerce Automation Layer", s_title))
    story.append(HRFlowable(width="100%", thickness=1, color=BORDER, spaceAfter=8))
    story.append(Paragraph("How AI takes a creator's asset to a published listing in one click.", s_sub))

    # Flow
    story.append(Paragraph("The Flow", s_h1))
    for s in [
        "<b>1.</b>  Creator selects an asset and clicks \"Auto-generate with AI\"",
        "<b>2.</b>  AI analyzes the asset — market fit, pricing, risk, readiness",
        "<b>3.</b>  Commerce profile is built and saved",
        "<b>4.</b>  AI generates a full listing — title, description, tags, keywords, price",
        "<b>5.</b>  Creator reviews, edits if needed, and publishes",
        "<b>6.</b>  Post-launch agent monitors and optimizes every 7 days",
    ]:
        story.append(Paragraph(s, s_step))

    # Agents
    story.append(Paragraph("AI Agents (Gemini 3.1 Pro Preview)", s_h1))
    story.append(tbl(
        ["Agent", "What It Does"],
        [
            ["Commerce Intake", "Analyzes asset — categories, tags, pricing, risk, readiness"],
            ["Listing Construction", "Generates title, description, tags, keywords, price"],
            ["Packaging", "Suggests bundles, collections, template packs"],
            ["Merchandising", "Feature recommendations, cross-sell, preview tips"],
            ["Search Optimization", "Optimizes tags, keywords, title for discoverability"],
            ["Catalog Strategy", "Portfolio analysis — gaps, bundles, health score"],
            ["Post-Launch Optimizer", "Monitors live listings, suggests improvements"],
        ],
        [0.25*W, 0.75*W]
    ))

    # Access
    story.append(Paragraph("Where To Access", s_h1))
    story.append(tbl(
        ["Feature", "Path"],
        [
            ["AI Listing Creator", "/creator/listings/create/form"],
            ["Commerce Dashboard", "/creator/commerce"],
            ["Bundles / Optimize / Catalog / Search", "/creator/commerce (tabs)"],
        ],
        [0.35*W, 0.65*W]
    ))

    # Two paths
    story.append(Paragraph("Two Entry Paths", s_h1))
    story.append(Paragraph(
        "<b>Decision Layer Path:</b> Asset goes through full evaluation first, then commerce profile is built from scores.", s_body))
    story.append(Paragraph(
        "<b>Marketplace Direct:</b> Skips evaluation — AI intake analyzes metadata directly. Faster, same result.", s_body))
    story.append(Paragraph(
        "Both paths produce the same commerce profile. Everything downstream is identical.", s_body))

    # End
    story.append(Spacer(1, 30))
    story.append(HRFlowable(width="100%", thickness=1, color=BORDER, spaceAfter=8))
    story.append(Paragraph("End of Report", ParagraphStyle("E", fontName="Helvetica", fontSize=9, textColor=TEXT_DIM, alignment=TA_CENTER)))

    doc.build(story, onFirstPage=Dark.on_page, onLaterPages=Dark.on_page)
    print(f"Done: {OUTPUT}")

if __name__ == "__main__":
    build()
