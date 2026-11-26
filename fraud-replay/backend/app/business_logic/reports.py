from __future__ import annotations

import asyncio
import io
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    KeepTogether,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)
from sqlalchemy.ext.asyncio import AsyncSession

from app.business_logic.audit import record_audit
from app.business_logic.investigations import investigation_detail
from app.core.dependencies import Principal
from app.data_access.db.models import MLModelVersion


def _register_font() -> tuple[str, str]:
    candidates = [
        (
            Path("C:/Windows/Fonts/arial.ttf"),
            Path("C:/Windows/Fonts/arialbd.ttf"),
        ),
        (
            Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
            Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
        ),
    ]
    for regular, bold in candidates:
        if regular.is_file() and bold.is_file():
            if "FraudReplay" not in pdfmetrics.getRegisteredFontNames():
                pdfmetrics.registerFont(TTFont("FraudReplay", regular))
                pdfmetrics.registerFont(TTFont("FraudReplay-Bold", bold))
            return "FraudReplay", "FraudReplay-Bold"
    raise FileNotFoundError("A Cyrillic TrueType font is required for PDF generation")


def _build_pdf(
    *,
    organization_name: str,
    analyst_name: str,
    detail,
    analysis_date: str,
    model_version: str,
    detection_method: str,
) -> bytes:
    regular, bold = _register_font()
    buffer = io.BytesIO()
    document = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=16 * mm,
        leftMargin=16 * mm,
        topMargin=15 * mm,
        bottomMargin=15 * mm,
        title=f"Fraud Replay {detail.case_id}",
        author=organization_name,
    )
    styles = getSampleStyleSheet()
    title = ParagraphStyle(
        "TitleCyr",
        parent=styles["Title"],
        fontName=bold,
        alignment=TA_CENTER,
        spaceAfter=10,
    )
    heading = ParagraphStyle(
        "HeadingCyr",
        parent=styles["Heading2"],
        fontName=bold,
        spaceBefore=8,
        spaceAfter=5,
    )
    body = ParagraphStyle(
        "BodyCyr",
        parent=styles["BodyText"],
        fontName=regular,
        leading=14,
    )
    small = ParagraphStyle("SmallCyr", parent=body, fontSize=8, leading=10)
    story = [
        Paragraph("FRAUD REPLAY — ОТЧЁТ О РАССЛЕДОВАНИИ", title),
        Table(
            [
                ["Организация", organization_name],
                ["Investigation ID", detail.case_id],
                ["Аналитик", analyst_name],
                ["Дата анализа", analysis_date],
                ["Risk Score", f"{detail.risk_score}/100 ({detail.risk_level})"],
                ["Статус", str(detail.status)],
                ["Модель", model_version],
                ["Метод", detection_method],
            ],
            colWidths=[42 * mm, 130 * mm],
            style=TableStyle(
                [
                    ("FONTNAME", (0, 0), (-1, -1), regular),
                    ("FONTNAME", (0, 0), (0, -1), bold),
                    ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#E8EEF6")),
                    ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#9AA8BA")),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("PADDING", (0, 0), (-1, -1), 5),
                ]
            ),
        ),
        Paragraph("Резюме", heading),
        Paragraph(detail.summary, body),
        Paragraph("Fraud Signals", heading),
    ]
    for signal in detail.signals:
        story.append(
            KeepTogether(
                [
                    Paragraph(f"<b>{signal.title}</b> (+{signal.points})", body),
                    Paragraph(signal.description, small),
                    Spacer(1, 2 * mm),
                ]
            )
        )
    story.extend([Paragraph("Подозрительные транзакции и Timeline", heading)])
    transaction_rows = [["ID", "Время UTC", "Отправитель", "Получатель", "Сумма, тиын", "Риск"]]
    for tx in detail.transactions:
        transaction_rows.append(
            [
                tx.transaction_id,
                tx.timestamp.isoformat(),
                tx.sender,
                tx.receiver,
                str(tx.amount_tiyn),
                str(tx.risk_score),
            ]
        )
    story.append(
        Table(
            transaction_rows,
            repeatRows=1,
            colWidths=[24 * mm, 38 * mm, 28 * mm, 28 * mm, 29 * mm, 14 * mm],
            style=TableStyle(
                [
                    ("FONTNAME", (0, 0), (-1, -1), regular),
                    ("FONTNAME", (0, 0), (-1, 0), bold),
                    ("FONTSIZE", (0, 0), (-1, -1), 7),
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#DCE7F5")),
                    ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#AAB5C3")),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("PADDING", (0, 0), (-1, -1), 3),
                ]
            ),
        )
    )
    story.extend(
        [
            Paragraph("Ограничения", heading),
            Paragraph(
                "Risk Score является приоритетом ручной проверки, а не вероятностью мошенничества. "
                "ML-модель использует синтетические или доступные исторические данные и требует "
                "валидации на репрезентативном банковском потоке. What-if результаты не доказывают "
                "гарантированное предотвращение последующих переводов.",
                body,
            ),
        ]
    )
    document.build(story)
    return buffer.getvalue()


async def generate_investigation_pdf(
    session: AsyncSession, principal: Principal, investigation
) -> bytes:
    detail = investigation_detail(investigation, principal.role)
    analysis = investigation.analysis_run
    model_version = "not used"
    if analysis.model_version_id:
        model = await session.get(MLModelVersion, analysis.model_version_id)
        model_version = model.version if model else "unavailable"
    pdf = await asyncio.to_thread(
        _build_pdf,
        organization_name=principal.organization.name,
        analyst_name=principal.user.display_name,
        detail=detail,
        analysis_date=(analysis.completed_at or analysis.created_at).isoformat(),
        model_version=model_version,
        detection_method=analysis.detection_method,
    )
    record_audit(
        session,
        action="report.exported",
        resource_type="investigation",
        resource_id=investigation.case_id,
        organization_id=principal.organization_id,
        user_id=principal.user_id,
    )
    await session.commit()
    return pdf
