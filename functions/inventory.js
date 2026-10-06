'use strict';
const {createHash,timingSafeEqual}=require('node:crypto');
const {parseStock}=require('./stock-import');
const catalog=require('./catalog.json');
class StockError extends Error {constructor(code,message){super(message);this.code=code;}}
const validDate=date=>typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(date+'T00:00:00Z'))&&new Date(date+'T00:00:00Z').toISOString().slice(0,10)===date;
function validateRecord(data,now=new Date()){
 if(!data||!validDate(data.date)||typeof data.time!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(data.time))throw new StockError('invalid-argument','재고 기준 날짜와 시간을 확인하세요.');
 const asOf=data.date+'T'+data.time;
 if(Date.parse(asOf+':00+09:00')>now.getTime()+300000)throw new StockError('invalid-argument','미래 시각의 재고는 등록할 수 없습니다.');
 if(typeof data.requestId!=='string'||!/^[a-f0-9-]{36}$/i.test(data.requestId))throw new StockError('invalid-argument','화면을 새로고침하고 다시 확인하세요.');
 if(typeof data.hasHeader!=='boolean')throw new StockError('invalid-argument','열 제목 포함 여부를 확인하세요.');
 let parsed;
 try{parsed=parseStock(data.text,{columns:data.columns,hasHeader:data.hasHeader,catalog,expectedTotal:data.expectedTotal??null});}catch(e){throw new StockError('invalid-argument',e.message);}
 if(!parsed.verified)throw new StockError('invalid-argument',parsed.errors.join('\n'));
 const hash=createHash('sha256').update(JSON.stringify({date:data.date,time:data.time,text:data.text,columns:data.columns,hasHeader:data.hasHeader,expectedTotal:data.expectedTotal??null})).digest('hex');
 return {id:asOf+'_'+data.requestId,asOf,hash,parsed};
}
function publicSnapshot(value){
 if(!value)return null;
 const fields=['id','date','asOf','savedAt','rows','total','itemCount','sourceRowCount','duplicateCount','pendingCount','sourceTotal','warnings'];
 return Object.fromEntries(fields.filter(k=>value[k]!==undefined).map(k=>[k,value[k]]));
}
function metadata(value){const {id,asOf,savedAt,total,itemCount,pendingCount}=value;return {id,asOf,savedAt,total,itemCount,pendingCount};}
function makeInventoryService({db,allowedEmails,registrationCode='',now=()=>new Date()}){
 async function writerIdentity(request){
  if(request.auth?.token.email_verified===true&&allowedEmails.includes(request.auth.token.email))return request.auth.uid;
  const supplied=request.data?.registrationCode;
  if(typeof supplied!=='string'||supplied.length<8||supplied.length>128||registrationCode.length<8)throw new StockError('permission-denied','재고 등록용 번호를 입력하세요.');
  const instant=now().getTime(),bucket=Math.floor(instant/900000);
  const address=request.rawRequest?.ip||'unknown';
  const limitRef=db.collection('mf_stock_auth_limits').doc(createHash('sha256').update(address).digest('hex')+'_'+bucket);
  const match=timingSafeEqual(createHash('sha256').update(supplied).digest(),createHash('sha256').update(registrationCode).digest());
  await db.runTransaction(async tx=>{
   const snap=await tx.get(limitRef),failures=Number(snap.data()?.failures)||0;
   if(failures>=5)throw new StockError('resource-exhausted','등록 번호를 여러 번 잘못 입력했습니다. 15분 후 다시 시도하세요.');
   if(!match)tx.set(limitRef,{failures:failures+1});
  });
  if(!match)throw new StockError('permission-denied','재고 등록용 번호가 맞지 않습니다.');
  return 'stock-registration-code';
 }
 const collection=db.collection('mf_stock_snapshots');
 const latestRef=db.collection('mf_stock_meta').doc('latest');
 const isNewer=(a,b)=>!b||a.asOf>b.asOf||(a.asOf===b.asOf&&a.savedAt>b.savedAt);
 async function save(request){
  const createdBy=await writerIdentity(request);
  const {id,asOf,hash,parsed}=validateRecord(request.data,now());
  if(request.data.dryRun===true)return {preview:true,...parsed};
  const ref=collection.doc(id);
  const dayRef=db.collection('mf_stock_meta').doc('day_'+request.data.date);
  const saved=await db.runTransaction(async tx=>{
   const snap=await tx.get(ref),latest=await tx.get(latestRef),day=await tx.get(dayRef);
   if(snap.exists){const previous=snap.data();if(previous.inputHash!==hash)throw new StockError('already-exists','같은 등록 요청의 내용이 달라졌습니다. 다시 확인하세요.');return previous;}
   const value={schemaVersion:1,id,date:request.data.date,asOf,savedAt:now().toISOString(),createdBy,inputHash:hash,...parsed};
   delete value.errors;delete value.verified;
   tx.create(ref,value);
   if(isNewer(value,latest.data()))tx.set(latestRef,metadata(value));
   if(isNewer(value,day.data()))tx.set(dayRef,metadata(value));
   return value;
  });
  return {snapshot:publicSnapshot(saved)};
 }
 async function get(data={}){
  if(data.date!==undefined && !validDate(data.date))throw new StockError('invalid-argument','조회 날짜를 확인하세요.');
  if(data.id!==undefined && (typeof data.id!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}_[a-f0-9-]{36}$/i.test(data.id)))throw new StockError('invalid-argument','조회 기록을 확인하세요.');
  const latest=await latestRef.get(),latestValue=latest.data();
  const date=data.date||latestValue?.id.slice(0,10)||new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul'}).format(now());
  const historySnap=await collection.where('id','>=',date+'T').where('id','<',date+'U').orderBy('id','desc').limit(100).get();
  const values=historySnap.docs.map(x=>x.data()).sort((a,b)=>b.asOf.localeCompare(a.asOf)||b.savedAt.localeCompare(a.savedAt));
  let chosen=values[0]||null;
  const day=await db.collection('mf_stock_meta').doc('day_'+date).get();
  const selectedId=data.id||day.data()?.id;
  if(selectedId){if(selectedId.slice(0,10)!==date)throw new StockError('invalid-argument','기록 날짜와 조회 날짜가 다릅니다.');const snap=await collection.doc(selectedId).get();chosen=snap.exists?snap.data():null;}
  if(chosen&&!values.some(v=>v.id===chosen.id))values.unshift(chosen);
  return {date,snapshot:publicSnapshot(chosen),history:values.map(metadata),latestAsOf:latestValue?.asOf||null,latestId:latestValue?.id||null};
 }
 return {save,get};
}
module.exports={StockError,validateRecord,publicSnapshot,makeInventoryService};
