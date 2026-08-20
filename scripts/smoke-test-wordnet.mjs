import assert from "node:assert/strict";
import { fetchWordNetEntry, formatWordNetCorpus } from "../api/_lib/wordnet-lexicon.mjs";

const entries = [];
for (const term of ["derive", "context", "significant"]) {
  const entry = await fetchWordNetEntry(term, { timeoutMs: 10_000 });
  assert.ok(entry.synsets.length > 0, `WordNet returned no synsets for ${term}`);
  assert.ok(entry.synsets[0].definitions[0], `WordNet returned no definition for ${term}`);
  entries.push(entry);
}

const corpus = formatWordNetCorpus(entries);
assert.match(corpus, /Open English WordNet/);
console.log(JSON.stringify({
  source: entries[0].source,
  license: entries[0].license,
  lemmas: entries.map((entry) => entry.resolvedLemma),
  synsets: entries.reduce((total, entry) => total + entry.synsets.length, 0),
  status: "passed",
}));
