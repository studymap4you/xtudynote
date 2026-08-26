#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from typing import Iterable
from xml.sax.saxutils import escape

from pypdf import PdfReader
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph


ROOT = Path(__file__).resolve().parents[1]
WORK_ROOT = ROOT / "tmp" / "variant-problem-bank"
OUTPUT_ROOT = ROOT / "output" / "pdf"
FONT_REGULAR = Path("/System/Library/Fonts/Supplemental/AppleGothic.ttf")
FONT_BOLD = FONT_REGULAR

PAGE_WIDTH, PAGE_HEIGHT = A4
NAVY = colors.HexColor("#08182B")
BLUE = colors.HexColor("#1668E8")
CYAN = colors.HexColor("#27C4E8")
INK = colors.HexColor("#172235")
MUTED = colors.HexColor("#68758A")
PALE_BLUE = colors.HexColor("#EAF4FF")
LINE = colors.HexColor("#C8D8EA")
CORAL = colors.HexColor("#FF6B61")
YELLOW = colors.HexColor("#FFC94A")
WHITE = colors.white

CIRCLED = ["①", "②", "③", "④", "⑤"]


def register_fonts() -> None:
    pdfmetrics.registerFont(TTFont("Pretendard", str(FONT_REGULAR)))
    pdfmetrics.registerFont(TTFont("Pretendard-Bold", str(FONT_BOLD)))


def paragraph_style(name: str, size: float, leading: float, color=INK, font="Pretendard") -> ParagraphStyle:
    return ParagraphStyle(
        name,
        fontName=font,
        fontSize=size,
        leading=leading,
        textColor=color,
        alignment=TA_LEFT,
        spaceAfter=0,
        splitLongWords=True,
        allowWidows=0,
        allowOrphans=0,
    )


def draw_paragraph(
    pdf: canvas.Canvas,
    text: str,
    x: float,
    y_top: float,
    width: float,
    style: ParagraphStyle,
    max_height: float | None = None,
) -> float:
    safe = escape(str(text or "")).replace("\n", "<br/>")
    paragraph = Paragraph(safe, style)
    _, height = paragraph.wrap(width, max_height or PAGE_HEIGHT)
    paragraph.drawOn(pdf, x, y_top - height)
    return y_top - height


def set_metadata(pdf: canvas.Canvas, manifest: dict) -> None:
    pdf.setTitle(manifest["title"])
    pdf.setAuthor("Xstudy Universe")
    pdf.setSubject("고등학교 영어 변형문제 문제은행 조립 교재")
    pdf.setCreator("Xstudy Variant Workbook Renderer v1")


def draw_page_frame(pdf: canvas.Canvas, page_number: int, section: str) -> None:
    pdf.setFillColor(colors.HexColor("#F5F9FE"))
    pdf.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, stroke=0, fill=1)
    pdf.setFillColor(WHITE)
    pdf.rect(12 * mm, 12 * mm, PAGE_WIDTH - 24 * mm, PAGE_HEIGHT - 24 * mm, stroke=0, fill=1)
    pdf.setStrokeColor(LINE)
    pdf.setLineWidth(0.8)
    pdf.rect(12 * mm, 12 * mm, PAGE_WIDTH - 24 * mm, PAGE_HEIGHT - 24 * mm, stroke=1, fill=0)
    pdf.setFillColor(NAVY)
    pdf.rect(12 * mm, PAGE_HEIGHT - 24 * mm, PAGE_WIDTH - 24 * mm, 12 * mm, stroke=0, fill=1)
    pdf.setFont("Pretendard-Bold", 8.5)
    pdf.setFillColor(WHITE)
    pdf.drawString(18 * mm, PAGE_HEIGHT - 20 * mm, "XSTUDY UNIVERSE")
    pdf.setFont("Pretendard", 7.8)
    pdf.setFillColor(colors.HexColor("#C7D9F5"))
    pdf.drawRightString(PAGE_WIDTH - 18 * mm, PAGE_HEIGHT - 20 * mm, section)
    pdf.setStrokeColor(BLUE)
    pdf.setLineWidth(1.2)
    pdf.line(18 * mm, 18 * mm, PAGE_WIDTH - 18 * mm, 18 * mm)
    pdf.setFont("Pretendard", 7.8)
    pdf.setFillColor(MUTED)
    pdf.drawString(18 * mm, 13.8 * mm, "영어 변형문제 실전")
    pdf.setFillColor(BLUE)
    pdf.drawRightString(PAGE_WIDTH - 18 * mm, 13.8 * mm, str(page_number))


def draw_cover(pdf: canvas.Canvas, manifest: dict) -> None:
    pdf.setFillColor(NAVY)
    pdf.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, stroke=0, fill=1)
    pdf.setFillColor(BLUE)
    pdf.rect(0, PAGE_HEIGHT - 17 * mm, PAGE_WIDTH, 17 * mm, stroke=0, fill=1)
    pdf.setFillColor(CYAN)
    pdf.rect(PAGE_WIDTH - 46 * mm, PAGE_HEIGHT - 46 * mm, 23 * mm, 23 * mm, stroke=0, fill=1)
    pdf.setFillColor(WHITE)
    pdf.rect(PAGE_WIDTH - 23 * mm, PAGE_HEIGHT - 46 * mm, 23 * mm, 23 * mm, stroke=0, fill=1)
    pdf.setFillColor(CORAL)
    pdf.rect(PAGE_WIDTH - 46 * mm, PAGE_HEIGHT - 69 * mm, 23 * mm, 23 * mm, stroke=0, fill=1)
    pdf.setFillColor(YELLOW)
    pdf.rect(PAGE_WIDTH - 23 * mm, PAGE_HEIGHT - 69 * mm, 23 * mm, 23 * mm, stroke=0, fill=1)

    pdf.setFillColor(CYAN)
    pdf.circle(24 * mm, PAGE_HEIGHT - 37 * mm, 2.3 * mm, stroke=0, fill=1)
    pdf.setFont("Pretendard-Bold", 11)
    pdf.setFillColor(colors.HexColor("#98DFFF"))
    pdf.drawString(31 * mm, PAGE_HEIGHT - 40 * mm, "HIGH SCHOOL ENGLISH")

    pdf.setFillColor(WHITE)
    pdf.setFont("Pretendard-Bold", 34)
    pdf.drawString(24 * mm, PAGE_HEIGHT - 82 * mm, f"고{manifest['grade']} 영어")
    pdf.setFillColor(colors.HexColor("#A7DFFF"))
    pdf.setFont("Pretendard-Bold", 29)
    pdf.drawString(24 * mm, PAGE_HEIGHT - 98 * mm, "변형문제 실전 10제")
    pdf.setFillColor(colors.HexColor("#D6E3F7"))
    pdf.setFont("Pretendard", 12)
    pdf.drawString(25 * mm, PAGE_HEIGHT - 113 * mm, manifest["subtitle"])

    pdf.setStrokeColor(colors.HexColor("#385373"))
    pdf.setLineWidth(1)
    pdf.line(24 * mm, PAGE_HEIGHT - 128 * mm, PAGE_WIDTH - 24 * mm, PAGE_HEIGHT - 128 * mm)

    labels = [
        ("글의 주제", "4"),
        ("내용 일치", "3"),
        ("어법", "1"),
        ("빈칸", "1"),
        ("글의 순서", "1"),
    ]
    box_width = (PAGE_WIDTH - 48 * mm - 8 * mm) / 3
    for index, (label, count) in enumerate(labels):
        row = index // 3
        col = index % 3
        x = 24 * mm + col * (box_width + 4 * mm)
        y = PAGE_HEIGHT - (151 + row * 29) * mm
        pdf.setFillColor(colors.HexColor("#102844"))
        pdf.roundRect(x, y, box_width, 23 * mm, 3 * mm, stroke=0, fill=1)
        pdf.setFillColor(CYAN if index % 2 == 0 else YELLOW)
        pdf.setFont("Pretendard-Bold", 19)
        pdf.drawString(x + 5 * mm, y + 9 * mm, count)
        pdf.setFillColor(WHITE)
        pdf.setFont("Pretendard-Bold", 9)
        pdf.drawString(x + 17 * mm, y + 11 * mm, label)
        pdf.setFillColor(colors.HexColor("#8DA4C1"))
        pdf.setFont("Pretendard", 7.3)
        pdf.drawString(x + 17 * mm, y + 6 * mm, "문제은행 선별")

    pdf.setFillColor(colors.HexColor("#D6E3F7"))
    pdf.setFont("Pretendard", 9.5)
    pdf.drawString(24 * mm, 38 * mm, "한 페이지 한 문항 · 교재 뒤쪽 통합 정답 및 해설")
    pdf.setFillColor(WHITE)
    pdf.setFont("Pretendard-Bold", 11)
    pdf.drawRightString(PAGE_WIDTH - 24 * mm, 24 * mm, "Xstudy Universe")
    pdf.showPage()


def fit_question_layout(question: dict) -> tuple[float, float, float]:
    density = len(question["passage"]) + len(question["stem"]) + sum(len(item) for item in question["choices"])
    if density > 5200:
        return 6.5, 8.4, 7.2
    if density > 4200:
        return 7.0, 9.0, 7.6
    if density > 3300:
        return 7.5, 9.6, 8.0
    if density > 2500:
        return 8.0, 10.3, 8.5
    return 8.8, 11.2, 9.2


def draw_question_page(pdf: canvas.Canvas, question: dict, page_number: int) -> dict:
    draw_page_frame(pdf, page_number, f"QUESTION {question['number']:02d}")
    left = 20 * mm
    width = PAGE_WIDTH - 40 * mm
    top = PAGE_HEIGHT - 34 * mm

    pdf.setFillColor(PALE_BLUE)
    pdf.roundRect(left, top - 14 * mm, width, 13 * mm, 2 * mm, stroke=0, fill=1)
    pdf.setFillColor(BLUE)
    pdf.setFont("Pretendard-Bold", 15)
    pdf.drawString(left + 5 * mm, top - 9.2 * mm, f"{question['number']:02d}")
    pdf.setFillColor(INK)
    pdf.setFont("Pretendard-Bold", 11)
    pdf.drawString(left + 19 * mm, top - 8.6 * mm, question["typeLabel"])
    pdf.setFillColor(MUTED)
    pdf.setFont("Pretendard", 7.4)
    pdf.drawRightString(left + width - 5 * mm, top - 8.5 * mm, question["questionId"])

    passage_size, passage_leading, choice_size = fit_question_layout(question)
    passage_style = paragraph_style("passage", passage_size, passage_leading, INK)
    stem_style = paragraph_style("stem", min(10.5, passage_size + 1.6), min(14, passage_leading + 3), INK, "Pretendard-Bold")
    choice_style = paragraph_style("choices", choice_size, choice_size * 1.42, INK)

    y = top - 21 * mm
    pdf.setFont("Pretendard-Bold", 7.7)
    pdf.setFillColor(BLUE)
    pdf.drawString(left, y, "PASSAGE")
    y -= 4 * mm
    pdf.setStrokeColor(LINE)
    pdf.setLineWidth(0.6)
    pdf.line(left, y, left + width, y)
    y -= 4 * mm
    y = draw_paragraph(pdf, question["passage"], left, y, width, passage_style)
    y -= 5 * mm

    pdf.setStrokeColor(CYAN)
    pdf.setLineWidth(2.3)
    pdf.line(left, y, left, y - 13 * mm)
    y = draw_paragraph(pdf, question["stem"], left + 4 * mm, y - 1 * mm, width - 4 * mm, stem_style)
    y -= 5 * mm

    for index, choice in enumerate(question["choices"]):
        choice_text = f"<b>{CIRCLED[index]}</b>&nbsp;&nbsp;{escape(str(choice))}"
        paragraph = Paragraph(choice_text, choice_style)
        _, height = paragraph.wrap(width - 5 * mm, PAGE_HEIGHT)
        paragraph.drawOn(pdf, left + 3 * mm, y - height)
        y -= height + 2.1 * mm

    overflow = y < 24 * mm
    if overflow:
        pdf.setFillColor(CORAL)
        pdf.setFont("Pretendard-Bold", 6.6)
        pdf.drawRightString(PAGE_WIDTH - 20 * mm, 22 * mm, "LAYOUT REVIEW")
    pdf.showPage()
    return {"questionId": question["questionId"], "bottomY": round(y / mm, 2), "overflow": overflow}


def answer_display(value: object) -> str:
    if isinstance(value, int) and 1 <= value <= 5:
        return CIRCLED[value - 1]
    try:
        number = int(str(value))
        if 1 <= number <= 5:
            return CIRCLED[number - 1]
    except (TypeError, ValueError):
        pass
    return str(value or "-")


def chunks(values: list[dict], size: int) -> Iterable[list[dict]]:
    for index in range(0, len(values), size):
        yield values[index:index + size]


def draw_answer_pages(pdf: canvas.Canvas, manifest: dict, page_number: int) -> int:
    for group_index, group in enumerate(chunks(manifest["questions"], 4)):
        draw_page_frame(pdf, page_number, "ANSWER & EXPLANATION")
        left = 20 * mm
        width = PAGE_WIDTH - 40 * mm
        y = PAGE_HEIGHT - 38 * mm
        pdf.setFillColor(INK)
        pdf.setFont("Pretendard-Bold", 18)
        pdf.drawString(left, y, "정답 및 해설")
        pdf.setFillColor(MUTED)
        pdf.setFont("Pretendard", 8.2)
        pdf.drawRightString(left + width, y, f"{group_index + 1} / {math.ceil(len(manifest['questions']) / 4)}")
        y -= 10 * mm

        for question in group:
            box_height = 43 * mm
            pdf.setFillColor(colors.HexColor("#F7FAFE"))
            pdf.roundRect(left, y - box_height, width, box_height - 2 * mm, 2 * mm, stroke=0, fill=1)
            pdf.setFillColor(BLUE)
            pdf.circle(left + 8 * mm, y - 9 * mm, 5 * mm, stroke=0, fill=1)
            pdf.setFillColor(WHITE)
            pdf.setFont("Pretendard-Bold", 9.2)
            pdf.drawCentredString(left + 8 * mm, y - 11.7 * mm, f"{question['number']:02d}")
            pdf.setFillColor(INK)
            pdf.setFont("Pretendard-Bold", 11)
            pdf.drawString(left + 17 * mm, y - 8.4 * mm, question["typeLabel"])
            pdf.setFillColor(CORAL)
            pdf.setFont("Pretendard-Bold", 16)
            pdf.drawRightString(left + width - 6 * mm, y - 10.5 * mm, answer_display(question["answer"]))
            explanation_style = paragraph_style("explanation", 8.2, 11.4, INK)
            draw_paragraph(
                pdf,
                question["explanation"],
                left + 17 * mm,
                y - 15 * mm,
                width - 25 * mm,
                explanation_style,
                24 * mm,
            )
            pdf.setFillColor(MUTED)
            pdf.setFont("Pretendard", 6.8)
            pdf.drawString(left + 17 * mm, y - 36 * mm, f"DB {question['questionId']} · 검증 {round(float(question['answerConfidence']) * 100)}%")
            y -= box_height
        pdf.showPage()
        page_number += 1
    return page_number


def build_workbook(manifest_path: Path, output_path: Path) -> dict:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if len(manifest.get("questions", [])) != 10:
        raise ValueError(f"{manifest_path}: 10문항 manifest가 아닙니다.")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    pdf = canvas.Canvas(str(output_path), pagesize=A4, pageCompression=1)
    set_metadata(pdf, manifest)
    draw_cover(pdf, manifest)
    checks = []
    page_number = 2
    for question in manifest["questions"]:
        checks.append(draw_question_page(pdf, question, page_number))
        page_number += 1
    page_number = draw_answer_pages(pdf, manifest, page_number)
    pdf.save()

    reader = PdfReader(str(output_path))
    expected_pages = 1 + len(manifest["questions"]) + math.ceil(len(manifest["questions"]) / 4)
    if len(reader.pages) != expected_pages:
        raise ValueError(f"{output_path}: 페이지 수 {len(reader.pages)}/{expected_pages}")
    if any(item["overflow"] for item in checks):
        overflow_ids = [item["questionId"] for item in checks if item["overflow"]]
        raise ValueError(f"{output_path}: 한 페이지 범위를 벗어난 문항 {overflow_ids}")
    extracted = "\n".join((page.extract_text() or "") for page in reader.pages)
    for question in manifest["questions"]:
        if question["questionId"] not in extracted:
            raise ValueError(f"{output_path}: 문항 ID 누락 {question['questionId']}")
    report = {
        "file": str(output_path),
        "pages": len(reader.pages),
        "questions": len(manifest["questions"]),
        "answerPages": math.ceil(len(manifest["questions"]) / 4),
        "layoutChecks": checks,
    }
    return report


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--grade", type=int, choices=[1, 2, 3])
    options = parser.parse_args()
    register_fonts()
    grades = [options.grade] if options.grade else [1, 2, 3]
    reports = []
    for grade in grades:
        manifest_path = WORK_ROOT / f"grade{grade}-workbook.json"
        output_path = OUTPUT_ROOT / f"xstudy-grade{grade}-english-variant-workbook-10.pdf"
        reports.append(build_workbook(manifest_path, output_path))
        print(f"교재 생성 완료: {output_path}")
    report_path = WORK_ROOT / "workbook-render-report.json"
    report_path.write_text(json.dumps(reports, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"렌더 검증 보고서: {report_path}")


if __name__ == "__main__":
    main()
