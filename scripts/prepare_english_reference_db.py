#!/usr/bin/env python3
"""Prepare local-only samples for an English textbook editorial profile DB.

The output JSON may contain copyrighted source excerpts and must stay outside the
repository. Only derived, non-quoting profiles are imported into Firestore.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import tempfile
import unicodedata
from pathlib import Path

import pdfplumber


SOURCE_SPECS = [
    ("daily-syntax-answer-guide", "1일1구문_정답및해설.pdf", "syntax-answer-guide", "고등 영어 구문 학습"),
    ("english-qualification-syntax-guide", "영어의자격_구문편_정답과해설.pdf", "syntax-answer-guide", "고등 영어 구문 분석"),
    ("common-english-2-teacher-guide", "영어 교과서 2 ai 교육자료.pdf", "teacher-guide", "공통영어2 수업 설계"),
    ("common-english-advanced-guide", "영어 교과서 심화 ai 교육자료.pdf", "teacher-guide", "고등 영어 심화 수업"),
    ("common-english-advanced-lesson-guide", "영어 교과서 pdf 심화버전 ai 교육자료.pdf", "teacher-guide", "고등 영어 단원 심화"),
    ("absolute-evaluation-syntax-guide", "절대평가Q_구문독해_정답및해설.pdf", "syntax-answer-guide", "수능 구문 독해"),
    ("ybm-common-english-1-guide", "ybm 영어 교과서 ai 교육자료.pdf", "teacher-guide", "공통영어1 수업 설계"),
]


def normalized_name(value: str) -> str:
    return unicodedata.normalize("NFC", value)


def find_named_file(downloads: Path, expected_name: str) -> Path:
    expected = normalized_name(expected_name)
    for candidate in downloads.iterdir():
        if candidate.is_file() and normalized_name(candidate.name) == expected:
            return candidate
    raise FileNotFoundError(downloads / expected_name)


def find_generator_manual(downloads: Path) -> Path | None:
    for directory in downloads.iterdir():
        if not directory.is_dir() or "출제프로그램" not in normalized_name(directory.name):
            continue
        for candidate in directory.iterdir():
            name = normalized_name(candidate.name)
            if candidate.suffix.lower() == ".pdf" and "매뉴얼" in name:
                return candidate
    return None


def select_page_indexes(page_count: int, max_pages: int) -> list[int]:
    if page_count <= max_pages:
        return list(range(page_count))
    indexes = {0, 1, page_count - 2, page_count - 1}
    for slot in range(max_pages):
        indexes.add(round(slot * (page_count - 1) / max(1, max_pages - 1)))
    return sorted(indexes)[:max_pages]


def normalize_text(text: str) -> str:
    value = unicodedata.normalize("NFC", text or "").replace("\u00a0", " ").replace("\x07", " ")
    value = re.sub(r"[ \t]+", " ", value)
    value = re.sub(r"\n{3,}", "\n\n", value)
    return value.strip()


def ocr_pages(helper: Path, pdf: pdfplumber.PDF, indexes: list[int]) -> dict[int, dict[str, str]]:
    if not indexes:
        return {}
    with tempfile.TemporaryDirectory(prefix="xtudy-pdf-ocr-") as directory:
        image_dir = Path(directory)
        for index in indexes:
            pdf.pages[index].to_image(resolution=180).save(image_dir / f"page-{index + 1:04d}.png", format="PNG")
        command = [
            "swift",
            "-module-cache-path",
            "/tmp/xtudy-swift-modules",
            "-target",
            "arm64-apple-macosx26.0",
            str(helper),
            str(image_dir),
        ]
        completed = subprocess.run(command, check=True, capture_output=True, text=True, timeout=900)
    result: dict[int, dict[str, str]] = {}
    for line in completed.stdout.splitlines():
        if not line.strip():
            continue
        item = json.loads(line)
        result[int(item["page"])] = {"method": str(item["method"]), "text": normalize_text(item["text"])}
    return result


def extract_pdf(path: Path, helper: Path, max_pages: int, sample_limit: int) -> tuple[str, dict[str, object]]:
    with pdfplumber.open(path) as pdf:
        page_count = len(pdf.pages)
        indexes = select_page_indexes(page_count, max_pages)
        extracted = {index + 1: normalize_text(pdf.pages[index].extract_text() or "") for index in indexes}
        needs_ocr = [page - 1 for page, text in extracted.items() if len(text) < 80]
        ocr = ocr_pages(helper, pdf, needs_ocr)
    methods: dict[str, int] = {"native": 0, "vision-ocr": 0, "empty": 0}
    sections = []
    for index in indexes:
        page = index + 1
        text = extracted.get(page, "")
        method = "native"
        if len(text) < 80 and page in ocr:
            text = ocr[page]["text"]
            method = ocr[page]["method"]
        if not text:
            method = "empty"
        methods[method] = methods.get(method, 0) + 1
        if text:
            sections.append(f"[PAGE {page}]\n{text}")
    sample = "\n\n".join(sections)
    if len(sample) > sample_limit:
        section_size = sample_limit // 3
        middle = max(0, len(sample) // 2 - section_size // 2)
        sample = "\n\n[EXCERPT GAP]\n\n".join(
            [sample[:section_size], sample[middle : middle + section_size], sample[-section_size:]]
        )
    return sample, {"pageCount": page_count, "sampledPages": [index + 1 for index in indexes], "methods": methods}


def extract_hwp(path: Path, sample_limit: int) -> tuple[str, dict[str, object]]:
    with tempfile.TemporaryDirectory(prefix="xtudy-hwp-") as directory:
        completed = subprocess.run(
            ["soffice", "--headless", "--convert-to", "txt:Text", "--outdir", directory, str(path)],
            check=False,
            capture_output=True,
            text=True,
            timeout=120,
        )
        outputs = list(Path(directory).glob("*.txt"))
        if completed.returncode != 0 or not outputs:
            return "", {"method": "conversion-failed", "detail": completed.stderr[-300:]}
        text = normalize_text(outputs[0].read_text(encoding="utf-8", errors="replace"))
        return text[:sample_limit], {"method": "libreoffice", "characterCount": len(text)}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        while chunk := stream.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def source_record(source_id: str, path: Path, category: str, focus: str, sample: str, extraction: dict[str, object]) -> dict[str, object]:
    return {
        "id": source_id,
        "title": path.stem,
        "sourceFileName": path.name,
        "category": category,
        "focus": focus,
        "mediaType": path.suffix.lower().lstrip("."),
        "byteSize": path.stat().st_size,
        "sha256": sha256(path),
        "extraction": extraction,
        "analysisSample": sample,
        "profile": None,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--downloads", type=Path, default=Path.home() / "Downloads")
    parser.add_argument("--output", type=Path, default=Path("/tmp/xtudy-english-reference-db.json"))
    parser.add_argument("--max-pages", type=int, default=24)
    parser.add_argument("--sample-limit", type=int, default=48_000)
    parser.add_argument("--ocr-helper", type=Path, default=Path(__file__).with_name("ocr-pdf-macos.swift"))
    args = parser.parse_args()

    documents = []
    for source_id, file_name, category, focus in SOURCE_SPECS:
        path = find_named_file(args.downloads, file_name)
        sample, extraction = extract_pdf(path, args.ocr_helper, args.max_pages, args.sample_limit)
        documents.append(source_record(source_id, path, category, focus, sample, extraction))
        print(json.dumps({"prepared": source_id, "characters": len(sample), **extraction}, ensure_ascii=False))

    manual = find_generator_manual(args.downloads)
    if manual:
        sample, extraction = extract_pdf(manual, args.ocr_helper, min(args.max_pages, 12), args.sample_limit)
        documents.append(source_record("vocabulary-2580-generator-manual", manual, "vocabulary-assessment", "수능 어휘 평가 구성", sample, extraction))

    errata = find_named_file(args.downloads, "[정오표] 메가스터디 영단어 수능 2580(추가쇄 반영됨)_ver 2..hwp")
    sample, extraction = extract_hwp(errata, args.sample_limit)
    documents.append(source_record("vocabulary-2580-errata", errata, "vocabulary-quality-control", "수능 어휘 교정 및 품질 관리", sample, extraction))

    payload = {
        "schemaVersion": "english-reference-profile-v1",
        "copyrightPolicy": "derived-structure-only-no-source-republication",
        "documents": documents,
        "excluded": [
            "Official 2022-2026 CSAT files already stored in csat-english-v1",
            "Duplicate ZIP archives",
            "Windows executable files",
            "Google verification HTML",
            "Unrelated screenshots and images",
        ],
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(args.output), "documentCount": len(documents)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
