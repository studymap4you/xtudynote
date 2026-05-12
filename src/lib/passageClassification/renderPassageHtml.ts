/**
 * templates/document.html 과 동일 구조의 정적 HTML (브라우저 생성).
 */

import type { PassageUnit } from "./processor";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const CIRCLES = ["①", "②", "③", "④", "⑤"];

export function renderPassageDocumentHtml(
  units: PassageUnit[],
  opts: {
    title: string;
    headerTitle: string;
    footerLeft: string;
    footerRight: string;
  },
): string {
  const { title, headerTitle, footerLeft, footerRight } = opts;
  const unitsHtml = units
    .map((u) => {
      const choiceKeys = Object.keys(u.phase1.choices).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
      const choicesHtml =
        choiceKeys.length > 0
          ? `<ol class="choices">${choiceKeys
              .map((k) => {
                const ci = parseInt(k, 10) - 1;
                const mark = CIRCLES[ci] ?? k;
                return `<li>${esc(mark)} ${esc(u.phase1.choices[k] ?? "")}</li>`;
              })
              .join("")}</ol>`
          : "";

      const p2 =
        u.phase2 != null
          ? `<section class="block"><h3>Phase 2 · 정답 및 해설</h3><p><strong>정답:</strong> ${u.phase2.answer}번</p><div class="passage">${esc(u.phase2.explanation)}</div></section>`
          : "";

      let p3 = "";
      if (u.phase3) {
        const rows: string[] = [];
        if (u.phase3.topic) rows.push(`<dt>주제</dt><dd>${esc(u.phase3.topic)}</dd>`);
        if (u.phase3.gist) rows.push(`<dt>요지</dt><dd>${esc(u.phase3.gist)}</dd>`);
        if (u.phase3.key_sentence)
          rows.push(`<dt>핵심 주제문</dt><dd>${esc(u.phase3.key_sentence)}</dd>`);
        if (u.phase3.literal) rows.push(`<dt>직독직해</dt><dd>${esc(u.phase3.literal)}</dd>`);
        if (rows.length)
          p3 = `<section class="block"><h3>Phase 3 · 심층 분석</h3><dl class="phase3-grid">${rows.join("")}</dl></section>`;
      }

      const p4 =
        u.phase4 != null && u.phase4.body.trim()
          ? `<section class="block"><h3>Phase 4 · 확인 문제</h3><div class="review-two-col">${esc(u.phase4.body)}</div></section>`
          : "";

      return `<article class="unit"><h2>지문 세트 · 문제 ${u.number}</h2>
<section class="block"><h3>Phase 1 · 문제 및 지문</h3>
${u.phase1.stem ? `<div class="stem">${esc(u.phase1.stem)}</div>` : ""}
${u.phase1.passage ? `<div class="passage">${esc(u.phase1.passage)}</div>` : ""}
${choicesHtml}
</section>
${p2}${p3}${p4}
</article>`;
    })
    .join("\n");

  const head = headerTitle.trim()
    ? `<header class="running-head">${esc(headerTitle)}</header>`
    : "";
  const foot =
    footerLeft.trim() || footerRight.trim()
      ? `<footer class="running-foot"><span>${esc(footerLeft)}</span><span>${esc(footerRight)}</span></footer>`
      : "";

  return `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>${esc(title)}</title>
<style>
:root{font-family:Malgun Gothic,Apple SD Gothic Neo,sans-serif;color:#0f172a;}
body{max-width:900px;margin:2rem auto;padding:0 1rem;line-height:1.6;font-size:11pt;}
h1{font-size:1.35rem;border-bottom:2px solid #2563eb;padding-bottom:0.5rem;}
.unit{margin:2.5rem 0;padding:1.25rem;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc;}
.unit h2{margin-top:0;font-size:1.1rem;color:#1d4ed8;}
section.block{margin:1.25rem 0;padding:1rem;background:#fff;border-radius:8px;border:1px solid #e2e8f0;}
section.block h3{margin-top:0;font-size:0.95rem;color:#334155;}
.stem{font-weight:700;margin-bottom:0.5rem;white-space:pre-wrap;}
.passage{white-space:pre-wrap;margin:0.5rem 0;}
ol.choices{margin:0.5rem 0 0 1.2rem;padding:0;}
ol.choices li{margin:0.25rem 0;white-space:pre-wrap;}
.phase3-grid{display:grid;gap:0.75rem;}
.phase3-grid dt{font-weight:700;color:#475569;font-size:0.85rem;}
.phase3-grid dd{margin:0 0 0.5rem 0;white-space:pre-wrap;}
.review-two-col{column-count:2;column-gap:1.5rem;white-space:pre-wrap;}
.running-head{text-align:center;font-weight:700;font-size:1rem;padding-bottom:0.5rem;margin-bottom:1rem;border-bottom:2px solid #cbd5e1;color:#1e293b;}
.doc-title-row{margin-bottom:0.25rem;}
.running-foot{display:flex;justify-content:space-between;margin-top:3rem;padding-top:1rem;border-top:1px solid #e2e8f0;font-size:0.85rem;color:#64748b;}
.meta{font-size:0.8rem;color:#64748b;margin-bottom:2rem;}
</style></head><body>
${head}
<div class="doc-title-row"><h1>${esc(title)}</h1></div>
<p class="meta">Phase3·4는 데이터가 있고 스위치가 켜져 있을 때만 표시됩니다.</p>
${unitsHtml}
${foot}
</body></html>`;
}
