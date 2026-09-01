import { getProblemBankFirestore } from "./_lib/problem-bank/admin.mjs";

const SESSIONS = [
  [2025,3],[2025,5],[2025,6],[2025,7],[2025,9],[2025,10],[2025,11],
  [2026,3],[2026,5],[2026,6],[2026,7],
];
const TYPES = ["grammar","topic","title","vocabulary","implied_meaning","summary","blank_inference","paragraph_order","sentence_insertion","irrelevant_sentence","factual_description"];
function examId(year, month) { return `exam_english_g3_${year}_${String(month).padStart(2,"0")}`; }
function clean(value, max=300) { return String(value ?? "").replace(/\u0000/gu,"").trim().slice(0,max); }

export default async function handler(req,res){
  res.setHeader("Content-Type","application/json; charset=utf-8");
  res.setHeader("Cache-Control","private, no-store");
  if(req.method!=="GET") return res.status(405).json({error:"method-not-allowed"});
  try{
    const db=getProblemBankFirestore();
    const sessions=[];
    for(const [year,month] of SESSIONS){
      const id=examId(year,month);
      const exam=await db.collection("exams").doc(id).get();
      const snap=await db.collection("problems").where("examId","==",id).limit(600).get();
      const docs=snap.docs.map(d=>d.data()||{}).filter(p=>["approved","gold","published"].includes(clean(p.status,30).toLowerCase()));
      const byType=Object.fromEntries(TYPES.map(t=>[t,0]));
      const byNumber={};
      const datasets={};
      const sourceFiles={};
      for(const p of docs){
        const type=clean(p.questionType,80).toLowerCase(); if(type in byType) byType[type]+=1;
        const n=Number(p.examQuestionNumber); if(Number.isInteger(n)) byNumber[n]=(byNumber[n]||0)+1;
        const ds=clean(p.datasetId,120)||"(none)"; datasets[ds]=(datasets[ds]||0)+1;
        const sf=clean(p.sourceFileName,240)||"(none)"; sourceFiles[sf]=(sourceFiles[sf]||0)+1;
      }
      sessions.push({year,month,examId:id,examExists:exam.exists,exam:exam.exists?{grade:Number(exam.data()?.grade)||0,title:clean(exam.data()?.title,240),problemBankReady:Boolean(exam.data()?.problemBankReady)}:null,approvedCount:docs.length,byType,byNumber,datasets,sourceFiles});
    }
    return res.status(200).json({ok:true,grade:3,sessionCount:sessions.length,totalApproved:sessions.reduce((a,s)=>a+s.approvedCount,0),sessions});
  }catch(error){
    console.error("[temporary-g3-bank-audit]",error);
    return res.status(500).json({error:clean(error instanceof Error?error.message:error,500)});
  }
}
