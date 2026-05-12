"""JSON(지문 세트) → HTML. 값이 없는 Phase 섹션은 출력하지 않음."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", dest="json_path", type=Path, required=True)
    ap.add_argument("--out", dest="html_path", type=Path, required=True)
    ap.add_argument(
        "--templates",
        dest="templates_dir",
        type=Path,
        default=None,
        help="템플릿 폴더(기본: 이 파일과 같은 디렉터리의 templates/)",
    )
    args = ap.parse_args()

    root = Path(__file__).resolve().parent
    tpl = args.templates_dir or (root / "templates")
    data = json.loads(args.json_path.read_text(encoding="utf-8"))

    env = Environment(
        loader=FileSystemLoader(str(tpl)),
        autoescape=select_autoescape(["html", "xml"]),
    )
    html = env.get_template("document.html").render(units=data, title="지문 분류 결과")

    args.html_path.parent.mkdir(parents=True, exist_ok=True)
    args.html_path.write_text(html, encoding="utf-8")
    print(f"Wrote {args.html_path}")


if __name__ == "__main__":
    main()
