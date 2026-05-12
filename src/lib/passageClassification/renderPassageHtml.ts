/**
 * 시험지·학습지형 정형 라벨 ([문제 N], [정답], [지문해설]).
 * templates/document.html 과 동일 구조.
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

function answerMark(answer: number): string {
  const i = answer - 1;
  if (i >= 0 && i < CIRCLES.length) return CIRCLES[i]!;
  return `${answer}번`;
}

/** 본문에 남은 `[문제 n]` 줄은 다음 문항으로 빠져야 하나 원고 오류 시 해설 끝에 붙는 경우 제거 */
function stripTrailingProblemHeaderLines(text: string): string {
  const lines = text.split("\n");
  const cut = lines.findIndex((l) => /^\s*\[\s*문제\s*\d+\s*\]\s*$/i.test(l));
  if (cut >= 0) return lines.slice(0, cut).join("\n").trim();
  return text.trim();
}

/** h2에 이미 [문제 N]을 쓰므로 표제 줄 앞의 동일 패턴은 한 번만 노출 */
function stripRedundantStemProblemTag(stem: string): string {
  return stem.replace(/^\s*\[\s*문제\s*\d+\s*\]\s*/i, "").trim();
}

/** 원고에 `1. ① …`처럼 들어간 표기 제거 — 렌더에서 ①은 한 번만 씀 */
function cleanChoiceText(raw: string, key: string): string {
  let t = (raw ?? "").trim().replace(/^\s*\d+\.[\s\u3000]*/, "");
  const ki = parseInt(key, 10) - 1;
  if (ki >= 0 && ki < CIRCLES.length && t.startsWith(CIRCLES[ki]!)) {
    t = t.slice(CIRCLES[ki]!.length).trimStart();
  }
  return t;
}

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
          ? `<ul class="choices">${choiceKeys
              .map((k) => {
                const ci = parseInt(k, 10) - 1;
                const mark = CIRCLES[ci] ?? k;
                return `<li><span class="choice-mark">${esc(mark)}</span> <span class="choice-text">${esc(cleanChoiceText(u.phase1.choices[k] ?? "", k))}</span></li>`;
              })
              .join("")}</ul>`
          : "";

      const p2clean =
        u.phase2 != null
          ? `<section class="block answer-section">
  <div class="formal-section">
    <div class="formal-heading">[정답]</div>
    <div class="formal-body answer-body">${esc(answerMark(u.phase2.answer))}</div>
  </div>${
    (u.phase2.explanation ?? "").trim()
      ? `
  <div class="formal-section">
    <div class="formal-heading">[지문해설]</div>
    <div class="formal-body explanation-body">${esc(stripTrailingProblemHeaderLines(u.phase2.explanation))}</div>
  </div>`
      : ""
  }
</section>`
          : "";

      let p3 = "";
      if (u.phase3) {
        const parts: string[] = [];
        if (u.phase3.topic) {
          parts.push(`<div class="formal-section"><div class="formal-heading">[주제]</div><div class="formal-body">${esc(u.phase3.topic)}</div></div>`);
        }
        if (u.phase3.gist) {
          parts.push(`<div class="formal-section"><div class="formal-heading">[요지]</div><div class="formal-body">${esc(u.phase3.gist)}</div></div>`);
        }
        if (u.phase3.key_sentence) {
          parts.push(
            `<div class="formal-section"><div class="formal-heading">[주제문]</div><div class="formal-body">${esc(u.phase3.key_sentence)}</div></div>`,
          );
        }
        if (u.phase3.literal) {
          parts.push(
            `<div class="formal-section"><div class="formal-heading">[직독직해]</div><div class="formal-body">${esc(u.phase3.literal)}</div></div>`,
          );
        }
        if (parts.length) p3 = `<section class="block deep-section">${parts.join("")}</section>`;
      }

      const p4 =
        u.phase4 != null && u.phase4.body.trim()
          ? `<section class="block"><div class="formal-heading">[확인문제]</div><div class="review-two-col formal-body">${esc(u.phase4.body)}</div></section>`
          : "";

      return `<article class="unit">
<h2 class="problem-no">[문제 ${u.number}]</h2>
<section class="block stem-section">
${u.phase1.stem ? `<div class="stem">${esc(stripRedundantStemProblemTag(u.phase1.stem))}</div>` : ""}
${u.phase1.passage ? `<div class="passage">${esc(u.phase1.passage)}</div>` : ""}
${choicesHtml}
</section>
${p2clean}${p3}${p4}
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
.unit+.unit{margin-top:3rem;padding-top:2rem;border-top:2px solid #cbd5e1;}
.problem-no{margin-top:0;margin-bottom:1rem;font-size:1.05rem;font-weight:800;color:#0f172a;letter-spacing:0.02em;}
section.block{margin:1.25rem 0;padding:1rem;background:#fff;border-radius:8px;border:1px solid #e2e8f0;}
.stem{font-weight:700;margin-bottom:0.5rem;white-space:pre-wrap;}
.passage{white-space:pre-wrap;margin:0.5rem 0;}
ul.choices{list-style:none;margin:0.75rem 0 0;padding:0;}
ul.choices li{margin:0.35rem 0;white-space:pre-wrap;padding-left:0;display:flex;align-items:baseline;gap:0.35rem;text-indent:0;}
.choice-mark{flex-shrink:0;font-weight:700;}
.choice-text{flex:1;min-width:0;}
.formal-heading{font-weight:800;font-size:0.95rem;color:#1e293b;margin:0 0 0.4rem;}
.formal-section{margin-top:1rem;}
.formal-section:first-child{margin-top:0;}
.formal-body{white-space:pre-wrap;line-height:1.65;}
.answer-body{font-size:1.05rem;font-weight:700;color:#1d4ed8;}
.answer-section{margin-bottom:0.25rem;}
.answer-section .formal-section + .formal-section{margin-top:1.15rem;}
.deep-section .formal-section + .formal-section{margin-top:1rem;}
.review-two-col{column-count:2;column-gap:1.5rem;white-space:pre-wrap;}
.running-head{text-align:center;font-weight:700;font-size:1rem;padding-bottom:0.5rem;margin-bottom:1rem;border-bottom:2px solid #cbd5e1;color:#1e293b;}
.doc-title-row{margin-bottom:0.25rem;}
.running-foot{display:flex;justify-content:space-between;margin-top:3rem;padding-top:1rem;border-top:1px solid #e2e8f0;font-size:0.85rem;color:#64748b;}
.meta{font-size:0.8rem;color:#64748b;margin-bottom:2rem;}
</style></head><body>
${head}
<div class="doc-title-row"><h1>${esc(title)}</h1></div>
<p class="meta">모듈 출력 설정에 따라 [주제]·[확인문제] 등 추가 블록이 이어질 수 있습니다.</p>
${unitsHtml}
${foot}
</body></html>`;
}
