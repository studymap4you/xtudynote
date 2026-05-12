from __future__ import annotations

from dataclasses import dataclass


@dataclass
class ParsedDocument:
    """Structured text obtained by splitting on known section headers."""

    source_name: str
    preamble: str
    problem_passage: str = ""
    answer_explanation: str = ""
    topic_gist: str = ""
    literal_translation: str = ""
    evaluation: str = ""


SECTION_LABELS_KO = {
    "problem_passage": "문제 · 지문",
    "answer_explanation": "정답 · 해설",
    "topic_gist": "주제 · 요지",
    "literal_translation": "직독직해",
    "evaluation": "평가문제",
}
