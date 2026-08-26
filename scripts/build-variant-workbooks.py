#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import math
import re
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
    pdf.setCreator("Xstudy Variant Workbook Renderer v4")


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
    pdf.drawString(24 * mm, PAGE_HEIGHT - 98 * mm, f"변형문제 실전 {len(manifest['questions'])}제")
    pdf.setFillColor(colors.HexColor("#D6E3F7"))
    pdf.setFont("Pretendard", 12)
    pdf.drawString(
        25 * mm,
        PAGE_HEIGHT - 113 * mm,
        f"{manifest['subtitle']} · 제{manifest['volume']}권 / 총 {manifest['volumeCount']}권",
    )

    pdf.setStrokeColor(colors.HexColor("#385373"))
    pdf.setLineWidth(1)
    pdf.line(24 * mm, PAGE_HEIGHT - 128 * mm, PAGE_WIDTH - 24 * mm, PAGE_HEIGHT - 128 * mm)

    labels = [
        (str(item["label"]), str(item["count"]))
        for item in manifest.get("summaryGroups", [])
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
        return 6.7, 8.7, 7.4
    if density > 4200:
        return 7.2, 9.3, 7.8
    if density > 3300:
        return 7.7, 9.9, 8.2
    if density > 2500:
        return 8.2, 10.6, 8.7
    return 9.0, 11.5, 9.4


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


def is_multiple_choice_answer(value: object) -> bool:
    return answer_display(value) in CIRCLED


def chunks(values: list[dict], size: int) -> Iterable[list[dict]]:
    for index in range(0, len(values), size):
        yield values[index:index + size]


EXPLANATION_GUIDES = {
    "purpose": "글의 첫머리와 끝부분에서 요청·안내·제안처럼 필자가 독자에게 기대하는 행동을 찾고, 그 기능이 선지 전체와 일치하는지 확인합니다.",
    "emotion_change": "사건 전후의 감정 표현과 분위기 변화를 시간 순서대로 연결해 시작과 마지막 감정을 결정합니다.",
    "claim": "반복되는 당위 표현과 결론 문장을 중심으로 필자가 독자에게 강조하는 행동이나 태도를 한 문장으로 정리합니다.",
    "main_idea": "구체적 사례보다 사례들이 공통으로 뒷받침하는 중심 판단을 찾고, 글 전체를 포괄하는 선지를 고릅니다.",
    "title": "반복되는 핵심어와 글의 전개 방향을 함께 담되, 지나치게 좁거나 넓지 않은 제목을 선택합니다.",
    "topic": "글에서 가장 자주 설명되는 대상과 그 대상에 관한 핵심 관점을 묶어 주제 범위를 확인합니다.",
    "factual_description": "인물·수치·원인·결과를 원문과 하나씩 대응하고, 부정·비교·범위가 바뀐 선지를 찾아냅니다.",
    "grammar": "밑줄 주변의 주어·동사 관계, 수식 대상, 병렬 구조와 시제를 확인해 문장 구조에 맞는 어형을 판단합니다.",
    "vocabulary": "앞뒤 문장의 긍정·부정 방향과 문맥상 의미를 먼저 잡은 뒤, 그 흐름과 어긋나는 어휘를 판별합니다.",
    "implied_meaning": "표현을 문자 그대로 해석하지 말고, 앞뒤 사례가 공통으로 드러내는 태도나 메시지로 바꾸어 봅니다.",
    "blank_short": "빈칸 전후의 연결어와 반복 개념을 확인하고, 글의 논리 방향을 자연스럽게 이어 주는 표현을 선택합니다.",
    "blank_long": "글 전체의 중심 논리를 요약한 뒤 빈칸이 결론·원인·대조 중 어떤 역할을 하는지 확인합니다.",
    "irrelevant_sentence": "각 문장의 핵심어와 지시어가 앞뒤 문장에 이어지는지 살펴, 중심 화제에서 벗어나는 문장을 찾습니다.",
    "paragraph_order": "대명사·관사·연결어와 시간 흐름을 단서로 각 문단의 선후 관계를 연결합니다.",
    "sentence_insertion": "삽입 문장의 지시어와 핵심어가 앞 문장에서 소개되고 뒤 문장에서 이어지는 위치를 찾습니다.",
    "summary": "원문의 핵심 주어와 결론을 유지하면서 세부 예시는 덜어 내고, 두 빈칸의 의미 관계를 함께 확인합니다.",
    "grammar_correction": "변형된 문장과 원문의 문장 구조를 비교해 어형·수 일치·수식 관계가 깨진 부분을 바로잡습니다.",
}

DISTRACTOR_GUIDES = {
    "factual_description": "오답 선지는 원문의 일부 단어를 유지한 채 대상, 수치, 긍정·부정 또는 인과관계를 바꾼 경우가 많습니다.",
    "grammar": "뜻이 자연스러워 보여도 주어와 동사의 수, 준동사의 역할, 수식 범위가 맞지 않으면 제외합니다.",
    "vocabulary": "비슷한 형태의 단어보다 문맥의 방향과 정확한 의미가 맞는지를 우선 확인합니다.",
    "paragraph_order": "부분적으로 자연스러운 연결만 보지 말고 모든 지시어가 앞에서 소개되었는지 끝까지 점검합니다.",
    "sentence_insertion": "주제만 비슷한 위치가 아니라 삽입 문장의 앞뒤 연결이 동시에 성립하는 위치를 선택합니다.",
    "irrelevant_sentence": "소재가 비슷해도 중심 논지를 발전시키지 않거나 앞뒤 연결을 끊는 문장은 제외 대상입니다.",
    "grammar_correction": "원문의 의미를 바꾸지 않으면서 문법적으로 완전한 문장이 되는지 다시 읽어 확인합니다.",
}


def compact_text(value: object, limit: int = 180) -> str:
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    if len(text) <= limit:
        return text
    return f"{text[:limit - 1].rstrip()}…"


def clean_explanation(value: object) -> str:
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    text = re.sub(r"^[^:]{1,30}\s*검증:\s*", "", text)
    text = re.sub(
        r"\s*원문과 문항 구조를 자동 대조한 결과이며,?\s*정답 신뢰도는\s*\d+%입니다\.?",
        "",
        text,
    )
    text = re.sub(r"\s*정답 신뢰도는\s*\d+%입니다\.?", "", text)
    text = re.sub(r"\s*자동 대조[^.]*\.?", "", text)
    return text.strip(" .") + "."


def detailed_explanation(question: dict) -> str:
    answer = answer_display(question.get("answer"))
    if is_multiple_choice_answer(question.get("answer")):
        answer_index = CIRCLED.index(answer)
        choices = question.get("choices", [])
        choice = compact_text(choices[answer_index] if answer_index < len(choices) else "", 165)
        answer_line = f"[정답 선지] {answer} {choice}"
    else:
        answer_line = f"[모범 답안] {compact_text(question.get('answer'), 220)}"

    evidence = clean_explanation(question.get("explanation"))
    guide = EXPLANATION_GUIDES.get(
        question.get("type"),
        "지문의 중심 내용과 문항이 요구하는 판단 기준을 먼저 정리한 뒤, 각 선지를 같은 기준으로 비교합니다.",
    )
    rationales = [
        item for item in question.get("choiceRationales", [])
        if not item.get("isCorrect") and item.get("rationale")
    ]
    if rationales:
        distractor = " · ".join(
            f"{CIRCLED[int(item.get('index', index + 1)) - 1]} {compact_text(item.get('rationale'), 68)}"
            for index, item in enumerate(rationales[:4])
            if 1 <= int(item.get("index", index + 1)) <= 5
        )
    else:
        distractor = DISTRACTOR_GUIDES.get(
            question.get("type"),
            "오답은 지문의 일부 표현만 가져왔거나 범위·인과·긍정과 부정의 방향을 바꾼 경우가 많으므로 글 전체와 대조합니다.",
        )
    return "\n".join([
        answer_line,
        f"[판단 근거] {evidence}",
        f"[풀이 포인트] {guide}",
        f"[선지 분석] {distractor}",
    ])


def draw_fitted_paragraph(
    pdf: canvas.Canvas,
    text: str,
    x: float,
    y_top: float,
    width: float,
    max_height: float,
    base_size: float = 8.8,
    minimum_size: float = 7.0,
) -> float:
    safe = escape(str(text or "")).replace("\n", "<br/>")
    size = base_size
    while size >= minimum_size - 0.01:
        style = paragraph_style(
            f"answer-{size:.1f}",
            size,
            size * 1.42,
            INK,
        )
        paragraph = Paragraph(safe, style)
        _, height = paragraph.wrap(width, max_height)
        if height <= max_height:
            paragraph.drawOn(pdf, x, y_top - height)
            return height
        size -= 0.2
    raise ValueError(f"정답 해설 영역을 벗어났습니다: {compact_text(text, 80)}")


def draw_answer_pages(pdf: canvas.Canvas, manifest: dict, page_number: int) -> int:
    for group_index, group in enumerate(chunks(manifest["questions"], 4)):
        draw_page_frame(pdf, page_number, "ANSWER & EXPLANATION")
        left = 18 * mm
        width = PAGE_WIDTH - 36 * mm
        title_y = PAGE_HEIGHT - 38 * mm
        pdf.setFillColor(INK)
        pdf.setFont("Pretendard-Bold", 18)
        pdf.drawString(left, title_y, "정답 및 해설")
        pdf.setFillColor(MUTED)
        pdf.setFont("Pretendard", 8.6)
        pdf.drawRightString(
            left + width,
            title_y,
            f"{group_index + 1} / {math.ceil(len(manifest['questions']) / 4)}",
        )
        pdf.setStrokeColor(BLUE)
        pdf.setLineWidth(1)
        pdf.line(left, title_y - 4 * mm, left + width, title_y - 4 * mm)

        column_gap = 8 * mm
        column_width = (width - column_gap) / 2
        content_top = title_y - 11 * mm
        content_bottom = 25 * mm
        row_gap = 5 * mm
        box_height = (content_top - content_bottom - row_gap) / 2
        center_x = left + column_width + column_gap / 2
        pdf.setStrokeColor(LINE)
        pdf.setLineWidth(0.7)
        pdf.line(center_x, content_bottom, center_x, content_top)

        for index, question in enumerate(group):
            column = index // 2
            row = index % 2
            x = left + column * (column_width + column_gap)
            y_top = content_top - row * (box_height + row_gap)
            pdf.setFillColor(colors.HexColor("#F7FAFE"))
            pdf.roundRect(x, y_top - box_height, column_width, box_height, 2 * mm, stroke=0, fill=1)
            pdf.setFillColor(BLUE)
            pdf.circle(x + 7 * mm, y_top - 8 * mm, 4.5 * mm, stroke=0, fill=1)
            pdf.setFillColor(WHITE)
            pdf.setFont("Pretendard-Bold", 8.8)
            pdf.drawCentredString(x + 7 * mm, y_top - 10.6 * mm, f"{question['number']:02d}")
            pdf.setFillColor(INK)
            pdf.setFont("Pretendard-Bold", 10.2)
            pdf.drawString(x + 14 * mm, y_top - 7.6 * mm, question["typeLabel"])
            multiple_choice = is_multiple_choice_answer(question["answer"])
            pdf.setFillColor(CORAL)
            pdf.setFont("Pretendard-Bold", 14 if multiple_choice else 8)
            pdf.drawRightString(
                x + column_width - 5 * mm,
                y_top - 10 * mm,
                answer_display(question["answer"]) if multiple_choice else "서술형",
            )
            pdf.setStrokeColor(LINE)
            pdf.setLineWidth(0.5)
            pdf.line(x + 5 * mm, y_top - 14 * mm, x + column_width - 5 * mm, y_top - 14 * mm)
            draw_fitted_paragraph(
                pdf,
                detailed_explanation(question),
                x + 5 * mm,
                y_top - 19 * mm,
                column_width - 10 * mm,
                box_height - 24 * mm,
                8.8,
                7.0,
            )
        pdf.showPage()
        page_number += 1
    return page_number


def build_workbook(manifest_path: Path, output_path: Path) -> dict:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if len(manifest.get("questions", [])) != 50:
        raise ValueError(f"{manifest_path}: 50문항 manifest가 아닙니다.")
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
    for banned in ("정답 신뢰도", "자동 대조", "DB VPB", "검증 99%"):
        if banned in extracted:
            raise ValueError(f"{output_path}: 공개 금지 문구가 남아 있습니다: {banned}")
    for question in manifest["questions"]:
        if question["questionId"] not in extracted:
            raise ValueError(f"{output_path}: 문항 ID 누락 {question['questionId']}")
        if question.get("correctionVersion") != "source-grounded-variant-v4":
            raise ValueError(f"{output_path}: 미교정 문항 포함 {question['questionId']}")
    report = {
        "file": str(output_path),
        "pages": len(reader.pages),
        "questions": len(manifest["questions"]),
        "answerPages": math.ceil(len(manifest["questions"]) / 4),
        "answerLayout": "two-column-detailed",
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
        manifest_paths = sorted(WORK_ROOT.glob(f"grade{grade}-workbook-[0-9][0-9].json"))
        if len(manifest_paths) != 10:
            raise ValueError(f"고{grade} manifest가 {len(manifest_paths)}개입니다. 10개가 필요합니다.")
        for manifest_path in manifest_paths:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            volume = int(manifest["volume"])
            output_path = OUTPUT_ROOT / (
                f"xstudy-grade{grade}-english-variant-workbook-{volume:02d}-50.pdf"
            )
            reports.append(build_workbook(manifest_path, output_path))
            print(f"교재 생성 완료: {output_path}")
    report_path = WORK_ROOT / "workbook-render-report.json"
    report_path.write_text(json.dumps(reports, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"렌더 검증 보고서: {report_path}")


if __name__ == "__main__":
    main()
