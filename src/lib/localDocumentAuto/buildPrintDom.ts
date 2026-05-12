import type { ParsedManuscript } from "@/lib/localDocumentAuto/parseManuscript";
import type { LocalDocModule, LocalDocModuleField } from "@/lib/localDocumentAuto/manuscriptModules";
import { LOCAL_DOC_FIELD_LABEL, problemModulePrintTitle } from "@/lib/localDocumentAuto/manuscriptModules";
import { LOCAL_DOC_PDF_CHUNK_WIDTH_PX } from "@/lib/localDocumentAuto/renderClientPdf";

const LABELS: Record<string, string> = {
  problem_passage: "문제 · 지문",
  answer_explanation: "정답 · 해설",
  topic_gist: "주제 · 요지",
  literal_translation: "직독직해",
  evaluation: "평가문제",
};

function modulePrintTitle(field: LocalDocModuleField): string {
  return LOCAL_DOC_FIELD_LABEL[field];
}

const ROOT_W = LOCAL_DOC_PDF_CHUNK_WIDTH_PX;

function chunkBaseStyle(box: HTMLDivElement): void {
  box.style.width = `${ROOT_W}px`;
  box.style.boxSizing = "border-box";
  box.style.background = "#ffffff";
  box.style.color = "#0f172a";
  box.style.fontFamily = '"Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
  box.style.fontSize = "14.67px";
  box.style.lineHeight = "1.6";
}

function el(tag: keyof HTMLElementTagNameMap, opt: { style?: Partial<CSSStyleDeclaration>; className?: string }, children: (Node | string)[]) {
  const n = document.createElement(tag);
  if (opt.className) n.className = opt.className;
  if (opt.style) Object.assign(n.style, opt.style);
  for (const c of children) {
    if (typeof c === "string") n.appendChild(document.createTextNode(c));
    else n.appendChild(c);
  }
  return n;
}

function splitTwoColumns(text: string): [string, string] {
  const lines = text.split("\n");
  if (lines.length <= 2) {
    const mid = Math.floor(text.length / 2) || 1;
    return [text.slice(0, mid).trim(), text.slice(mid).trim() || " "];
  }
  const mid = Math.ceil(lines.length / 2);
  return [lines.slice(0, mid).join("\n").trim(), lines.slice(mid).join("\n").trim() || " "];
}

export function buildLocalDocPrintRoot(params: {
  kind: "worksheet" | "evaluation";
  headerTitle: string;
  footerLeft: string;
  footerRight: string;
  docTitle: string;
  parsed: ParsedManuscript;
}): HTMLDivElement {
  const { kind, headerTitle, footerLeft, footerRight, docTitle, parsed } = params;

  const root = document.createElement("div");
  root.style.width = `${ROOT_W}px`;
  root.style.boxSizing = "border-box";
  root.style.padding = "16px 48px 40px";
  root.style.background = "#ffffff";
  root.style.color = "#0f172a";
  root.style.fontFamily = '"Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
  root.style.fontSize = "14.67px";
  root.style.lineHeight = "1.6";

  const head = el(
    "header",
    {
      style: {
        borderBottom: "1px solid #cbd5e1",
        paddingBottom: "10px",
        marginBottom: "18px",
        textAlign: "center",
        fontWeight: "700",
        fontSize: "15px",
        color: "#1e293b",
      },
    },
    [headerTitle],
  );

  const sub = el(
    "p",
    {
      style: {
        margin: "0 0 20px",
        fontSize: "12px",
        color: "#64748b",
        textAlign: "center",
      },
    },
    [`${docTitle} · ${kind === "worksheet" ? "학습지" : "평가문제지"} · 브라우저 생성본`],
  );

  root.append(head, sub);

  const appendSection = (title: string, body: string, extraStyle?: Partial<CSSStyleDeclaration>) => {
    if (!body.trim()) return;
    const h = el("h2", { style: { fontSize: "15px", color: "#1d4ed8", margin: "22px 0 8px", fontWeight: "700" } }, [title]);
    const p = el("div", {
      style: {
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        margin: "0 0 12px",
        ...(extraStyle ?? {}),
      },
    }, [body]);
    root.append(h, p);
  };

  if (kind === "worksheet") {
    appendSection("도입 (구획 전)", parsed.preamble);
    appendSection(LABELS.problem_passage, parsed.problem_passage);
    appendSection(LABELS.answer_explanation, parsed.answer_explanation);
    appendSection(LABELS.topic_gist, parsed.topic_gist);
    appendSection(LABELS.literal_translation, parsed.literal_translation, {
      fontFamily: '"Segoe UI", "Noto Sans", sans-serif',
    });
  } else {
    const ev = parsed.evaluation.trim() || " ";
    const [left, right] = splitTwoColumns(ev);
    const row = el("div", { style: { display: "flex", gap: "14px", alignItems: "flex-start" } }, []);
    const c1 = el(
      "div",
      {
        style: {
          flex: "1 1 0",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          minWidth: "0",
        },
      },
      [left],
    );
    const c2 = el(
      "div",
      {
        style: {
          flex: "1 1 0",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          minWidth: "0",
        },
      },
      [right],
    );
    const h2 = el("h2", { style: { fontSize: "15px", color: "#1d4ed8", margin: "0 0 10px", fontWeight: "700" } }, [
      LABELS.evaluation,
    ]);
    row.append(c1, c2);
    root.append(h2, row);
  }

  const foot = el(
    "footer",
    {
      style: {
        display: "flex",
        justifyContent: "space-between",
        marginTop: "28px",
        paddingTop: "12px",
        borderTop: "1px solid #e2e8f0",
        fontSize: "11px",
        color: "#64748b",
      },
    },
    [],
  );
  foot.append(
    el("span", { style: { flex: "1 1 0", minWidth: "0" } }, [footerLeft]),
    el("span", { style: { flex: "1 1 0", minWidth: "0", textAlign: "right" } }, [footerRight]),
  );
  root.append(foot);

  return root;
}

/** 모듈 순서 그대로. PDF·프리뷰 공통 — 머릿말·모듈별 박스·꼬리말을 각각 독립 청크로 만듭니다(PDF는 청크 단위로 페이지를 나눕니다). */
export function buildLocalDocPrintChunksFromModules(params: {
  kind: "worksheet" | "evaluation";
  headerTitle: string;
  footerLeft: string;
  footerRight: string;
  docTitle: string;
  modules: LocalDocModule[];
}): HTMLDivElement[] {
  const { kind, headerTitle, footerLeft, footerRight, docTitle, modules } = params;
  const chunks: HTMLDivElement[] = [];

  const headWrap = document.createElement("div");
  chunkBaseStyle(headWrap);
  headWrap.style.padding = "16px 48px 8px";
  const head = el(
    "header",
    {
      style: {
        borderBottom: "1px solid #cbd5e1",
        paddingBottom: "10px",
        marginBottom: "12px",
        textAlign: "center",
        fontWeight: "700",
        fontSize: "15px",
        color: "#1e293b",
      },
    },
    [headerTitle],
  );
  const sub = el(
    "p",
    {
      style: {
        margin: "0 0 8px",
        fontSize: "12px",
        color: "#64748b",
        textAlign: "center",
      },
    },
    [`${docTitle} · ${kind === "worksheet" ? "학습지" : "평가문제지"} · 브라우저 생성본`],
  );
  headWrap.append(head, sub);
  chunks.push(headWrap);

  const pushModuleBox = (title: string, body: string, extraStyle?: Partial<CSSStyleDeclaration>) => {
    if (!body.trim()) return;
    const wrap = document.createElement("div");
    chunkBaseStyle(wrap);
    wrap.style.padding = "0 48px 12px";
    const box = document.createElement("div");
    box.style.border = "1px solid #cbd5e1";
    box.style.borderRadius = "12px";
    box.style.background = "#f8fafc";
    box.style.padding = "14px 16px";
    const h = el(
      "h2",
      { style: { fontSize: "15px", color: "#1d4ed8", margin: "0 0 10px", fontWeight: "700" } },
      [title],
    );
    const inner = el(
      "div",
      {
        style: {
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          background: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: "8px",
          padding: "12px 14px",
          margin: "0",
          ...(extraStyle ?? {}),
        },
      },
      [body],
    );
    box.append(h, inner);
    wrap.appendChild(box);
    chunks.push(wrap);
  };

  if (kind === "worksheet") {
    let problemOrdinal = 0;
    for (const m of modules) {
      if (m.field === "evaluation") continue;
      if (!(m.body ?? "").trim()) continue;
      let displayTitle: string;
      if (m.field === "problem") {
        problemOrdinal += 1;
        displayTitle = problemModulePrintTitle(m, problemOrdinal);
      } else {
        displayTitle = m.field === "preamble" ? "도입 (구획 전)" : modulePrintTitle(m.field);
      }
      const extra =
        m.field === "literal_translation"
          ? ({ fontFamily: '"Segoe UI", "Noto Sans", sans-serif' } satisfies Partial<CSSStyleDeclaration>)
          : undefined;
      pushModuleBox(displayTitle, m.body, extra);
    }
  } else {
    const evParts = modules.filter((m) => m.field === "evaluation").map((m) => (m.body ?? "").trim()).filter(Boolean);
    const ev = evParts.length ? evParts.join("\n\n") : " ";
    const [left, right] = splitTwoColumns(ev);
    const wrap = document.createElement("div");
    chunkBaseStyle(wrap);
    wrap.style.padding = "0 48px 12px";
    const box = document.createElement("div");
    box.style.border = "1px solid #cbd5e1";
    box.style.borderRadius = "12px";
    box.style.background = "#f8fafc";
    box.style.padding = "14px 16px";
    const h2ev = el("h2", { style: { fontSize: "15px", color: "#1d4ed8", margin: "0 0 10px", fontWeight: "700" } }, [
      LABELS.evaluation,
    ]);
    const row = el("div", { style: { display: "flex", gap: "14px", alignItems: "flex-start" } }, []);
    const c1 = el(
      "div",
      {
        style: {
          flex: "1 1 0",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          minWidth: "0",
        },
      },
      [left],
    );
    const c2 = el(
      "div",
      {
        style: {
          flex: "1 1 0",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          minWidth: "0",
        },
      },
      [right],
    );
    row.append(c1, c2);
    box.append(h2ev, row);
    wrap.appendChild(box);
    chunks.push(wrap);
  }

  const footWrap = document.createElement("div");
  chunkBaseStyle(footWrap);
  footWrap.style.padding = "12px 48px 40px";
  const foot = el(
    "footer",
    {
      style: {
        display: "flex",
        justifyContent: "space-between",
        marginTop: "8px",
        paddingTop: "12px",
        borderTop: "1px solid #e2e8f0",
        fontSize: "11px",
        color: "#64748b",
      },
    },
    [],
  );
  foot.append(
    el("span", { style: { flex: "1 1 0", minWidth: "0" } }, [footerLeft]),
    el("span", { style: { flex: "1 1 0", minWidth: "0", textAlign: "right" } }, [footerRight]),
  );
  footWrap.appendChild(foot);
  chunks.push(footWrap);

  return chunks;
}

export function buildLocalDocPrintRootFromModules(params: {
  kind: "worksheet" | "evaluation";
  headerTitle: string;
  footerLeft: string;
  footerRight: string;
  docTitle: string;
  modules: LocalDocModule[];
}): HTMLDivElement {
  const chunks = buildLocalDocPrintChunksFromModules(params);
  const root = document.createElement("div");
  root.style.width = `${ROOT_W}px`;
  root.style.boxSizing = "border-box";
  root.style.background = "#ffffff";
  root.style.margin = "0 auto";
  for (const c of chunks) {
    root.appendChild(c);
  }
  return root;
}
