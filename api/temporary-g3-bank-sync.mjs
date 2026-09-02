import crypto from "node:crypto";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { getProblemBankFirestore, problemBankSettings } from "./_lib/problem-bank/admin.mjs";

const TOKEN = "g3final_20260902_K7mQ4pV9";
const DATASET_ID = "xtudy-g3-final-11-variants-v1";
const DATASET_VERSION = "2026-09-02.2";
const VALID_NUMBERS = new Set([...Array.from({ length: 7 }, (_, i) => i + 18), ...Array.from({ length: 17 }, (_, i) => i + 29)]);
const CIRCLED = ["①", "②", "③", "④", "⑤"];
const TYPE_LABELS = Object.freeze({
  "어법": "grammar", "주제": "topic", "제목": "title", "어휘": "vocabulary",
  "함축의미추론": "implied_meaning", "요약문완성": "summary", "빈칸추론": "blank_inference",
  "문장의 순서": "paragraph_order", "문장삽입": "sentence_insertion",
  "전체 흐름과 무관한 문장": "irrelevant_sentence", "내용일치": "factual_description",
});
const TYPE_KEYS = Object.values(TYPE_LABELS);
const STEM = Object.freeze({
  grammar: "다음 글의 굵게 표시된 부분 중, 어법상 틀린 것은?",
  topic: "다음 글의 주제로 가장 적절한 것은?",
  title: "다음 글의 제목으로 가장 적절한 것은?",
  vocabulary: "다음 글의 굵게 표시된 부분 중, 문맥상 낱말의 쓰임이 적절하지 않은 것은?",
  implied_meaning: "다음 글에서 굵은 글씨로 강조된 부분이 의미하는 바로 가장 적절한 것은?",
  summary: "다음 글의 내용을 요약할 때 가장 적절한 것은?",
  blank_inference: "다음 빈칸에 들어갈 말로 가장 적절한 것은?",
  paragraph_order: "주어진 글 다음에 이어질 글의 순서로 가장 적절한 것은?",
  sentence_insertion: "글의 흐름으로 보아, 주어진 문장이 들어가기에 가장 적절한 곳은?",
  irrelevant_sentence: "다음 글에서 전체 흐름과 관계 없는 문장은?",
  factual_description: "다음 글의 내용과 일치하지 않는 것은?",
});
const SESSIONS = Object.freeze([
  { year: 2025, month: 3, title: "2025년 3월 고3 전국연합학력평가", organizer: "서울특별시교육청", examKind: "national_mock", sets: 21, sourceProblems: 231, expanded: 264 },
  { year: 2025, month: 5, title: "2025년 5월 고3 전국연합학력평가", organizer: "경기도교육청", examKind: "national_mock", sets: 21, sourceProblems: 231, expanded: 264 },
  { year: 2025, month: 6, title: "2026학년도 6월 모의평가", organizer: "한국교육과정평가원", examKind: "kice_mock", sets: 21, sourceProblems: 231, expanded: 264 },
  { year: 2025, month: 7, title: "2025년 7월 고3 전국연합학력평가", organizer: "인천광역시교육청", examKind: "national_mock", sets: 21, sourceProblems: 231, expanded: 264 },
  { year: 2025, month: 9, title: "2026학년도 9월 모의평가", organizer: "한국교육과정평가원", examKind: "kice_mock", sets: 21, sourceProblems: 231, expanded: 264 },
  { year: 2025, month: 10, title: "2025년 10월 고3 전국연합학력평가", organizer: "서울특별시교육청", examKind: "national_mock", sets: 20, sourceProblems: 220, expanded: 253 },
  { year: 2025, month: 11, title: "2026학년도 대학수학능력시험", organizer: "한국교육과정평가원", examKind: "csat", sets: 21, sourceProblems: 231, expanded: 264 },
  { year: 2026, month: 3, title: "2026년 3월 고3 전국연합학력평가", organizer: "서울특별시교육청", examKind: "national_mock", sets: 21, sourceProblems: 231, expanded: 264 },
  { year: 2026, month: 5, title: "2026년 5월 고3 전국연합학력평가", organizer: "경기도교육청", examKind: "national_mock", sets: 21, sourceProblems: 231, expanded: 264 },
  { year: 2026, month: 6, title: "2027학년도 6월 모의평가", organizer: "한국교육과정평가원", examKind: "kice_mock", sets: 21, sourceProblems: 231, expanded: 264 },
  { year: 2026, month: 7, title: "2026년 7월 고3 전국연합학력평가", organizer: "인천광역시교육청", examKind: "national_mock", sets: 21, sourceProblems: 231, expanded: 264 },
]);
const LABEL_PATTERN = Object.keys(TYPE_LABELS).sort((a,b)=>b.length-a.length).map((s)=>s.replace(/[.*+?^${}()|[\]\\]/gu,"\\$&")).join("|");
const MASTER_RE = /(?:(?:SET\s+\d+\s*[·|]\s*원문 문항\s*)?([0-9]{1,2}(?:\s*[~～-]\s*[0-9]{1,2})?)번(?:\s+공통지문)?\s*[·|]\s*MASTER PASSAGE)/giu;
const QUESTION_RE = new RegExp(`(?:[0-9~～-]+번\\s+변형(?:문제)?\\s*)?(?<seq>\\d{1,2})(?:\\.)?\\s*(?:·\\s*)?\\[(?<label>${LABEL_PATTERN})\\]`, "giu");
const ANSWER_RE = new RegExp(`(?<seq>\\d{1,2})\\.\\s*\\[(?<label>${LABEL_PATTERN})\\]\\s*정답\\s*(?<ans>[①②③④⑤])`, "giu");

function clean(value, max = 100000) { return String(value ?? "").normalize("NFC").replace(/\u0000/gu, " ").replace(/[\t\r\n]+/gu, " ").replace(/\s+/gu, " ").trim().slice(0, max); }
function examId(year, month) { return `exam_english_g3_${year}_${String(month).padStart(2, "0")}`; }
function sessionKey(year, month) { return `g3-${year}-${String(month).padStart(2, "0")}`; }
function configFromKey(value) { const m=/^g3-(2025|2026)-(03|05|06|07|09|10|11)$/u.exec(clean(value,40)); return m ? SESSIONS.find((s)=>s.year===Number(m[1])&&s.month===Number(m[2])) || null : null; }
function sha(value) { return crypto.createHash("sha256").update(String(value)).digest("hex"); }
function numbersFrom(label) { const n=String(label).match(/\d{1,2}/gu)?.map(Number)||[]; return n.length===1?n:n.length===2&&n[1]>=n[0]?Array.from({length:n[1]-n[0]+1},(_,i)=>n[0]+i):[]; }
function pageAt(text, offset) { const matches=[...text.slice(0,offset).matchAll(/\[\[PAGE_(\d+)\]\]/gu)]; return matches.length?Number(matches.at(-1)[1]):1; }
function compact(value) { return clean(String(value).replace(/\[\[PAGE_\d+\]\]/gu," ")); }
function stripPage(text) {
  const lines=String(text).split(/\r?\n/u); const out=[]; let afterHeader=false;
  for(const line of lines){ const s=line.trim(); if(s.startsWith("Xtudy Universe")){afterHeader=true;continue;} if(afterHeader&&/^\d{1,3}$/u.test(s)){afterHeader=false;continue;} afterHeader=false; out.push(line); }
  return out.join("\n");
}
function stripStem(body) {
  const value=String(body).trim(); const candidates=[];
  for(const pattern of [/\[?주어진\s+글\]?/u,/\[?주어진\s+문장\]?/u,/\bDear\b/u,/\bTo Whom\b/u,/\bTo whom\b/u,/“/u,/"/u,/(?<![A-Za-z])[A-Za-z][A-Za-z'’\-]{1,}/u]){ const m=pattern.exec(value); if(m)candidates.push(m.index); }
  return candidates.length?value.slice(Math.min(...candidates)):value.slice(Math.max(0,value.indexOf("?")+1));
}
function parseInline(block) {
  let b=compact(stripStem(String(block).split(/\s*문항\s*코드\s*:/u)[0])); const markers=[...b.matchAll(/[①②③④⑤]/gu)]; let candidates=[];
  if(markers.length>=10){ const tail=markers.slice(-5); if(tail.map((m)=>m[0]).join("")===CIRCLED.join("")){ const list=tail.map((m,i)=>b.slice(Number(m.index)+1,i<4?Number(tail[i+1].index):b.length).trim()); if(list.every((x)=>x.length<=220)){ candidates=list; b=b.slice(0,Number(tail[0].index)).trimEnd(); } } }
  if(!candidates.length)b=b.replace(/\s*①\s*②\s*③\s*④\s*⑤\s*$/u,"").trim();
  const useful=candidates.length===5&&!candidates.every((x)=>/(?:표시|위치|문장)/u.test(x));
  return { passage:b, choices: useful?candidates:[...CIRCLED] };
}
function parseNormal(block) {
  const b=compact(stripStem(String(block).split(/\s*문항\s*코드\s*:/u)[0])); const markers=[...b.matchAll(/[①②③④⑤]/gu)];
  if(markers.length>=5){ const tail=markers.slice(-5); if(tail.map((m)=>m[0]).join("")===CIRCLED.join("")){ const choices=tail.map((m,i)=>b.slice(Number(m.index)+1,i<4?Number(tail[i+1].index):b.length).trim()); if(choices.every(Boolean))return {passage:b.slice(0,Number(tail[0].index)).trim(),choices}; } }
  return {passage:b,choices:[]};
}
function impliedTarget(explanation){ const m=clean(explanation,12000).match(/(?:굵은\s*표현|굵게\s*표시된|굵은\s*글씨로\s*강조된|강조된)\s*[‘'“"]([^’'”"]{2,220})[’'”"]/u); return m?.[1]?.trim()||""; }
function emphasis(passage,type,choices,explanation){
  if(type==="implied_meaning"){const t=impliedTarget(explanation),start=t?passage.indexOf(t):-1;return start>=0?[{target:"passage",start,end:start+t.length,style:"bold",source:"explanation-target"}]:[];}
  if(!["grammar","vocabulary"].includes(type))return [];
  const real=choices.length===5&&!choices.every((x,i)=>x===CIRCLED[i])?choices:null; if(real){let cursor=0;const ranges=[];let ok=true;for(let i=0;i<5;i++){const mi=passage.indexOf(CIRCLED[i],cursor),cand=clean(real[i],220);if(mi<0||!cand||/(?:표시|위치)/u.test(cand)){ok=false;break;}const start=passage.indexOf(cand,mi+1);if(start<0||passage.slice(mi+1,start).trim()){ok=false;break;}ranges.push({target:"passage",start,end:start+cand.length,style:"bold",source:"source-echo-exact"});cursor=start+cand.length;}if(ok&&ranges.length===5)return ranges;}
  const ranges=[]; for(let i=0;i<5;i++){const marker=CIRCLED[i],hits=[...passage.matchAll(new RegExp(marker,"gu"))];if(hits.length!==1)continue;const base=Number(hits[0].index)+1,tail=passage.slice(base);if(type==="vocabulary"){const m=/^\s*([A-Za-z0-9]+(?:[-’'][A-Za-z0-9]+)*)/u.exec(tail);if(m){const start=base+(m[0].length-m[1].length);ranges.push({target:"passage",start,end:start+m[1].length,style:"bold",source:"marker-word"});}}else{const m=/^\s*((?:[A-Za-z0-9]+(?:[-’'][A-Za-z0-9]+)?(?:\s+|$)){1,4})/u.exec(tail);if(m){const phrase=m[1].trim(),start=base+(m[0].length-m[0].trimStart().length);if(phrase)ranges.push({target:"passage",start,end:start+phrase.length,style:"bold",source:"marker-phrase"});}}}return ranges;
}
async function driveToken(){
  const sa=problemBankSettings().serviceAccount; if(!sa?.client_email||!sa?.private_key)throw new Error("service-account-unavailable"); const now=Math.floor(Date.now()/1000);
  const enc=(v)=>Buffer.from(JSON.stringify(v)).toString("base64url"); const head=enc({alg:"RS256",typ:"JWT"}),body=enc({iss:sa.client_email,scope:"https://www.googleapis.com/auth/drive.readonly",aud:"https://oauth2.googleapis.com/token",iat:now,exp:now+3500}); const unsigned=`${head}.${body}`;
  const sig=crypto.sign("RSA-SHA256",Buffer.from(unsigned),sa.private_key).toString("base64url"); const assertion=`${unsigned}.${sig}`;
  const response=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion})}); if(!response.ok)throw new Error(`drive-token-${response.status}`); return (await response.json()).access_token;
}
async function drivePdf(fileId){ const token=await driveToken(); const response=await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,{headers:{Authorization:`Bearer ${token}`}}); if(!response.ok)throw new Error(`drive-fetch-${response.status}`); return new Uint8Array(await response.arrayBuffer()); }
async function extractText(bytes){ const pdf=await pdfjs.getDocument({data:bytes}).promise; const pages=[]; for(let i=1;i<=pdf.numPages;i++){const page=await pdf.getPage(i),content=await page.getTextContent(),raw=content.items.map((item)=>item&&"str" in item?item.str:"").join("\n"); pages.push(`\n[[PAGE_${i}]]\n${stripPage(raw)}`);} return {text:pages.join("\n"),pageCount:pdf.numPages}; }
function parseSegment(segment,label,config){
  let boundary=segment.indexOf("정답 및 상세 해설"); if(boundary<0)boundary=segment.indexOf("정답 및 해설"); const qpart=boundary>=0?segment.slice(0,boundary):segment,apart=boundary>=0?segment.slice(boundary):"";
  const qms=[...qpart.matchAll(QUESTION_RE)].filter((m)=>Number(m.groups?.seq)>=1&&Number(m.groups?.seq)<=11); const unique=[];const seen=new Set();for(const m of qms){const n=Number(m.groups.seq);if(!seen.has(n)){seen.add(n);unique.push(m);}}
  const ams=[...apart.matchAll(ANSWER_RE)],answers=new Map(); for(let i=0;i<ams.length;i++){const m=ams[i],n=Number(m.groups.seq);if(n<1||n>11||answers.has(n))continue;const end=i+1<ams.length?Number(ams[i+1].index):apart.length;answers.set(n,{answer:CIRCLED.indexOf(m.groups.ans)+1,explanation:compact(apart.slice(Number(m.index)+m[0].length,end))});}
  const problems=[]; for(let i=0;i<unique.length;i++){const m=unique[i],seq=Number(m.groups.seq),korean=m.groups.label,type=TYPE_LABELS[korean],end=i+1<unique.length?Number(unique[i+1].index):qpart.length,block=qpart.slice(Number(m.index)+m[0].length,end);const parsed=["grammar","vocabulary","sentence_insertion","irrelevant_sentence"].includes(type)?parseInline(block):parseNormal(block);const a=answers.get(seq)||{};const ranges=emphasis(parsed.passage,type,parsed.choices,a.explanation||"");problems.push({baseQuestionId:`G3-${config.year}-${String(config.month).padStart(2,"0")}-${label}-${String(seq).padStart(2,"0")}`,questionType:type,subtype:korean,passage:parsed.passage,question:STEM[type],choices:parsed.choices,answer:a.answer,explanation:a.explanation||"",sourcePageNumber:pageAt(segment,Number(m.index)),emphasisRanges:ranges,formattingVersion:"grade3-final-import-v2",formattingFingerprint:sha(JSON.stringify({passage:parsed.passage,ranges}))});}
  return problems;
}
async function parsePdf(bytes,config,sourceFileName){ const extracted=await extractText(bytes),matches=[...extracted.text.matchAll(MASTER_RE)],sources=[];for(let i=0;i<matches.length;i++){const label=String(matches[i][1]).replace(/\s+/gu,"").replace(/[～-]/gu,"~"),segment=extracted.text.slice(Number(matches[i].index),i+1<matches.length?Number(matches[i+1].index):extracted.text.length);sources.push({sourceLabel:label,numbers:numbersFrom(label),problems:parseSegment(segment,label,config)});}return {sourceFileName,pageCount:extracted.pageCount,sources}; }
async function ensureExams(db){const batch=db.batch();for(const s of SESSIONS){const id=examId(s.year,s.month);batch.set(db.collection("exams").doc(id),{id,year:s.year,grade:3,month:s.month,subject:"english",title:s.title,organizer:s.organizer,examKind:s.examKind,problemBankReady:false,variantBankExpected:true},{merge:true});}await batch.commit();return{examCount:SESSIONS.length,problemBankReady:false};}
async function importDrive(req,db){
  const config=configFromKey(req.query?.session),fileId=clean(req.query?.fileId,160),sourceFileName=clean(req.query?.fileName,240);if(!config||!fileId)throw Object.assign(new Error("import-params-invalid"),{statusCode:400}); const bytes=await drivePdf(fileId),parsed=await parsePdf(bytes,config,sourceFileName||`drive-${fileId}.pdf`);
  const sourceProblems=parsed.sources.reduce((n,s)=>n+s.problems.length,0),expanded=parsed.sources.reduce((n,s)=>n+s.numbers.length*s.problems.length,0); if(parsed.sources.length!==config.sets||sourceProblems!==config.sourceProblems||expanded!==config.expanded)throw Object.assign(new Error(`parse-count-invalid:${parsed.sources.length}/${sourceProblems}/${expanded}`),{statusCode:409});
  const eid=examId(config.year,config.month),examRef=db.collection("exams").doc(eid);await examRef.set({id:eid,year:config.year,grade:3,month:config.month,subject:"english",title:config.title,organizer:config.organizer,examKind:config.examKind,problemBankReady:false,variantBankExpected:true},{merge:true}); const batch=db.batch(),now=new Date();let imported=0,emphasized=0;const answerDistribution={1:0,2:0,3:0,4:0,5:0};
  for(const source of parsed.sources){if(source.problems.length!==11)throw new Error(`source-problem-count:${source.sourceLabel}`);for(const p of source.problems){if(p.choices.length!==5||!Number.isInteger(p.answer)||p.answer<1||p.answer>5||p.passage.length<80||p.explanation.length<20)throw new Error(`problem-invalid:${p.baseQuestionId}`);answerDistribution[p.answer]+=1;if(p.emphasisRanges.length)emphasized+=1;for(const raw of source.numbers){const number=Number(raw);if(!VALID_NUMBERS.has(number))throw new Error(`number-invalid:${number}`);const qid=`${p.baseQuestionId}-Q${String(number).padStart(2,"0")}`,docId=`problem_${sha(qid).slice(0,32)}`;batch.set(db.collection("problems").doc(docId),{questionId:qid,subject:"english",language:"en",examFamily:config.examKind==="csat"?"csat":"mock_exam",grade:12,schoolGrade:3,examYear:config.year,examMonth:config.month,examQuestionNumbers:source.numbers,questionType:p.questionType,subtype:p.subtype,difficulty:4,sourceId:`xtudy-g3-${config.year}-${String(config.month).padStart(2,"0")}-${source.sourceLabel}`,passage:p.passage,question:p.question,choices:p.choices,answer:p.answer,explanation:p.explanation,emphasisRanges:p.emphasisRanges,formattingVersion:p.formattingVersion,formattingFingerprint:p.formattingFingerprint,conceptTags:[p.questionType,"grade-3","high-school-english"],skillTags:[p.questionType,config.examKind==="csat"?"csat-variant":"mock-exam-variant",`${config.year}-${String(config.month).padStart(2,"0")}`],qualityScore:95,status:"approved",validation:{answerPresent:true,explanationPresent:true,structurallyValid:true,issues:[],sourceVerified:true,parserVersion:DATASET_VERSION},generator:{provider:"xtudy-universe",model:"source-pdf",version:DATASET_VERSION},datasetId:DATASET_ID,datasetVersion:DATASET_VERSION,sourceFileName:parsed.sourceFileName,sourcePageNumber:p.sourcePageNumber,sourcePassageLabel:source.sourceLabel,duplicateIndex:1,examId:eid,sourceExamId:eid,examQuestionNumber:number,originalQuestionNumber:number,sourceQuestionNumber:number,metadata:{examId:eid,questionNumber:number,sourcePassageLabel:source.sourceLabel},createdAt:now,updatedAt:now},{merge:true});imported+=1;}}}
  if(imported!==config.expanded)throw new Error("expanded-count-invalid");await batch.commit();return{session:sessionKey(config.year,config.month),examId:eid,pageCount:parsed.pageCount,masterSets:parsed.sources.length,sourceProblems,imported,emphasizedProblems:emphasized,answerDistribution,problemBankReady:false};
}
async function auditSession(db,config){const eid=examId(config.year,config.month),exam=await db.collection("exams").doc(eid).get(),snap=await db.collection("problems").where("examId","==",eid).limit(600).get(),docs=snap.docs.map((d)=>d.data()||{}).filter((p)=>p.datasetId===DATASET_ID&&p.status==="approved"),buckets={};let emphasized=0;for(const p of docs){const key=`${Number(p.examQuestionNumber)}:${clean(p.questionType,80)}`;buckets[key]=(buckets[key]||0)+1;if(Array.isArray(p.emphasisRanges)&&p.emphasisRanges.length)emphasized+=1;}const expectedNumbers=[...VALID_NUMBERS].filter((n)=>!(config.year===2025&&config.month===10&&n===20)),missing=[];for(const n of expectedNumbers)for(const type of TYPE_KEYS)if((buckets[`${n}:${type}`]||0)!==1)missing.push(`${n}:${type}:${buckets[`${n}:${type}`]||0}`);return{session:sessionKey(config.year,config.month),examId:eid,examExists:exam.exists,problemBankReady:exam.exists?Boolean(exam.data()?.problemBankReady):false,approvedDatasetProblems:docs.length,expectedExpanded:config.expanded,emphasizedProblems:emphasized,missing:missing.slice(0,50),valid:docs.length===config.expanded&&missing.length===0};}
async function markReady(db,config){const audit=await auditSession(db,config);if(!audit.valid)throw Object.assign(new Error("audit-not-ready"),{statusCode:409});await db.collection("exams").doc(audit.examId).set({problemBankReady:true,variantBankExpected:true,problemBankVerifiedAt:new Date(),problemBankDatasetId:DATASET_ID,problemBankDatasetVersion:DATASET_VERSION},{merge:true});return{...audit,problemBankReady:true};}

export default async function handler(req,res){res.setHeader("Content-Type","application/json; charset=utf-8");res.setHeader("Cache-Control","private, no-store");if(req.method!=="GET"||clean(req.query?.token,100)!==TOKEN)return res.status(404).json({error:"not-found"});const action=clean(req.query?.action,40),db=getProblemBankFirestore();try{if(action==="identity")return res.status(200).json({clientEmail:problemBankSettings().serviceAccount?.client_email||null});if(action==="ensure-exams")return res.status(200).json(await ensureExams(db));if(action==="import-drive")return res.status(200).json(await importDrive(req,db));if(action==="audit-all"){const sessions=[];for(const s of SESSIONS)sessions.push(await auditSession(db,s));return res.status(200).json({datasetId:DATASET_ID,datasetVersion:DATASET_VERSION,sessions});}if(action==="ready"){const config=configFromKey(req.query?.session);if(!config)return res.status(400).json({error:"session-invalid"});return res.status(200).json(await markReady(db,config));}return res.status(400).json({error:"action-invalid"});}catch(error){console.error("[temporary-g3-bank-sync]",error);return res.status(Number(error?.statusCode)||500).json({error:clean(error instanceof Error?error.message:error,500)});}}
