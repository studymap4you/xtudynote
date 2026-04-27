import { isElementaryWord } from "@/data/englishElementaryBlocklist";
import type { EnglishPassageAnalysis, EnglishSentenceWork, EnglishVocabPair } from "@/types/englishPassageLab";

function readOpenAiKey(): string {
  return String(import.meta.env.VITE_OPENAI_API_KEY ?? "").trim();
}

function readOpenAiModel(): string {
  const m = String(import.meta.env.VITE_OPENAI_MODEL ?? "").trim();
  return m || "gpt-4o-mini";
}

const SYSTEM = `You are an assistant for Korean middle school English teachers.
Return ONLY valid JSON (one object), no markdown.

Schema:
{
  "vocabulary": [ { "word": "English lemma or phrase", "meaning": "Korean gloss, short" } ],
  "sentences": [
    {
      "english": "sentence from passage",
      "koreanFull": "natural Korean translation of the sentence",
      "koreanWithBlanks": "same translation but replace 1-3 key meaning chunks with _____ (underscores only as blanks)",
      "blankAnswersKo": ["missing phrase 1", "missing phrase 2"],
      "compositionKorean": "One Korean prompt asking the student to express the main idea of this sentence in English (clear, classroom-safe)",
      "compositionEnglish": "model English sentence that answers compositionKorean and matches the original sentence closely"
    }
  ]
}

Rules:
- vocabulary: IMPORTANT — exclude elementary/basic English words (a, the, is, go, school, …). Include content words, phrases, and useful collocations only (max 28 items).
- sentences: one entry per sentence in the passage order; split on sentence boundaries (. ! ?). Merge very short fragments with neighbors if needed.
- koreanWithBlanks must use _____ for each blank and blankAnswersKo must match in order.
- No opinions; stick to the passage text.
`;

export async function analyzeEnglishPassage(passage: string): Promise<EnglishPassageAnalysis> {
  const apiKey = readOpenAiKey();
  if (!apiKey) {
    throw new Error(
      "OpenAI API 키가 없습니다. .env.local에 VITE_OPENAI_API_KEY를 설정한 뒤 개발 서버를 다시 실행하세요.",
    );
  }
  const trimmed = passage.trim();
  if (trimmed.length < 40) {
    throw new Error("지문을 더 길게 입력해 주세요.");
  }

  const model = readOpenAiModel();
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.25,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: `Analyze this English passage:\n\n"""${trimmed.slice(0, 12000)}"""`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `OpenAI 요청 실패 (${res.status})`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenAI 응답에 본문이 없습니다.");

  let parsed: unknown;
  try {
    parsed = JSON.parse(content) as unknown;
  } catch {
    throw new Error("AI 응답 JSON 파싱에 실패했습니다.");
  }

  return normalizeAnalysis(parsed);
}

function normalizeAnalysis(raw: unknown): EnglishPassageAnalysis {
  const o = raw as Record<string, unknown>;
  const vocabIn = Array.isArray(o.vocabulary) ? o.vocabulary : [];
  const sentIn = Array.isArray(o.sentences) ? o.sentences : [];

  const seen = new Set<string>();
  const vocabulary: EnglishVocabPair[] = [];
  for (const row of vocabIn) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const word = String(r.word ?? "").trim();
    const meaning = String(r.meaning ?? "").trim();
    if (!word || !meaning) continue;
    const key = word.toLowerCase();
    if (seen.has(key)) continue;
    const tokens = word.split(/\s+/).filter(Boolean);
    if (tokens.length > 0 && tokens.every((t) => isElementaryWord(t))) continue;
    seen.add(key);
    vocabulary.push({
      id: crypto.randomUUID(),
      word,
      meaning,
    });
  }

  const sentences: EnglishSentenceWork[] = [];
  for (const row of sentIn) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const english = String(r.english ?? "").trim();
    const koreanFull = String(r.koreanFull ?? "").trim();
    const koreanWithBlanks = String(r.koreanWithBlanks ?? "").trim();
    const compositionKorean = String(r.compositionKorean ?? "").trim();
    const compositionEnglish = String(r.compositionEnglish ?? "").trim();
    const blankRaw = Array.isArray(r.blankAnswersKo) ? r.blankAnswersKo : [];
    const blankAnswersKo = blankRaw.map((x) => String(x ?? "").trim()).filter(Boolean);
    if (!english || !koreanFull) continue;
    sentences.push({
      id: crypto.randomUUID(),
      english,
      koreanFull,
      koreanWithBlanks: koreanWithBlanks || koreanFull,
      blankAnswersKo,
      compositionKorean: compositionKorean || koreanFull,
      compositionEnglish: compositionEnglish || english,
    });
  }

  return { vocabulary, sentences };
}
