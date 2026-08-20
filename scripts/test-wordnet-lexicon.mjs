import test from "node:test";
import assert from "node:assert/strict";
import {
  extractWordNetCandidates,
  fetchWordNetEntry,
  formatWordNetCorpus,
  loadWordNetEntriesWithCache,
  normalizeGroundedVocabulary,
  normalizeWordNetPayload,
} from "../api/_lib/wordnet-lexicon.mjs";

const samplePayload = [
  {
    id: "00252677-v",
    lexname: "verb.change",
    partOfSpeech: "v",
    members: [{ lemma: "derive" }, { lemma: "obtain" }],
    definition: ["obtain from a particular source"],
    example: ["The present name derives from an older form"],
    antonym: [{ target_lemma: "lose" }],
  },
];

test("extracts useful English lemmas and prioritizes word-list lines", () => {
  const candidates = extractWordNetCandidates("derive  도출하다\ncontext  문맥\nderive appears in the passage and the student explains it", 4);
  assert.deepEqual(candidates.slice(0, 2), ["derive", "context"]);
  assert.equal(candidates.includes("student"), false);
});

test("normalizes WordNet synsets without carrying arbitrary response fields", () => {
  const entry = normalizeWordNetPayload(samplePayload, "derived", "derive");
  assert.equal(entry.resolvedLemma, "derive");
  assert.equal(entry.synsets[0].definitions[0], "obtain from a particular source");
  assert.deepEqual(entry.synsets[0].antonyms, ["lose"]);
});

test("retries a basic inflection when the exact WordNet lemma is absent", async () => {
  const requested = [];
  const fetchImpl = async (url) => {
    requested.push(url);
    return {
      ok: true,
      json: async () => url.endsWith("/derived") ? [] : samplePayload,
    };
  };
  const entry = await fetchWordNetEntry("derived", { fetchImpl, baseUrl: "https://wordnet.test/api" });
  assert.equal(entry.resolvedLemma, "derive");
  assert.equal(requested.length >= 2, true);
});

test("formats grounding context and only accepts vocabulary found in WordNet", () => {
  const entry = normalizeWordNetPayload(samplePayload, "derive", "derive");
  const corpus = formatWordNetCorpus([entry]);
  assert.match(corpus, /00252677-v/);
  const vocabulary = normalizeGroundedVocabulary([
    { term: "derive", meaning: "특정한 근원에서 얻다", example: "We derive energy from sunlight." },
    { term: "invented-term", meaning: "검증되지 않은 뜻" },
  ], [entry]);
  assert.equal(vocabulary.length, 1);
  assert.equal(vocabulary[0].source, "Open English WordNet");
});

test("caches WordNet results and avoids a second external request", async () => {
  const store = new Map();
  const firestore = {
    doc: (path) => ({ path }),
    getAll: async (...refs) => refs.map((ref) => ({
      exists: store.has(ref.path),
      data: () => store.get(ref.path),
    })),
    batch: () => {
      const pending = [];
      return {
        set: (ref, value) => pending.push([ref.path, value]),
        commit: async () => pending.forEach(([path, value]) => store.set(path, value)),
      };
    },
  };
  let requestCount = 0;
  const fetchImpl = async () => {
    requestCount += 1;
    return { ok: true, json: async () => samplePayload };
  };
  const args = {
    firestore,
    source: "derive derive",
    fetchImpl,
    baseUrl: "https://wordnet.test/api",
    now: new Date("2026-08-20T00:00:00.000Z"),
  };
  const first = await loadWordNetEntriesWithCache(args);
  const second = await loadWordNetEntriesWithCache(args);
  assert.equal(first.entries.length, 1);
  assert.equal(second.entries.length, 1);
  assert.equal(second.cacheHitCount, 1);
  assert.equal(requestCount, 1);
});
