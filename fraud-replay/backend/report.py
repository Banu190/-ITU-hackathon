from datetime import timedelta, timezone
from io import BytesIO
import os
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import KeepTogether, Paragraph, SimpleDocTemplate, Spacer

from .models import Dataset, Investigation, ScoredTransfer


ALMATY_TIME = timezone(timedelta(hours=5))


def report_font() -> str:
    candidates = [
        os.environ.get("FRAUD_REPLAY_PDF_FONT"),
        Path(os.environ.get("WINDIR", r"C:\Windows")) / "Fonts" / "arial.ttf",
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
        Path("/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf"),
        Path("/System/Library/Fonts/Supplemental/Arial.ttf"),
    ]
    for candidate in candidates:
        if candidate and Path(candidate).is_file():
            name = "FraudReplaySans"
            if name not in pdfmetrics.getRegisteredFontNames():
                pdfmetrics.registerFont(TTFont(name, str(candidate)))
            return name
    raise FileNotFoundError("Для PDF требуется Arial, DejaVu Sans или путь к TTF в FRAUD_REPLAY_PDF_FONT.")


def format_amount(amount_tiyn: int) -> str:
    tenge, remainder = divmod(amount_tiyn, 100)
    whole = f"{tenge:,}".replace(",", " ")
    fraction = f",{remainder:02d}" if remainder else ""
    return f"{whole}{fraction} KZT"


def build_report(dataset: Dataset, case: Investigation, transactions: list[ScoredTransfer]) -> bytes:
    font = report_font()
    body = ParagraphStyle("Body", fontName=font, fontSize=10, leading=14, textColor=colors.HexColor("#25364a"), spaceAfter=5)
    title = ParagraphStyle("Title", parent=body, fontSize=25, leading=31, spaceAfter=14)
    heading = ParagraphStyle("Heading", parent=body, fontSize=12, leading=17, textColor=colors.HexColor("#124f94"))
    footer = ParagraphStyle("Footer", parent=body, alignment=TA_RIGHT, fontSize=8)
    output = BytesIO()
    doc = SimpleDocTemplate(
        output, pagesize=A4, leftMargin=54, rightMargin=54, topMargin=45, bottomMargin=45,
        title=f"Fraud Replay · {case.case_id}",
    )

    story = [
        Paragraph("Fraud Replay", heading),
        Paragraph(f"Расследование {case.case_id}", title),
        Paragraph(f"Набор № {dataset.dataset_id} · {escape(dataset.source)}", body),
        Paragraph(f"Условная оценка риска: {case.risk_score}/100. Операций для проверки: {len(case.suspicious_transactions)}.", body),
        Paragraph("Оценка предназначена для приоритизации проверки. Данные синтетические.", body),
        Paragraph("Сигналы: " + escape(", ".join(case.reasons)), body),
        Spacer(1, 12),
        Paragraph("Хронология · UTC+05:00", heading),
    ]
    for transfer in transactions:
        moment = transfer.timestamp.astimezone(ALMATY_TIME).strftime("%d.%m.%Y %H:%M:%S")
        block = [
            Paragraph(f"{escape(transfer.transaction_id)} · {moment} · Риск {transfer.risk_score}/100", heading),
            Paragraph(f"{escape(transfer.sender)} → {escape(transfer.receiver)} · {format_amount(transfer.amount_tiyn)}", body),
        ]
        for reason in transfer.reasons:
            related = ", ".join(reason.related_transactions[:6])
            if len(reason.related_transactions) > 6:
                related += f" и ещё {len(reason.related_transactions) - 6}"
            links = f" Связанные операции: {escape(related)}." if related else ""
            block.append(Paragraph(f"{reason.title} (+{reason.points}). {reason.description}{links}", body))
        if not transfer.reasons:
            block.append(Paragraph("Связанная операция.", body))
        story.extend([KeepTogether(block), Spacer(1, 6)])

    def draw_footer(canvas, document):
        text = Paragraph(f"Fraud Replay · {case.case_id} / {document.page}", footer)
        text.wrap(document.width, 12)
        text.drawOn(canvas, document.leftMargin, 25)

    doc.build(story, onFirstPage=draw_footer, onLaterPages=draw_footer)
    return output.getvalue()
