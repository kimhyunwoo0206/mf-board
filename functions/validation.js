'use strict';
const catalog = require('./catalog.json');
function validateImage(image) {
  if (typeof image !== 'string' || image.length > 7_000_000 || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(image)) throw new Error('JPG, PNG, WEBP 사진 한 장(5MB 이하)을 선택하세요.');
  const encoded=image.split(',')[1], bytes=Buffer.from(encoded,'base64');
  if (!bytes.length || bytes.length>5_000_000 || bytes.toString('base64')!==encoded) throw new Error('사진 파일을 다시 선택하세요.');
  return image;
}
function fieldName(name) {
  return String(name).trim().replace(/^\[로켓프레시\]\s*/, '').replace(/^위드프레쉬\s*산지직송\s*/, '').replace(/^국내산\s*/, '')
    .replace(/^남해안\s*활\s*홍가리비/, '홍가리비').replace(/^손질\s*갑오징어/, '갑오징어')
    .replace(/^생물\s*손질\s*오징어/, '손질오징어(통)').replace(/^손질\s*오징어\s*\(해동\)/, '손질오징어(할복)')
    .replace(/^(갑오징어\s*\d+(?:\.\d+)?(?:kg|g))\s*\(해동\)$/, '$1')
    .replace(/\s+/g, ' ').trim();
}
const compact=name=>fieldName(name).replace(/\s/g,'');
function validateExtraction(value) {
  if (!value || !Array.isArray(value.rows) || value.rows.length>300 || !Array.isArray(value.warnings)) throw new Error('판독 형식 오류');
  const warnings=value.warnings.map(String), rawRows=[];
  let total=0, complete=value.rows.length>0 && value.tableComplete===true;
  if(value.tableComplete!==true)warnings.push('대상 표 전체 행 확인 필요');
  value.rows.forEach((row,index)=>{
    const valid=row && typeof row.name==='string' && row.name.trim() && row.uncertain===false && Number.isSafeInteger(row.quantity) && row.quantity>=0 && row.quantity<=100000 && (row.barcode===null || typeof row.barcode==='string');
    if (!valid) {complete=false;warnings.push(`${index+1}행: 원본 상품명 또는 수량 확인 필요`);}
    if(Number.isSafeInteger(row?.quantity) && row.quantity>=0 && row.quantity<=100000) total+=row.quantity;
    rawRows.push({...row,rowNumber:index+1});
  });
  const sourceTotal=Number.isSafeInteger(value.total) && value.total>=0 ? value.total : null;
  if(sourceTotal===null)warnings.push('사진 하단 총합 확인 필요');
  else if(sourceTotal!==total)warnings.push(`사진 총합과 판독 합계가 다릅니다: 사진 ${sourceTotal}, 판독 ${total}`);
  if(!value.rows.length)warnings.push('읽을 수 있는 품목이 없습니다.');
  const verified=complete && sourceTotal!==null && sourceTotal===total;
  // Catalog matching happens only after the complete transcription passes validation.
  if(!verified)return {rows:[],rawRows,pendingRows:[],total,sourceTotal,warnings,needsReview:true,status:'RECHECK',registeredTotal:0};
  const items=new Map(),pendingRows=[];
  rawRows.forEach(row=>{
    const item=row.barcode ? catalog.find(x=>x.barcode===row.barcode) : catalog.find(x=>compact(x.name)===compact(row.name) || (x.aliases||[]).some(a=>compact(a)===compact(row.name)));
    if(!item){pendingRows.push({...row,fieldName:fieldName(row.name),status:'신규 SKU 확인 필요'});return;}
    if(row.quantity)items.set(item.name,(items.get(item.name)||0)+row.quantity);
  });
  const rows=Array.from(items,([name,quantity])=>({name,quantity}));
  return {rows,rawRows,pendingRows,total,sourceTotal,warnings,needsReview:false,status:pendingRows.length?'NEW_SKU_REVIEW':'VERIFIED',registeredTotal:rows.reduce((n,r)=>n+r.quantity,0)};
}
module.exports={catalog,validateImage,validateExtraction,fieldName};
