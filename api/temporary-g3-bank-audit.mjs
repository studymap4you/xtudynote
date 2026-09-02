import { getProblemBankFirestore } from "./_lib/problem-bank/admin.mjs";

const TOKEN = "g3audit_20260902_Vm4pQ8tN";
const DATASET_ID = "xtudy-mock-exam-11-variants-v1";
const PROBE_FILE_ID = "file_0000000096ec8211a41c8d0fa3886b3c";
const SESSIONS = [
  [2025,3],[2025,5],[2025,6],[2025,7],[2025,9],[2025,10],[2025,11],
  [2026,3],[2026,5],[2026,6],[2026,7],
];
const TYPES = ["grammar","topic","title","vocabulary","implied_meaning","summary","blank_inference","paragraph_order","sentence_insertion","irrelevant_sentence","factual_description"];
function clean(v,max=120){return String(v??"").replace(/\u0000/gu,"").trim().slice(0,max);}
function numberFrom(p){return Number(p.examQuestionNumber||p.originalQuestionNumber||p.sourceQuestionNumber||p.metadata?.questionNumber)||0;}
async function probeFile(){
  const key=process.env.OPENAI_API_KEY||"";
  if(!key)return {hasOpenAIKey:false,status:null};
  const response=await fetch(`https://api.openai.com/v1/files/${PROBE_FILE_ID}/content`,{headers:{Authorization:`Bearer ${key}`}});
  const bytes=await response.arrayBuffer().catch(()=>new ArrayBuffer(0));
  return {hasOpenAIKey:true,status:response.status,ok:response.ok,contentType:response.headers.get("content-type"),contentLength:response.headers.get("content-length"),receivedBytes:bytes.byteLength,bodyPrefix:response.ok?null:new TextDecoder().decode(bytes.slice(0,400))};
}
export default async function handler(req,res){
  res.setHeader("Content-Type","application/json; charset=utf-8");
  res.setHeader("Cache-Control","private, no-store");
  if(req.method!=="GET"||clean(req.query?.token,100)!==TOKEN)return res.status(404).json({error:"not-found"});
  try{
    if(req.query?.action==="probe-file")return res.status(200).json(await probeFile());
    const db=getProblemBankFirestore();
    const sessions=[];
    let totalApproved=0,totalDataset=0,totalIndexed=0;
    for(const [year,month] of SESSIONS){
      const examId=`exam_english_g3_${year}_${String(month).padStart(2,"0")}`;
      const examSnap=await db.collection("exams").doc(examId).get();
      const exam=examSnap.exists?(examSnap.data()||{}):null;
      const snap=await db.collection("problems").where("examId","==",examId).limit(600).get();
      const approved=snap.docs.map(d=>({id:d.id,...(d.data()||{})})).filter(p=>["approved","gold","published"].includes(clean(p.status,30).toLowerCase()));
      const dataset=approved.filter(p=>p.datasetId===DATASET_ID || clean(p.datasetId,100).includes("g3"));
      const dist={};
      for(const p of dataset){
        const n=numberFrom(p),t=clean(p.questionType,80).toLowerCase();
        if(!n||!TYPES.includes(t))continue;
        dist[`${n}:${t}`]=(dist[`${n}:${t}`]||0)+1;
      }
      const indexed=Object.values(dist).reduce((a,b)=>a+b,0);
      totalApproved+=approved.length; totalDataset+=dataset.length; totalIndexed+=indexed;
      sessions.push({year,month,examId,examExists:examSnap.exists,problemBankReady:exam?.problemBankReady??null,approvedCount:approved.length,datasetCount:dataset.length,indexedCount:indexed,distribution:dist});
    }
    const staging=await db.collection("_xtudy_high_school_sync_staging").limit(300).get();
    const stagedBySession={};
    for(const doc of staging.docs){const d=doc.data()||{};const k=clean(d.sessionKey,50)||"unknown";stagedBySession[k]=(stagedBySession[k]||0)+1;}
    return res.status(200).json({datasetId:DATASET_ID,totals:{approved:totalApproved,dataset:totalDataset,indexed:totalIndexed},stagedBySession,sessions});
  }catch(error){console.error("[temporary-g3-bank-audit]",error);return res.status(500).json({error:clean(error instanceof Error?error.message:error,500)});}
}
