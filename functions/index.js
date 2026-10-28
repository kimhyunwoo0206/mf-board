'use strict';
const {onCall,HttpsError}=require('firebase-functions/v2/https');
const {defineSecret}=require('firebase-functions/params');
const {initializeApp}=require('firebase-admin/app');
const {getFirestore}=require('firebase-admin/firestore');
const {makeInventoryService,StockError}=require('./inventory');
initializeApp({databaseURL:'https://coupang-mf-default-rtdb.asia-southeast1.firebasedatabase.app'});
const stockRegistrationCode=defineSecret('MF_STOCK_REGISTRATION_CODE');
// 신규 직원 이메일을 받으면 이 목록과 stock.html의 승인 목록에 함께 추가합니다.
const ALLOWED_EMAILS = [
  'youngmooff@gmail.com',
  'withfresh11@gmail.com'
];
const stockOptions={region:'asia-southeast1',memory:'256MiB',cpu:1,minInstances:0,maxInstances:2,concurrency:10,timeoutSeconds:60,cors:['https://kimhyunwoo0206.github.io']};
function stockService(registrationCode=''){return makeInventoryService({db:getFirestore(),allowedEmails:ALLOWED_EMAILS,registrationCode});}
async function runStock(action){
  try{return await action();}
  catch(e){if(e instanceof StockError)throw new HttpsError(e.code,e.message);throw new HttpsError('unavailable','재고를 처리하지 못했습니다. 잠시 후 다시 시도하세요.');}
}
exports.saveMfStock=onCall({...stockOptions,secrets:[stockRegistrationCode]},request=>runStock(()=>stockService(stockRegistrationCode.value()).save(request)));
// Link holders may view stock; only approved accounts may create immutable snapshots.
exports.getMfStock=onCall(stockOptions,request=>runStock(()=>stockService().get(request.data||{})));
