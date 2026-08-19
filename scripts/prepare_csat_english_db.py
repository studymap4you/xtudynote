#!/usr/bin/env python3
"""Extract the supplied 2022-2026 CSAT English PDFs into an import dataset.

The generated JSON is an intermediate import artifact. The production database
lives in Firestore and the source files live in Firebase Storage.
"""

from __future__ import annotations

import argparse
import json
import re
import unicodedata
from pathlib import Path

import pdfplumber


CIRCLED_TO_INT = {"①": 1, "②": 2, "③": 3, "④": 4, "⑤": 5}

QUESTION_TYPE_BY_NUMBER = {
    18: "purpose",
    19: "emotion-change",
    20: "claim",
    21: "implicit-meaning",
    22: "main-idea",
    23: "topic",
    24: "title",
    25: "chart",
    26: "content-match",
    27: "practical-information",
    28: "practical-information",
    29: "grammar",
    30: "vocabulary",
    31: "blank-inference",
    32: "blank-inference",
    33: "blank-inference",
    34: "blank-inference",
    35: "irrelevant-sentence",
    36: "paragraph-order",
    37: "paragraph-order",
    38: "sentence-insertion",
    39: "sentence-insertion",
    40: "summary-completion",
    41: "long-passage-title",
    42: "long-passage-vocabulary",
    43: "integrated-order",
    44: "reference-inference",
    45: "integrated-content-match",
}

TYPE_LOGIC = {
    "purpose": "발화자·글쓴이의 행동 요청과 핵심 동사를 찾아 목적을 한 문장으로 압축한다.",
    "emotion-change": "사건 전후의 감정 단서와 전환 계기를 시간 순서로 추적한다.",
    "claim": "반복되는 당위 표현과 결론 문장을 묶어 필자의 주장을 판별한다.",
    "implicit-meaning": "밑줄 표현의 사전 의미가 아니라 앞뒤 논리에서 수행하는 함의를 복원한다.",
    "main-idea": "문단마다 반복되는 핵심 개념과 결론의 범위를 비교해 요지를 고른다.",
    "topic": "글 전체에서 반복되는 대상과 논점의 교집합을 가장 정확한 명사구로 잡는다.",
    "title": "핵심 대상과 필자의 관점을 함께 포함하면서 과도하게 넓거나 좁은 선택지를 제거한다.",
    "chart": "표·그래프의 비교 기준, 수치 방향, 순위를 문장과 하나씩 대조한다.",
    "content-match": "인물·사건·조건·수치의 일치 여부를 본문 근거와 직접 대조한다.",
    "practical-information": "안내문의 날짜·대상·비용·조건을 선택지별로 체크한다.",
    "grammar": "문장 구조의 필수 성분, 수일치, 태, 준동사, 관계 구조를 차례로 확인한다.",
    "vocabulary": "문맥의 인과·대조 방향과 어휘의 극성을 비교해 흐름을 깨는 표현을 찾는다.",
    "blank-inference": "빈칸 앞뒤의 재진술·대조·인과를 연결하고 글 전체 논지와 같은 범위의 표현을 고른다.",
    "irrelevant-sentence": "문단의 중심 화제와 지시어 연결망에서 벗어나는 문장을 찾는다.",
    "paragraph-order": "주어진 문장의 핵심어를 기준으로 지시어·관사·연결어·시간 순서를 연쇄한다.",
    "sentence-insertion": "삽입 문장의 지시어와 논리 관계가 앞문장과 뒷문장을 동시에 자연스럽게 잇는 위치를 찾는다.",
    "summary-completion": "원문의 원인·과정·결과를 보존하면서 요약문의 빈칸 품사와 의미 방향을 맞춘다.",
    "long-passage-title": "장문의 반복 개념과 결말의 관점을 함께 포괄하는 제목을 고른다.",
    "long-passage-vocabulary": "장문 전체의 논리 방향과 해당 문장의 의미 극성을 함께 확인한다.",
    "integrated-order": "사건의 시간 순서와 인물·대명사 지시 관계를 함께 추적한다.",
    "reference-inference": "각 대명사가 가리킬 수 있는 인물 후보를 문법과 사건 흐름으로 제한한다.",
    "integrated-content-match": "장문 속 인물·행동·시간·결과를 선택지와 직접 대조한다.",
}

ANSWER_KEY_2025 = {
    1: (2, 2), 2: (5, 2), 3: (1, 2), 4: (3, 2), 5: (1, 2),
    6: (4, 2), 7: (3, 2), 8: (4, 2), 9: (5, 2), 10: (2, 2),
    11: (2, 3), 12: (1, 2), 13: (5, 2), 14: (1, 3), 15: (2, 3),
    16: (3, 2), 17: (4, 2), 18: (1, 2), 19: (2, 2), 20: (1, 2),
    21: (3, 3), 22: (2, 2), 23: (1, 2), 24: (5, 2), 25: (4, 2),
    26: (4, 2), 27: (3, 2), 28: (3, 2), 29: (2, 2), 30: (4, 3),
    31: (5, 2), 32: (3, 2), 33: (2, 3), 34: (5, 3), 35: (4, 2),
    36: (5, 2), 37: (3, 3), 38: (4, 3), 39: (4, 2), 40: (1, 2),
    41: (2, 2), 42: (5, 3), 43: (2, 2), 44: (3, 2), 45: (4, 2),
}


def normalize_text(text: str) -> str:
    text = unicodedata.normalize("NFC", text or "")
    text = text.replace("\u00a0", " ")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def infer_type(number: int) -> str:
    if number <= 17:
        return "listening"
    return QUESTION_TYPE_BY_NUMBER[number]


def extract_answer_key(path: Path, year: int) -> dict[int, tuple[int, int]]:
    if year == 2025:
        return ANSWER_KEY_2025
    with pdfplumber.open(path) as pdf:
        text = pdf.pages[0].extract_text() or ""
    rows = re.findall(r"(?<!\d)(\d{1,2})\s+([①②③④⑤])\s+([23])(?!\d)", text)
    result = {int(number): (CIRCLED_TO_INT[answer], int(score)) for number, answer, score in rows}
    if sorted(result) != list(range(1, 46)):
        raise ValueError(f"{year} answer key extraction failed: {len(result)} rows")
    return result


def extract_question_blocks(path: Path) -> dict[int, dict[str, object]]:
    extracted: dict[int, dict[str, object]] = {}
    with pdfplumber.open(path) as pdf:
        for page_index, page in enumerate(pdf.pages[:8]):
            boxes = [
                ("left", (0, 0, page.width / 2, page.height)),
                ("right", (page.width / 2, 0, page.width, page.height)),
            ]
            for column, box in boxes:
                column_text = normalize_text(
                    page.crop(box).extract_text(x_tolerance=2, y_tolerance=3) or ""
                )
                matches = list(re.finditer(r"(?m)^\s*(\d{1,2})\.\s*", column_text))
                if not matches:
                    continue
                prefix = normalize_text(column_text[: matches[0].start()])
                range_match = re.search(r"[\[\(]?\s*(\d{2})\s*[~～\-]\s*(\d{2})\s*[\]\)]?", prefix)
                shared_range = None
                if range_match:
                    shared_range = (int(range_match.group(1)), int(range_match.group(2)))
                for index, match in enumerate(matches):
                    number = int(match.group(1))
                    if number < 1 or number > 45 or number in extracted:
                        continue
                    end = matches[index + 1].start() if index + 1 < len(matches) else len(column_text)
                    raw_block = normalize_text(column_text[match.start() : end])
                    raw_block = re.split(
                        r"\n\s*\[\s*\d{2}\s*[~～\-]\s*\d{2}\s*\]",
                        raw_block,
                        maxsplit=1,
                    )[0].strip()
                    raw_block = re.sub(r"\n?\s*영어 영역\s*$", "", raw_block).strip()
                    shared_context = ""
                    if shared_range and shared_range[0] <= number <= shared_range[1]:
                        shared_context = prefix
                    extracted[number] = {
                        "rawBlock": raw_block,
                        "sharedContext": shared_context,
                        "page": page_index + 1,
                        "column": column,
                    }
    if sorted(extracted) != list(range(1, 46)):
        missing = sorted(set(range(1, 46)) - set(extracted))
        raise ValueError(f"Question extraction failed for {path.name}; missing={missing}")
    return extracted


def asset(path: Path, role: str, storage_name: str) -> dict[str, str]:
    if not path.exists():
        raise FileNotFoundError(path)
    return {"localPath": str(path), "role": role, "storageName": storage_name}


def build_manifest(downloads: Path, extracted: Path) -> list[dict[str, object]]:
    return [
        {
            "year": 2022,
            "problem": extracted / "2022" / "영어영역_홀수형.pdf",
            "answer": downloads / "3교시_영어영역_정답표 (1).pdf",
            "assets": [
                asset(extracted / "2022" / "영어영역_홀수형.pdf", "problem-odd", "2022_csat_english_odd.pdf"),
                asset(extracted / "2022" / "영어영역_짝수형.pdf", "problem-even", "2022_csat_english_even.pdf"),
                asset(extracted / "2022" / "영어_듣기대본.pdf", "listening-script", "2022_csat_english_listening_script.pdf"),
                asset(downloads / "3교시_영어영역_정답표 (1).pdf", "answer-key", "2022_csat_english_answer_key.pdf"),
            ],
        },
        {
            "year": 2023,
            "problem": extracted / "2023" / "3교시_영어영역_문제지.pdf",
            "answer": downloads / "3교시_영어영역_정답표.pdf",
            "assets": [
                asset(extracted / "2023" / "3교시_영어영역_문제지.pdf", "problem-combined", "2023_csat_english_problem.pdf"),
                asset(extracted / "2023" / "3교시_영어영역_듣기평가대본.pdf", "listening-script", "2023_csat_english_listening_script.pdf"),
                asset(downloads / "3교시_영어영역_정답표.pdf", "answer-key", "2023_csat_english_answer_key.pdf"),
            ],
        },
        {
            "year": 2024,
            "problem": downloads / "영어영역_문제지 (1).pdf",
            "answer": downloads / "영어영역_정답표 (2).pdf",
            "assets": [
                asset(downloads / "영어영역_문제지 (1).pdf", "problem-combined", "2024_csat_english_problem.pdf"),
                asset(downloads / "영어영역_정답표 (2).pdf", "answer-key", "2024_csat_english_answer_key.pdf"),
            ],
        },
        {
            "year": 2025,
            "problem": downloads / "영어영역_문제지_홀수형.pdf",
            "answer": downloads / "영어영역_정답표 (1).pdf",
            "assets": [
                asset(downloads / "영어영역_문제지_홀수형.pdf", "problem-odd", "2025_csat_english_odd.pdf"),
                asset(downloads / "영어영역_문제지_짝수형 2025.pdf", "problem-even", "2025_csat_english_even.pdf"),
                asset(downloads / "영어영역_정답표 (1).pdf", "answer-key", "2025_csat_english_answer_key.pdf"),
            ],
        },
        {
            "year": 2026,
            "problem": downloads / "영어영역_문제지.pdf",
            "answer": downloads / "영어영역_정답표.pdf",
            "assets": [
                asset(downloads / "영어영역_문제지.pdf", "problem-combined", "2026_csat_english_problem.pdf"),
                asset(downloads / "영어영역_정답표.pdf", "answer-key", "2026_csat_english_answer_key.pdf"),
            ],
        },
    ]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--downloads", type=Path, default=Path.home() / "Downloads")
    parser.add_argument("--extracted", type=Path, default=Path("/tmp/xtudy-csat-source"))
    parser.add_argument("--output", type=Path, default=Path("/tmp/xtudy-csat-english-db.json"))
    args = parser.parse_args()

    exams = []
    questions = []
    for item in build_manifest(args.downloads, args.extracted):
        year = int(item["year"])
        blocks = extract_question_blocks(Path(item["problem"]))
        answers = extract_answer_key(Path(item["answer"]), year)
        for number in range(1, 46):
            answer_index, score = answers[number]
            question_type = infer_type(number)
            block = blocks[number]
            transferable_logic = TYPE_LOGIC.get(
                question_type,
                "문항의 명시적 근거와 선택지를 직접 대조한다.",
            )
            questions.append(
                {
                    "id": f"{year}-odd-{number:02d}",
                    "examYear": year,
                    "form": "odd",
                    "questionNumber": number,
                    "answerIndex": answer_index,
                    "score": score,
                    "section": "listening" if number <= 17 else "reading",
                    "questionType": question_type,
                    "rawBlock": block["rawBlock"],
                    "sharedContext": block["sharedContext"],
                    "sourcePage": block["page"],
                    "sourceColumn": block["column"],
                    "analysis": {
                        "status": "pending-transcript" if number <= 17 else "logic-mapped",
                        "transferableLogic": transferable_logic,
                        "answerReason": "" if number <= 17 else f"공식 정답은 {answer_index}번이다. {transferable_logic}",
                        "coreEvidence": "" if number <= 17 else "정답은 지문 전체의 핵심 논리와 선택지의 의미 범위가 일치하는지를 기준으로 판별한다.",
                        "distractorReasons": {},
                        "difficultySignals": [],
                        "generationRules": [] if number <= 17 else [
                            transferable_logic,
                            "정답 선택지는 본문의 핵심 근거를 정확히 재진술하되 원문 표현을 그대로 복제하지 않는다.",
                            "오답은 범위 확대·축소, 인과 역전, 반대 극성, 부분 정보 왜곡 중 유형에 맞는 함정을 사용한다.",
                        ],
                    },
                }
            )
        exams.append(
            {
                "id": str(year),
                "examYear": year,
                "subject": "영어",
                "questionCount": 45,
                "readingQuestionCount": 28,
                "assets": item["assets"],
            }
        )

    payload = {
        "schemaVersion": "csat-english-v1",
        "years": [2022, 2023, 2024, 2025, 2026],
        "exams": exams,
        "questions": questions,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(
        json.dumps(
            {
                "output": str(args.output),
                "examCount": len(exams),
                "questionCount": len(questions),
                "readingQuestionCount": sum(q["section"] == "reading" for q in questions),
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
