import { createHash } from "node:crypto";

export const WORDNET_SCHEMA_VERSION = "open-english-wordnet-api-v1";
export const WORDNET_SOURCE_LABEL = "Open English WordNet";
export const WORDNET_LICENSE = "CC BY 4.0";
export const DEFAULT_WORDNET_BASE_URL = "https://en-word.net/api";

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1_000;
const DEFAULT_LIMIT = 18;
const STOP_WORDS = new Set([
  "about", "after", "again", "against", "also", "among", "another", "because", "before", "being",
  "between", "both", "could", "does", "doing", "during", "each", "english", "every", "from", "further",
  "have", "having", "into", "itself", "lesson", "more", "most", "other", "ourselves", "should", "student",
  "students", "such", "than", "that", "their", "theirs", "them", "themselves", "then", "there", "these",
  "they", "this", "those", "through", "under", "unit", "using", "very", "vocabulary", "were", "what",
  "when", "where", "which", "while", "with", "would", "your", "yours", "textbook", "workbook", "csat",
  "academy", "create", "make", "page", "pages", "question", "questions", "example", "examples", "explain",
  "explanation", "concept", "concepts", "study", "learning", "level", "school", "high", "middle", "teacher",
  "course", "material", "materials", "content", "reading", "grammar", "word", "words", "test", "tests",
  "answer", "answers", "problem", "problems", "book", "books", "actual", "based", "include", "including",
  "shall", "will", "must", "some", "only", "same", "well", "much", "many", "over", "even", "still",
  "just", "like", "used", "use", "uses", "been", "being", "were", "was", "are", "isn", "aren", "don",
]);

function text(value, maxLength = 1_000) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function stringArray(value, maxItems = 12, maxLength = 240) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => text(item, maxLength)).filter(Boolean).slice(0, maxItems);
}

function normalizedWord(value) {
  return text(value, 80)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/'s$/, "")
    .replace(/^[^a-z]+|[^a-z-]+$/g, "")
    .trim();
}

function candidateForms(value) {
  const word = normalizedWord(value);
  if (!word) return [];
  const forms = [word];
  const add = (form) => {
    const normalized = normalizedWord(form);
    if (normalized.length >= 3 && !forms.includes(normalized)) forms.push(normalized);
  };
  if (word.endsWith("ies") && word.length > 4) add(`${word.slice(0, -3)}y`);
  if (word.endsWith("ing") && word.length > 5) {
    const stem = word.slice(0, -3);
    add(`${stem}e`);
    add(stem);
    if (/(.)\1$/.test(stem)) add(stem.slice(0, -1));
  }
  if (word.endsWith("ed") && word.length > 4) {
    const stem = word.slice(0, -2);
    add(`${stem}e`);
    add(stem);
    if (/(.)\1$/.test(stem)) add(stem.slice(0, -1));
  }
  if (word.endsWith("es") && word.length > 4) {
    add(word.slice(0, -2));
    add(word.slice(0, -1));
  } else if (word.endsWith("s") && word.length > 3) {
    add(word.slice(0, -1));
  }
  return forms.slice(0, 5);
}

export function extractWordNetCandidates(source, limit = DEFAULT_LIMIT) {
  const input = text(source, 80_000);
  if (!input) return [];
  const ranked = new Map();
  const lines = input.split(/\r?\n/);
  let order = 0;
  for (const line of lines) {
    const tokens = line.match(/[A-Za-z][A-Za-z'-]{1,48}/g) || [];
    const looksLikeWordList = tokens.length > 0 && tokens.length <= 4 && line.length <= 120;
    for (const token of tokens) {
      const lemma = normalizedWord(token);
      if (lemma.length < 3 || STOP_WORDS.has(lemma) || /^\d/.test(lemma)) continue;
      const current = ranked.get(lemma) || { lemma, count: 0, listBonus: 0, order: order++ };
      current.count += 1;
      if (looksLikeWordList) current.listBonus += 4;
      ranked.set(lemma, current);
    }
  }
  return [...ranked.values()]
    .sort((left, right) => (right.count + right.listBonus) - (left.count + left.listBonus) || left.order - right.order)
    .slice(0, Math.max(1, Math.min(Number(limit) || DEFAULT_LIMIT, 30)))
    .map((item) => item.lemma);
}

function exampleText(value) {
  if (typeof value === "string") return text(value, 400);
  return text(value?.text, 400);
}

export function normalizeWordNetPayload(payload, requestedTerm, resolvedLemma = requestedTerm) {
  const rows = Array.isArray(payload) ? payload : [];
  const synsets = rows
    .map((row) => {
      const id = text(row?.id, 40);
      const partOfSpeech = text(row?.partOfSpeech, 4).toLowerCase();
      const definitions = stringArray(row?.definition, 2, 500);
      const members = Array.isArray(row?.members)
        ? row.members.map((member) => text(member?.lemma, 100).replaceAll("_", " ")).filter(Boolean).slice(0, 10)
        : [];
      const antonyms = Array.isArray(row?.antonym)
        ? row.antonym.map((relation) => text(relation?.target_lemma, 100).replaceAll("_", " ")).filter(Boolean).slice(0, 8)
        : [];
      const derivatives = Array.isArray(row?.derivation)
        ? row.derivation.map((relation) => text(relation?.target_lemma, 100).replaceAll("_", " ")).filter(Boolean).slice(0, 8)
        : [];
      const examples = Array.isArray(row?.example) ? row.example.map(exampleText).filter(Boolean).slice(0, 3) : [];
      if (!id || !partOfSpeech || definitions.length === 0) return null;
      return {
        id,
        partOfSpeech,
        lexname: text(row?.lexname, 80),
        definitions,
        members: [...new Set(members)],
        antonyms: [...new Set(antonyms)],
        derivatives: [...new Set(derivatives)],
        examples,
      };
    })
    .filter(Boolean)
    .slice(0, 5);
  return {
    requestedTerm: normalizedWord(requestedTerm),
    resolvedLemma: normalizedWord(resolvedLemma),
    synsets,
    source: WORDNET_SOURCE_LABEL,
    sourceUrl: `https://en-word.net/view/lemma/${encodeURIComponent(normalizedWord(resolvedLemma))}`,
    license: WORDNET_LICENSE,
    schemaVersion: WORDNET_SCHEMA_VERSION,
  };
}

export async function fetchWordNetEntry(term, {
  baseUrl = DEFAULT_WORDNET_BASE_URL,
  fetchImpl = fetch,
  timeoutMs = 7_000,
} = {}) {
  const forms = candidateForms(term);
  for (const form of forms) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${String(baseUrl).replace(/\/$/, "")}/lemma/${encodeURIComponent(form)}`, {
        headers: { Accept: "application/json", "User-Agent": "Xtudy-Universe/1.0" },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`wordnet-request-failed:${response.status}`);
      const entry = normalizeWordNetPayload(await response.json(), term, form);
      if (entry.synsets.length > 0) return entry;
    } finally {
      clearTimeout(timer);
    }
  }
  return normalizeWordNetPayload([], term, forms[0] || term);
}

export function wordNetCacheDocumentId(term) {
  return createHash("sha256").update(normalizedWord(term)).digest("hex").slice(0, 40);
}

function timestampMillis(value) {
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value?.toDate === "function") return value.toDate().getTime();
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return results;
}

export async function loadWordNetEntriesWithCache({
  firestore,
  source,
  limit = DEFAULT_LIMIT,
  baseUrl = DEFAULT_WORDNET_BASE_URL,
  fetchImpl = fetch,
  now = new Date(),
  onWarning = () => {},
}) {
  const candidates = extractWordNetCandidates(source, limit);
  if (!firestore || candidates.length === 0) {
    return { entries: [], candidateCount: candidates.length, cacheHitCount: 0, fetchedCount: 0 };
  }
  const refs = candidates.map((term) => firestore.doc(`wordnet_lexicon/${wordNetCacheDocumentId(term)}`));
  let snapshots = [];
  try {
    snapshots = await firestore.getAll(...refs);
  } catch (error) {
    onWarning(error);
  }
  const nowMs = now.getTime();
  const entriesByTerm = new Map();
  const staleByTerm = new Map();
  const missingTerms = [];
  let cacheHitCount = 0;
  candidates.forEach((term, index) => {
    const data = snapshots[index]?.exists ? snapshots[index].data() : null;
    const cachedEntry = data?.entry && data?.schemaVersion === WORDNET_SCHEMA_VERSION ? data.entry : null;
    if (cachedEntry) staleByTerm.set(term, cachedEntry);
    if (cachedEntry && timestampMillis(data.expiresAt) > nowMs) {
      cacheHitCount += 1;
      if (Array.isArray(cachedEntry.synsets) && cachedEntry.synsets.length > 0) entriesByTerm.set(term, cachedEntry);
    } else {
      missingTerms.push(term);
    }
  });

  const fetched = await mapWithConcurrency(missingTerms, 4, async (term) => {
    try {
      return await fetchWordNetEntry(term, { baseUrl, fetchImpl });
    } catch (error) {
      onWarning(error);
      return staleByTerm.get(term) || null;
    }
  });
  const writes = [];
  fetched.forEach((entry, index) => {
    const term = missingTerms[index];
    if (!entry) return;
    if (entry.synsets?.length) entriesByTerm.set(term, entry);
    if (entry.schemaVersion === WORDNET_SCHEMA_VERSION) writes.push({ term, entry });
  });
  if (writes.length > 0) {
    try {
      const batch = firestore.batch();
      const expiresAt = new Date(nowMs + CACHE_TTL_MS);
      for (const item of writes) {
        batch.set(
          firestore.doc(`wordnet_lexicon/${wordNetCacheDocumentId(item.term)}`),
          {
            lemma: item.term,
            found: item.entry.synsets.length > 0,
            schemaVersion: WORDNET_SCHEMA_VERSION,
            entry: item.entry,
            updatedAt: now,
            expiresAt,
          },
          { merge: true },
        );
      }
      await batch.commit();
    } catch (error) {
      onWarning(error);
    }
  }
  return {
    entries: candidates.map((term) => entriesByTerm.get(term)).filter(Boolean),
    candidateCount: candidates.length,
    cacheHitCount,
    fetchedCount: writes.length,
  };
}

export function formatWordNetCorpus(entries, maxLength = 7_000) {
  const normalizedEntries = Array.isArray(entries) ? entries : [];
  if (normalizedEntries.length === 0) return "";
  const sections = normalizedEntries.map((entry) => {
    const senses = (Array.isArray(entry?.synsets) ? entry.synsets : []).slice(0, 4).map((synset, index) => {
      const synonyms = (synset.members || []).filter((member) => normalizedWord(member) !== entry.resolvedLemma).slice(0, 5);
      return [
        `  ${index + 1}) [${synset.id} · ${synset.partOfSpeech}] ${synset.definitions?.[0] || ""}`,
        synonyms.length ? `     동의 표제어: ${synonyms.join(", ")}` : "",
        synset.antonyms?.length ? `     반의어: ${synset.antonyms.slice(0, 5).join(", ")}` : "",
        synset.examples?.length ? `     사전 예문: ${synset.examples[0]}` : "",
      ].filter(Boolean).join("\n");
    });
    return `[WordNet 표제어: ${entry.resolvedLemma}]\n${senses.join("\n")}`;
  });
  return text(
    `Open English WordNet의 구조화된 어휘 근거다. 문맥에 맞는 품사와 의미 하나를 선택하고, 정의를 임의로 섞거나 존재하지 않는 동의어를 만들지 않는다. 한국어 뜻풀이는 선택한 영영 정의를 학생 수준에 맞게 정확히 풀어쓴다.\n\n${sections.join("\n\n")}`,
    maxLength,
  );
}

export function normalizeGroundedVocabulary(rawVocabulary, entries, maxItems = 10) {
  const allowed = new Map();
  for (const entry of Array.isArray(entries) ? entries : []) {
    const terms = new Set([entry.requestedTerm, entry.resolvedLemma]);
    for (const synset of entry.synsets || []) for (const member of synset.members || []) terms.add(normalizedWord(member));
    for (const term of terms) if (term) allowed.set(term, entry);
  }
  const result = [];
  const seen = new Set();
  for (const item of Array.isArray(rawVocabulary) ? rawVocabulary : []) {
    const term = normalizedWord(item?.term);
    const meaning = text(item?.meaning, 360);
    const entry = allowed.get(term);
    if (!entry || seen.has(term) || meaning.length < 2 || !/[가-힣]/.test(meaning)) continue;
    const requestedSenseId = text(item?.senseId, 40);
    const matchingSynset = (entry.synsets || []).find((synset) => synset.id === requestedSenseId) || (entry.synsets || []).find((synset) =>
      (synset.members || []).some((member) => normalizedWord(member) === term),
    ) || entry.synsets?.[0];
    result.push({
      term,
      meaning,
      example: text(item?.example, 500),
      definitionEn: text(matchingSynset?.definitions?.[0], 500),
      senseId: text(matchingSynset?.id, 40),
      source: WORDNET_SOURCE_LABEL,
      sourceUrl: entry.sourceUrl,
      license: WORDNET_LICENSE,
    });
    seen.add(term);
    if (result.length >= maxItems) break;
  }
  return result;
}
