"""JSON(dict 리스트) → HTML 문자열. Streamlit·CLI 공용."""
from __future__ import annotations

import argparse
import copy
import json
import re
from pathlib import Path
from typing import Any

_CIRCLES = ("①", "②", "③", "④", "⑤")


def _clean_choice_display(text: str, key: str) -> str:
    """원고에 '1. ① …'처럼 들어간 중복 번호·원문자 제거."""
    t = (text or "").strip()
    t = re.sub(r"^\s*\d+\.[\s　]*", "", t)
    try:
        ki = int(key) - 1
    except (TypeError, ValueError):
        return t
    if 0 <= ki < 5 and t.startswith(_CIRCLES[ki]):
        t = t[len(_CIRCLES[ki]) :].lstrip()
    return t


def _sanitize_units_for_template(units: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out = copy.deepcopy(units)
    for u in out:
        p1 = u.get("phase1") or {}
        ch = p1.get("choices") or {}
        if isinstance(ch, dict) and ch:
            p1["choices"] = {str(k): _clean_choice_display(str(v), str(k)) for k, v in ch.items()}
        u["phase1"] = p1
    return out

from jinja2 import Environment, FileSystemLoader, select_autoescape


def _deepcopy_units(units: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return copy.deepcopy(units)


def apply_phase_toggles(
    units: list[dict[str, Any]],
    *,
    include_phase3: bool,
    include_phase4: bool,
) -> list[dict[str, Any]]:
    out = _deepcopy_units(units)
    for u in out:
        if not include_phase3:
            u["phase3"] = None
        if not include_phase4:
            u["phase4"] = None
    return out


def render_document_html(
    units: list[dict[str, Any]],
    *,
    title: str = "지문 분류 결과",
    header_title: str = "",
    footer_left: str = "",
    footer_right: str = "",
    include_phase3: bool = True,
    include_phase4: bool = True,
    templates_dir: Path | None = None,
) -> str:
    root = Path(__file__).resolve().parent
    tpl = templates_dir or (root / "templates")
    data = apply_phase_toggles(
        units,
        include_phase3=include_phase3,
        include_phase4=include_phase4,
    )
    data = _sanitize_units_for_template(data)
    env = Environment(
        loader=FileSystemLoader(str(tpl)),
        autoescape=select_autoescape(["html", "xml"]),
    )
    return env.get_template("document.html").render(
        units=data,
        title=title,
        header_title=header_title.strip() or title,
        footer_left=footer_left.strip(),
        footer_right=footer_right.strip(),
    )


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", dest="json_path", type=Path, required=True)
    ap.add_argument("--out", dest="html_path", type=Path, required=True)
    ap.add_argument("--templates", dest="templates_dir", type=Path, default=None)
    ap.add_argument("--title", default="지문 분류 결과")
    ap.add_argument("--header-title", dest="header_title", default="")
    ap.add_argument("--footer-left", dest="footer_left", default="")
    ap.add_argument("--footer-right", dest="footer_right", default="")
    ap.add_argument("--no-phase3", action="store_true", help="출력에서 Phase3 제외")
    ap.add_argument("--no-phase4", action="store_true", help="출력에서 Phase4 제외")
    args = ap.parse_args()

    raw = json.loads(args.json_path.read_text(encoding="utf-8"))
    html = render_document_html(
        raw,
        title=args.title,
        header_title=args.header_title,
        footer_left=args.footer_left,
        footer_right=args.footer_right,
        include_phase3=not args.no_phase3,
        include_phase4=not args.no_phase4,
        templates_dir=args.templates_dir,
    )
    args.html_path.parent.mkdir(parents=True, exist_ok=True)
    args.html_path.write_text(html, encoding="utf-8")
    print(f"Wrote {args.html_path}")


if __name__ == "__main__":
    main()
