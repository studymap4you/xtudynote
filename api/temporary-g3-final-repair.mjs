import { getProblemBankFirestore } from "./_lib/problem-bank/admin.mjs";

const TOKEN="grade3-final-repair";
const DATASET_ID="xtudy-g3-final-11-variants-v2";
const CIRCLED=["①","②","③","④","⑤"];
const SESSIONS=[[2025,3],[2025,5],[2025,6],[2025,7],[2025,9],[2025,10],[2025,11],[2026,3],[2026,5],[2026,6],[2026,7]];
function clean(v,max=30000){return String(v??"").normalize("NFC").replace(/\u0000/gu," ").replace(/[\t\r\n]+/gu," ").replace(/\s+/gu," ").trim().slice(0,max)}
function markers(passage){return [...clean(passage).matchAll(/[①②③④⑤]/gu)].map(m=>({symbol:m[0],index:Number(m.index)}))}
function validRanges(passage,ranges){const n=clean(passage).length;return Array.isArray(ranges)?ranges.filter(r=>r?.target==="passage"&&r?.style==="bold"&&Number.isInteger(Number(r.start))&&Number.isInteger(Number(r.end))&&Number(r.start)>=0&&Number(r.end)>Number(r.start)&&Number(r.end)<=n):[]}
export default async function handler(req,res){
  res.setHeader("Content-Type","application/json; charset=utf-8");res.setHeader("Cache-Control","private, no-store");
  if(req.method!=="GET"||clean(req.query?.token,80)!==TOKEN)return res.status(404).json({error:"not-found"});
  const db=getProblemBankFirestore(),out=[];
  try{
    for(const [year,month] of SESSIONS){const examId=`exam_english_g3_${year}_${String(month).padStart(2,"0")}`,snap=await db.collection("problems").where("examId","==",examId).limit(600).get(),bad=[];
      for(const doc of snap.docs){const p=doc.data()||{},type=clean(p.questionType,80);if(p.datasetId!==DATASET_ID||p.status!=="approved"||!["grammar","vocabulary"].includes(type))continue;const ms=markers(p.passage),rs=validRanges(p.passage,p.emphasisRanges),seq=ms.map(x=>x.symbol).join("");if(ms.length===5&&seq===CIRCLED.join("")&&rs.length===5)continue;bad.push({questionId:p.questionId||doc.id,number:p.examQuestionNumber,type,sourcePassageLabel:p.sourcePassageLabel,sourcePageNumber:p.sourcePageNumber,markerCount:ms.length,markerSequence:seq,markers:ms,rangeCount:rs.length,ranges:rs,passage:clean(p.passage,8000)});if(bad.length>=8)break;}
      out.push({session:`g3-${year}-${String(month).padStart(2,"0")}`,examples:bad});
    }
    return res.status(200).json({datasetId:DATASET_ID,sessions:out});
  }catch(error){return res.status(500).json({error:clean(error instanceof Error?error.message:error,1000)})}
}
