import { getProblemBankFirestore } from "./_lib/problem-bank/admin.mjs";

const SESSIONS = [
  {year:2025,month:3,title:"2025년 3월 고3 전국연합학력평가",organizer:"서울특별시교육청",examKind:"national_mock"},
  {year:2025,month:5,title:"2025년 5월 고3 전국연합학력평가",organizer:"경기도교육청",examKind:"national_mock"},
  {year:2025,month:6,title:"2026학년도 6월 모의평가",organizer:"한국교육과정평가원",examKind:"kice_mock"},
  {year:2025,month:7,title:"2025년 7월 고3 전국연합학력평가",organizer:"인천광역시교육청",examKind:"national_mock"},
  {year:2025,month:9,title:"2026학년도 9월 모의평가",organizer:"한국교육과정평가원",examKind:"kice_mock"},
  {year:2025,month:10,title:"2025년 10월 고3 전국연합학력평가",organizer:"서울특별시교육청",examKind:"national_mock"},
  {year:2025,month:11,title:"2026학년도 대학수학능력시험",organizer:"한국교육과정평가원",examKind:"csat"},
  {year:2026,month:3,title:"2026년 3월 고3 전국연합학력평가",organizer:"서울특별시교육청",examKind:"national_mock"},
  {year:2026,month:5,title:"2026년 5월 고3 전국연합학력평가",organizer:"경기도교육청",examKind:"national_mock"},
  {year:2026,month:6,title:"2027학년도 6월 모의평가",organizer:"한국교육과정평가원",examKind:"kice_mock"},
  {year:2026,month:7,title:"2026년 7월 고3 전국연합학력평가",organizer:"인천광역시교육청",examKind:"national_mock"},
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
    if(req.query?.register==="1"){
      const batch=db.batch();
      for(const session of SESSIONS){
        const id=examId(session.year,session.month);
        batch.set(db.collection("exams").doc(id),{
          id,year:session.year,grade:3,month:session.month,subject:"english",
          title:session.title,organizer:session.organizer,examKind:session.examKind,
          problemBankReady:false,variantBankExpected:true,variantBankUpdatedAt:new Date(),
        },{merge:true});
      }
      await batch.commit();
    }
    const sessions=[];
    for(const session of SESSIONS){
      const {year,month}=session;
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
      sessions.push({year,month,examId:id,examExists:exam.exists,exam:exam.exists?{grade:Number(exam.data()?.grade)||0,title:clean(exam.data()?.title,240),problemBankReady:Boolean(exam.data()?.problemBankReady),variantBankExpected:Boolean(exam.data()?.variantBankExpected)}:null,approvedCount:docs.length,byType,byNumber,datasets,sourceFiles});
    }
    return res.status(200).json({ok:true,registered:req.query?.register==="1",grade:3,sessionCount:sessions.length,totalApproved:sessions.reduce((a,s)=>a+s.approvedCount,0),sessions});
  }catch(error){
    console.error("[temporary-g3-bank-audit]",error);
    return res.status(500).json({error:clean(error instanceof Error?error.message:error,500)});
  }
}
