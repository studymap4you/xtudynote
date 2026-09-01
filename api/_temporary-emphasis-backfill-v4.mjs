import crypto from "node:crypto";
import { getProblemBankFirestore } from "./_lib/problem-bank/admin.mjs";

const TOKEN = "xubf3_20260901_F7kQ2r9Lm4";
const DATASET_ID = "xtudy-mock-exam-11-variants-v1";
const FORMATTING_VERSION = "emphasis-backfill-v4-exact";
const TARGET_TYPES = new Set(["grammar", "vocabulary", "implied_meaning"]);
const SESSIONS = [
  [1, 2025, 3], [1, 2025, 6], [1, 2025, 9], [1, 2025, 10], [1, 2026, 3], [1, 2026, 6],
  [2, 2025, 3], [2, 2025, 6], [2, 2025, 9], [2, 2025, 10], [2, 2026, 3], [2, 2026, 6],
];
const CIRCLED = ["①", "②", "③", "④", "⑤"];
const NEXT_PAGE = /\s+Xtudy Universe(?:\s*[|·]\s*|\s+)/u;

function text(value, max = 50000) {
  return String(value ?? "").normalize("NFC").replace(/\u0000/gu, "").trim().slice(0, max);
}
function compact(value, max = 50000) {
  return text(value, max).replace(/[\t\r\n]+/gu, " ").replace(/\s+/gu, " ").trim();
}
function hash(value) { return crypto.createHash("sha256").update(String(value)).digest("hex"); }
function esc(value) { return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"); }
function flexPattern(value) {
  const tokens = compact(value, 2000).split(/\s+/u).filter(Boolean);
  return tokens.length ? new RegExp(tokens.map(esc).join("\\s+"), "u") : null;
}
function findRange(source, candidate, from = 0, to = source.length) {
  const pattern = flexPattern(candidate);
  if (!pattern) return null;
  const segment = source.slice(Math.max(0, from), Math.min(source.length, to));
  const match = pattern.exec(segment);
  if (!match || match.index === undefined) return null;
  const start = Math.max(0, from) + match.index;
  return { start, end: start + match[0].length };
}
function normalizedRanges(ranges, length) {
  const unique = new Map();
  for (const range of ranges) {
    const start = Number(range?.start), end = Number(range?.end);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > length) continue;
    const style = range?.style === "underline" ? "underline" : "bold";
    unique.set(`${start}:${end}:${style}`, { target: "passage", start, end, style, source: compact(range?.source, 100) || "v4" });
  }
  return [...unique.values()].sort((a,b) => a.start-b.start || a.end-b.end);
}
function existing(problem, passage) {
  return Array.isArray(problem?.emphasisRanges)
    ? normalizedRanges(problem.emphasisRanges.filter((r) => r?.target === "passage"), passage.length)
    : [];
}
function stripFooter(value) {
  const match = NEXT_PAGE.exec(value);
  return match && match.index !== undefined ? value.slice(0, match.index).trimEnd() : value.trimEnd();
}
function stripChoice(value, index) {
  let result = compact(stripFooter(text(value, 2000)), 2000);
  const marker = CIRCLED[index-1];
  if (marker && result.startsWith(marker)) result = result.slice(marker.length).trimStart();
  return result.replace(new RegExp(`^\\(?${index}\\)?[.)]?\\s*`, "u"), "").trim();
}
function trailingEcho(raw) {
  const all = [...raw.matchAll(/[①②③④⑤]/gu)];
  if (all.length < 10) return null;
  for (let startIndex = all.length - 5; startIndex >= Math.max(0, all.length - 16); startIndex -= 1) {
    const tail = all.slice(startIndex, startIndex + 5);
    if (tail.length !== 5 || tail.map((m) => m[0]).join("") !== "①②③④⑤") continue;
    const main = raw.slice(0, Number(tail[0].index)).trimEnd();
    const candidates = tail.map((m, i) => {
      const start = Number(m.index) + m[0].length;
      const end = i < 4 ? Number(tail[i+1].index) : raw.length;
      return compact(stripFooter(raw.slice(start, end)), 2000);
    });
    if (candidates.some((c) => !c || c.length > 240 || /^[①②③④⑤]+$/u.test(c))) continue;
    return { main, candidates };
  }
  return null;
}
function exactInline(problem, raw) {
  const echo = trailingEcho(raw);
  const main = echo?.main ?? stripFooter(raw);
  let candidates = echo?.candidates ?? [];
  if (candidates.length !== 5 && Array.isArray(problem.choices) && problem.choices.length >= 5) {
    const choices = problem.choices.slice(0,5).map((c,i) => stripChoice(c,i+1));
    if (choices.every((c) => c && c.length <= 240 && !/^(?:[①②③④⑤]|문항\s*코드)/u.test(c))) candidates = choices;
  }
  if (candidates.length !== 5) return { passage: main, ranges: [], method: "unresolved" };
  const ranges = [];
  for (let i=0;i<5;i+=1) {
    const marker = CIRCLED[i], candidate = candidates[i];
    const markers = [...main.matchAll(new RegExp(esc(marker), "gu"))];
    const hits = [];
    for (const m of markers) {
      const markerEnd = Number(m.index)+marker.length;
      const hit = findRange(main, candidate, markerEnd, Math.min(main.length, markerEnd+candidate.length+180));
      if (hit && /^\s*$/u.test(main.slice(markerEnd, hit.start))) hits.push(hit);
    }
    if (hits.length !== 1) return { passage: main, ranges: [], method: "unresolved" };
    ranges.push({ ...hits[0], style: "bold", source: echo ? "source-echo-exact-v4" : "choice-exact-v4" });
  }
  return { passage: main, ranges: normalizedRanges(ranges, main.length), method: echo ? "source-echo-exact-v4" : "choice-exact-v4" };
}
function impliedTarget(explanation) {
  const src = text(explanation, 12000);
  const quoted = [
    /(?:굵게\s*표시된|굵은\s*글씨로\s*강조된|굵게\s*표시한|밑줄\s*친|밑줄\s*표시된)\s*[“"'‘]([^”"'’]{2,300})[”"'’]/u,
    /(?:표현|구절)\s*[“"'‘]([^”"'’]{2,300})[”"'’]\s*(?:은|는|이|가|을|를)/u,
  ];
  for (const p of quoted) { const hit=p.exec(src)?.[1]?.trim(); if(hit) return hit; }
  const phrases=["굵게 표시된","굵은 글씨로 강조된","굵게 표시한","밑줄 친","밑줄 표시된"];
  for(const phrase of phrases){
    const idx=src.indexOf(phrase); if(idx<0) continue;
    let tail=src.slice(idx+phrase.length).trimStart().replace(/^[“"'‘]+/u,"");
    const endings=["는 문자", "은 문자", "의 의미", "는 문맥", "은 문맥", "는 단순", "은 단순", "는 앞", "은 앞"];
    let end=Infinity;
    for(const token of endings){ const at=tail.indexOf(token); if(at>=2) end=Math.min(end,at); }
    if(!Number.isFinite(end)){
      const ko=tail.search(/[가-힣]/u); if(ko>=2) end=ko;
    }
    if(Number.isFinite(end) && end<=300){
      const candidate=tail.slice(0,end).replace(/[”"'’\s,;:]+$/u,"").trim(); if(candidate.length>=2) return candidate;
    }
  }
  return "";
}
function exactImplied(problem, raw) {
  const main = stripFooter(raw);
  const candidate=impliedTarget(problem.explanation);
  if(!candidate) return {passage:main,ranges:[],method:"unresolved"};
  const hit=findRange(main,candidate);
  if(!hit) return {passage:main,ranges:[],method:"unresolved"};
  return {passage:main,ranges:normalizedRanges([{...hit,style:"bold",source:"source-explanation-exact-v4"}],main.length),method:"source-explanation-exact-v4"};
}
function derive(problem){
  const raw=text(problem.passage,30000), type=compact(problem.questionType,80).toLowerCase();
  if(!TARGET_TYPES.has(type)||!raw) return {passage:raw,ranges:[],method:"not-target"};
  const stored=existing(problem,raw); if(stored.length) return {passage:raw,ranges:stored,method:"existing"};
  return type==="implied_meaning" ? exactImplied(problem,raw) : exactInline(problem,raw);
}
async function session(firestore,grade,year,month,execute){
  const examId=`exam_english_g${grade}_${year}_${String(month).padStart(2,"0")}`;
  const snap=await firestore.collection("problems").where("examId","==",examId).limit(600).get();
  const docs=snap.docs.filter((d)=>{const p=d.data()||{};return p.datasetId===DATASET_ID&&TARGET_TYPES.has(compact(p.questionType,80).toLowerCase());});
  const stats={grade,year,month,examId,total:docs.length,existing:0,sourceEchoExact:0,choiceExact:0,explanationExact:0,unresolved:0,updated:0};
  const unresolved=[],writes=[];
  for(const doc of docs){
    const p=doc.data()||{}, d=derive(p);
    if(d.method==="existing") stats.existing+=1;
    else if(d.method==="source-echo-exact-v4") stats.sourceEchoExact+=1;
    else if(d.method==="choice-exact-v4") stats.choiceExact+=1;
    else if(d.method==="source-explanation-exact-v4") stats.explanationExact+=1;
    else {stats.unresolved+=1; unresolved.push({id:p.questionId||doc.id,type:p.questionType,sourcePageNumber:p.sourcePageNumber??null,sourcePassageLabel:p.sourcePassageLabel??null}); continue;}
    if(d.method!=="existing"&&d.ranges.length){
      writes.push({ref:doc.ref,data:{emphasisRanges:d.ranges,formattingVersion:FORMATTING_VERSION,formattingFingerprint:hash(JSON.stringify({passage:d.passage,ranges:d.ranges})),formattingBackfilledAt:new Date(),formattingBackfillMethod:d.method}});
    }
  }
  if(execute){for(let i=0;i<writes.length;i+=400){const batch=firestore.batch(),chunk=writes.slice(i,i+400);for(const w of chunk)batch.set(w.ref,w.data,{merge:true});await batch.commit();stats.updated+=chunk.length;}}
  return {...stats,unresolvedItems:unresolved.slice(0,100)};
}
export default async function handler(req,res){
  res.setHeader("Content-Type","application/json; charset=utf-8");res.setHeader("Cache-Control","private, no-store");
  if(req.method!=="GET")return res.status(405).json({error:"method-not-allowed"});
  if(compact(req.query?.token,100)!==TOKEN)return res.status(404).json({error:"not-found"});
  const execute=req.query?.execute==="1";
  try{const firestore=getProblemBankFirestore(),sessions=[];for(const args of SESSIONS)sessions.push(await session(firestore,...args,execute));
    const totals=sessions.reduce((a,s)=>{for(const k of ["total","existing","sourceEchoExact","choiceExact","explanationExact","unresolved","updated"])a[k]+=s[k];return a;},{total:0,existing:0,sourceEchoExact:0,choiceExact:0,explanationExact:0,unresolved:0,updated:0});
    return res.status(200).json({execute,datasetId:DATASET_ID,formattingVersion:FORMATTING_VERSION,totals,sessions});
  }catch(error){console.error("[emphasis-v4]",error);return res.status(500).json({error:compact(error instanceof Error?error.message:error,500)});}
}
