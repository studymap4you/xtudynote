"""
비정형 텍스트 → 지문 세트(JSON). Phase3·4는 앵커가 없으면 None.
--merge: [문제 N] 블록으로 Phase2~4만 같은 번호에 병합.
"""
from __future__ import annotations

import argparse
import json
import re
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

# ---------------------------------------------------------------------------
# 데이터 모델
# ---------------------------------------------------------------------------


@dataclass
class Phase1Block:
    number: int
    stem: str
    passage: str
    choices: dict[str, str] = field(default_factory=dict)


@dataclass
class Phase2Block:
    answer: int
    explanation: str


@dataclass
class Phase3Block:
    topic: str | None = None
    gist: str | None = None
    key_sentence: str | None = None
    literal: str | None = None


@dataclass
class Phase4Block:
    body: str


@dataclass
class PassageUnit:
    number: int
    phase1: Phase1Block
    phase2: Phase2Block | None = None
    phase3: Phase3Block | None = None
    phase4: Phase4Block | None = None


def phase3_effective(p: Phase3Block | None) -> Phase3Block | None:
    if p is None:
        return None
    if not any((p.topic or "").strip() or (p.gist or "").strip() or (p.key_sentence or "").strip() or (p.literal or "").strip()):
        return None
    return p


def phase4_effective(p: Phase4Block | None) -> Phase4Block | None:
    if p is None or not (p.body or "").strip():
        return None
    return p


PROBLEM_START = re.compile(r"^\s*(\d+)\.\s*(.*)$")
CHOICE_LINE = re.compile(r"^\s*([①②③④⑤])\s*[.．]?\s*(.*)$")
CIRCLE_TO_NUM = {"①": "1", "②": "2", "③": "3", "④": "4", "⑤": "5"}
MERGE_UNIT_HEAD = re.compile(r"\[\s*문제\s*(\d+)\s*\]", re.I)

ANCHOR_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("phase2_se", re.compile(r"\[\s*정답\s*및\s*해설\s*\]", re.I)),
    ("phase2_short", re.compile(r"\[\s*정답\s*\]", re.I)),
    ("phase2_expl", re.compile(r"\[\s*해설\s*\]", re.I)),
    ("phase3_topic", re.compile(r"\[\s*주제\s*\]", re.I)),
    ("phase3_gist", re.compile(r"\[\s*요지\s*\]", re.I)),
    ("phase3_keysent", re.compile(r"\[\s*주제문\s*\]", re.I)),
    ("phase3_literal", re.compile(r"\[\s*직독직해\s*\]", re.I)),
    ("phase4_ko", re.compile(r"\[\s*확인문제\s*\]", re.I)),
    ("phase4_en", re.compile(r"\[\s*Review\s*\]", re.I)),
]


def _norm(s: str) -> str:
    return s.replace("\r\n", "\n").replace("\r", "\n")


def _normalize_bracket_anchors(s: str) -> str:
    return s.replace("\uff3b", "[").replace("\uff3d", "]").replace("【", "[").replace("】", "]")


def _split_stem_passage(preamble_lines: list[str]) -> tuple[str, str]:
    if not preamble_lines:
        return "", ""
    text = "\n".join(preamble_lines).strip()
    if "\n\n" in text:
        a, b = text.split("\n\n", 1)
        return a.strip(), b.strip()
    if len(preamble_lines) >= 2:
        return preamble_lines[0].strip(), "\n".join(preamble_lines[1:]).strip()
    return text, ""


def _parse_choices(lines: list[str], start: int) -> tuple[dict[str, str], int]:
    choices: dict[str, str] = {}
    i = start
    while i < len(lines):
        m = CHOICE_LINE.match(lines[i])
        if not m:
            break
        circle, rest = m.group(1), m.group(2).strip()
        num = CIRCLE_TO_NUM.get(circle)
        if num:
            choices[num] = rest
        i += 1
        if len(choices) >= 5:
            break
    return choices, i


def _find_first_anchor_start(text: str) -> int:
    min_i = -1
    for _kind, pat in ANCHOR_PATTERNS:
        m = pat.search(text)
        if m and (min_i < 0 or m.start() < min_i):
            min_i = m.start()
    return min_i


def _fallback_phase2(text: str) -> Phase2Block | None:
    t = text.strip()
    if not t:
        return None
    ans_m = re.search(r"(?:정답|답)\s*[:：]?\s*([①②③④⑤1-5])", t)
    if ans_m:
        token = ans_m.group(1)
        ans = int(CIRCLE_TO_NUM.get(token, token))
        tail = t[ans_m.end() :].strip()
        tail = re.sub(r"^\s*(?:해설|설명)\s*[:：]?\s*", "", tail, count=1, flags=re.M).strip() or t[ans_m.start() :].strip()
        return Phase2Block(answer=ans, explanation=tail or t)
    em = re.search(r"^\s*해설\s*[:：]?\s*([\s\S]*)$", t, re.M)
    if em and em.group(1).strip():
        return Phase2Block(answer=1, explanation=em.group(1).strip())
    return None


def _parse_trailing(text: str) -> tuple[Phase2Block | None, Phase3Block | None, Phase4Block | None]:
    normalized = _normalize_bracket_anchors(text)
    if not normalized.strip():
        return None, None, None

    matches: list[tuple[int, int, str]] = []
    for kind, pat in ANCHOR_PATTERNS:
        for m in pat.finditer(normalized):
            matches.append((m.start(), m.end(), kind))
    matches.sort(key=lambda x: x[0])

    segs: dict[str, str] = {}
    p2_parts: list[str] = []
    for idx, (_start, end, kind) in enumerate(matches):
        content_start = end
        content_end = matches[idx + 1][0] if idx + 1 < len(matches) else len(normalized)
        chunk = normalized[content_start:content_end].strip()
        if kind.startswith("phase2_"):
            if chunk:
                p2_parts.append(chunk)
            continue
        if kind in segs:
            segs[kind] = f"{segs[kind]}\n{chunk}".strip()
        else:
            segs[kind] = chunk

    p2_raw = "\n\n".join(p2_parts).strip()
    phase2: Phase2Block | None = None
    if p2_raw:
        ans_m = re.search(r"(?:정답|답)\s*[:：]?\s*([①②③④⑤1-5])", p2_raw)
        ans = 1
        if ans_m:
            token = ans_m.group(1)
            ans = int(CIRCLE_TO_NUM.get(token, token))
        expl = re.sub(
            r"^\s*(?:정답|답)\s*[:：]?\s*[①②③④⑤1-5]\s*",
            "",
            p2_raw,
            count=1,
            flags=re.M,
        ).strip()
        phase2 = Phase2Block(answer=ans, explanation=expl or p2_raw)
    if phase2 is None:
        phase2 = _fallback_phase2(normalized)

    p3 = Phase3Block(
        topic=(segs.get("phase3_topic") or "").strip() or None,
        gist=(segs.get("phase3_gist") or "").strip() or None,
        key_sentence=(segs.get("phase3_keysent") or "").strip() or None,
        literal=(segs.get("phase3_literal") or "").strip() or None,
    )
    p3 = phase3_effective(p3)

    p4_raw = (segs.get("phase4_ko") or segs.get("phase4_en") or "").strip()
    p4 = phase4_effective(Phase4Block(body=p4_raw) if p4_raw else None)

    return phase2, p3, p4


def _looks_like_explanation_only(u: PassageUnit) -> bool:
    blob = f"{u.phase1.stem}\n{u.phase1.passage}".strip()
    return bool(re.search(r"\[\s*정답|정답\s*및\s*해설|\[\s*해설|^\s*해설\s*[:：]?", blob, re.I))


def _parse_unit_body(number: int, body: str) -> PassageUnit:
    body = _normalize_bracket_anchors(_norm(body))
    lines = body.split("\n")
    choice_idx = None
    for i, line in enumerate(lines):
        if CHOICE_LINE.match(line):
            choice_idx = i
            break
    if choice_idx is None:
        full_text = "\n".join(lines).strip()
        anchor_at = _find_first_anchor_start(full_text)
        if anchor_at >= 0:
            preamble = full_text[:anchor_at].strip()
            preamble_lines = preamble.split("\n") if preamble else []
            stem, passage = _split_stem_passage(preamble_lines)
            ph2, ph3, ph4 = _parse_trailing(full_text[anchor_at:])
            return PassageUnit(
                number=number,
                phase1=Phase1Block(number=number, stem=stem, passage=passage, choices={}),
                phase2=ph2,
                phase3=ph3,
                phase4=ph4,
            )
        stem, passage = _split_stem_passage(lines)
        ph2, ph3, ph4 = _parse_trailing(full_text)
        return PassageUnit(
            number=number,
            phase1=Phase1Block(number=number, stem=stem, passage=passage, choices={}),
            phase2=ph2,
            phase3=ph3,
            phase4=ph4,
        )

    preamble = lines[:choice_idx]
    stem, passage = _split_stem_passage(preamble)
    choices, end_ci = _parse_choices(lines, choice_idx)
    trailing = "\n".join(lines[end_ci:]).strip()
    ph2, ph3, ph4 = _parse_trailing(trailing)
    return PassageUnit(
        number=number,
        phase1=Phase1Block(number=number, stem=stem, passage=passage, choices=choices),
        phase2=ph2,
        phase3=ph3,
        phase4=ph4,
    )


def split_unit_chunks(text: str) -> list[tuple[int, str]]:
    text = _normalize_bracket_anchors(_norm(text))
    lines = text.split("\n")
    heads: list[tuple[int, int, str]] = []
    for i, line in enumerate(lines):
        m = PROBLEM_START.match(line)
        if m:
            heads.append((i, int(m.group(1)), m.group(2)))
    if not heads:
        return []

    chunks: list[tuple[int, str]] = []
    for hi, (line_i, num, first_rest) in enumerate(heads):
        end_line = heads[hi + 1][0] if hi + 1 < len(heads) else len(lines)
        chunk_lines: list[str] = []
        if first_rest.strip():
            chunk_lines.append(first_rest)
        chunk_lines.extend(lines[line_i + 1 : end_line])
        chunks.append((num, "\n".join(chunk_lines).strip()))
    return chunks


def _renumber_units(units: list[PassageUnit]) -> list[PassageUnit]:
    out: list[PassageUnit] = []
    for i, u in enumerate(units, start=1):
        p1 = u.phase1
        out.append(
            PassageUnit(
                number=i,
                phase1=Phase1Block(number=i, stem=p1.stem, passage=p1.passage, choices=dict(p1.choices)),
                phase2=u.phase2,
                phase3=u.phase3,
                phase4=u.phase4,
            )
        )
    return out


def _merge_detached_explanations(units: list[PassageUnit]) -> list[PassageUnit]:
    out: list[PassageUnit] = []
    for u in units:
        if not out:
            out.append(u)
            continue
        prev = out[-1]
        no_choices = len(u.phase1.choices) == 0
        prev_has = len(prev.phase1.choices) > 0
        if no_choices and prev_has and (u.phase2 is not None or _looks_like_explanation_only(u)):
            if u.phase2:
                if prev.phase2 is None:
                    prev.phase2 = u.phase2
                else:
                    prev.phase2 = Phase2Block(
                        answer=prev.phase2.answer,
                        explanation=f"{prev.phase2.explanation}\n\n{u.phase2.explanation}".strip(),
                    )
            if u.phase3:
                prev.phase3 = _merge_phase3(prev.phase3, u.phase3)
            if u.phase4:
                prev.phase4 = u.phase4
            continue
        out.append(u)
    return out


def parse_document(raw: str) -> list[PassageUnit]:
    units = [_parse_unit_body(n, body) for n, body in split_unit_chunks(raw)]
    units = _merge_detached_explanations(units)
    return _renumber_units(units)


def _merge_phase3(a: Phase3Block | None, b: Phase3Block | None) -> Phase3Block | None:
    if b is None:
        return a
    if a is None:
        return phase3_effective(b)
    merged = Phase3Block(
        topic=(b.topic if (b.topic or "").strip() else a.topic),
        gist=(b.gist if (b.gist or "").strip() else a.gist),
        key_sentence=(b.key_sentence if (b.key_sentence or "").strip() else a.key_sentence),
        literal=(b.literal if (b.literal or "").strip() else a.literal),
    )
    return phase3_effective(merged)


def merge_units(base: list[PassageUnit], patch_raw: str) -> list[PassageUnit]:
    by_num = {u.number: u for u in base}
    if not by_num:
        return base

    patch_raw = _norm(patch_raw)
    matches = list(MERGE_UNIT_HEAD.finditer(patch_raw))

    def apply_body(n: int, body: str) -> None:
        if n not in by_num:
            return
        ph2, ph3, ph4 = _parse_trailing(body)
        u = by_num[n]
        if ph2:
            u.phase2 = ph2
        if ph3:
            u.phase3 = _merge_phase3(u.phase3, ph3)
        if ph4:
            u.phase4 = ph4

    if not matches:
        first_n = min(by_num.keys())
        apply_body(first_n, patch_raw)
        return sorted(by_num.values(), key=lambda x: x.number)

    for i, m in enumerate(matches):
        n = int(m.group(1))
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(patch_raw)
        apply_body(n, patch_raw[start:end])

    return sorted(by_num.values(), key=lambda x: x.number)


def unit_to_dict(u: PassageUnit) -> dict[str, Any]:
    return {
        "number": u.number,
        "phase1": asdict(u.phase1),
        "phase2": asdict(u.phase2) if u.phase2 else None,
        "phase3": asdict(u.phase3) if u.phase3 else None,
        "phase4": asdict(u.phase4) if u.phase4 else None,
    }


def unit_from_dict(d: dict[str, Any]) -> PassageUnit:
    """JSON·세션 복원용 (병합 루프 재실행 시 사용)."""
    p1 = d["phase1"]
    phase1 = Phase1Block(
        number=int(p1["number"]),
        stem=p1.get("stem") or "",
        passage=p1.get("passage") or "",
        choices=dict(p1.get("choices") or {}),
    )
    p2 = None
    if d.get("phase2"):
        x = d["phase2"]
        p2 = Phase2Block(answer=int(x["answer"]), explanation=x.get("explanation") or "")
    p3 = None
    if d.get("phase3"):
        x = d["phase3"]
        p3 = Phase3Block(
            topic=x.get("topic"),
            gist=x.get("gist"),
            key_sentence=x.get("key_sentence"),
            literal=x.get("literal"),
        )
        p3 = phase3_effective(p3)
    p4 = None
    if d.get("phase4"):
        x = d["phase4"]
        p4 = phase4_effective(Phase4Block(body=x.get("body") or ""))
    return PassageUnit(number=int(d["number"]), phase1=phase1, phase2=p2, phase3=p3, phase4=p4)


def units_from_dicts(rows: list[dict[str, Any]]) -> list[PassageUnit]:
    return [unit_from_dict(x) for x in rows]


def main() -> None:
    ap = argparse.ArgumentParser(description="지문 분류 → JSON")
    ap.add_argument("--in", dest="in_path", type=Path, required=True)
    ap.add_argument("--json", dest="json_path", type=Path, required=True)
    ap.add_argument("--merge", dest="merge_path", type=Path, default=None)
    args = ap.parse_args()

    raw = args.in_path.read_text(encoding="utf-8")
    units = parse_document(raw)
    if args.merge_path and args.merge_path.is_file():
        units = merge_units(units, args.merge_path.read_text(encoding="utf-8"))
    else:
        units.sort(key=lambda u: u.number)

    args.json_path.parent.mkdir(parents=True, exist_ok=True)
    args.json_path.write_text(
        json.dumps([unit_to_dict(u) for u in units], ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"Wrote {len(units)} units → {args.json_path}")


if __name__ == "__main__":
    main()
