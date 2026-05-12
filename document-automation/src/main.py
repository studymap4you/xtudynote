from __future__ import annotations

import sys
from pathlib import Path

# Allow `python path/to/src/main.py` without installing a package.
_SRC = Path(__file__).resolve().parent
_ROOT = _SRC.parent
if str(_SRC) not in sys.path:
    sys.path.insert(0, str(_SRC))

from config import load_config  # noqa: E402
from models import SECTION_LABELS_KO  # noqa: E402
from parser import parse_txt  # noqa: E402
from render import build_font_face_css, make_env, render_pdf  # noqa: E402


def _rel(root: Path, *parts: str) -> Path:
    return (root.joinpath(*parts)).resolve()


def main() -> None:
    try:
        _run()
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)


def _run() -> None:
    cfg = load_config(_ROOT)
    paths_cfg = cfg.get("paths") or {}
    input_dir = _rel(_ROOT, paths_cfg.get("input", "input"))
    output_dir = _rel(_ROOT, paths_cfg.get("output", "output"))
    templates_dir = _rel(_ROOT, paths_cfg.get("templates", "templates"))

    doc_cfg = cfg.get("document") or {}
    header_title = str(doc_cfg.get("header_title", "")).strip() or "문서"
    footer_left = str(doc_cfg.get("footer_left", "")).strip()
    footer_right = str(doc_cfg.get("footer_right", "")).strip()

    font_css = build_font_face_css(_ROOT, cfg)
    env = make_env(templates_dir)
    base_url = _ROOT.as_uri() + "/"

    txt_files = sorted(input_dir.glob("*.txt"))
    if not txt_files:
        print(f"No .txt files in {input_dir}", file=sys.stderr)
        return

    labels = SECTION_LABELS_KO

    for path in txt_files:
        raw = path.read_text(encoding="utf-8")
        parsed = parse_txt(path.stem, raw)
        doc_title = path.stem

        common = {
            "doc_title": doc_title,
            "header_title": header_title,
            "footer_left": footer_left,
            "footer_right": footer_right,
            "font_face_css": font_css,
            "labels": labels,
        }

        render_pdf(
            env,
            "worksheet.html",
            output_dir / f"{path.stem}_worksheet.pdf",
            base_url=base_url,
            **common,
            preamble=parsed.preamble,
            problem_passage=parsed.problem_passage,
            answer_explanation=parsed.answer_explanation,
            topic_gist=parsed.topic_gist,
            literal_translation=parsed.literal_translation,
        )

        render_pdf(
            env,
            "evaluation.html",
            output_dir / f"{path.stem}_evaluation.pdf",
            base_url=base_url,
            **common,
            evaluation=parsed.evaluation,
        )

        print(f"OK: {path.name} -> {path.stem}_worksheet.pdf, {path.stem}_evaluation.pdf")


if __name__ == "__main__":
    main()
