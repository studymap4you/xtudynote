function sanitizeText(value, maxLength = 20_000) {
  return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, maxLength);
}

function englishWordCount(value) {
  return (String(value ?? "").match(/[A-Za-z]+(?:[-'][A-Za-z]+)*/g) || []).length;
}

function queryTokens(value) {
  const translations = {
    환경: "environment climate ecology pollution biodiversity",
    과학: "science research technology",
    기술: "technology digital artificial intelligence",
    교육: "education learning teaching student",
    심리: "psychology behavior emotion cognition",
    사회: "society culture economic community",
    의학: "medicine health clinical cancer",
    문학: "literature reading narrative culture",
  };
  let expanded = String(value ?? "").toLowerCase();
  for (const [term, addition] of Object.entries(translations)) {
    if (expanded.includes(term)) expanded += ` ${addition}`;
  }
  return [...new Set(expanded.split(/[^\p{L}\p{N}]+/u).filter((token) => token.length >= 3))].slice(0, 40);
}

function splitSourceChunks(value, maxLength = 5_000) {
  const paragraphs = sanitizeText(value, 500_000)
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const chunks = [];
  let buffer = "";
  for (const paragraph of paragraphs) {
    if (buffer && buffer.length + paragraph.length + 2 > maxLength) {
      if (englishWordCount(buffer) >= 80) chunks.push(buffer);
      buffer = "";
    }
    if (paragraph.length > maxLength) {
      const sentences = paragraph.split(/(?<=[.!?])\s+/);
      for (const sentence of sentences) {
        if (buffer && buffer.length + sentence.length + 1 > maxLength) {
          if (englishWordCount(buffer) >= 80) chunks.push(buffer);
          buffer = "";
        }
        buffer = buffer ? `${buffer} ${sentence}` : sentence;
      }
    } else {
      buffer = buffer ? `${buffer}\n\n${paragraph}` : paragraph;
    }
  }
  if (englishWordCount(buffer) >= 80) chunks.push(buffer);
  return chunks;
}

function chunkScore(chunk, tokens) {
  const lower = chunk.toLowerCase();
  return tokens.reduce((total, token) => total + (lower.includes(token) ? 4 : 0), 0) + Math.min(2, englishWordCount(chunk) / 180);
}

function normalizeSourceRecord(snapshot) {
  const data = snapshot.data() || {};
  const textPath = [...(Array.isArray(data.referenceMaterialFilePaths) ? data.referenceMaterialFilePaths : [])]
    .find((item) => /\.txt$/iu.test(String(item)));
  return {
    id: snapshot.id,
    title: sanitizeText(data.subject, 500) || snapshot.id,
    author: sanitizeText(data.sourceAuthor, 300) || undefined,
    sourceType: data.sourceDatabase === "open_access_paper_sources" ? "paper" : "other",
    topic: [data.sourceField, data.section, ...(Array.isArray(data.themes) ? data.themes : [])]
      .map((item) => sanitizeText(item, 200))
      .filter(Boolean),
    difficulty: "high",
    copyrightStatus: sanitizeText(data.sourceLicense, 200) || "library-reference",
    textPath: sanitizeText(textPath, 1_000),
    sourceDatabase: sanitizeText(data.sourceDatabase, 200),
    status: sanitizeText(data.status, 40),
  };
}

async function readStorageText(bucket, storagePath) {
  if (!storagePath) return "";
  const [bytes] = await bucket.file(storagePath).download();
  return bytes.toString("utf8").replace(/\u0000/g, "");
}

function metadataScore(source, tokens, sourceUsage) {
  const haystack = `${source.title} ${source.topic.join(" ")} ${source.sourceDatabase}`.toLowerCase();
  const lexical = tokens.reduce((total, token) => total + (haystack.includes(token) ? 12 : 0), 0);
  const usagePenalty = Number(sourceUsage?.[source.id] || 0) * 18;
  return lexical - usagePenalty;
}

export async function searchSourceDocuments({
  firestore,
  bucket,
  request,
  userSourceText = "",
  sourceUsage = {},
  limit = 5,
}) {
  const tokens = queryTokens(request.userRequest);
  const candidates = [];
  const userChunks = splitSourceChunks(userSourceText).slice(0, 2);
  userChunks.forEach((chunk, index) => {
    candidates.push({
      id: `user-source-${index + 1}`,
      title: `사용자 첨부 원문 ${index + 1}`,
      sourceType: "other",
      topic: ["user-upload"],
      text: chunk,
      difficulty: request.targetLevel,
      copyrightStatus: "user-supplied",
      retrievalScore: 10_000 - Number(sourceUsage[`user-source-${index + 1}`] || 0) * 18,
    });
  });

  const snapshot = await firestore
    .collection("contents")
    .where("libraryCategory", "==", "source_material")
    .limit(250)
    .get();
  const records = snapshot.docs
    .map(normalizeSourceRecord)
    .filter((source) => source.textPath && ["internal", "approved"].includes(source.status))
    .sort((left, right) => metadataScore(right, tokens, sourceUsage) - metadataScore(left, tokens, sourceUsage));

  const downloadLimit = Math.min(Math.max(limit * 3, 12), records.length);
  for (const source of records.slice(0, downloadLimit)) {
    try {
      const fullText = await readStorageText(bucket, source.textPath);
      const chunks = splitSourceChunks(fullText);
      if (!chunks.length) continue;
      const ranked = chunks
        .map((chunk, index) => ({ chunk, index, score: chunkScore(chunk, tokens) }))
        .sort((a, b) => b.score - a.score || a.index - b.index);
      const useOffset = Number(sourceUsage[source.id] || 0) % Math.min(3, ranked.length);
      const selected = ranked[useOffset] || ranked[0];
      candidates.push({
        id: source.id,
        title: source.title,
        author: source.author,
        sourceType: source.sourceType,
        topic: source.topic,
        text: selected.chunk,
        difficulty: source.difficulty,
        copyrightStatus: source.copyrightStatus,
        retrievalScore: metadataScore(source, tokens, sourceUsage) + selected.score,
      });
    } catch (error) {
      console.warn("[csat-question-engine] source text skipped", source.id, error instanceof Error ? error.message : error);
    }
  }

  return candidates
    .sort((left, right) => right.retrievalScore - left.retrievalScore)
    .slice(0, Math.max(3, limit))
    .map(({ retrievalScore: _retrievalScore, ...source }) => source);
}

