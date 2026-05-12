from __future__ import annotations

from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape


def build_font_face_css(root: Path, cfg: dict) -> str:
    fonts = cfg.get("fonts") or {}
    chunks: list[str] = []
    ko = fonts.get("korean_ttf")
    en = fonts.get("english_ttf")
    if ko:
        p = (root / ko).resolve()
        if p.is_file():
            chunks.append(
                f'@font-face {{ font-family: "XtudyKo"; src: url("{p.as_uri()}"); '
                f"font-weight: 400; font-style: normal; }}"
            )
    if en:
        p = (root / en).resolve()
        if p.is_file():
            chunks.append(
                f'@font-face {{ font-family: "XtudyEn"; src: url("{p.as_uri()}"); '
                f"font-weight: 400; font-style: normal; }}"
            )
    return "\n".join(chunks)


def make_env(templates_dir: Path) -> Environment:
    return Environment(
        loader=FileSystemLoader(str(templates_dir)),
        autoescape=select_autoescape(["html", "xml"]),
    )


def render_pdf(
    env: Environment,
    template_name: str,
    out_pdf: Path,
    *,
    base_url: str,
    **ctx: object,
) -> None:
    try:
        from weasyprint import HTML
    except OSError as exc:
        raise RuntimeError(
            "WeasyPrint needs native libraries (Pango/GTK). On Windows, install the GTK3 runtime "
            "listed in https://doc.courtbouillon.org/weasyprint/stable/first_steps.html#installation "
            f" - original error: {exc}"
        ) from exc

    html_str = env.get_template(template_name).render(**ctx)
    out_pdf.parent.mkdir(parents=True, exist_ok=True)
    HTML(string=html_str, base_url=base_url).write_pdf(out_pdf)
