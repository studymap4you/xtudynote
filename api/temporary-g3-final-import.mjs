import crypto from "node:crypto";
import * as pdfjsWorker from "pdfjs-dist/legacy/build/pdf.worker.mjs";
import { getProblemBankFirestore, problemBankSettings } from "./_lib/problem-bank/admin.mjs";

globalThis.pdfjsWorker = pdfjsWorker;

const TOKEN = "grade3-final-import";
const DATASET_ID = "xtudy-g3-final-11-variants-v2";
const DATASET_VERSION = "2026-09-11.2";
const CIRCLED = ["①", "②", "③", "④", "⑤"];
const VALID_NUMBERS = new Set([...Array.from({ length: 7 }, (_, i) => i + 18), ...Array.from({ length: 17 }, (_, i) => i + 29)]);
const OLD_DATASETS = new Set(["xtudy-g3-final-11-variants-v1", "xtudy-mock-exam-11-variants-v1", DATASET_ID]);

const TYPE_BY_LABEL = Object.freeze({
  "어법":"grammar", "주제":"topic", "제목":"title", "어휘":"vocabulary",
  "함축의미추론":"implied_meaning", "함축 의미추론":"implied_meaning",
  "요약문완성":"summary", "요약문 완성":"summary", "빈칸추론":"blank_inference", "빈칸 추론":"blank_inference",
  "문장의 순서":"paragraph_order", "문장삽입":"sentence_insertion", "문장 삽입":"sentence_insertion",
  "전체 흐름과 무관한 문장":"irrelevant_sentence", "글의 흐름":"irrelevant_sentence",
  "내용일치":"factual_description", "내용 일치":"factual_description",
});
const TYPE_KEYS = [...new Set(Object.values(TYPE_BY_LABEL))];
const STEM_BY_TYPE = Object.freeze({
  grammar:"다음 글의 굵게 표시된 부분 중, 어법상 틀린 것은?", topic:"다음 글의 주제로 가장 적절한 것은?", title:"다음 글의 제목으로 가장 적절한 것은?",
  vocabulary:"다음 글의 굵게 표시된 부분 중, 문맥상 낱말의 쓰임이 적절하지 않은 것은?", implied_meaning:"다음 글에서 굵은 글씨로 강조된 부분이 의미하는 바로 가장 적절한 것은?",
  summary:"다음 글의 내용을 한 문장으로 요약할 때 빈칸에 들어갈 말로 가장 적절한 것은?", blank_inference:"다음 빈칸에 들어갈 말로 가장 적절한 것은?",
  paragraph_order:"주어진 글 다음에 이어질 글의 순서로 가장 적절한 것은?", sentence_insertion:"글의 흐름으로 보아, 주어진 문장이 들어가기에 가장 적절한 곳은?",
  irrelevant_sentence:"다음 글에서 전체 흐름과 관계없는 문장은?", factual_description:"다음 글의 내용과 일치하지 않는 것은?",
});
const SESSIONS = Object.freeze([
  {year:2025,month:3,title:"2025년 3월 고3 전국연합학력평가",organizer:"서울특별시교육청",examKind:"national_mock",sets:21,sourceProblems:231,expanded:264},
  {year:2025,month:5,title:"2025년 5월 고3 전국연합학력평가",organizer:"경기도교육청",examKind:"national_mock",sets:21,sourceProblems:231,expanded:264},
  {year:2025,month:6,title:"2026학년도 6월 모의평가",organizer:"한국교육과정평가원",examKind:"kice_mock",sets:21,sourceProblems:231,expanded:264},
  {year:2025,month:7,title:"2025년 7월 고3 전국연합학력평가",organizer:"인천광역시교육청",examKind:"national_mock",sets:21,sourceProblems:231,expanded:264},
  {year:2025,month:9,title:"2026학년도 9월 모의평가",organizer:"한국교육과정평가원",examKind:"kice_mock",sets:21,sourceProblems:231,expanded:264},
  {year:2025,month:10,title:"2025년 10월 고3 전국연합학력평가",organizer:"서울특별시교육청",examKind:"national_mock",sets:20,sourceProblems:220,expanded:253},
  {year:2025,month:11,title:"2026학년도 대학수학능력시험",organizer:"한국교육과정평가원",examKind:"csat",sets:21,sourceProblems:231,expanded:264},
  {year:2026,month:3,title:"2026년 3월 고3 전국연합학력평가",organizer:"서울특별시교육청",examKind:"national_mock",sets:21,sourceProblems:231,expanded:264},
  {year:2026,month:5,title:"2026년 5월 고3 전국연합학력평가",organizer:"경기도교육청",examKind:"national_mock",sets:21,sourceProblems:231,expanded:264},
  {year:2026,month:6,title:"2027학년도 6월 모의평가",organizer:"한국교육과정평가원",examKind:"kice_mock",sets:21,sourceProblems:231,expanded:264},
  {year:2026,month:7,title:"2026년 7월 고3 전국연합학력평가",organizer:"인천광역시교육청",examKind:"national_mock",sets:21,sourceProblems:231,expanded:264},
]);
const LABEL_PATTERN = Object.keys(TYPE_BY_LABEL).sort((a,b)=>b.length-a.length).map((s)=>s.replace(/[.*+?^${}()|[\]\\]/gu,"\\$&")).join("|");
const QUESTION_RE = new RegExp([
  `[0-9~～-]+번(?:\\s+공통지문)?\\s+변형(?:문제)?\\s+(?<variant>\\d{1,3})\\s*[·|]\\s*\\[?(?<variantLabel>${LABEL_PATTERN})\\]?`,
  `(?:\\d{2}-)?(?<plain>\\d{1,3})\\.\\s*\\[(?<plainLabel>${LABEL_PATTERN})\\]`,
].join("|"), "giu");
const ANSWER_RE = new RegExp(`(?:^|\\s)(?<seq>\\d{1,3})\\.\\s*\\[(?<label>${LABEL_PATTERN})\\]\\s*정답\\s*(?<answer>[①②③④⑤])`, "giu");

function clean(v,max=100000){return String(v??"").normalize("NFC").replace(/\u0000/gu," ").replace(/[\t\r\n]+/gu," ").replace(/\s+/gu," ").trim().slice(0,max);}
function sha(v){return crypto.createHash("sha256").update(String(v)).digest("hex");}
function examId(y,m){return `exam_english_g3_${y}_${String(m).padStart(2,"0")}`;}
function sessionKey(y,m){return `g3-${y}-${String(m).padStart(2,"0")}`;}
function configFromKey(v){const m=/^g3-(2025|2026)-(03|05|06|07|09|10|11)$/u.exec(clean(v,40));return m?SESSIONS.find(s=>s.year===Number(m[1])&&s.month===Number(m[2]))||null:null;}
function numbersFrom(v){const n=String(v).match(/\d{1,2}/gu)?.map(Number)||[];if(n.length===1)return n;if(n.length===2&&n[1]>=n[0])return Array.from({length:n[1]-n[0]+1},(_,i)=>n[0]+i);return [];}
function compact(v){return clean(String(v).replace(/\[\[PAGE_\d+\]\]/gu," "));}
function pageAt(text,offset){const m=[...text.slice(0,offset).matchAll(/\[\[PAGE_(\d+)\]\]/gu)];return m.length?Number(m.at(-1)[1]):1;}
function questionLabel(match){return clean(match.groups?.variantLabel||match.groups?.plainLabel,80);}
function stripPageHeader(text){return String(text).replace(/Xtudy Universe[^\n]*(?:\n\s*\d{1,3})?/gu," ");}
function removeStem(block){
  const value=compact(String(block).split(/\s*문항\s*코드\s*:/u)[0]);const starts=[];
  for(const re of [/\[주어진 문장\]/u,/\[주어진 글\]/u,/\bDear\b/u,/\bTo Whom\b/u,/\bTo whom\b/u,/“/u,/"/u,/(?<![A-Za-z])[A-Za-z][A-Za-z'’\-]{1,}/u]){const m=re.exec(value);if(m)starts.push(m.index);}
  if(starts.length)return value.slice(Math.min(...starts)).trim();const q=value.indexOf("?");return (q>=0?value.slice(q+1):value).trim();
}
function parseInline(block){
  let passage=removeStem(block);const markers=[...passage.matchAll(/[①②③④⑤]/gu)];
  if(markers.length>=10){const tail=markers.slice(-5);if(tail.map(m=>m[0]).join("")===CIRCLED.join("")){const candidates=tail.map((m,i)=>clean(passage.slice(Number(m.index)+1,i<4?Number(tail[i+1].index):passage.length),220));const before=passage.slice(0,Number(tail[0].index)).trimEnd();if(candidates.every(Boolean)&&candidates.filter(c=>before.includes(c)).length>=4)passage=before;}}
  passage=passage.replace(/\s*①\s*②\s*③\s*④\s*⑤\s*$/u,"").trim();return {passage,choices:[...CIRCLED]};
}
function parseNormal(block){
  const body=removeStem(block),markers=[...body.matchAll(/[①②③④⑤]/gu)];if(markers.length<5)return {passage:body,choices:[]};const tail=markers.slice(-5);if(tail.map(m=>m[0]).join("")!==CIRCLED.join(""))return {passage:body,choices:[]};
  const choices=tail.map((m,i)=>clean(body.slice(Number(m.index)+1,i<4?Number(tail[i+1].index):body.length),4000));return {passage:clean(body.slice(0,Number(tail[0].index)),30000),choices};
}
function impliedTarget(explanation){const m=clean(explanation,12000).match(/(?:굵은\s*표현|굵게\s*표시된|굵은\s*글씨로\s*강조된|강조된)\s*[‘'“"]([^’'”"]{2,220})[’'”"]/u);return m?.[1]?.trim()||"";}
function emphasisRanges(passage,type,explanation){
  if(type==="implied_meaning"){const target=impliedTarget(explanation),start=target?passage.indexOf(target):-1;return start>=0?[{target:"passage",start,end:start+target.length,style:"bold",source:"explanation-target"}]:[];}
  if(!["grammar","vocabulary"].includes(type))return [];const ranges=[];
  for(let i=0;i<5;i++){const hits=[...passage.matchAll(new RegExp(CIRCLED[i],"gu"))];if(hits.length!==1)continue;const base=Number(hits[0].index)+1,tail=passage.slice(base);
    if(type==="vocabulary"){const m=/^\s*([A-Za-z0-9]+(?:[-’'][A-Za-z0-9]+)*)/u.exec(tail);if(m){const start=base+m[0].indexOf(m[1]);ranges.push({target:"passage",start,end:start+m[1].length,style:"bold",source:"marker-word"});}}
    else{const m=/^\s*((?:[A-Za-z0-9]+(?:[-’'][A-Za-z0-9]+)?(?:\s+|$)){1,4})/u.exec(tail);if(m){const phrase=m[1].trim(),start=base+m[0].indexOf(m[1]);if(phrase)ranges.push({target:"passage",start,end:start+phrase.length,style:"bold",source:"marker-phrase"});}}
  }return ranges;
}
function ensureDomGlobals(){
  if(typeof globalThis.DOMMatrix==="undefined")globalThis.DOMMatrix=class DOMMatrix{constructor(init){this.a=1;this.b=0;this.c=0;this.d=1;this.e=0;this.f=0;if(Array.isArray(init)&&init.length>=6)[this.a,this.b,this.c,this.d,this.e,this.f]=init.slice(0,6).map(Number);}multiplySelf(o={a:1,b:0,c:0,d:1,e:0,f:0}){const a=this.a*o.a+this.c*o.b,b=this.b*o.a+this.d*o.b,c=this.a*o.c+this.c*o.d,d=this.b*o.c+this.d*o.d,e=this.a*o.e+this.c*o.f+this.e,f=this.b*o.e+this.d*o.f+this.f;Object.assign(this,{a,b,c,d,e,f});return this;}preMultiplySelf(o){const x=new globalThis.DOMMatrix([o?.a??1,o?.b??0,o?.c??0,o?.d??1,o?.e??0,o?.f??0]);x.multiplySelf(this);Object.assign(this,x);return this;}translateSelf(x=0,y=0){return this.multiplySelf(new globalThis.DOMMatrix([1,0,0,1,Number(x),Number(y)]));}scaleSelf(x=1,y=x){return this.multiplySelf(new globalThis.DOMMatrix([Number(x),0,0,Number(y),0,0]));}rotateSelf(a=0){const r=Number(a)*Math.PI/180;return this.multiplySelf(new globalThis.DOMMatrix([Math.cos(r),Math.sin(r),-Math.sin(r),Math.cos(r),0,0]));}inverse(){const z=this.a*this.d-this.b*this.c;if(!z)return new globalThis.DOMMatrix();return new globalThis.DOMMatrix([this.d/z,-this.b/z,-this.c/z,this.a/z,(this.c*this.f-this.d*this.e)/z,(this.b*this.e-this.a*this.f)/z]);}invertSelf(){Object.assign(this,this.inverse());return this;}transformPoint(p={x:0,y:0}){return{x:this.a*Number(p.x||0)+this.c*Number(p.y||0)+this.e,y:this.b*Number(p.x||0)+this.d*Number(p.y||0)+this.f};}};
  if(typeof globalThis.ImageData==="undefined")globalThis.ImageData=class ImageData{};if(typeof globalThis.Path2D==="undefined")globalThis.Path2D=class Path2D{addPath(){}moveTo(){}lineTo(){}bezierCurveTo(){}closePath(){}};
}
async function driveToken(){
  const sa=problemBankSettings().serviceAccount;if(!sa?.client_email||!sa?.private_key)throw new Error("service-account-unavailable");const now=Math.floor(Date.now()/1000),enc=v=>Buffer.from(JSON.stringify(v)).toString("base64url"),head=enc({alg:"RS256",typ:"JWT"}),body=enc({iss:sa.client_email,scope:"https://www.googleapis.com/auth/drive.readonly",aud:"https://oauth2.googleapis.com/token",iat:now,exp:now+3500}),unsigned=`${head}.${body}`,sig=crypto.sign("RSA-SHA256",Buffer.from(unsigned),sa.private_key).toString("base64url");
  const response=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion:`${unsigned}.${sig}`})});if(!response.ok)throw new Error(`drive-token-${response.status}`);return (await response.json()).access_token;
}
async function drivePdf(fileId){const token=await driveToken(),response=await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,{headers:{Authorization:`Bearer ${token}`}});if(!response.ok)throw new Error(`drive-fetch-${response.status}`);return new Uint8Array(await response.arrayBuffer());}
async function extractText(bytes){ensureDomGlobals();const pdfjs=await import("pdfjs-dist/legacy/build/pdf.mjs"),pdf=await pdfjs.getDocument({data:bytes}).promise,pages=[];for(let i=1;i<=pdf.numPages;i++){const page=await pdf.getPage(i),content=await page.getTextContent(),raw=content.items.map(item=>item&&"str" in item?item.str:"").join(" ");pages.push(` [[PAGE_${i}]] ${stripPageHeader(raw)}`);}return{text:pages.join(" "),pageCount:pdf.numPages};}
function groupsFrom(text,config){
  const re=new RegExp([
    `SET\\s+\\d+\\s*[·|]\\s*원문 문항\\s*([0-9~～-]+)`,
    `원문\\s+([0-9~～-]+)\\s*·\\s*11유형 세트`,
    `고3 ${config.year}년 0?${config.month}월\\s*[·|]\\s*([0-9~～-]+)번(?:\\s+공통지문)? 변형문제 11개`,
    `고3 ${config.year}년 0?${config.month}월 모의고사\\s+([0-9~～-]+)번(?:\\s+공통지문)?\\s+변형문제`,
    `${config.year}년 0?${config.month}월 고3\\s+([0-9~～-]+)번(?:\\s+공통지문)?\\s+변형문제`,
    `([0-9~～-]+)번(?:\\s+공통지문)?\\s*[·|]\\s*MASTER PASSAGE`,
  ].join("|"),"gu");const markers=[...text.matchAll(re)];return markers.map((m,i)=>{const label=m.slice(1).find(Boolean);return{sourceLabel:String(label).replace(/[～-]/gu,"~"),numbers:numbersFrom(label),text:text.slice(Number(m.index),i+1<markers.length?Number(markers[i+1].index):text.length)};}).filter(g=>g.numbers.length);
}
function parseGroup(group,config){
  let boundary=group.text.indexOf("정답 및 상세 해설");if(boundary<0)boundary=group.text.indexOf("정답 및 해설");const qpart=boundary>=0?group.text.slice(0,boundary):group.text,apart=boundary>=0?group.text.slice(boundary):"";
  const qmatches=[...qpart.matchAll(QUESTION_RE)].filter(m=>{const after=qpart.slice(Number(m.index)+m[0].length,Number(m.index)+m[0].length+12);return !/^\s*정답/u.test(after);}).slice(0,11);
  const amatches=[...apart.matchAll(ANSWER_RE)].slice(0,11),answers=amatches.map((m,i)=>({answer:CIRCLED.indexOf(m.groups.answer)+1,explanation:compact(apart.slice(Number(m.index)+m[0].length,i+1<amatches.length?Number(amatches[i+1].index):apart.length))}));
  return qmatches.map((m,i)=>{const label=questionLabel(m),type=TYPE_BY_LABEL[label],end=i+1<qmatches.length?Number(qmatches[i+1].index):qpart.length,block=qpart.slice(Number(m.index)+m[0].length,end),parsed=["grammar","vocabulary","sentence_insertion","irrelevant_sentence"].includes(type)?parseInline(block):parseNormal(block),answer=answers[i]||{},ranges=emphasisRanges(parsed.passage,type,answer.explanation||"");return{baseQuestionId:`G3-${config.year}-${String(config.month).padStart(2,"0")}-${group.sourceLabel}-${String(i+1).padStart(2,"0")}`,questionType:type,subtype:label,passage:parsed.passage,question:STEM_BY_TYPE[type],choices:parsed.choices,answer:answer.answer,explanation:answer.explanation||"",sourcePageNumber:pageAt(group.text,Number(m.index)),emphasisRanges:ranges,formattingVersion:"grade3-final-import-v2",formattingFingerprint:sha(JSON.stringify({passage:parsed.passage,ranges}))};});
}
async function parsePdf(bytes,config,sourceFileName){const extracted=await extractText(bytes),groups=groupsFrom(extracted.text,config),sources=groups.map(g=>({...g,problems:parseGroup(g,config)}));return{sourceFileName,pageCount:extracted.pageCount,sources};}
async function ensureExams(db){const batch=db.batch();for(const s of SESSIONS){const id=examId(s.year,s.month);batch.set(db.collection("exams").doc(id),{id,year:s.year,grade:3,month:s.month,subject:"english",title:s.title,organizer:s.organizer,examKind:s.examKind,problemBankReady:false,variantBankExpected:true},{merge:true});}await batch.commit();return{examCount:SESSIONS.length,problemBankReady:false};}
async function clearOld(db,id){const snap=await db.collection("problems").where("examId","==",id).limit(1000).get(),targets=snap.docs.filter(doc=>{const p=doc.data()||{};return OLD_DATASETS.has(p.datasetId)||((p.generator?.provider==="xtudy-universe")&&(p.skillTags||[]).some(tag=>["mock-exam-variant","csat-variant"].includes(tag)));});for(let start=0;start<targets.length;start+=450){const batch=db.batch();targets.slice(start,start+450).forEach(doc=>batch.delete(doc.ref));await batch.commit();}return targets.length;}
async function importDrive(req,db){
  const config=configFromKey(req.query?.session),fileId=clean(req.query?.fileId,160),sourceFileName=clean(req.query?.fileName,240)||`drive-${fileId}.pdf`;if(!config||!fileId)throw Object.assign(new Error("import-params-invalid"),{statusCode:400});const parsed=await parsePdf(await drivePdf(fileId),config,sourceFileName),sourceProblems=parsed.sources.reduce((n,s)=>n+s.problems.length,0),expanded=parsed.sources.reduce((n,s)=>n+s.numbers.length*s.problems.length,0);
  if(parsed.sources.length!==config.sets||sourceProblems!==config.sourceProblems||expanded!==config.expanded)throw Object.assign(new Error(`parse-count-invalid:${parsed.sources.length}/${sourceProblems}/${expanded}`),{statusCode:409});
  for(const source of parsed.sources)for(const p of source.problems)if(p.choices.length!==5||!Number.isInteger(p.answer)||p.answer<1||p.answer>5||p.passage.length<80||p.explanation.length<20)throw Object.assign(new Error(`problem-invalid:${p.baseQuestionId}:${p.choices.length}/${p.answer}/${p.passage.length}/${p.explanation.length}`),{statusCode:409});
  const id=examId(config.year,config.month),removed=await clearOld(db,id),now=new Date(),batch=db.batch(),dist={1:0,2:0,3:0,4:0,5:0};let imported=0,emphasized=0;
  for(const source of parsed.sources)for(const p of source.problems){dist[p.answer]+=1;if(p.emphasisRanges.length)emphasized+=1;for(const raw of source.numbers){const number=Number(raw);if(!VALID_NUMBERS.has(number))throw new Error(`number-invalid:${number}`);const questionId=`${p.baseQuestionId}-Q${String(number).padStart(2,"0")}`,docId=`problem_${sha(questionId).slice(0,32)}`;batch.set(db.collection("problems").doc(docId),{questionId,subject:"english",language:"en",examFamily:config.examKind==="csat"?"csat":"mock_exam",grade:12,schoolGrade:3,examYear:config.year,examMonth:config.month,examQuestionNumbers:source.numbers,questionType:p.questionType,subtype:p.subtype,difficulty:4,sourceId:`xtudy-g3-${config.year}-${String(config.month).padStart(2,"0")}-${source.sourceLabel}`,passage:p.passage,question:p.question,choices:p.choices,answer:p.answer,explanation:p.explanation,emphasisRanges:p.emphasisRanges,formattingVersion:p.formattingVersion,formattingFingerprint:p.formattingFingerprint,conceptTags:[p.questionType,"grade-3","high-school-english"],skillTags:[p.questionType,config.examKind==="csat"?"csat-variant":"mock-exam-variant",`${config.year}-${String(config.month).padStart(2,"0")}`],qualityScore:95,status:"approved",validation:{answerPresent:true,explanationPresent:true,structurallyValid:true,issues:[],sourceVerified:true,parserVersion:DATASET_VERSION},generator:{provider:"xtudy-universe",model:"source-pdf",version:DATASET_VERSION},datasetId:DATASET_ID,datasetVersion:DATASET_VERSION,sourceFileName:parsed.sourceFileName,sourcePageNumber:p.sourcePageNumber,sourcePassageLabel:source.sourceLabel,duplicateIndex:1,examId:id,sourceExamId:id,examQuestionNumber:number,originalQuestionNumber:number,sourceQuestionNumber:number,metadata:{examId:id,questionNumber:number,sourcePassageLabel:source.sourceLabel},createdAt:now,updatedAt:now},{merge:true});imported++;}}
  await batch.commit();await db.collection("exams").doc(id).set({problemBankReady:false,variantBankExpected:true,problemBankDatasetId:DATASET_ID,problemBankDatasetVersion:DATASET_VERSION},{merge:true});return{session:sessionKey(config.year,config.month),examId:id,pageCount:parsed.pageCount,masterSets:parsed.sources.length,sourceProblems,imported,removedOldProblems:removed,emphasizedProblems:emphasized,answerDistribution:dist,problemBankReady:false};
}
async function auditSession(db,config){const id=examId(config.year,config.month),exam=await db.collection("exams").doc(id).get(),snap=await db.collection("problems").where("examId","==",id).limit(600).get(),docs=snap.docs.map(d=>d.data()||{}).filter(p=>p.datasetId===DATASET_ID&&p.status==="approved"),buckets={};for(const p of docs){const key=`${Number(p.examQuestionNumber)}:${clean(p.questionType,80)}`;buckets[key]=(buckets[key]||0)+1;}const expected=[...VALID_NUMBERS].filter(n=>!(config.year===2025&&config.month===10&&n===20)),missing=[];for(const n of expected)for(const type of TYPE_KEYS){const count=buckets[`${n}:${type}`]||0;if(count!==1)missing.push(`${n}:${type}:${count}`);}return{session:sessionKey(config.year,config.month),examId:id,examExists:exam.exists,problemBankReady:exam.exists?Boolean(exam.data()?.problemBankReady):false,approvedDatasetProblems:docs.length,expectedExpanded:config.expanded,missing:missing.slice(0,100),valid:docs.length===config.expanded&&missing.length===0};}
async function markReady(db,config){const audit=await auditSession(db,config);if(!audit.valid)throw Object.assign(new Error(`audit-not-ready:${JSON.stringify(audit)}`),{statusCode:409});await db.collection("exams").doc(audit.examId).set({problemBankReady:true,variantBankExpected:true,problemBankVerifiedAt:new Date(),problemBankDatasetId:DATASET_ID,problemBankDatasetVersion:DATASET_VERSION},{merge:true});return{...audit,problemBankReady:true};}
export default async function handler(req,res){res.setHeader("Content-Type","application/json; charset=utf-8");res.setHeader("Cache-Control","private, no-store");if(req.method!=="GET"||clean(req.query?.token,100)!==TOKEN)return res.status(404).json({error:"not-found"});const action=clean(req.query?.action,40),db=getProblemBankFirestore();try{if(action==="identity")return res.status(200).json({clientEmail:problemBankSettings().serviceAccount?.client_email||null,datasetId:DATASET_ID,datasetVersion:DATASET_VERSION});if(action==="ensure-exams")return res.status(200).json(await ensureExams(db));if(action==="import-drive")return res.status(200).json(await importDrive(req,db));if(action==="audit-all"){const sessions=[];for(const s of SESSIONS)sessions.push(await auditSession(db,s));return res.status(200).json({datasetId:DATASET_ID,datasetVersion:DATASET_VERSION,sessions});}if(action==="ready"){const config=configFromKey(req.query?.session);if(!config)return res.status(400).json({error:"session-invalid"});return res.status(200).json(await markReady(db,config));}return res.status(400).json({error:"action-invalid"});}catch(error){console.error("[temporary-g3-final-import]",error);return res.status(Number(error?.statusCode)||500).json({error:clean(error instanceof Error?error.message:error,1000)});}}
