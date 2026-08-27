import { createHash } from "node:crypto";
import nlp from "compromise";

const CIRCLED = ["①", "②", "③", "④", "⑤"];
const CHOICE_TYPES = new Set([
  "purpose",
  "emotion_change",
  "claim",
  "main_idea",
  "title",
  "topic",
  "factual_description",
  "grammar",
  "vocabulary",
  "implied_meaning",
  "blank_short",
  "blank_long",
  "irrelevant_sentence",
  "paragraph_order",
  "sentence_insertion",
  "summary",
]);
const SEMANTIC_TYPES = new Set(["purpose", "claim", "main_idea", "title", "topic", "implied_meaning", "blank_long"]);
const OPEN_ENDED_TYPES = new Set(["writing_reorder", "writing_conditional", "grammar_correction"]);
const STOP_WORDS = new Set([
  "a", "an", "the", "of", "about", "after", "again", "against", "also", "among", "another", "because", "before", "being",
  "between", "both", "could", "does", "doing", "during", "each", "every", "from", "further", "have",
  "having", "into", "itself", "more", "most", "other", "should", "some", "such", "than", "that", "their",
  "them", "then", "there", "these", "they", "this", "those", "through", "under", "very", "what", "when",
  "where", "which", "while", "with", "would", "your", "ours", "were", "been", "will", "shall", "must",
  "might", "only", "same", "well", "much", "many", "over", "even", "still", "just", "like", "used", "uses",
  "using", "into", "onto", "upon", "whose", "whom", "such", "make", "made", "take", "taken", "people", "all",
  "he", "she", "him", "her", "we", "our", "ours", "us", "they", "them", "you", "your", "yours", "i", "me", "my",
]);
const GENERIC_CONCEPTS = new Set([
  "amount", "case", "condition", "example", "fact", "idea", "information", "issue", "kind", "matter",
  "means", "method", "number", "part", "person", "people", "place", "point", "process", "reason", "result",
  "situation", "something", "thing", "things", "time", "type", "way", "year", "years", "you", "your", "they", "them",
  "it", "its", "he", "she", "him", "her", "we", "our", "us", "i", "me", "who", "whom", "whose",
  "someone", "anyone", "everyone", "somebody", "anybody", "everybody", "nobody", "all", "one", "important",
]);
const ACTOR_CONCEPTS = new Set([
  "author", "boy", "boys", "child", "children", "daughter", "father", "girl", "girls", "man", "men",
  "mother", "parent", "parents", "reader", "readers", "son", "student", "students", "teacher", "teachers",
  "woman", "women", "writer", "writers",
]);

const ANTONYMS = Object.freeze({
  accept: "reject", accepted: "rejected", active: "passive", advantage: "disadvantage", allow: "prevent",
  allowed: "prevented", always: "never", appear: "disappear", available: "unavailable", beneficial: "harmful",
  better: "worse", big: "small", broad: "narrow", careful: "careless", certain: "uncertain", clear: "unclear",
  close: "distant", common: "rare", complex: "simple", consistent: "inconsistent", continue: "stop",
  correct: "incorrect", decrease: "increase", decreased: "increased", different: "identical", difficult: "easy",
  direct: "indirect", discourage: "encourage", early: "late", effective: "ineffective", encourage: "discourage",
  equal: "unequal", expand: "reduce", explicit: "implicit", fast: "slow", flexible: "rigid", gain: "lose",
  good: "bad", greater: "smaller", happy: "unhappy", harmful: "beneficial", high: "low", hotter: "colder",
  important: "unimportant", improve: "worsen", include: "exclude", increase: "decrease", increased: "decreased",
  independent: "dependent", likely: "unlikely", local: "global", long: "short", major: "minor", more: "less",
  know: "misunderstand", knows: "misunderstands", essential: "optional", focus: "ignore", focused: "ignored",
  necessary: "unnecessary", negative: "positive", new: "old", normal: "abnormal", often: "rarely", open: "closed",
  optimistic: "pessimistic", ordinary: "exceptional", permanent: "temporary", positive: "negative", possible: "impossible",
  private: "public", protect: "endanger", protected: "endangered", reduce: "expand", reduced: "expanded", reliable: "unreliable",
  prevent: "allow", prevents: "allows", prevented: "allowed", replace: "preserve", replaces: "preserves", replaced: "preserved",
  remember: "forget", safe: "dangerous", similar: "different", simple: "complex", slow: "fast", stable: "unstable",
  strong: "weak", success: "failure", successful: "unsuccessful", support: "oppose", supported: "opposed", true: "false",
  unique: "common", useful: "useless", valuable: "worthless", visible: "invisible", weak: "strong", willing: "unwilling",
  gentle: "rough", rough: "gentle", younger: "older",
});

const PATTERN_RATIONALES = Object.freeze({
  ABSTRACT_CONCRETE_SHIFT: "원문의 범위를 특정 사례로 과도하게 좁혀 중심 의미와 어긋납니다.",
  SCOPE_SHIFT: "원문의 제한된 범위를 모든 경우로 확대해 범위가 달라집니다.",
  POLARITY_REVERSAL: "원문의 긍정·부정 방향을 뒤집어 핵심 판단과 반대가 됩니다.",
  LEXICAL_SUBSTITUTION: "핵심어를 문맥상 반대되거나 다른 개념으로 바꾸었습니다.",
  PARTIAL_TRUTH: "일부 표현은 맞지만 원문의 조건이나 결론을 누락했습니다.",
  CAUSAL_DISTORTION: "원문에서 설명한 원인과 결과의 관계를 바꾸었습니다.",
  SEQUENCE_REVERSAL: "원문의 시간적·논리적 전개 순서를 뒤집었습니다.",
  SOURCE_EVIDENCE: "원문에서 그대로 확인되는 내용이므로 이 문항의 오답 선지입니다.",
});

const STEM_BY_TYPE = Object.freeze({
  purpose: "다음 글의 목적으로 가장 적절한 것을 고르시오.",
  emotion_change: "다음 글에 드러난 심경 변화로 가장 적절한 것을 고르시오.",
  claim: "다음 글에서 필자가 주장하는 바로 가장 적절한 것을 고르시오.",
  main_idea: "다음 글의 요지로 가장 적절한 것을 고르시오.",
  title: "다음 글의 제목으로 가장 적절한 것을 고르시오.",
  topic: "다음 글의 주제로 가장 적절한 것을 고르시오.",
  factual_description: "다음 글의 내용과 일치하지 않는 것을 고르시오.",
  grammar: "다음 글의 밑줄 친 부분 중 어법상 틀린 것을 고르시오.",
  vocabulary: "다음 글의 밑줄 친 부분 중 문맥상 낱말의 쓰임이 적절하지 않은 것을 고르시오.",
  implied_meaning: "다음 글의 밑줄 친 표현이 의미하는 바로 가장 적절한 것을 고르시오.",
  blank_short: "다음 빈칸에 들어갈 말로 가장 적절한 것을 고르시오.",
  blank_long: "다음 빈칸에 들어갈 말로 가장 적절한 것을 고르시오.",
  irrelevant_sentence: "다음 글에서 전체 흐름과 관계없는 문장을 고르시오.",
  paragraph_order: "주어진 글의 (A), (B), (C)를 이어질 순서에 맞게 배열한 것을 고르시오.",
  sentence_insertion: "글의 흐름으로 보아, 주어진 문장이 들어가기에 가장 적절한 곳을 고르시오.",
  summary: "다음 글의 내용을 요약한 문장의 빈칸 (A), (B)에 들어갈 말로 가장 적절한 것을 고르시오.",
});

function text(value, maxLength = 60_000) {
  return String(value ?? "")
    .replace(/\u0000/gu, " ")
    .replace(/[\t\r\n]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, maxLength);
}

function comparable(value) {
  return text(value, 100_000)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/gu, "");
}

function englishWords(value) {
  return text(value, 100_000).match(/[A-Za-z]+(?:[-'][A-Za-z]+)*/gu) || [];
}

function splitSentences(value) {
  return (text(value, 100_000).match(/[^.!?]+[.!?]+(?:[”’"']+)?|[^.!?]+$/gu) || [])
    .map((item) => text(item))
    .filter((item) => englishWords(item).length >= 3);
}

function stableInteger(value) {
  return Number.parseInt(createHash("sha256").update(String(value)).digest("hex").slice(0, 12), 16);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function removeLegacyMarkers(value) {
  return text(value)
    .replace(/\(\s*[①②③④⑤]\s*\)/gu, "")
    .replace(/[①②③④⑤]/gu, "")
    .replace(/\(\s*\)/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function removeLegacyAlphabetMarkers(value) {
  return text(value)
    .replace(/,\s*\(\s*[ABC]\s*\)\s*,/gu, ", however,")
    .replace(/(^|[.!?]\s+)\(\s*[ABC]\s*\)\s*,?\s*/gu, "$1Overall, ")
    .replace(/\(\s*[ABC]\s*\)/gu, "")
    .replace(/,\s*,/gu, ",")
    .replace(/(^|[.!?]\s+),\s*/gu, "$1")
    .replace(/\s+/gu, " ")
    .trim();
}

function lowerFirst(value) {
  const input = text(value);
  return input ? `${input[0].toLowerCase()}${input.slice(1)}` : input;
}

function titleWord(value) {
  const input = text(value, 80);
  return input ? `${input[0].toUpperCase()}${input.slice(1).toLowerCase()}` : input;
}

function topKeywords(source, limit = 8) {
  const counts = new Map();
  const order = new Map();
  englishWords(source).forEach((raw, index) => {
    const word = raw.toLowerCase().replace(/'s$/u, "");
    if (word.length < 4 || STOP_WORDS.has(word)) return;
    if (!order.has(word)) order.set(word, index);
    counts.set(word, (counts.get(word) || 0) + 1);
  });
  return [...counts]
    .sort((left, right) => right[1] - left[1] || order.get(left[0]) - order.get(right[0]))
    .slice(0, limit)
    .map(([word]) => word);
}

function cleanConcept(value) {
  return text(value, 100)
    .replace(/^[,;:\s]+|[,;:.!?\s]+$/gu, "")
    .replace(/^(?:a|an|the|this|that|these|those|both|either|each|every|some|many|most|my|our|your|their|his|her|its)\s+/iu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function wordStem(value) {
  return String(value).toLowerCase()
    .replace(/ies$/u, "y")
    .replace(/(?:ing|ed)$/u, "")
    .replace(/s$/u, "");
}

function conceptPhrases(source, preferred = "", limit = 8) {
  const central = findCentralSentence(source);
  const centralDocument = nlp(central);
  const preferredStems = new Set(englishWords(preferred)
    .map(wordStem)
    .filter((word) => word.length >= 3 && !STOP_WORDS.has(word) && !GENERIC_CONCEPTS.has(word)));
  const candidates = [
    ...centralDocument.topics().out("array"),
    ...centralDocument.nouns().out("array"),
  ]
    .map(cleanConcept)
    .filter((item) => {
      const words = englishWords(item);
      if (!words.length || words.length > 6 || item.length > 72) return false;
      if (/\s(?:Many|Some|The|This|That|These|Those)\s/u.test(item)) return false;
      const meaningful = words.map((word) => word.toLowerCase()).filter((word) => !STOP_WORDS.has(word));
      if (!meaningful.length || meaningful.every((word) => GENERIC_CONCEPTS.has(word))) return false;
      if (meaningful.some((word) => GENERIC_CONCEPTS.has(word) && /^(?:us|who|whom|whose|someone|anyone|everyone)$/u.test(word))) return false;
      const tags = nlp(item).json().flatMap((sentence) => sentence.terms || []).flatMap((term) => term.tags || []);
      return !tags.includes("Pronoun")
        && !(tags.includes("Date") && !tags.includes("ProperNoun"))
        && !(tags.includes("Verb") && !tags.includes("Noun"));
    });
  const unique = [...new Map(candidates.map((item) => [comparable(item), item])).values()];
  const ranked = unique
    .map((item) => {
      const matcher = new RegExp(escapeRegExp(item), "igu");
      const count = [...text(source, 100_000).matchAll(matcher)].length || 1;
      const firstIndex = text(source, 100_000).toLowerCase().indexOf(item.toLowerCase());
      const itemWords = englishWords(item).map((word) => word.toLowerCase());
      const itemStems = itemWords.map(wordStem);
      const centralBonus = comparable(central).includes(comparable(item)) || tokenOverlap(central, item) >= 0.45 ? 8 : 0;
      const preferredBonus = itemStems.filter((word) => preferredStems.has(word)).length * 3;
      const actorOnlyPenalty = itemWords.every((word) => ACTOR_CONCEPTS.has(word) || GENERIC_CONCEPTS.has(word)) ? 9 : 0;
      const properNounBonus = /(?:^|\s)[A-Z][a-z]+(?:\s+[A-Z][A-Za-z'-]+)+/u.test(item) ? 1.5 : 0;
      const multiwordBonus = Math.min(itemWords.length, 4) * 1.3;
      const openingBonus = firstIndex >= 0 && firstIndex < 140 ? 0.5 : 0;
      return {
        item,
        score: count * 1.8 + centralBonus + preferredBonus + properNounBonus + multiwordBonus + openingBonus - actorOnlyPenalty,
      };
    })
    .sort((left, right) => right.score - left.score || right.item.length - left.item.length);
  const selected = [];
  for (const candidate of ranked) {
    const { item } = candidate;
    const itemWords = englishWords(item);
    if (itemWords.length === 1) {
      const stem = wordStem(itemWords[0]);
      const expanded = ranked.find((other) => other !== candidate
        && englishWords(other.item).length > 1
        && englishWords(other.item).map(wordStem).includes(stem)
        && other.score >= candidate.score - 3);
      if (expanded) continue;
    }
    const normalized = comparable(item);
    const overlaps = selected.some((existing) => {
      const existingNormalized = comparable(existing);
      return existingNormalized.includes(normalized)
        || normalized.includes(existingNormalized)
        || tokenOverlap(existing, item) >= 0.7;
    });
    if (!overlaps) selected.push(item);
    if (selected.length === limit) break;
  }
  return selected;
}

function phraseTitle(value) {
  const minor = new Set(["a", "an", "and", "as", "at", "by", "for", "from", "in", "of", "on", "or", "the", "to", "with"]);
  return englishWords(value).map((word, index) => {
    const lower = word.toLowerCase();
    if (index > 0 && minor.has(lower)) return lower;
    return `${lower[0]?.toUpperCase() || ""}${lower.slice(1)}`;
  }).join(" ");
}

function openingGerundPhrase(source) {
  const first = splitSentences(source)[0] || "";
  const match = first.match(/^([A-Z][A-Za-z'-]+ing\s+(?:(?!\b(?:is|are|was|were|can|could|may|might|will|would|should|must)\b)[A-Za-z'-]+\s*){1,5})(?=\b(?:is|are|was|were|can|could|may|might|will|would|should|must)\b)/u);
  return match ? text(match[1], 100) : "";
}

function tokenOverlap(left, right) {
  const leftTokens = new Set(englishWords(left).map((item) => item.toLowerCase()).filter((item) => !STOP_WORDS.has(item)));
  const rightTokens = new Set(englishWords(right).map((item) => item.toLowerCase()).filter((item) => !STOP_WORDS.has(item)));
  if (!leftTokens.size || !rightTokens.size) return 0;
  const intersection = [...leftTokens].filter((item) => rightTokens.has(item)).length;
  return intersection / new Set([...leftTokens, ...rightTokens]).size;
}

function findCentralSentence(source, preferred = "") {
  const candidates = splitSentences(source);
  const preferredComparable = comparable(preferred);
  if (preferredComparable) {
    const exact = candidates.find((sentence) => {
      const normalized = comparable(sentence);
      return normalized.includes(preferredComparable) || preferredComparable.includes(normalized);
    });
    if (exact && englishWords(exact).length >= 8) return exact;
  }
  const sourceCounts = new Map();
  englishWords(source).forEach((raw) => {
    const word = raw.toLowerCase().replace(/'s$/u, "");
    if (word.length < 4 || STOP_WORDS.has(word) || GENERIC_CONCEPTS.has(word) || ACTOR_CONCEPTS.has(word)) return;
    sourceCounts.set(word, (sourceCounts.get(word) || 0) + 1);
  });
  const preferredStems = new Set(englishWords(preferred)
    .map(wordStem)
    .filter((word) => word.length >= 3 && !STOP_WORDS.has(word)));
  return candidates
    .map((sentence, index) => {
      const tokens = englishWords(sentence).map((item) => item.toLowerCase());
      const keywordCount = [...new Set(tokens)].reduce((sum, item) => {
        const count = sourceCounts.get(item) || 0;
        return sum + (count >= 2 ? Math.min(count, 4) : 0);
      }, 0);
      const preferredCount = tokens.map(wordStem).filter((item) => preferredStems.has(item)).length;
      const locationBonus = index === candidates.length - 1 ? 6 : index === 0 ? 0.2 : 0;
      const conclusionBonus = /\b(?:therefore|thus|consequently|as a result|this means|in conclusion|overall)\b/iu.test(sentence) ? 1.5 : 0;
      const questionPenalty = /\?/u.test(sentence) ? 2.5 : 0;
      return {
        sentence,
        score: keywordCount + preferredCount * 2.5 + locationBonus + conclusionBonus
          + Math.min(tokens.length, 30) / 100 - questionPenalty,
      };
    })
    .sort((left, right) => right.score - left.score)[0]?.sentence || text(source);
}

function replaceFirstWord(value, word, replacement) {
  const matcher = new RegExp(`\\b${escapeRegExp(word)}\\b`, "iu");
  return text(value).replace(matcher, replacement);
}

function polarityMutation(value) {
  const input = text(value);
  if (/\bnot\b/iu.test(input)) return input.replace(/\bnot\s+/iu, "");
  if (/\bcannot\b/iu.test(input)) return input.replace(/\bcannot\b/iu, "can");
  if (/\bcan\b/iu.test(input)) return input.replace(/\bcan\b/iu, "cannot");
  const auxiliary = /\b(is|are|was|were|has|have|had|could|will|would|should|must|may|might|do|does|did)\b/iu;
  if (auxiliary.test(input)) return input.replace(auxiliary, "$1 not");
  const verbPattern = /\b(starts?|shapes?|shows?|supports?|provides?|causes?|leads?|allows?|encourages?|requires?|helps?|means?|becomes?|makes?|gives?|improves?|reduces?|increases?|determines?|affects?|influences?|prevents?|protects?|creates?|offers?|suggests?|indicates?|demonstrates?|explains?|relies?|depends?|matters?|remains?|needs?|welcomes?|wins?|finds?|reports?|asks?)\b/iu;
  const verb = input.match(verbPattern);
  if (verb?.index != null) {
    const original = verb[0];
    const lower = original.toLowerCase();
    const infinitive = text(nlp(original).verbs().toInfinitive().out("text"), 80).toLowerCase()
      || lower.replace(/ied$/u, "y").replace(/ed$/u, "").replace(/s$/u, "");
    const past = /(?:ed|won|made|gave|took|found|thought|led|began|became|wrote|said|told)$/u.test(lower);
    const singular = /s$/u.test(lower) && !/ss$/u.test(lower);
    const base = infinitive || (singular ? lower.replace(/s$/u, "") : lower);
    const before = input.slice(0, verb.index);
    if (/\bto\s+$/iu.test(before)) {
      return `${before.replace(/\bto\s+$/iu, "not to ")}${base}${input.slice(verb.index + original.length)}`;
    }
    const auxiliaryText = past ? "did not" : singular ? "does not" : "do not";
    return `${input.slice(0, verb.index)}${auxiliaryText} ${base}${input.slice(verb.index + original.length)}`;
  }
  for (const word of englishWords(input)) {
    const antonym = ANTONYMS[word.toLowerCase()];
    if (antonym) return replaceFirstWord(input, word, antonym);
  }
  return "";
}

function scopeMutation(value) {
  const input = text(value);
  const someMatch = input.match(/\bsome\s+([A-Za-z][A-Za-z'-]*)/iu);
  if (someMatch) {
    const noun = someMatch[1];
    return input.replace(someMatch[0], `${/s$/u.test(noun) ? "all" : "complete"} ${noun}`);
  }
  const replacements = [
    [/\bone\s+of\s+\d+\s+([A-Za-z][A-Za-z'-]*)s\b/iu, "the only $1"], [/\bthe\s+many\b/iu, "all"], [/\bsome\b/iu, "all"],
    [/\bmany\b/iu, "all"], [/\bmost\b/iu, "all"], [/\bmay\b/iu, "must"], [/\bcan\b/iu, "must"],
    [/\boften\b/iu, "always"], [/\bsometimes\b/iu, "always"], [/\busually\b/iu, "always"],
    [/\bgenerally\b/iu, "without exception"], [/\btend(?:s|ed)?\s+to\b/iu, "always"],
  ];
  for (const [matcher, replacement] of replacements) {
    if (matcher.test(input)) return input.replace(matcher, replacement);
  }
  const possessiveSubject = input.match(/\b(our|their|his|her)\s+([A-Za-z][A-Za-z'-]*(?:\s+[A-Za-z][A-Za-z'-]*){0,2})\s+(is|are|was|were|has|have)\b/iu);
  if (possessiveSubject) {
    const [, , subject, verb] = possessiveSubject;
    const everyVerb = ({ are: "is", were: "was", have: "has" }[verb.toLowerCase()] || verb);
    return input.replace(possessiveSubject[0], `every ${subject} ${everyVerb}`);
  }
  if (/\bbecause\b/iu.test(input)) return input.replace(/\bbecause\b/iu, "solely because");
  const modalVerb = /\b(has|have|had|could|will|would|should|must|may|might)\s+([A-Za-z][A-Za-z'-]*)\b/iu;
  if (modalVerb.test(input)) return input.replace(modalVerb, "$1 only $2");
  return `Only ${lowerFirst(input)}`;
}

function lexicalMutation(value, source) {
  const input = text(value);
  for (const word of englishWords(input)) {
    const antonym = ANTONYMS[word.toLowerCase()];
    if (antonym) return replaceFirstWord(input, word, antonym);
  }
  const number = input.match(/\b\d+(?:\.\d+)?\b/u);
  if (number) {
    const numeric = Number(number[0]);
    const replacement = Number.isFinite(numeric) ? String(Math.max(1, numeric + (numeric < 10 ? 2 : 10))) : "two";
    return input.replace(number[0], replacement);
  }
  const adjectives = nlp(input).match("#Adjective").out("array");
  for (const phrase of adjectives) {
    const adjective = englishWords(phrase)[0]?.toLowerCase();
    if (adjective && ANTONYMS[adjective]) return replaceFirstWord(input, adjective, ANTONYMS[adjective]);
  }
  return "";
}

function partialTruthMutation(value) {
  const input = text(value);
  if (/\binstead\s+of\b/iu.test(input)) return input.replace(/\binstead\s+of\b/iu, "while");
  const becauseIndex = input.search(/\s+because\s+/iu);
  if (becauseIndex > input.length * 0.35) return `${input.slice(0, becauseIndex).trim().replace(/[,;\s]+$/u, "")}.`;
  const conjunction = input.match(/\b(and|but|while|whereas)\b/iu);
  if (conjunction?.index && conjunction.index > input.length * 0.35) {
    return `${input.slice(0, conjunction.index).trim().replace(/[,;\s]+$/u, "")}.`;
  }
  const lastComma = input.lastIndexOf(",");
  if (lastComma > input.length * 0.55) {
    const tail = input.slice(lastComma + 1);
    if (nlp(tail).verbs().out("array").length > 0) {
      return `${input.slice(0, lastComma).trim().replace(/[,;\s]+$/u, "")}.`;
    }
  }
  const trailingPhrase = input.match(/\s+(?:instead\s+of|from|during|within|across|through|without|for|in|on|at|by|with)\s+[^,.;!?]{3,100}[.!?]?$/iu);
  if (trailingPhrase?.index && trailingPhrase.index > input.length * 0.3) {
    const before = input.slice(0, trailingPhrase.index).trim();
    if (/\b(?:based|depends?|relies?|rests?|focus(?:es|ed)?|insists?|counts?)$/iu.test(before)) return "";
    return `${input.slice(0, trailingPhrase.index).trim().replace(/[,;\s]+$/u, "")} while leaving the broader context unexamined.`;
  }
  return "";
}

function causalMutation(value, source) {
  const input = text(value);
  const because = input.match(/^(.+?)\s+because\s+(.+?)([.!?])?$/iu);
  if (because) return `Because ${lowerFirst(because[1].replace(/[,;\s]+$/u, ""))}, ${lowerFirst(because[2])}${because[3] || "."}`;
  const leads = input.match(/^(.+?)\s+(causes?|leads? to|results? in)\s+(.+?)([.!?])?$/iu);
  if (leads) return `${leads[3]} ${leads[2]} ${lowerFirst(leads[1])}${leads[4] || "."}`;
  return "";
}

function abstractConcreteMutation(value, source) {
  const input = text(value).replace(/[.!?]+$/u, "");
  return `${input}, but only in one isolated case.`;
}

function mutate(value, pattern, source) {
  if (pattern === "POLARITY_REVERSAL") return polarityMutation(value);
  if (pattern === "SCOPE_SHIFT") return scopeMutation(value);
  if (pattern === "LEXICAL_SUBSTITUTION") return lexicalMutation(value, source);
  if (pattern === "PARTIAL_TRUTH") return partialTruthMutation(value);
  if (pattern === "CAUSAL_DISTORTION") return causalMutation(value, source);
  return abstractConcreteMutation(value, source);
}

function naturalChoice(candidate, correct) {
  const value = text(candidate, 2_000);
  if (!value || comparable(value) === comparable(correct)) return false;
  if (/In every situation without exception|regardless of the remaining conditions|conditions stated in the passage/iu.test(value)) return false;
  if (/\b(?:a\s+(?:old|unusual|important|effective)|an\s+(?:new|useful|major|minor))\b/iu.test(value)) return false;
  if (/\bnot\s+not\b|\bcannot\s+not\b|\bto\s+do\s+not\b|\b(?:a|an)\s+all\b|,\s*,|\b(?:doneed|movs|producting|sideed|driveing)\b/iu.test(value)) return false;
  if (/\b(?:based|depends?|relies?|rests?)\s+while\b|^Only\s+(?:(?:who|what|where|when)\s*:|but\b|and\b|or\b|however\b|although\b|because\b)/iu.test(value)) return false;
  const ratio = correct.length ? value.length / correct.length : 1;
  if (ratio < 0.35 || ratio > 1.65 || tokenOverlap(value, correct) < 0.3) return false;
  if (englishWords(correct).length >= 8 && nlp(value).verbs().out("array").length === 0) return false;
  return true;
}

export function inspectVariantDistractorCandidates(correct, source) {
  return ["POLARITY_REVERSAL", "SCOPE_SHIFT", "PARTIAL_TRUTH", "ABSTRACT_CONCRETE_SHIFT", "CAUSAL_DISTORTION", "LEXICAL_SUBSTITUTION"]
    .map((pattern) => {
      const candidate = text(mutate(correct, pattern, source), 2_000);
      return { pattern, candidate, accepted: naturalChoice(candidate, correct), overlap: tokenOverlap(candidate, correct) };
    });
}

function choiceMetadata(choices, answer, patterns, correctRationale) {
  return choices.map((choice, index) => {
    const isCorrect = index + 1 === answer;
    const pattern = patterns[index] || null;
    return {
      index: index + 1,
      text: choice,
      isCorrect,
      distractorPattern: isCorrect ? null : pattern,
      rationale: isCorrect ? correctRationale : PATTERN_RATIONALES[pattern] || "원문의 근거와 일치하지 않습니다.",
    };
  });
}

function assembleChoices(correct, source, questionId, allowedPatterns = [
  "POLARITY_REVERSAL", "SCOPE_SHIFT", "PARTIAL_TRUTH", "ABSTRACT_CONCRETE_SHIFT", "CAUSAL_DISTORTION", "LEXICAL_SUBSTITUTION",
]) {
  const normalizedCorrect = text(correct, 2_000);
  const wrong = [];
  for (const pattern of allowedPatterns) {
    const candidate = text(mutate(normalizedCorrect, pattern, source), 2_000);
    if (naturalChoice(candidate, normalizedCorrect)
      && !wrong.some((item) => comparable(item.text) === comparable(candidate))) {
      wrong.push({ text: candidate, pattern });
    }
    if (wrong.length === 4) break;
  }
  if (wrong.length !== 4) throw new Error(`${questionId}: 서로 다른 오답 네 개를 만들지 못했습니다.`);
  const answerIndex = stableInteger(`${questionId}:answer`) % 5;
  const choices = [];
  const patterns = [];
  let wrongCursor = 0;
  for (let index = 0; index < 5; index += 1) {
    if (index === answerIndex) {
      choices.push(normalizedCorrect);
      patterns.push(null);
    } else {
      choices.push(wrong[wrongCursor].text);
      patterns.push(wrong[wrongCursor].pattern);
      wrongCursor += 1;
    }
  }
  return {
    choices,
    answer: answerIndex + 1,
    choiceRationales: choiceMetadata(
      choices,
      answerIndex + 1,
      patterns,
      "지문의 핵심 내용, 범위, 인과관계와 긍정·부정 방향을 그대로 보존합니다.",
    ),
    distractorPatterns: wrong.map((item) => item.pattern),
  };
}

function currentCorrectChoice(problem) {
  const index = Number(problem.answer) - 1;
  return index >= 0 && index < (problem.choices || []).length ? text(problem.choices[index], 4_000) : "";
}

function semanticCorrectAnswer(type, source) {
  const central = findCentralSentence(source);
  if (type === "purpose") return `To explain that ${lowerFirst(central)}`;
  if (type === "implied_meaning") return `The expression suggests that ${lowerFirst(central)}`;
  return central;
}

function namedPerson(source) {
  const peopleCandidates = nlp(source).people().out("array")
    .map(cleanConcept)
    .filter((item) => /^[A-Z][A-Za-z'-]+(?:\s+[A-Z][A-Za-z'-]+)+$/u.test(item))
    .filter((item) => !/\b(?:Club|Company|Corporation|Daily News|Museum|University|United States|School|Center|Association|Institute)\b/iu.test(item));
  return peopleCandidates[0] || "";
}

function robustThemeConcept(value, central) {
  const concept = cleanConcept(value);
  const words = englishWords(concept).map((word) => word.toLowerCase());
  if (!words.length || words.length > 6) return false;
  if (/[—(),]$/u.test(concept) || /[“”"]/u.test(concept)) return false;
  if (/^(?:and|as|at|both|each|either|every|in|into|least|of|on|so|the|to|with)\b|\b(?:and|as|at|in|into|of|on|the|to|with)$/iu.test(concept)) return false;
  if (/\b(?:actually|able|known|recorded|regardless|roughly|safe|suddenly)\b/iu.test(concept)) return false;
  if (/\band\b/iu.test(concept)) return false;
  const terms = nlp(concept).json().flatMap((sentence) => sentence.terms || []);
  const tags = new Set(terms.flatMap((term) => term.tags || []));
  const finiteVerb = terms.some((term) => (term.tags || []).includes("Verb")
    && !/(?:ing|ed)$/iu.test(term.normal || term.text || ""));
  if (!tags.has("Noun") || tags.has("Pronoun") || finiteVerb) return false;
  const meaningful = words.filter((word) => !STOP_WORDS.has(word));
  if (meaningful.some((word) => word.length < 3)) return false;
  const genericCount = meaningful.filter((word) => GENERIC_CONCEPTS.has(word)).length;
  if (!meaningful.length || genericCount >= Math.ceil(meaningful.length / 2)) return false;
  return comparable(central).includes(comparable(concept)) || tokenOverlap(central, concept) >= 0.6;
}

export function inspectVariantTheme(source, preferred = "") {
  const central = findCentralSentence(source);
  const concepts = conceptPhrases(source, preferred, 8);
  return {
    central,
    concepts: concepts.map((concept) => ({ concept, robust: robustThemeConcept(concept, central) })),
  };
}

function thematicChoices(type, source, questionId, preferred = "") {
  const concepts = conceptPhrases(source, preferred, 8);
  if (concepts.length < 2) throw new Error(`${questionId}: 제목·주제용 중심 개념이 부족합니다.`);
  const [first, second] = concepts;
  const person = namedPerson(source);
  const contestMatch = source.match(/^(.{3,80}?\b(?:contest|competition))\b/iu);
  const contestCandidate = cleanConcept(contestMatch?.[1] || "");
  const contest = contestCandidate
    && englishWords(contestCandidate).length <= 8
    && /\b(?:deadline|entry|prize|register|submit)\b/iu.test(source)
    ? contestCandidate
    : "";
  const thematicEvidence = findCentralSentence(source);
  if (!robustThemeConcept(first, thematicEvidence) || !robustThemeConcept(second, thematicEvidence)) {
    throw new Error(`${questionId}: 제목·주제 중심 개념이 원문 중심문장에 정확히 근거하지 않습니다.`);
  }
  const isRecommendation = Boolean(person) && /\b(?:writing to you on behalf of|I\s+(?:strongly\s+|highly\s+)?recommend|commitment to both|coaching\s+\w+\s+for\s+\w+\s+years)\b/iu.test(source);
  const isAppreciation = /\b(?:sincere appreciation|congratulations|thank you|grateful)\b/iu.test(source);
  const firstSentence = splitSentences(source)[0] || "";
  const isBiography = Boolean(person)
    && comparable(firstSentence).includes(comparable(person))
    && /\b(?:was born|is remembered as|was known as)\b/iu.test(firstSentence);
  const isNotice = /\b(?:who should apply|for more information|register for|application|tuition|admission prices|hours monday|cost:)\b/iu.test(source);
  const isGuidance = /\b(?:is very important|should|must|need to|best bet|recommended)\b/iu.test(thematicEvidence)
    && !/[“”"']/u.test(thematicEvidence);
  let correct;
  if (type === "title") {
    if (isRecommendation) correct = `A Recommendation for ${phraseTitle(person || first)}`;
    else if (isBiography) correct = `${phraseTitle(person)}: Life and Career`;
    else if (contest) correct = `${phraseTitle(contest)}: Rules and Participation`;
    else if (isAppreciation) correct = `Congratulations and Support for ${phraseTitle(person || first)}`;
    else if (isNotice) correct = `${phraseTitle(first)}: Essential Information`;
    else if (isGuidance) correct = `Understanding ${phraseTitle(first)}: Recommended Practice`;
    else correct = `Understanding ${phraseTitle(first)} and ${phraseTitle(second)}`;
  } else if (isRecommendation) correct = `a recommendation based on ${person}'s qualifications and commitment`;
  else if (isBiography) correct = `the life and career of ${person}`;
  else if (contest) correct = `the rules and participation details of ${lowerFirst(contest)}`;
  else if (isAppreciation) correct = `congratulations and support concerning ${person || lowerFirst(first)}`;
  else if (isNotice) correct = `essential information about ${lowerFirst(first)}`;
  else if (isGuidance) correct = `recommended practices concerning ${lowerFirst(first)}`;
  else correct = `the relationship between ${lowerFirst(first)} and ${lowerFirst(second)}`;

  const wrong = type === "title"
    ? [
        { text: `${phraseTitle(first)} Without ${phraseTitle(second)}`, pattern: "POLARITY_REVERSAL" },
        { text: `${phraseTitle(second)} as the Sole Cause of ${phraseTitle(first)}`, pattern: "CAUSAL_DISTORTION" },
        { text: `${phraseTitle(first)}: One Exceptional Case`, pattern: "ABSTRACT_CONCRETE_SHIFT" },
        { text: `Replacing ${phraseTitle(first)} with ${phraseTitle(second)}`, pattern: "LEXICAL_SUBSTITUTION" },
      ]
    : [
        { text: `the complete replacement of ${lowerFirst(first)} by ${lowerFirst(second)}`, pattern: "LEXICAL_SUBSTITUTION" },
        { text: `${lowerFirst(first)} without ${lowerFirst(second)}`, pattern: "POLARITY_REVERSAL" },
        { text: `${lowerFirst(second)} as the sole cause of ${lowerFirst(first)}`, pattern: "CAUSAL_DISTORTION" },
        { text: `${lowerFirst(first)} only in one isolated case involving ${lowerFirst(second)}`, pattern: "ABSTRACT_CONCRETE_SHIFT" },
      ];
  if (new Set([correct, ...wrong.map((item) => item.text)].map(comparable)).size !== 5) {
    throw new Error(`${questionId}: 제목·주제 선지의 의미 중복을 제거하지 못했습니다.`);
  }
  const answerPosition = stableInteger(`${questionId}:thematic`) % 5;
  const choices = [];
  const patterns = [];
  let cursor = 0;
  for (let index = 0; index < 5; index += 1) {
    if (index === answerPosition) {
      choices.push(correct);
      patterns.push(null);
    } else {
      choices.push(wrong[cursor].text);
      patterns.push(wrong[cursor].pattern);
      cursor += 1;
    }
  }
  return {
    choices,
    answer: answerPosition + 1,
    choiceRationales: choiceMetadata(
      choices,
      answerPosition + 1,
      patterns,
      "글에서 반복되는 대상과 중심 관계를 지나치게 넓히거나 좁히지 않고 포괄합니다.",
    ),
    distractorPatterns: wrong.map((item) => item.pattern),
  };
}

function semanticQuestion(problem, source) {
  const preferred = currentCorrectChoice(problem);
  const correct = semanticCorrectAnswer(problem.questionType, source);
  const longBlankRemoved = problem.questionType === "blank_long" ? findCentralSentence(source) : "";
  if (longBlankRemoved) {
    const removedWordCount = englishWords(longBlankRemoved).length;
    if (removedWordCount < 8 || removedWordCount > 55
      || !/^[“”"'‘’(\[]*[A-Z0-9]/u.test(longBlankRemoved)
      || (longBlankRemoved.match(/:/gu) || []).length > 1
      || /\b(?:who|what to submit|where to send|when)\s*:/iu.test(longBlankRemoved)
      || /\bwho\s+(?:this|that|these|those|earlier|previous)\b/iu.test(longBlankRemoved)
      || nlp(longBlankRemoved).verbs().out("array").length === 0) {
      throw new Error(`${problem.questionId}: 문장형 빈칸으로 사용할 완전한 원문 문장을 찾지 못했습니다.`);
    }
  }
  const choiceSet = ["title", "topic"].includes(problem.questionType)
    ? thematicChoices(problem.questionType, source, problem.questionId, preferred)
    : assembleChoices(correct, source, problem.questionId);
  let passage = source;
  let evidence = ["title", "topic"].includes(problem.questionType)
    ? findCentralSentence(source)
    : findCentralSentence(source);
  if (problem.questionType === "implied_meaning") {
    const marked = evidence;
    passage = source.replace(marked, `【밑줄】 ${marked} 【/밑줄】`);
  }
  if (problem.questionType === "blank_long") {
    const removed = longBlankRemoved;
    passage = source.replace(removed, "________");
    evidence = removed;
    choiceSet.transformation = {
      kind: "sentence-blank",
      removedText: removed,
      blankCount: (passage.match(/________/gu) || []).length,
      reconstructionValid: comparable(passage.replace("________", removed)) === comparable(source),
    };
  }
  return {
    passage,
    stem: STEM_BY_TYPE[problem.questionType],
    ...choiceSet,
    evidence,
    explanation: `정답은 원문의 핵심 진술인 “${text(evidence, 420)}”의 의미와 범위, 인과관계를 바꾸지 않습니다. 나머지 선지는 핵심 요소 하나를 서로 다른 방식으로 변형했습니다.`,
    transformation: choiceSet.transformation || { kind: problem.questionType === "implied_meaning" ? "marked-expression" : "source-preserved" },
  };
}

function emotionQuestion(problem, source) {
  const originalChoices = Array.isArray(problem.choices) ? problem.choices.map((item) => text(item, 300)) : [];
  const originalAnswer = Number(problem.answer);
  if (originalChoices.length === 5 && originalAnswer >= 1 && originalAnswer <= 5 && new Set(originalChoices.map(comparable)).size === 5) {
    const patternOrder = ["POLARITY_REVERSAL", "SEQUENCE_REVERSAL", "LEXICAL_SUBSTITUTION", "PARTIAL_TRUTH"];
    const patterns = originalChoices.map((_, index) => index + 1 === originalAnswer ? null : patternOrder.shift());
    return {
      passage: source,
      stem: STEM_BY_TYPE.emotion_change,
      choices: originalChoices,
      answer: originalAnswer,
      choiceRationales: choiceMetadata(
        originalChoices,
        originalAnswer,
        patterns,
        "글의 시작과 끝에서 명시적으로 확인되는 심리 상태의 흐름과 일치합니다.",
      ),
      distractorPatterns: patterns.filter(Boolean),
      evidence: findCentralSentence(source),
      explanation: "사건의 시작과 끝에서 감정을 직접 나타내는 표현을 시간 순서대로 대조합니다. 감정 표현이 명시되지 않았다면 변화가 없다는 선지가 정답입니다.",
      transformation: { kind: "source-preserved" },
    };
  }
  throw new Error(`${problem.questionId}: 심경 변화 선지를 복원하지 못했습니다.`);
}

function factualQuestion(problem, source) {
  const sentences = splitSentences(source).filter((sentence) => englishWords(sentence).length >= 7);
  if (sentences.length < 4) throw new Error(`${problem.questionId}: 내용 일치용 원문 문장이 부족합니다.`);
  const existingFalse = currentCorrectChoice(problem);
  const matchedSource = sentences
    .map((sentence) => ({ sentence, score: tokenOverlap(sentence, existingFalse) }))
    .sort((left, right) => right.score - left.score)[0];
  const center = matchedSource?.score >= 0.45 ? matchedSource.sentence : findCentralSentence(source, existingFalse);
  const answerPosition = stableInteger(`${problem.questionId}:factual`) % 5;
  const existingFalseIsControlled = existingFalse
    && !comparable(source).includes(comparable(existingFalse))
    && englishWords(existingFalse).length >= 5
    && tokenOverlap(existingFalse, center) >= 0.45
    && existingFalse.length >= center.length * 0.45
    && existingFalse.length <= center.length * 1.8
    && splitSentences(existingFalse).length <= 1
    && !/\bnot\s+not\b|It is not true that|\b(?:doneed|movs|producting|sideed|driveing)\b/iu.test(existingFalse);
  const falseSentence = existingFalseIsControlled ? existingFalse : polarityMutation(center);
  const truthCandidates = [
    ...sentences,
    ...sentences.slice(0, -1).map((sentence, index) => `${sentence} ${sentences[index + 1]}`),
  ]
    .filter((sentence) => comparable(sentence) !== comparable(center))
    .filter((sentence, index, values) => values.findIndex((item) => comparable(item) === comparable(sentence)) === index)
    .sort((left, right) => Math.abs(left.length - falseSentence.length) - Math.abs(right.length - falseSentence.length));
  const trueSentences = truthCandidates.slice(0, 5);
  if (trueSentences.length < 5) throw new Error(`${problem.questionId}: 내용 일치 선지 다섯 개를 구성하지 못했습니다.`);
  const choices = trueSentences.slice(0, 5);
  choices[answerPosition] = falseSentence;
  if (new Set(choices.map(comparable)).size !== 5 || comparable(source).includes(comparable(choices[answerPosition]))) {
    choices[answerPosition] = mutate(center, "SCOPE_SHIFT", source);
  }
  const patterns = choices.map((_, index) => index === answerPosition ? null : "SOURCE_EVIDENCE");
  const rationales = choices.map((choice, index) => ({
    index: index + 1,
    text: choice,
    isCorrect: index === answerPosition,
    distractorPattern: index === answerPosition ? "POLARITY_REVERSAL" : "SOURCE_EVIDENCE",
    rationale: index === answerPosition
      ? "원문의 핵심 진술에서 긍정·부정 방향을 뒤집어 내용과 일치하지 않습니다."
      : PATTERN_RATIONALES.SOURCE_EVIDENCE,
  }));
  return {
    passage: source,
    stem: STEM_BY_TYPE.factual_description,
    choices,
    answer: answerPosition + 1,
    choiceRationales: rationales,
    distractorPatterns: ["POLARITY_REVERSAL"],
    evidence: center,
    explanation: `정답 선지는 원문의 “${text(center, 380)}”에서 의미 방향을 바꾸었으므로 글의 내용과 일치하지 않습니다. 나머지 네 선지는 원문에서 직접 확인됩니다.`,
    transformation: { kind: "single-factual-distortion", pattern: "LEXICAL_SUBSTITUTION" },
  };
}

function grammarWrongForm(value) {
  const word = text(value, 80);
  if (/ing$/iu.test(word)) return word.replace(/ing$/iu, "ed");
  if (/ied$/iu.test(word)) return word.replace(/ied$/iu, "ies");
  if (/ed$/iu.test(word)) return `${word.replace(/ed$/iu, "")}s`;
  if (/ies$/iu.test(word)) return word.replace(/ies$/iu, "y");
  if (/s$/iu.test(word) && !/ss$/iu.test(word)) return word.replace(/s$/iu, "");
  if (/y$/iu.test(word)) return word.replace(/y$/iu, "ies");
  return `${word}s`;
}

function markControlledWord(source, target, replacement, questionId) {
  const cleanSource = removeLegacyMarkers(source);
  const tokens = [...cleanSource.matchAll(/[A-Za-z]+(?:[-'][A-Za-z]+)*/gu)];
  const targetIndex = tokens.findIndex((match) => match[0].toLowerCase() === target.toLowerCase());
  if (targetIndex < 0) throw new Error(`${questionId}: 원문에서 통제 변형 대상 '${target}'을 찾지 못했습니다.`);
  const candidates = tokens
    .map((match, index) => ({ match, index }))
    .filter(({ match, index }) => index !== targetIndex
      && match[0].length >= 4
      && !STOP_WORDS.has(match[0].toLowerCase())
      && match[0].toLowerCase() !== replacement.toLowerCase())
    .filter(({ match }, index, values) => values.findIndex((item) => item.match[0].toLowerCase() === match[0].toLowerCase()) === index)
    .sort((left, right) => stableInteger(`${questionId}:${left.match[0]}`) - stableInteger(`${questionId}:${right.match[0]}`));
  const lengthMatched = candidates.filter(({ match }) => match[0].length >= Math.max(4, replacement.length * 0.55)
    && match[0].length <= replacement.length * 1.65);
  const markerCandidates = lengthMatched.length >= 4 ? lengthMatched : candidates;
  const selected = [{ match: tokens[targetIndex], target: true }, ...markerCandidates.slice(0, 4).map(({ match }) => ({ match, target: false }))]
    .sort((left, right) => Number(left.match.index) - Number(right.match.index));
  if (selected.length !== 5) throw new Error(`${questionId}: 밑줄 표시용 어휘가 부족합니다.`);
  let cursor = 0;
  let display = "";
  const choices = [];
  let answer = 0;
  selected.forEach((item, index) => {
    const start = Number(item.match.index);
    const original = item.match[0];
    const rendered = item.target ? replacement : original;
    display += `${cleanSource.slice(cursor, start)}${CIRCLED[index]}${rendered}`;
    cursor = start + original.length;
    choices.push(rendered);
    if (item.target) answer = index + 1;
  });
  display += cleanSource.slice(cursor);
  return { display, choices, answer, original: target, replacement };
}

function resolveSourceWord(source, requested) {
  const wanted = text(requested, 100).toLowerCase();
  const forms = new Set([wanted]);
  if (wanted.endsWith("ies")) forms.add(`${wanted.slice(0, -3)}y`);
  if (wanted.endsWith("ing")) {
    forms.add(wanted.slice(0, -3));
    forms.add(`${wanted.slice(0, -3)}e`);
  }
  if (wanted.endsWith("ed")) {
    forms.add(wanted.slice(0, -2));
    forms.add(`${wanted.slice(0, -2)}e`);
  }
  if (wanted.endsWith("s")) forms.add(wanted.slice(0, -1));
  const tokens = englishWords(removeLegacyMarkers(source));
  return tokens.find((token) => forms.has(token.toLowerCase())
    || forms.has(token.toLowerCase().replace(/s$/u, ""))) || "";
}

function grammarQuestion(problem, source) {
  const preferred = currentCorrectChoice(problem);
  const quoted = text(problem.question ?? problem.stem).match(/[‘']([^’']+)[’']/u)?.[1] || preferred;
  const requestedTarget = englishWords(quoted)[0] || englishWords(preferred)[0];
  const target = resolveSourceWord(source, requestedTarget) || englishWords(removeLegacyMarkers(source))
    .filter((word) => word.length >= 5 && !STOP_WORDS.has(word.toLowerCase()) && /(ing|ed|s)$/iu.test(word))
    .sort((left, right) => stableInteger(`${problem.questionId}:${left}`) - stableInteger(`${problem.questionId}:${right}`))[0];
  if (!target) throw new Error(`${problem.questionId}: 어법 변형 대상을 찾지 못했습니다.`);
  const marked = markControlledWord(source, target, grammarWrongForm(target), problem.questionId);
  const patterns = marked.choices.map((_, index) => index + 1 === marked.answer ? null : "SOURCE_EVIDENCE");
  return {
    passage: marked.display,
    stem: STEM_BY_TYPE.grammar,
    choices: marked.choices,
    answer: marked.answer,
    choiceRationales: choiceMetadata(
      marked.choices,
      marked.answer,
      patterns,
      `원문의 '${marked.original}'을 '${marked.replacement}'로 한 곳만 바꾸어 문장 구조에 맞지 않습니다.`,
    ),
    distractorPatterns: ["GRAMMAR_SINGLE_MUTATION"],
    evidence: `원문 어형: ${marked.original}`,
    explanation: `원문에서 '${marked.original}'이 쓰인 자리를 '${marked.replacement}'로 한 곳만 바꾸었습니다. 주어·동사 관계와 병렬 구조를 확인하면 ${CIRCLED[marked.answer - 1]}가 어법상 맞지 않습니다.`,
    transformation: { kind: "grammar-single-mutation", original: marked.original, replacement: marked.replacement },
  };
}

function vocabularyQuestion(problem, source) {
  const cleanSource = removeLegacyMarkers(source);
  let target = englishWords(cleanSource)
    .map((word) => word.toLowerCase())
    .find((word) => ANTONYMS[word] && word.length >= 4);
  let replacement = target ? ANTONYMS[target] : "";
  if (!target) {
    target = resolveSourceWord(cleanSource, currentCorrectChoice(problem)).toLowerCase();
    const substitutes = topKeywords(cleanSource, 20).filter((word) => word !== target);
    replacement = substitutes.find((word) => word.length >= Math.max(4, target.length - 4) && word.length <= target.length + 5)
      || substitutes[0]
      || "different";
  }
  if (!target || !replacement || target === replacement) {
    throw new Error(`${problem.questionId}: 문맥 어휘 변형 대상을 찾지 못했습니다.`);
  }
  const marked = markControlledWord(cleanSource, target, replacement, problem.questionId);
  const patterns = marked.choices.map((_, index) => index + 1 === marked.answer ? null : "SOURCE_EVIDENCE");
  return {
    passage: marked.display,
    stem: STEM_BY_TYPE.vocabulary,
    choices: marked.choices,
    answer: marked.answer,
    choiceRationales: choiceMetadata(
      marked.choices,
      marked.answer,
      patterns,
      `'${marked.original}'을 문맥상 반대 방향인 '${marked.replacement}'로 바꾸어 글의 의미 흐름과 어긋납니다.`,
    ),
    distractorPatterns: ["POLARITY_REVERSAL"],
    evidence: `원문 어휘: ${marked.original}`,
    explanation: `원문의 '${marked.original}'을 반대 의미인 '${marked.replacement}'로 한 곳만 바꾸었습니다. 앞뒤 문장의 의미 방향과 대조하면 ${CIRCLED[marked.answer - 1]}가 문맥상 적절하지 않습니다.`,
    transformation: { kind: "vocabulary-antonym-mutation", original: marked.original, replacement: marked.replacement },
  };
}

function extractBlankSentence(problem) {
  const stem = text(problem.question ?? problem.stem, 8_000);
  const afterInstruction = stem.includes("고르시오.") ? stem.slice(stem.indexOf("고르시오.") + "고르시오.".length) : stem;
  return text(afterInstruction);
}

function shortBlankCandidates(correct, source, questionId) {
  const normalized = text(correct, 100).toLowerCase();
  const correctTags = new Set((nlp(normalized).json()[0]?.terms?.[0]?.tags) || []);
  const primaryTag = ["Adverb", "Adjective", "Verb", "Noun"].find((tag) => correctTags.has(tag)) || "Noun";
  const sourceTerms = nlp(source).json()
    .flatMap((sentence) => sentence.terms || [])
    .filter((term) => Array.isArray(term.tags)
      && term.tags.includes(primaryTag)
      && !term.tags.some((tag) => ["Pronoun", "Value", "Abbreviation", "Determiner"].includes(tag)))
    .map((term) => text(term.normal || term.text, 100).toLowerCase())
    .filter((item) => englishWords(item).length === 1)
    .filter((item) => {
      if (correctTags.has("Plural")) return /s$/u.test(item);
      if (correctTags.has("Comparative")) return /er$/u.test(item);
      return true;
    });
  const suffix = normalized.endsWith("er") ? "comparative"
    : normalized.endsWith("ly") ? "adverb"
      : normalized.endsWith("ing") ? "ing"
        : normalized.endsWith("ed") ? "ed"
          : normalized.endsWith("s") ? "plural"
            : "base";
  const pools = {
    comparative: ["colder", "smaller", "slower", "lower", "weaker", "nearer"],
    adverb: ["rarely", "quietly", "widely", "closely", "strongly", "clearly"],
    ing: ["changing", "reducing", "supporting", "avoiding", "increasing", "limiting"],
    ed: ["reduced", "limited", "changed", "supported", "prevented", "required"],
    plural: topKeywords(source, 30).filter((word) => word.endsWith("s")),
    base: topKeywords(source, 20),
  };
  const antonym = ANTONYMS[normalized];
  const typedPool = pools[suffix] || [];
  const candidates = [antonym, ...sourceTerms, ...typedPool, ...(typedPool.length < 4 ? topKeywords(source, 24) : [])]
    .map((item) => text(item, 100).toLowerCase())
    .filter((item) => item.length >= 3 && /^[a-z]+(?:[-'][a-z]+)?$/u.test(item))
    .filter((item) => !STOP_WORDS.has(item) && !GENERIC_CONCEPTS.has(item))
    .filter((item) => {
      const tags = new Set((nlp(item).json()[0]?.terms?.[0]?.tags) || []);
      return !["Pronoun", "Value", "Abbreviation", "Determiner"].some((tag) => tags.has(tag));
    })
    .filter((item) => comparable(item) !== comparable(normalized))
    .filter((item, index, values) => values.indexOf(item) === index)
    .sort((left, right) => stableInteger(`${questionId}:${left}`) - stableInteger(`${questionId}:${right}`))
    .slice(0, 4);
  if (candidates.length !== 4) throw new Error(`${questionId}: 단어형 빈칸 오답 네 개를 만들지 못했습니다.`);
  return candidates;
}

function shortBlankQuestion(problem, source) {
  const correct = currentCorrectChoice(problem);
  if (!correct || englishWords(correct).length !== 1) throw new Error(`${problem.questionId}: 단어형 빈칸 정답을 찾지 못했습니다.`);
  const blankTemplate = extractBlankSentence(problem);
  const candidates = splitSentences(source)
    .filter((sentence) => new RegExp(`\\b${escapeRegExp(correct)}\\b`, "iu").test(sentence))
    .map((sentence) => ({ sentence, score: tokenOverlap(sentence, blankTemplate.replace(/_{3,}/gu, "")) }))
    .sort((left, right) => right.score - left.score);
  const targetSentence = candidates[0]?.sentence;
  if (!targetSentence) throw new Error(`${problem.questionId}: 빈칸 정답이 포함된 원문 문장을 찾지 못했습니다.`);
  const blankedSentence = replaceFirstWord(targetSentence, correct, "________");
  const passage = source.replace(targetSentence, blankedSentence);
  const wrong = shortBlankCandidates(correct, source, problem.questionId);
  const answerPosition = stableInteger(`${problem.questionId}:short-blank`) % 5;
  const choices = [];
  const patterns = [];
  let cursor = 0;
  const patternPool = ["LEXICAL_SUBSTITUTION", "POLARITY_REVERSAL", "SCOPE_SHIFT", "ABSTRACT_CONCRETE_SHIFT"];
  for (let index = 0; index < 5; index += 1) {
    if (index === answerPosition) {
      choices.push(correct);
      patterns.push(null);
    } else {
      choices.push(wrong[cursor]);
      patterns.push(patternPool[cursor]);
      cursor += 1;
    }
  }
  return {
    passage,
    stem: STEM_BY_TYPE.blank_short,
    choices,
    answer: answerPosition + 1,
    choiceRationales: choiceMetadata(
      choices,
      answerPosition + 1,
      patterns,
      "원문의 해당 자리에 실제로 사용된 낱말이며 문법과 의미를 모두 만족합니다.",
    ),
    distractorPatterns: patternPool,
    evidence: targetSentence,
    explanation: `원문 문장 “${text(targetSentence, 420)}”에서 '${correct}'이 있던 자리를 빈칸으로 만들었습니다. 문장 구조와 문맥을 함께 만족하는 것은 ${CIRCLED[answerPosition]}입니다.`,
    transformation: {
      kind: "word-blank",
      removedText: correct,
      blankCount: (passage.match(/________/gu) || []).length,
      reconstructionValid: comparable(passage.replace("________", correct)) === comparable(source),
    },
  };
}

function chunkIntoThree(source) {
  const sentences = splitSentences(source);
  if (sentences.length < 3) throw new Error("A/B/C 배열을 만들 원문 단위가 부족합니다.");
  const firstEnd = Math.max(1, Math.round(sentences.length / 3));
  const secondEnd = Math.max(firstEnd + 1, Math.round((sentences.length * 2) / 3));
  return [
    sentences.slice(0, firstEnd).join(" "),
    sentences.slice(firstEnd, secondEnd).join(" "),
    sentences.slice(secondEnd).join(" "),
  ];
}

function permutations(values) {
  if (values.length <= 1) return [values];
  return values.flatMap((value, index) => permutations(values.filter((_, nested) => nested !== index)).map((tail) => [value, ...tail]));
}

function paragraphOrderQuestion(problem, source) {
  if (/\bw\s+[A-Z][A-Za-z]|\b(?:Date\s*&\s*Time|Admission\s*\(Price\)|Booking\s+Information|Who\s+should\s+apply|What\s+to\s+submit|Where\s+to\s+send)\b/iu.test(source)) {
    throw new Error(`${problem.questionId}: 목록·신청서형 원문은 문단 순서 배열에 사용하지 않습니다.`);
  }
  const normalizedSource = removeLegacyAlphabetMarkers(splitSentences(source).join(" "));
  const chunks = chunkIntoThree(normalizedSource);
  if (chunks.some((chunk) => !/^[“”"'‘’(\[]*[A-Z0-9]/u.test(chunk))) {
    throw new Error(`${problem.questionId}: A/B/C 원문 단위가 완전한 문장으로 시작하지 않습니다.`);
  }
  const sourceOrder = [0, 1, 2];
  const displayOrder = [...sourceOrder].sort((left, right) => stableInteger(`${problem.questionId}:chunk:${left}`) - stableInteger(`${problem.questionId}:chunk:${right}`));
  if (displayOrder.every((value, index) => value === index)) [displayOrder[0], displayOrder[1]] = [displayOrder[1], displayOrder[0]];
  const labels = ["A", "B", "C"];
  const originalToLabel = new Map(displayOrder.map((originalIndex, labelIndex) => [originalIndex, labels[labelIndex]]));
  const correctOrder = sourceOrder.map((index) => originalToLabel.get(index));
  const correctChoice = `(${correctOrder.join(")-(")})`;
  const allChoices = permutations(labels).map((items) => `(${items.join(")-(")})`);
  const wrongChoices = allChoices
    .filter((choice) => choice !== correctChoice)
    .sort((left, right) => stableInteger(`${problem.questionId}:${left}`) - stableInteger(`${problem.questionId}:${right}`))
    .slice(0, 4);
  const answerPosition = stableInteger(`${problem.questionId}:order-answer`) % 5;
  const choices = [];
  let cursor = 0;
  for (let index = 0; index < 5; index += 1) {
    choices.push(index === answerPosition ? correctChoice : wrongChoices[cursor++]);
  }
  const passage = displayOrder.map((originalIndex, index) => `(${labels[index]}) ${chunks[originalIndex]}`).join("\n\n");
  return {
    passage,
    stem: STEM_BY_TYPE.paragraph_order,
    choices,
    answer: answerPosition + 1,
    choiceRationales: choices.map((choice, index) => ({
      index: index + 1,
      text: choice,
      isCorrect: index === answerPosition,
      distractorPattern: index === answerPosition ? null : "SEQUENCE_REVERSAL",
      rationale: index === answerPosition
        ? "원문의 문장 전개 순서를 그대로 복원합니다."
        : PATTERN_RATIONALES.SEQUENCE_REVERSAL,
    })),
    distractorPatterns: ["SEQUENCE_REVERSAL"],
    evidence: chunks.join(" "),
    explanation: `대명사·연결어·시간 흐름을 따라 원문을 복원하면 ${correctChoice} 순서입니다.`,
    transformation: {
      kind: "paragraph-order",
      chunks,
      displayOrder,
      correctOrder,
      reconstructionValid: comparable(correctOrder.map((label) => chunks[displayOrder[labels.indexOf(label)]]).join(" ")) === comparable(normalizedSource),
    },
  };
}

function legacyInsertionQuestion(problem, source) {
  const raw = text(problem.question ?? problem.stem, 20_000);
  const givenMatch = raw.match(/\[주어진\s*문장\]\s*([\s\S]*?)(?=\s*(?:\[남은\s*글\]|[①②③④⑤]))/u);
  const given = text(givenMatch?.[1], 4_000);
  const givenIndex = source.indexOf(given);
  if (!given || givenIndex < 0) {
    throw new Error(`${problem.questionId}: 기존 문장 삽입 구조를 복원하지 못했습니다.`);
  }
  const sourceWithoutGiven = text(`${source.slice(0, givenIndex)} ${source.slice(givenIndex + given.length)}`);
  const segments = splitSentences(sourceWithoutGiven);
  while (segments.length < 4) {
    const longestIndex = segments.reduce(
      (best, item, index) => item.length > segments[best].length ? index : best,
      0,
    );
    const longest = segments[longestIndex];
    const commaIndexes = [...longest.matchAll(/,\s+/gu)].map((match) => Number(match.index) + match[0].length);
    const cut = commaIndexes.sort((left, right) => Math.abs(left - longest.length / 2) - Math.abs(right - longest.length / 2))[0];
    if (cut) {
      segments.splice(longestIndex, 1, text(longest.slice(0, cut)), text(longest.slice(cut)));
    } else {
      const words = longest.split(/\s+/u);
      const wordCut = Math.max(1, Math.floor(words.length / 2));
      segments.splice(longestIndex, 1, words.slice(0, wordCut).join(" "), words.slice(wordCut).join(" "));
    }
  }
  const beforeCount = segments.filter((segment) => source.indexOf(segment) >= 0 && source.indexOf(segment) < givenIndex).length;
  const insertionIndex = Math.min(4, Math.max(0, beforeCount));
  const displayParts = [];
  for (let index = 0; index <= 4; index += 1) {
    displayParts.push(`( ${CIRCLED[index]} )`);
    if (index < 4) displayParts.push(segments[index]);
  }
  const remaining = displayParts.join(" ");
  const answer = insertionIndex + 1;
  const choices = CIRCLED.map((marker) => `위치 ${marker}`);
  const reconstructed = [...segments.slice(0, insertionIndex), given, ...segments.slice(insertionIndex)].join(" ");
  const normalizedSource = splitSentences(source).join(" ");
  return {
    passage: `[주어진 문장] ${given}\n\n[남은 글] ${remaining}`,
    stem: STEM_BY_TYPE.sentence_insertion,
    choices,
    answer,
    choiceRationales: choices.map((choice, index) => ({
      index: index + 1,
      text: choice,
      isCorrect: index + 1 === answer,
      distractorPattern: index + 1 === answer ? null : "SEQUENCE_REVERSAL",
      rationale: index + 1 === answer
        ? "주어진 문장을 넣으면 원문에서 확인되는 전개가 복원됩니다."
        : "주어진 문장의 지시어와 앞뒤 핵심어가 동시에 연결되지 않습니다.",
    })),
    distractorPatterns: ["SEQUENCE_REVERSAL"],
    evidence: given,
    explanation: `주어진 문장은 원문에서 ${CIRCLED[answer - 1]} 위치에 놓입니다. 앞뒤 핵심어와 지시어가 모두 이어지는 위치를 확인합니다.`,
    transformation: {
      kind: "sentence-insertion-source-reconstruction",
      given,
      originalIndex: insertionIndex,
      reconstructionValid: comparable(reconstructed) === comparable(normalizedSource),
    },
  };
}

function sentenceInsertionQuestion(problem, source) {
  const sentences = splitSentences(source);
  if (sentences.length < 6) return legacyInsertionQuestion(problem, source);
  const normalizedSource = sentences.join(" ");
  const targetIndex = Math.min(5, Math.max(1, Math.floor(sentences.length / 2)));
  const given = sentences[targetIndex];
  const remaining = sentences.filter((_, index) => index !== targetIndex);
  const marked = remaining.map((sentence, index) => index < 5 ? `${sentence} ( ${CIRCLED[index]} )` : sentence).join(" ");
  const choices = CIRCLED.map((marker) => `위치 ${marker}`);
  const answer = targetIndex;
  return {
    passage: `[주어진 문장] ${given}\n\n[남은 글] ${marked}`,
    stem: STEM_BY_TYPE.sentence_insertion,
    choices,
    answer,
    choiceRationales: choices.map((choice, index) => ({
      index: index + 1,
      text: choice,
      isCorrect: index + 1 === answer,
      distractorPattern: index + 1 === answer ? null : "SEQUENCE_REVERSAL",
      rationale: index + 1 === answer
        ? "주어진 문장을 넣으면 원문의 문장 순서가 정확히 복원됩니다."
        : "주어진 문장의 지시어와 앞뒤 핵심어가 동시에 연결되지 않습니다.",
    })),
    distractorPatterns: ["SEQUENCE_REVERSAL"],
    evidence: given,
    explanation: `주어진 문장의 원래 위치는 ${CIRCLED[answer - 1]}입니다. 앞 문장에서 소개된 핵심어가 주어진 문장으로 이어지고 다음 문장에서 계속 전개됩니다.`,
    transformation: {
      kind: "sentence-insertion",
      given,
      originalIndex: targetIndex,
      reconstructionValid: comparable([...remaining.slice(0, targetIndex), given, ...remaining.slice(targetIndex)].join(" ")) === comparable(normalizedSource),
    },
  };
}

function numberedSegments(value) {
  const input = text(value, 20_000);
  const markers = [...input.matchAll(/[①②③④⑤]/gu)].slice(0, 5);
  if (markers.length !== 5) return [];
  return markers.map((marker, index) => {
    const start = Number(marker.index) + marker[0].length;
    const end = index < 4 ? Number(markers[index + 1].index) : input.length;
    return text(input.slice(start, end), 4_000);
  });
}

function irrelevantQuestion(problem, source) {
  const segments = numberedSegments(problem.question ?? problem.stem);
  const answer = Number(problem.answer);
  if (segments.length !== 5 || answer < 1 || answer > 5) {
    throw new Error(`${problem.questionId}: 무관한 문장 구조를 복원하지 못했습니다.`);
  }
  const choices = CIRCLED.map((marker) => `문장 ${marker}`);
  return {
    passage: segments.map((segment, index) => `${CIRCLED[index]} ${segment}`).join(" "),
    stem: STEM_BY_TYPE.irrelevant_sentence,
    choices,
    answer,
    choiceRationales: choices.map((choice, index) => ({
      index: index + 1,
      text: choice,
      isCorrect: index + 1 === answer,
      distractorPattern: index + 1 === answer ? "ADJACENT_TOPIC" : "SOURCE_EVIDENCE",
      rationale: index + 1 === answer
        ? "소재 일부가 비슷해 보여도 앞뒤 문장의 핵심어와 지시어가 연결되지 않습니다."
        : "앞뒤 문장의 화제와 논리 전개를 이어 주는 원문 문장입니다.",
    })),
    distractorPatterns: ["ADJACENT_TOPIC"],
    evidence: segments.filter((_, index) => index + 1 !== answer).join(" "),
    explanation: `${CIRCLED[answer - 1]}는 앞뒤 문장의 중심 화제와 지시어 연결에서 벗어납니다. 나머지 네 문장은 원문의 논리 흐름을 순서대로 이어 줍니다.`,
    transformation: { kind: "irrelevant-sentence", insertedSentence: segments[answer - 1], answer },
  };
}

function summaryQuestion(problem, source) {
  const central = findCentralSentence(source, currentCorrectChoice(problem));
  const centralConcepts = conceptPhrases(central, 8)
    .filter((item) => englishWords(item).length <= 3)
    .filter((item, index, values) => values.findIndex((other) => comparable(other) === comparable(item)) === index);
  const fallbackWords = topKeywords(central, 12).filter((item) => !centralConcepts.some((concept) => comparable(concept) === comparable(item)));
  const pair = [...centralConcepts, ...fallbackWords].slice(0, 2).map((item) => text(item, 100));
  if (pair.length !== 2 || pair.some((item) => !item)) throw new Error(`${problem.questionId}: 요약문 핵심어 두 개를 찾지 못했습니다.`);
  const pairMatchers = pair.map((item) => new RegExp(`\\b${escapeRegExp(item)}\\b`, "iu"));
  if (pairMatchers.some((matcher) => !matcher.test(central))) throw new Error(`${problem.questionId}: 요약문 핵심어가 중심 문장에 없습니다.`);
  let summary = central.replace(pairMatchers[0], "(A)");
  summary = summary.replace(pairMatchers[1], "(B)");
  const alternatives = conceptPhrases(source, 16)
    .filter((item) => englishWords(item).length <= 3)
    .filter((item) => !pair.some((correctItem) => comparable(correctItem) === comparable(item)))
    .filter((item, index, values) => values.findIndex((other) => comparable(other) === comparable(item)) === index);
  const keywordAlternatives = topKeywords(source, 24)
    .filter((item) => !pair.map((correctItem) => correctItem.toLowerCase()).includes(item));
  const keywords = [...alternatives, ...keywordAlternatives]
    .filter((item, index, values) => values.findIndex((other) => comparable(other) === comparable(item)) === index)
    .slice(0, 4);
  if (keywords.length < 4) throw new Error(`${problem.questionId}: 요약문 오답 핵심어 네 개를 찾지 못했습니다.`);
  const correct = `${pair[0]} / ${pair[1]}`;
  const wrong = [
    { text: `${pair[1]} / ${pair[0]}`, pattern: "ROLE_TARGET_SWAP" },
    { text: `${keywords[0]} / ${pair[1]}`, pattern: "LEXICAL_SUBSTITUTION" },
    { text: `${pair[0]} / ${keywords[1]}`, pattern: "PARTIAL_TRUTH" },
    { text: `${keywords[2]} / ${keywords[3]}`, pattern: "ABSTRACT_CONCRETE_SHIFT" },
  ];
  const answerPosition = stableInteger(`${problem.questionId}:summary`) % 5;
  const choices = [];
  const patterns = [];
  let cursor = 0;
  for (let index = 0; index < 5; index += 1) {
    if (index === answerPosition) {
      choices.push(correct);
      patterns.push(null);
    } else {
      choices.push(wrong[cursor].text);
      patterns.push(wrong[cursor].pattern);
      cursor += 1;
    }
  }
  return {
    passage: source,
    stem: `${STEM_BY_TYPE.summary}\n${summary}`,
    choices,
    answer: answerPosition + 1,
    choiceRationales: choiceMetadata(
      choices,
      answerPosition + 1,
      patterns,
      "원문의 핵심 주어와 결론을 유지하면서 세부 사례만 덜어 낸 요약입니다.",
    ),
    distractorPatterns: wrong.map((item) => item.pattern),
    evidence: central,
    explanation: `원문의 중심 문장에서 '${pair[0]}'과 '${pair[1]}'을 각각 (A), (B)로 바꾸었습니다. 두 자리를 원문과 같은 의미 관계로 복원하는 조합은 ${CIRCLED[answerPosition]} ${correct}입니다.`,
    transformation: {
      kind: "summary-pair",
      correctPair: pair,
      sourceSentence: central,
      reconstructionValid: comparable(summary.replace("(A)", pair[0]).replace("(B)", pair[1])) === comparable(central),
    },
  };
}

function grammarCorrectionQuestion(problem, source) {
  const answer = text(problem.answer, 2_000);
  if (!answer
    || comparable(answer).length < 10
    || !comparable(source).includes(comparable(answer))) {
    throw new Error(`${problem.questionId}: 어법 오류 수정 정답을 원문에서 복원하지 못했습니다.`);
  }
  return {
    passage: source,
    stem: text(problem.question ?? problem.stem, 8_000),
    choices: [],
    answer,
    choiceRationales: [],
    distractorPatterns: [],
    evidence: answer,
    explanation: `변형 문장을 원문의 문장 구조와 비교하면 바르게 고친 전체 문장은 “${answer}”입니다. 의미는 유지하고 어형과 수 일치만 바로잡습니다.`,
    transformation: { kind: "grammar-correction", correctedSentence: answer },
  };
}

function writingSourceSentence(problem, source) {
  const candidates = splitSentences(source)
    .filter((sentence) => {
      const count = englishWords(sentence).length;
      return count >= 10 && count <= 28;
    });
  if (!candidates.length) throw new Error(`${problem.questionId}: 서술형에 사용할 원문 문장을 찾지 못했습니다.`);
  const central = findCentralSentence(source);
  const centralMatch = candidates.find((sentence) => comparable(sentence) === comparable(central));
  return centralMatch || candidates[stableInteger(`${problem.questionId}:writing-source`) % candidates.length];
}

function phraseChunks(sentence, count = 4) {
  const words = text(sentence, 4_000).split(/\s+/u).filter(Boolean);
  const chunks = [];
  let cursor = 0;
  for (let index = 0; index < count; index += 1) {
    const remainingWords = words.length - cursor;
    const remainingChunks = count - index;
    const size = Math.ceil(remainingWords / remainingChunks);
    chunks.push(words.slice(cursor, cursor + size).join(" "));
    cursor += size;
  }
  return chunks.filter(Boolean);
}

function writingReorderQuestion(problem, source) {
  const answer = writingSourceSentence(problem, source);
  const chunks = phraseChunks(answer);
  if (chunks.length !== 4) throw new Error(`${problem.questionId}: 어구 배열 단위를 만들지 못했습니다.`);
  const rotation = (stableInteger(`${problem.questionId}:writing-reorder`) % 3) + 1;
  const shuffled = [...chunks.slice(rotation), ...chunks.slice(0, rotation)];
  return {
    passage: source,
    stem: `글의 문맥에 맞게 <보기>의 어구를 모두 한 번씩 사용하여 원문의 문장을 완성하시오.\n<보기> ${shuffled.join(" / ")}`,
    choices: [],
    answer,
    choiceRationales: [],
    distractorPatterns: [],
    evidence: answer,
    explanation: "각 어구의 수식 관계와 문장 성분을 연결하면 원문 문장과 같은 순서가 됩니다. 제시된 어구는 빠뜨리거나 반복하지 않고 모두 한 번씩 사용합니다.",
    transformation: {
      kind: "writing-reorder",
      sourceSentence: answer,
      sourcePhrases: chunks,
      shuffledPhrases: shuffled,
      reconstructionValid: comparable(chunks.join(" ")) === comparable(answer),
    },
  };
}

function writingConditionalQuestion(problem, source) {
  const answer = writingSourceSentence(problem, source);
  const answerWords = englishWords(answer);
  const keywords = topKeywords(answer, 8).slice(0, 3);
  if (keywords.length < 3) throw new Error(`${problem.questionId}: 조건 영작 제시어를 만들지 못했습니다.`);
  return {
    passage: source,
    stem: `글의 문맥에 맞게 원문의 문장을 영작하시오.\n<조건> 제시어 ${keywords.join(", ")}를 모두 사용할 것 / 총 ${answerWords.length}단어 / 제시어의 어형은 원문에 맞게 사용할 것`,
    choices: [],
    answer,
    choiceRationales: [],
    distractorPatterns: [],
    evidence: answer,
    explanation: `원문의 논리 관계와 어순을 유지하면서 제시어 ${keywords.join(", ")}를 모두 사용해야 합니다. 정답은 원문에서 확인되는 ${answerWords.length}단어 문장입니다.`,
    transformation: {
      kind: "writing-conditional",
      sourceSentence: answer,
      requiredWords: keywords,
      expectedWordCount: answerWords.length,
      reconstructionValid: keywords.every((keyword) => new RegExp(`\\b${escapeRegExp(keyword)}\\b`, "iu").test(answer)),
    },
  };
}

function questionPayload(problem, source) {
  if (SEMANTIC_TYPES.has(problem.questionType)) return semanticQuestion(problem, source);
  if (problem.questionType === "emotion_change") return emotionQuestion(problem, source);
  if (problem.questionType === "factual_description") return factualQuestion(problem, source);
  if (problem.questionType === "grammar") return grammarQuestion(problem, source);
  if (problem.questionType === "vocabulary") return vocabularyQuestion(problem, source);
  if (problem.questionType === "blank_short") return shortBlankQuestion(problem, source);
  if (problem.questionType === "irrelevant_sentence") return irrelevantQuestion(problem, source);
  if (problem.questionType === "paragraph_order") return paragraphOrderQuestion(problem, source);
  if (problem.questionType === "sentence_insertion") return sentenceInsertionQuestion(problem, source);
  if (problem.questionType === "summary") return summaryQuestion(problem, source);
  if (problem.questionType === "writing_reorder") return writingReorderQuestion(problem, source);
  if (problem.questionType === "writing_conditional") return writingConditionalQuestion(problem, source);
  if (problem.questionType === "grammar_correction") return grammarCorrectionQuestion(problem, source);
  throw new Error(`${problem.questionId}: 지원하지 않는 변형문제 유형 ${problem.questionType}`);
}

function validateQuestion(question) {
  const issues = [];
  const choiceQuestion = CHOICE_TYPES.has(question.type);
  if (!question.sourcePassage || englishWords(question.sourcePassage).length < 40) issues.push("source_passage_missing");
  if (!question.passage || englishWords(question.passage).length < 20) issues.push("display_passage_missing");
  if (!question.stem || question.stem.length < 8) issues.push("stem_missing");
  if (choiceQuestion && question.choices.length !== 5) issues.push("choice_count_not_five");
  if (choiceQuestion && (!Number.isInteger(question.answer) || question.answer < 1 || question.answer > 5)) issues.push("answer_out_of_range");
  if (choiceQuestion && new Set(question.choices.map(comparable)).size !== 5) issues.push("duplicate_choices");
  if (OPEN_ENDED_TYPES.has(question.type)) {
    if (typeof question.answer !== "string" || englishWords(question.answer).length < 6) issues.push("open_answer_missing");
    if (!comparable(question.sourcePassage).includes(comparable(question.answer))) issues.push("open_answer_not_in_source");
  }
  if (choiceQuestion) {
    const lengths = question.choices.map((choice) => choice.length).sort((left, right) => left - right);
    const medianLength = lengths[2] || 0;
    const correctLength = question.choices[Number(question.answer) - 1]?.length || 0;
    if (!["grammar", "vocabulary", "blank_short"].includes(question.type)
      && medianLength
      && (correctLength > medianLength * 2.5 || correctLength < medianLength * 0.35)) {
      issues.push("correct_choice_length_outlier");
    }
    const choiceText = question.choices.join(" ");
    if (/It is not true that|In every situation without exception|regardless of the remaining conditions|\bnot\s+not\b|\bcannot\s+not\b|\bto\s+do\s+not\b|\b(?:a|an)\s+all\b|,\s*,|\ba\s+(?:old|unusual|important|effective)\b|\ban\s+(?:new|useful|major|minor)\b/iu.test(choiceText)) {
      issues.push("implausible_choice_wording");
    }
    if (/\b(?:based|depends?|relies?|rests?)\s+while\b|^Only\s+(?:(?:who|what|where|when)\s*:|but\b|and\b|or\b|however\b|although\b|because\b)/imu.test(choiceText)) {
      issues.push("broken_choice_grammar");
    }
    if (question.type === "blank_short" && question.choices.some((choice) => {
      const normalized = text(choice, 100).toLowerCase();
      const tags = new Set((nlp(normalized).json()[0]?.terms?.[0]?.tags) || []);
      return normalized.length < 3
        || GENERIC_CONCEPTS.has(normalized)
        || ["Pronoun", "Value", "Abbreviation", "Determiner"].some((tag) => tags.has(tag));
    })) issues.push("invalid_short_blank_choice");
  }
  if (SEMANTIC_TYPES.has(question.type)) {
    const used = new Set(question.choiceRationales.filter((item) => !item.isCorrect).map((item) => item.distractorPattern));
    if (used.size !== 4) issues.push("distractor_patterns_not_distinct");
  }
  if (["blank_short", "blank_long"].includes(question.type)) {
    if ((question.passage.match(/________/gu) || []).length !== 1) issues.push("blank_count_not_one");
    if (!question.transformation?.reconstructionValid) issues.push("blank_reconstruction_failed");
  }
  if (["purpose", "claim", "main_idea", "implied_meaning", "blank_long"].includes(question.type)) {
    const correct = question.choices[Number(question.answer) - 1] || "";
    const malformed = question.choices.some((choice, index) => index + 1 !== Number(question.answer) && !naturalChoice(choice, correct));
    if (malformed) issues.push("semantic_distractor_not_plausible");
  }
  if (question.type === "summary" && !question.transformation?.reconstructionValid) issues.push("summary_reconstruction_failed");
  if (["writing_reorder", "writing_conditional"].includes(question.type)
    && !question.transformation?.reconstructionValid) {
    issues.push("writing_reconstruction_failed");
  }
  if (["paragraph_order", "sentence_insertion"].includes(question.type) && !question.transformation?.reconstructionValid) {
    issues.push("source_reconstruction_failed");
  }
  if (["blank_short", "blank_long", "paragraph_order", "sentence_insertion", "irrelevant_sentence"].includes(question.type)) {
    const sourceComparable = comparable(question.sourcePassage);
    const stemComparable = comparable(question.stem);
    if (sourceComparable.length > 180 && stemComparable.includes(sourceComparable.slice(0, 180))) issues.push("source_duplicated_in_stem");
  }
  if (/정답\s*신뢰도|자동\s*대조|AI\s*생성|모델\s*검증/iu.test(question.explanation)) issues.push("internal_ai_phrase_exposed");
  if (!question.explanation || question.explanation.length < 45) issues.push("explanation_too_short");
  return { valid: issues.length === 0, issues };
}

export function correctVariantQuestion(problem, { typeLabel, difficulty } = {}) {
  const sourcePassage = text(problem.sourcePassage ?? problem.passage, 40_000);
  const displaySource = removeLegacyMarkers(sourcePassage);
  const normalizedProblem = {
    ...problem,
    questionId: text(problem.questionId ?? problem.id, 160),
    questionType: text(problem.questionType ?? problem.type, 80),
    question: text(problem.question ?? problem.stem, 20_000),
    choices: Array.isArray(problem.choices) ? problem.choices.map((item) => text(item, 8_000)) : [],
    answer: problem.answer,
  };
  const payload = questionPayload(normalizedProblem, displaySource);
  const corrected = {
    questionId: normalizedProblem.questionId,
    sourceId: text(problem.sourceId, 200),
    sourcePassageId: text(problem.sourcePassageId, 200),
    type: normalizedProblem.questionType,
    typeLabel: typeLabel || text(problem.typeLabel, 100) || normalizedProblem.questionType,
    difficulty: Number(difficulty ?? problem.difficulty) || 3,
    sourcePassage,
    passage: payload.passage,
    stem: payload.stem,
    choices: payload.choices,
    answer: payload.answer,
    explanation: payload.explanation,
    choiceRationales: payload.choiceRationales,
    distractorPatterns: payload.distractorPatterns,
    evidence: payload.evidence,
    transformation: payload.transformation,
    correctionVersion: "source-grounded-variant-v4",
  };
  const validation = validateQuestion(corrected);
  if (!validation.valid) {
    throw new Error(`${corrected.questionId}: 교정 검수 실패 - ${validation.issues.join(", ")}`);
  }
  return { ...corrected, validation };
}

export function validateCorrectedVariantQuestion(question) {
  return validateQuestion(question);
}

export const VARIANT_QUESTION_CORRECTION_VERSION = "source-grounded-variant-v4";
