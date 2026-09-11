import crypto from "node:crypto";
import { getProblemBankFirestore } from "./_lib/problem-bank/admin.mjs";

const TOKEN="grade3-final-repair";
const DATASET_ID="xtudy-g3-final-11-variants-v2";
const REPAIR_VERSION="2026-09-11.render-repair.4";
const CIRCLED=["①","②","③","④","⑤"];
const TYPE_KEYS=["grammar","topic","title","vocabulary","implied_meaning","summary","blank_inference","paragraph_order","sentence_insertion","irrelevant_sentence","factual_description"];
const SESSIONS=[[2025,3,264],[2025,5,264],[2025,6,264],[2025,7,264],[2025,9,264],[2025,10,253],[2025,11,264],[2026,3,264],[2026,5,264],[2026,6,264],[2026,7,264]].map(([year,month,expected])=>({year,month,expected,examId:`exam_english_g3_${year}_${String(month).padStart(2,"0")}`}));
const VALID_NUMBERS=[...Array.from({length:7},(_,i)=>18+i),...Array.from({length:17},(_,i)=>29+i)];
const GENERIC_TAIL_RE=/\s*①\s*첫\s*번째\s*[^①②③④⑤]{0,60}\s*②\s*두\s*번째\s*[^①②③④⑤]{0,60}\s*③\s*세\s*번째\s*[^①②③④⑤]{0,60}\s*④\s*네\s*번째\s*[^①②③④⑤]{0,60}\s*⑤\s*다섯\s*번째\s*[^①②③④⑤]{0,80}\s*$/u;
const BARE_TAIL_RE=/\s*①\s*②\s*③\s*④\s*⑤\s*$/u;
const PAGE_FOOTER_RE=/\s+Xtudy Universe\s*[·|]\s*고3\b[\s\S]*$/u;

function clean(v,max=100000){return String(v??"").normalize("NFC").replace(/\u0000/gu," ").replace(/[\t\r\n]+/gu," ").replace(/\s+/gu," ").trim().slice(0,max)}
function sha(v){return crypto.createHash("sha256").update(String(v)).digest("hex")}
function stripPageFooter(v){return clean(v,30000).replace(PAGE_FOOTER_RE,"").trim()}
function stripSimpleTail(v){return clean(v,30000).replace(GENERIC_TAIL_RE,"").replace(BARE_TAIL_RE,"").trim()}
function markers(v){return [...String(v).matchAll(/[①②③④⑤]/gu)].map(m=>({symbol:m[0],index:Number(m.index)}))}
function splitTrailingLegend(v){
  const text=stripPageFooter(v),ms=markers(text);if(ms.length<9)return{text,legend:[]};
  const tail=ms.slice(-5);if(tail.map(x=>x.symbol).join("")!==CIRCLED.join(""))return{text,legend:[]};
  const start=tail[0].index,legend=tail.map((m,i)=>clean(text.slice(m.index+1,i<4?tail[i+1].index:text.length),300));
  return{text:text.slice(0,start).trimEnd(),legend};
}
function renumberFive(text){const ms=markers(text);if(ms.length!==5)return text;let out="",cursor=0;for(let i=0;i<5;i++){out+=text.slice(cursor,ms[i].index)+CIRCLED[i];cursor=ms[i].index+1;}return out+text.slice(cursor)}
function repairInlinePassage(value,type){
  let {text,legend}=splitTrailingLegend(value);text=stripSimpleTail(text);if(!["grammar","vocabulary"].includes(type))return{text,markersChanged:false,legendRemoved:legend.length>0};
  let ms=markers(text),changed=legend.length>0;
  if(ms.length===4&&ms.map(x=>x.symbol).join("")==="②③④⑤"){
    const candidate=clean(legend[0],200);let at=-1;if(candidate)at=text.indexOf(candidate);
    if(at<0)at=0;text=`${text.slice(0,at)}① ${text.slice(at)}`.replace(/^①\s+/u,"① ");changed=true;
  }
  ms=markers(text);
  if(ms.length===5){const next=renumberFive(text);if(next!==text)changed=true;text=next;}
  return{text:clean(text,30000),markersChanged:changed,legendRemoved:legend.length>0};
}
function markerSequenceValid(passage,type){if(!["grammar","vocabulary"].includes(type))return true;const s=markers(passage).map(x=>x.symbol);return s.length===5&&s.join("")===CIRCLED.join("")}
function impliedTarget(e){const m=clean(e,12000).match(/(?:굵은\s*표현|굵게\s*표시된|굵은\s*글씨로\s*강조된|강조된|밑줄\s*친|밑줄\s*표시된)\s*[‘'“"]([^’'”"]{2,220})[’'”"]/u);return m?.[1]?.trim()||""}
function normalizeExisting(ranges,textLength){if(!Array.isArray(ranges))return[];return ranges.flatMap(r=>{const start=Number(r?.start),end=Number(r?.end),target=clean(r?.target,20),style=clean(r?.style,20),source=clean(r?.source,80)||undefined;if(target!=="passage"||!["bold","underline"].includes(style)||!Number.isInteger(start)||!Number.isInteger(end)||start<0||end<=start||end>textLength)return[];return[{target,start,end,style,source}]})}
function firstCandidate(tail,type){
  if(type==="vocabulary"){const m=/^\s*([A-Za-z0-9]+(?:[-’'][A-Za-z0-9]+)*)/u.exec(tail);if(m)return{offset:m[0].indexOf(m[1]),text:m[1]};}
  else{const m=/^\s*([A-Za-z0-9]+(?:[-’'][A-Za-z0-9]+)?(?:\s+[A-Za-z0-9]+(?:[-’'][A-Za-z0-9]+)?){0,3})/u.exec(tail);if(m)return{offset:m[0].indexOf(m[1]),text:m[1]};}
  const f=/^\s*([^\s①②③④⑤]{1,80})/u.exec(tail);return f?{offset:f[0].indexOf(f[1]),text:f[1]}:null;
}
function computedRanges(passage,type,explanation){
  if(type==="implied_meaning"){const t=impliedTarget(explanation),s=t?passage.indexOf(t):-1;return s>=0?[{target:"passage",start:s,end:s+t.length,style:"bold",source:"explanation-target"}]:[]}
  if(!["grammar","vocabulary"].includes(type))return[];const out=[];let cursor=0;
  for(let i=0;i<5;i++){const marker=CIRCLED[i],mi=passage.indexOf(marker,cursor);if(mi<0)continue;const base=mi+1,c=firstCandidate(passage.slice(base),type);if(!c){cursor=base;continue;}const start=base+c.offset,end=start+c.text.length;out.push({target:"passage",start,end,style:"bold",source:type==="vocabulary"?"repaired-marker-word":"repaired-marker-phrase"});cursor=end;}
  return out;
}
function hasTailArtifact(p){const t=clean(p,30000);return GENERIC_TAIL_RE.test(t)||BARE_TAIL_RE.test(t)||PAGE_FOOTER_RE.test(t)}
async function sessionDocs(db,examId){const snap=await db.collection("problems").where("examId","==",examId).limit(600).get();return snap.docs.filter(d=>{const p=d.data()||{};return p.datasetId===DATASET_ID&&p.status==="approved"})}
async function repairSession(db,s){
  const docs=await sessionDocs(db,s.examId),writes=[];let changed=0,tailRemoved=0,markersFixed=0,emphasisRebuilt=0;
  for(const doc of docs){const p=doc.data()||{},type=clean(p.questionType,80),before=clean(p.passage,30000),r=repairInlinePassage(before,type),after=r.text;if(after!==before)tailRemoved+=hasTailArtifact(before)?1:0;if(r.markersChanged)markersFixed++;
    const existing=normalizeExisting(p.emphasisRanges,after.length),computed=computedRanges(after,type,p.explanation||"");let ranges=existing;if(["grammar","vocabulary"].includes(type))ranges=computed.length===5?computed:existing;else if(computed.length)ranges=computed;
    const fp=sha(JSON.stringify({passage:after,ranges}));if(after!==before||JSON.stringify(ranges)!==JSON.stringify(existing)||p.formattingVersion!==REPAIR_VERSION||p.formattingFingerprint!==fp){writes.push({ref:doc.ref,data:{passage:after,emphasisRanges:ranges,formattingVersion:REPAIR_VERSION,formattingFingerprint:fp,updatedAt:new Date()}});changed++;if(computed.length===5||type==="implied_meaning"&&computed.length)emphasisRebuilt++;}
  }
  for(let i=0;i<writes.length;i+=400){const b=db.batch();for(const w of writes.slice(i,i+400))b.set(w.ref,w.data,{merge:true});await b.commit()}
  return{session:`g3-${s.year}-${String(s.month).padStart(2,"0")}`,examId:s.examId,documents:docs.length,changed,tailRemoved,markersFixed,emphasisRebuilt};
}
async function auditSession(db,s){
  const exam=await db.collection("exams").doc(s.examId).get(),docs=await sessionDocs(db,s.examId),counts=new Map();let tailArtifacts=0,invalidInlineMarkerSequence=0,grammarVocabularyIncompleteEmphasis=0;
  for(const doc of docs){const p=doc.data()||{},n=Number(p.examQuestionNumber),type=clean(p.questionType,80),passage=clean(p.passage,30000),key=`${n}:${type}`;counts.set(key,(counts.get(key)||0)+1);if(hasTailArtifact(passage))tailArtifacts++;if(["grammar","vocabulary"].includes(type)){if(!markerSequenceValid(passage,type))invalidInlineMarkerSequence++;if(normalizeExisting(p.emphasisRanges,passage.length).filter(r=>r.style==="bold").length!==5)grammarVocabularyIncompleteEmphasis++;}}
  const expectedNumbers=VALID_NUMBERS.filter(n=>!(s.year===2025&&s.month===10&&n===20)),missing=[];for(const n of expectedNumbers)for(const type of TYPE_KEYS){const c=counts.get(`${n}:${type}`)||0;if(c!==1)missing.push(`${n}:${type}:${c}`)}const ready=exam.exists?Boolean(exam.data()?.problemBankReady):false,valid=docs.length===s.expected&&missing.length===0&&tailArtifacts===0&&invalidInlineMarkerSequence===0&&grammarVocabularyIncompleteEmphasis===0&&ready;
  return{session:`g3-${s.year}-${String(s.month).padStart(2,"0")}`,examId:s.examId,documents:docs.length,expected:s.expected,problemBankReady:ready,missing,tailArtifacts,invalidInlineMarkerSequence,grammarVocabularyIncompleteEmphasis,valid};
}
export default async function handler(req,res){res.setHeader("Content-Type","application/json; charset=utf-8");res.setHeader("Cache-Control","private, no-store");if(req.method!=="GET"||clean(req.query?.token,80)!==TOKEN)return res.status(404).json({error:"not-found"});const db=getProblemBankFirestore(),action=clean(req.query?.action,40);try{if(action==="repair-all"){const sessions=[];for(const s of SESSIONS)sessions.push(await repairSession(db,s));return res.status(200).json({datasetId:DATASET_ID,repairVersion:REPAIR_VERSION,sessions})}if(action==="audit-all"){const sessions=[];for(const s of SESSIONS)sessions.push(await auditSession(db,s));return res.status(200).json({datasetId:DATASET_ID,repairVersion:REPAIR_VERSION,allValid:sessions.every(x=>x.valid),totalDocuments:sessions.reduce((n,x)=>n+x.documents,0),sessions})}return res.status(400).json({error:"action-invalid"})}catch(error){console.error("[temporary-g3-final-repair]",error);return res.status(500).json({error:clean(error instanceof Error?error.message:error,1000)})}}
