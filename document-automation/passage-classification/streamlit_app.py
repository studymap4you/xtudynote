"""
로컬 Streamlit 대시보드 — 지문 분류 모듈형 워크플로우.
실행: cd document-automation/passage-classification && streamlit run streamlit_app.py
"""
from __future__ import annotations

import json
from typing import Any

import streamlit as st
import streamlit.components.v1 as components

from processor import merge_units, parse_document, unit_to_dict, units_from_dicts
from renderer import render_document_html

st.set_page_config(page_title="Xtudy · 지문 분류 작업실", layout="wide")

INIT: dict[str, Any] = {
    "step": 1,
    "units": None,
    "base_text": "",
    "doc_title": "지문 분류 결과",
    "header_title": "Xtudy · 교재",
    "footer_left": "Xtudy-Universe",
    "footer_right": "내부용",
    "include_p3": True,
    "include_p4": True,
}
for _k, _v in INIT.items():
    if _k not in st.session_state:
        st.session_state[_k] = _v


def step_bar(current: int) -> None:
    labels = ["원고 업로드", "모듈 구성", "디자인 프리뷰", "생성"]
    c = st.columns(4)
    for i, col in enumerate(c, start=1):
        done = i < current
        here = i == current
        mark = "✓ " if done else ("▶ " if here else "· ")
        lab = f"**{i}.** {labels[i - 1]}"
        with col:
            st.markdown(f"{mark}{lab}")


def count_phase_stats(units: list[dict[str, Any]]) -> tuple[int, int, int, int]:
    n = len(units)
    p2 = sum(1 for u in units if u.get("phase2"))
    p3 = sum(1 for u in units if u.get("phase3"))
    p4 = sum(1 for u in units if u.get("phase4"))
    return n, p2, p3, p4


def apply_merge_text(base_units: list[dict[str, Any]], patch: str) -> list[dict[str, Any]]:
    objs = units_from_dicts(base_units)
    merged = merge_units(objs, patch)
    return [unit_to_dict(u) for u in merged]


st.title("지문 분류 · 모듈형 작업실")
st.caption("비정형 .txt → 구조화 → HTML. 외부 API 없이 로컬에서만 동작합니다.")

step_bar(int(st.session_state.step))

if st.session_state.units is None:
    st.info("**1단계**부터 원고(.txt)를 올려 주세요.")

# --- Step 1 ---
if st.session_state.step == 1:
    st.subheader("1. 원고 업로드")
    up = st.file_uploader("여기에 원고를 끌어다 놓으세요.", type=["txt"], key="drag_txt")
    if up is not None:
        raw = up.read().decode("utf-8", errors="replace")
        st.session_state.base_text = raw
        units = [unit_to_dict(u) for u in parse_document(raw)]
        st.session_state.units = units
        n, c2, c3, c4 = count_phase_stats(units)
        st.success(
            f"**문제(지문 세트) {n}개**가 감지되었습니다. "
            f"정답·해설(Phase2) **{c2}개**, 심층 분석(Phase3) 데이터 **{c3}개**, 확인 문제(Phase4) **{c4}개**."
        )
        st.markdown("##### 실시간 감지 · 모듈 카드")
        pc = st.columns(4)
        card_meta = [
            ("Phase 1 · 문제지", f"{n}세트", "번호·①~⑤"),
            ("Phase 2 · 해설", f"{c2}/{n}", "[정답 및 해설]"),
            ("Phase 3 · 분석", f"{c3}/{n}", "[주제]·[요지]…"),
            ("Phase 4 · 확인", f"{c4}/{n}", "[확인문제]·[Review]"),
        ]
        for col, (title, val, hint) in zip(pc, card_meta):
            with col:
                st.metric(title, val, help=hint)
        st.markdown("---")
        st.markdown(
            "**중간 확인** — 최종 HTML에 어떤 모듈을 넣을지 선택하세요. "
            "(데이터가 없는 항목은 토글이 비활성화됩니다.)"
        )
        want_p3 = st.radio(
            "주제·요지·주제문·직독직해(Phase3)를 교재에 포함할까요?",
            options=["예, 포함합니다", "아니요, 문제·해설만"],
            horizontal=True,
            key="radio_p3",
        )
        want_p4 = st.radio(
            "확인 문제 / Review(Phase4, 2단)를 포함할까요?",
            options=["예, 포함합니다", "아니요"],
            horizontal=True,
            key="radio_p4",
        )
        st.session_state.include_p3 = want_p3.startswith("예") and c3 > 0
        st.session_state.include_p4 = want_p4.startswith("예") and c4 > 0
        if c3 == 0 and want_p3.startswith("예"):
            st.warning(
                "현재 원고에서 Phase3 앵커(`[주제]` 등)가 감지되지 않았습니다. "
                "나중에 **병합 .txt**로 추가할 수 있습니다."
            )
        if c4 == 0 and want_p4.startswith("예"):
            st.warning("Phase4(`[확인문제]` 또는 `[Review]`)가 없습니다. 병합으로 추가하거나 원고를 수정하세요.")

        if st.button("다음: 모듈 구성", type="primary"):
            st.session_state.step = 2
            st.rerun()

# --- Step 2+ need units ---
if st.session_state.units is not None and st.session_state.step >= 2:
    units = st.session_state.units
    n, c2, c3, c4 = count_phase_stats(units)

    if st.session_state.step == 2:
        st.subheader("2. 모듈 구성")
        left, right = st.columns((3, 2))
        with left:
            st.markdown("##### 감지된 섹션")
            c1, c2b, c3b, c4b = st.columns(4)
            with c1:
                st.metric("Phase 1 · 문제지", f"{n}세트")
            with c2b:
                st.metric("Phase 2 · 해설", f"{c2}/{n}")
            with c3b:
                st.metric("Phase 3 · 분석", f"{c3}/{n}")
            with c4b:
                st.metric("Phase 4 · 확인", f"{c4}/{n}")

            st.markdown("##### 파싱 요약 표")
            st.dataframe(
                [
                    {
                        "번호": u["number"],
                        "문항 요약": (str(u["phase1"].get("stem", ""))[:100] + "…")
                        if len(str(u["phase1"].get("stem", ""))) > 100
                        else u["phase1"].get("stem", ""),
                        "해설": "✓" if u.get("phase2") else "—",
                        "분석": "✓" if u.get("phase3") else "—",
                        "확인": "✓" if u.get("phase4") else "—",
                    }
                    for u in units
                ],
                use_container_width=True,
                hide_index=True,
            )

            for u in units:
                with st.expander(f"문제 {u['number']} · 카드", expanded=False):
                    stem = u["phase1"].get("stem", "")
                    short = (stem[:120] + "…") if len(str(stem)) > 120 else stem
                    st.write("**Phase 1**", short)
                    st.caption(f"선택지 {len(u['phase1'].get('choices') or {})}개")
                    st.write("· Phase2", "있음" if u.get("phase2") else "— 없음 —")
                    st.write("· Phase3", "있음" if u.get("phase3") else "— 없음 —")
                    st.write("· Phase4", "있음" if u.get("phase4") else "— 없음 —")

            st.markdown("##### 출력 스위치")
            p3_has = c3 > 0
            p4_has = c4 > 0
            tg1, tg2 = st.columns(2)
            with tg1:
                en3 = st.toggle(
                    "Phase 3 (심층 분석) HTML에 포함",
                    value=bool(st.session_state.include_p3 and p3_has),
                    disabled=not p3_has,
                    key="tog_p3",
                )
                if not p3_has:
                    st.caption("데이터 없음 — `[주제]` 등 앵커가 있는 병합 텍스트를 적용하세요.")
                st.session_state.include_p3 = en3 and p3_has
            with tg2:
                en4 = st.toggle(
                    "Phase 4 (확인문제·2단) HTML에 포함",
                    value=bool(st.session_state.include_p4 and p4_has),
                    disabled=not p4_has,
                    key="tog_p4",
                )
                if not p4_has:
                    st.caption("데이터 없음 — `[확인문제]` / `[Review]` 병합을 사용하세요.")
                st.session_state.include_p4 = en4 and p4_has

            st.markdown("##### 병합(Merge)")
            mfile = st.file_uploader("추가 .txt (`[문제 N]` 블록)", type=["txt"], key="merge_u")
            if mfile and st.button("병합 적용", key="btn_merge"):
                patch = mfile.read().decode("utf-8", errors="replace")
                st.session_state.units = apply_merge_text(st.session_state.units, patch)
                st.success("병합을 반영했습니다. 위 지표를 다시 확인하세요.")
                st.rerun()

        with right:
            st.markdown("##### 머릿말 · 꼬리말 (즉시 반영)")
            st.session_state.doc_title = st.text_input("문서 제목 (h1)", value=st.session_state.doc_title)
            st.session_state.header_title = st.text_input("머릿말 (상단 강조)", value=st.session_state.header_title)
            st.session_state.footer_left = st.text_input("꼬리말 왼쪽", value=st.session_state.footer_left)
            st.session_state.footer_right = st.text_input("꼬리말 오른쪽", value=st.session_state.footer_right)
            st.markdown(
                f"<div style='padding:12px;border:1px solid #2563eb;border-radius:8px;background:#eff6ff'>"
                f"<strong>{st.session_state.header_title}</strong><br/><span style='color:#64748b;font-size:0.85rem'>"
                f"{st.session_state.footer_left} · {st.session_state.footer_right}</span></div>",
                unsafe_allow_html=True,
            )

        b1, b2, _ = st.columns([1, 1, 4])
        with b1:
            if st.button("← 이전"):
                st.session_state.step = 1
                st.rerun()
        with b2:
            if st.button("다음: 프리뷰 →", type="primary"):
                st.session_state.step = 3
                st.rerun()

    if st.session_state.step == 3:
        st.subheader("3. 디자인 프리뷰")
        preview = render_document_html(
            units,
            title=st.session_state.doc_title,
            header_title=st.session_state.header_title,
            footer_left=st.session_state.footer_left,
            footer_right=st.session_state.footer_right,
            include_phase3=st.session_state.include_p3,
            include_phase4=st.session_state.include_p4,
        )
        h_preview = min(720, 400 + n * 40)
        components.html(preview, height=h_preview, scrolling=True)

        st.markdown("##### Phase 4 · 2단 미니 미리보기")
        sample_p4 = next((u.get("phase4", {}) or {}).get("body", "") for u in units if u.get("phase4"))
        if sample_p4:
            safe = (
                sample_p4.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            )
            mini = (
                "<div style='column-count:2;column-gap:24px;border:1px dashed #94a3b8;padding:12px;"
                "font-family:Malgun Gothic,sans-serif;font-size:13px;line-height:1.5;white-space:pre-wrap'>"
                + safe
                + "</div>"
            )
            components.html(mini, height=220, scrolling=True)
        else:
            st.info("확인 문제(Phase4) 본문이 없어 2단 미리보기를 건너뜁니다.")

        b1, b2, _ = st.columns([1, 1, 4])
        with b1:
            if st.button("← 모듈 구성", key="b_back2"):
                st.session_state.step = 2
                st.rerun()
        with b2:
            if st.button("다음: 생성", type="primary", key="b_next4"):
                st.session_state.step = 4
                st.rerun()

    if st.session_state.step == 4:
        st.subheader("4. 생성 · 내보내기")
        st.markdown("**교재 상단·하단에 들어갈 문구**를 여기서 다시 확인·수정한 뒤, 아래 **교재 HTML**을 내려받으면 됩니다.")
        cti, chi, cf1, cf2 = st.columns(2)
        with cti:
            st.session_state.doc_title = st.text_input("문서 제목 (h1)", value=st.session_state.doc_title, key="final_title")
        with chi:
            st.session_state.header_title = st.text_input("머릿말 (상단 강조)", value=st.session_state.header_title, key="final_head")
        with cf1:
            st.session_state.footer_left = st.text_input("꼬리말 왼쪽", value=st.session_state.footer_left, key="final_fl")
        with cf2:
            st.session_state.footer_right = st.text_input("꼬리말 오른쪽", value=st.session_state.footer_right, key="final_fr")

        final_html = render_document_html(
            units,
            title=st.session_state.doc_title,
            header_title=st.session_state.header_title,
            footer_left=st.session_state.footer_left,
            footer_right=st.session_state.footer_right,
            include_phase3=st.session_state.include_p3,
            include_phase4=st.session_state.include_p4,
        )
        json_bytes = json.dumps(units, ensure_ascii=False, indent=2).encode("utf-8")
        cj, ch, _ = st.columns([1, 1, 3])
        with cj:
            st.download_button("units.json 내려받기", json_bytes, file_name="units.json", mime="application/json")
        with ch:
            st.download_button(
                "교재 생성 — report.html 내려받기",
                final_html.encode("utf-8"),
                file_name="report.html",
                mime="text/html",
                type="primary",
            )

        st.markdown("##### 터미널과 동일한 배치 (참고)")
        st.code(
            "python processor.py --in 원고.txt --json out/units.json\n"
            "python renderer.py --json out/units.json --out out/report.html "
            f'--title "{st.session_state.doc_title}" '
            f'--header-title "{st.session_state.header_title}" '
            f'--footer-left "{st.session_state.footer_left}" '
            f'--footer-right "{st.session_state.footer_right}"'
            + (" --no-phase3" if not st.session_state.include_p3 else "")
            + (" --no-phase4" if not st.session_state.include_p4 else ""),
            language="bash",
        )
        if st.button("← 프리뷰로", key="b_back4"):
            st.session_state.step = 3
            st.rerun()

with st.sidebar:
    st.markdown("### 작업 초기화")
    if st.button("전체 초기화"):
        for _k, _v in INIT.items():
            st.session_state[_k] = _v
        st.session_state.units = None
        st.rerun()
    st.markdown("---")
    st.markdown("빠른 단계 이동")
    ns = st.number_input("단계", min_value=1, max_value=4, value=int(st.session_state.step), step=1)
    if st.button("이동") and st.session_state.units is not None:
        st.session_state.step = int(ns)
        st.rerun()
