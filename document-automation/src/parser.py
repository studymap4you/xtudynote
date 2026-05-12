from __future__ import annotations

import re
from dataclasses import dataclass

from models import ParsedDocument

# Line must be exactly one of these headers (after strip), UTF-8.
_HEADER_LINE = re.compile(
    r"^\s*(\[문제\+지문\]|\[정답\+해설\]|\[주제\+요지\]|\[직독직해\]|\[평가문제\])\s*$"
)

_HEADER_TO_FIELD: dict[str, str] = {
    "[문제+지문]": "problem_passage",
    "[정답+해설]": "answer_explanation",
    "[주제+요지]": "topic_gist",
    "[직독직해]": "literal_translation",
    "[평가문제]": "evaluation",
}


@dataclass
class _Marker:
    field_name: str
    line_index: int


def parse_txt(source_name: str, raw: str) -> ParsedDocument:
    lines = raw.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    markers: list[_Marker] = []
    for i, line in enumerate(lines):
        m = _HEADER_LINE.match(line)
        if not m:
            continue
        token = m.group(1)
        field = _HEADER_TO_FIELD.get(token)
        if field:
            markers.append(_Marker(field_name=field, line_index=i))

    if not markers:
        return ParsedDocument(source_name=source_name, preamble=raw.strip())

    doc = ParsedDocument(source_name=source_name, preamble="\n".join(lines[: markers[0].line_index]).strip())

    for idx, mk in enumerate(markers):
        start = mk.line_index + 1
        end = markers[idx + 1].line_index if idx + 1 < len(markers) else len(lines)
        body = "\n".join(lines[start:end]).strip()
        _assign(doc, mk.field_name, body)

    return doc


def _assign(doc: ParsedDocument, field: str, body: str) -> None:
    current = getattr(doc, field, None)
    if not isinstance(current, str):
        return
    if not body:
        return
    if current:
        setattr(doc, field, f"{current.rstrip()}\n\n{body}".strip())
    else:
        setattr(doc, field, body)
