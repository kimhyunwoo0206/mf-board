'use strict';
const {onCall,HttpsError}=require('firebase-functions/v2/https');
const {defineSecret}=require('firebase-functions/params');
const {initializeApp}=require('firebase-admin/app');
const {getFirestore}=require('firebase-admin/firestore');
const {validateImage}=require('./validation');
const {extractOrder}=require('./extraction');
initializeApp({databaseURL:'https://coupang-mf-default-rtdb.asia-southeast1.firebasedatabase.app'});
const apiKey=defineSecret('OPENAI_API_KEY');
exports.extractMfOrder=onCall({region:'asia-southeast1',secrets:[apiKey],memory:'256MiB',cpu:1,minInstances:0,maxInstances:1,concurrency:1,timeoutSeconds:300,cors:['https://kimhyunwoo0206.github.io']},async request=>{
  if(!request.auth || request.auth.token.email_verified!==true || !['youngmooff@gmail.com','withfresh11@gmail.com'].includes(request.auth.token.email))throw new HttpsError('permission-denied','승인된 Google 계정으로 로그인하세요.');
  let image;
  try{image=validateImage(request.data?.image);}catch(e){throw new HttpsError('invalid-argument',e.message);}
  const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul'}).format(new Date());
  const db=getFirestore(),quotaRef=db.doc(`mf_ai_usage/${date}`);
  const reserve=()=>db.runTransaction(async transaction=>{
    const snap=await transaction.get(quotaRef),n=Number(snap.data()?.attempts)||0;
    if(n>=30)throw new HttpsError('resource-exhausted','오늘 판독 한도(30회)에 도달했습니다.');
    transaction.set(quotaRef,{attempts:n+1});
  });
  try{return await extractOrder({image,key:apiKey.value(),reserve});}
  catch(e){if(e instanceof HttpsError)throw e;throw new HttpsError('unavailable','사진 판독을 완료하지 못했습니다. 잠시 후 다시 시도하거나 선명한 사진을 선택하세요.');}
});
