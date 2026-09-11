import crypto from "node:crypto";
import { getProblemBankFirestore } from "./_lib/problem-bank/admin.mjs";

const TOKEN = "grade3-final-repair";
const DATASET_ID = "xtudy-g3-final-11-variants-v2";
const REPAIR_VERSION = "2026-09-11.render-repair.1";
const CIRCLED = ["①", "②", "③", "④", "⑤"];
const TYPE_KEYS = ["grammar","topic","title","vocabulary","implied_meaning","summary","blank_inference","paragraph_order","sentence_insertion","irrelevant_sentence","factual_description"];
const SESSIONS = [
  [2025,3,264],[2025,5,264],[2025,6,264],[2025,7,264],[2025,9,264],[2025,10,253],[2025,11,264],
  [2026,3,264],[2026,5,264],[2026,6,264],[2026,7,264],
].map(([year,month,expected])=>({year,month,expected,examId:`exam_english_g3_${year}_${String(month).padStart(2,"0")}`}));
const VALID_NUMBERS = [...Array.from({length:7},(_,i)=>18+i), ...Array.from({length:17},(_,i)=>29+i)];
const GENERIC_TAIL_RE = /\s*①\s*첫\s*번째\s*[^①②③④⑤]{0,60}\s*②\s*두\s*번째\s*[^①②③④⑤]{0,60}\s*③\s*세\s*번째\s*[^①②③④⑤]{0,60}\s*④\s*네\s*번째\s*[^①②③④⑤]{0,60}\s*⑤\s*다섯\s*번째\s*[^①②③④⑤]{0,80}\s*$/u;
const BARE_TAIL_RE = /\s*①\s*②\s*③\s*④\s*⑤\s*$/u;

function clean(value,max=100000){return String(value??"").normalize("NFC").replace(/\u0000/gu," ").replace(/[\t\r\n]+/gu," ").replace(/\s+/gu," ").trim().slice(0,max)}
function sha(value){return crypto.createHash("sha256").update(String(value)).digest("hex")}
function stripTail(value){let text=clean(value,30000);text=text.replace(GENERIC_TAIL_RE,"").replace(BARE_TAIL_RE,"").trim();return text}
function impliedTarget(explanation){const m=clean(explanation,12000).match(/(?:굵은\s*표현|굵게\s*표시된|굵은\s*글씨로\s*강조된|강조된|밑줄\s*친|밑줄\s*표시된)\s*[‘'“"]([^’'”"]{2,220})[’'”"]/u);return m?.[1]?.trim()||""}
function normalizeExisting(ranges,textLength){if(!Array.isArray(ranges))return[];return ranges.flatMap((r)=>{const start=Number(r?.start),end=Number(r?.end),target=clean(r?.target,20),style=clean(r?.style,20),source=clean(r?.source,80)||undefined;if(target!=="passage"||!["bold","underline"].includes(style)||!Number.isInteger(start)||!Number.isInteger(end)||start<0||end<=start||end>textLength)return[];return[{target,start,end,style,source}]})}
function computedRanges(passage,type,explanation){
  if(type==="implied_meaning"){const target=impliedTarget(explanation),start=target?passage.indexOf(target):-1;return start>=0?[{target:"passage",start,end:start+target.length,style:"bold",source:"explanation-target"}]:[]}
  if(!["grammar","vocabulary"].includes(type))return[];
  const ranges=[];
  for(let i=0;i<5;i++){
    const hits=[...passage.matchAll(new RegExp(CIRCLED[i],"gu"))];
    if(hits.length!==1)continue;
    const base=Number(hits[0].index)+1,tail=passage.slice(base);
    if(type==="vocabulary"){
      const m=/^\s*([A-Za-z0-9]+(?:[-’'][A-Za-z0-9]+)*)/u.exec(tail);if(!m)continue;
      const start=base+m[0].indexOf(m[1]);ranges.push({target:"passage",start,end:start+m[1].length,style:"bold",source:"repaired-marker-word"});
    }else{
      const m=/^\s*((?:[A-Za-z0-9]+(?:[-’'][A-Za-z0-9]+)?(?:\s+|$)){1,4})/u.exec(tail);if(!m)continue;
      const phrase=m[1].trim();if(!phrase)continue;const start=base+m[0].indexOf(m[1]);ranges.push({target:"passage",start,end:start+phrase.length,style:"bold",source:"repaired-marker-phrase"});
    }
  }
  return ranges;
}
function hasTailArtifact(passage){return GENERIC_TAIL_RE.test(clean(passage,30000))||BARE_TAIL_RE.test(clean(passage,30000))}

async function sessionDocs(db,examId){const snap=await db.collection("problems").where("examId","==",examId).limit(600).get();return snap.docs.filter(doc=>{const p=doc.data()||{};return p.datasetId===DATASET_ID&&p.status==="approved"})}

async function repairSession(db,session){
  const docs=await sessionDocs(db,session.examId);let changed=0,tailRemoved=0,emphasisRebuilt=0;const writes=[];
  for(const doc of docs){const p=doc.data()||{},type=clean(p.questionType,80),before=clean(p.passage,30000),after=stripTail(before);if(after!==before)tailRemoved++;
    const computed=computedRanges(after,type,p.explanation||"");const existing=normalizeExisting(p.emphasisRanges,after.length);const ranges=computed.length?computed:existing;
    const nextFingerprint=sha(JSON.stringify({passage:after,ranges}));
    if(after!==before||JSON.stringify(ranges)!==JSON.stringify(existing)||p.formattingVersion!==REPAIR_VERSION||p.formattingFingerprint!==nextFingerprint){writes.push({ref:doc.ref,data:{passage:after,emphasisRanges:ranges,formattingVersion:REPAIR_VERSION,formattingFingerprint:nextFingerprint,updatedAt:new Date()}});changed++;if(computed.length)emphasisRebuilt++;}
  }
  for(let i=0;i<writes.length;i+=400){const batch=db.batch();for(const item of writes.slice(i,i+400))batch.set(item.ref,item.data,{merge:true});await batch.commit()}
  return{session:`g3-${session.year}-${String(session.month).padStart(2,"0")}`,examId:session.examId,documents:docs.length,changed,tailRemoved,emphasisRebuilt};
}

async function auditSession(db,session){
  const exam=await db.collection("exams").doc(session.examId).get(),docs=await sessionDocs(db,session.examId),counts=new Map();let tailArtifacts=0,grammarVocabularyIncompleteEmphasis=0;
  for(const doc of docs){const p=doc.data()||{},number=Number(p.examQuestionNumber),type=clean(p.questionType,80),key=`${number}:${type}`;counts.set(key,(counts.get(key)||0)+1);if(hasTailArtifact(p.passage))tailArtifacts++;
    if(["grammar","vocabulary"].includes(type)){const ranges=normalizeExisting(p.emphasisRanges,clean(p.passage,30000).length).filter(r=>r.style==="bold");if(ranges.length<5)grammarVocabularyIncompleteEmphasis++;}
  }
  const expectedNumbers=VALID_NUMBERS.filter(n=>!(session.year===2025&&session.month===10&&n===20)),missing=[];
  for(const n of expectedNumbers)for(const type of TYPE_KEYS){const count=counts.get(`${n}:${type}`)||0;if(count!==1)missing.push(`${n}:${type}:${count}`)}
  const ready=exam.exists?Boolean(exam.data()?.problemBankReady):false;
  const valid=docs.length===session.expected&&missing.length===0&&tailArtifacts===0&&grammarVocabularyIncompleteEmphasis===0&&ready;
  return{session:`g3-${session.year}-${String(session.month).padStart(2,"0")}`,examId:session.examId,documents:docs.length,expected:session.expected,problemBankReady:ready,missing,tailArtifacts,grammarVocabularyIncompleteEmphasis,valid};
}

export default async function handler(req,res){
  res.setHeader("Content-Type","application/json; charset=utf-8");res.setHeader("Cache-Control","private, no-store");
  if(req.method!=="GET"||clean(req.query?.token,80)!==TOKEN)return res.status(404).json({error:"not-found"});
  const db=getProblemBankFirestore(),action=clean(req.query?.action,40);
  try{
    if(action==="repair-all"){const sessions=[];for(const session of SESSIONS)sessions.push(await repairSession(db,session));return res.status(200).json({datasetId:DATASET_ID,repairVersion:REPAIR_VERSION,sessions})}
    if(action==="audit-all"){const sessions=[];for(const session of SESSIONS)sessions.push(await auditSession(db,session));return res.status(200).json({datasetId:DATASET_ID,repairVersion:REPAIR_VERSION,allValid:sessions.every(s=>s.valid),totalDocuments:sessions.reduce((n,s)=>n+s.documents,0),sessions})}
    return res.status(400).json({error:"action-invalid"});
  }catch(error){console.error("[temporary-g3-final-repair]",error);return res.status(500).json({error:clean(error instanceof Error?error.message:error,1000)})}
}
