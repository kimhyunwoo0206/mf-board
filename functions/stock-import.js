'use strict';
(function(root,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory();
 else root.MfStockImport=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 const fields={name:['상품명','제품명','sku명','상품이름'],barcode:['상품바코드','바코드','barcode'],productId:['외부skuid','외부sku','externalskuid'],quantity:['현재재고','현재재고수량','재고수량','현재고','수량','재고'],rowId:['인벤토리id','inventoryid','재고id'],location:['로케이션','로케이션명','location','재고위치','보관위치']};
 const clean=s=>String(s).trim().toLowerCase().replace(/[\s_()-]/g,'');
 const normalize=s=>String(s).trim().replace(/^\[로켓프레시\]\s*/,'').replace(/^(?:위드프레쉬|워드프레쉬)\s*산지직송\s*/,'').replace(/^국내산\s*/,'')
 .replace(/^남해안\s*활\s*홍가리비/,'홍가리비').replace(/^손질\s*갑오징어/,'갑오징어').replace(/^생물\s*손질\s*오징어/,'손질오징어(통)').replace(/^손질\s*오징어\s*\(해동\)/,'손질오징어(할복)').replace(/^(갑오징어\s*\d+(?:\.\d+)?(?:kg|g))\s*\(해동\)$/,'$1').replace(/\s/g,'');
 function cells(text){
  if(typeof text!=='string'||text.length>200000)throw new Error('엑셀 내용은 200KB 이하로 복사하세요.');
  const data=[],row=[];let cell='',quote=false;
  for(let i=0;i<text.length;i++){
   const c=text[i];
   if(c==='"'){if(quote&&text[i+1]==='"'){cell+='"';i++;}else if(quote||cell==='')quote=!quote;else cell+=c;}
   else if(!quote&&(c==='\t'||c==='\n'||c==='\r')){
    row.push(cell.trim());cell='';
    if(c!=='\t'){if(c==='\r'&&text[i+1]==='\n')i++;if(row.some(Boolean))data.push([...row]);row.length=0;}
   }else cell+=c;
  }
  if(quote)throw new Error('닫히지 않은 따옴표가 있습니다. 엑셀 셀 범위를 다시 복사하세요.');
  row.push(cell.trim());if(row.some(Boolean))data.push([...row]);
  if(data.length>1001)throw new Error('한 번에 1,000개 재고 행까지 등록할 수 있습니다.');
  return data;
 }
 function inspect(text){
  const data=cells(text);if(!data.length)throw new Error('엑셀 내용을 붙여넣으세요.');
  const first=data[0],header=Object.values(fields).flat().some(alias=>first.some(s=>clean(s)===alias));
  const width=Math.max(...data.map(r=>r.length));
  const headers=Array.from({length:width},(_,i)=>header?(first[i]||'열 '+(i+1)):'열 '+(i+1));
  const mapping={};for(const [key,aliases] of Object.entries(fields)){const hits=first.map((s,i)=>aliases.includes(clean(s))?i:-1).filter(i=>i>=0);mapping[key]=header&&hits.length===1?hits[0]:-1;}
  if(!header&&width===2){mapping.name=0;mapping.quantity=1;}
  const coupangProfile=!header && [9,10].includes(width) && data.slice(0,5).every(r=>/^\d+$/.test(r[4]||'')&&/^\d{13}$/.test(r[6]||'')&&!!r[7]&&!/^\d+$/.test(r[7])&&/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(r[width-1]||''));
  if(coupangProfile){
   Object.assign(mapping,{rowId:0,location:2,productId:4,barcode:6,name:7,quantity:width-1});
   const names={0:'인벤토리 ID',1:'로케이션 구분',2:'로케이션',3:'내부 SKU ID',4:'외부 SKU ID',5:'SKU 등급',6:'상품 바코드',7:'상품명'};
   headers.forEach((h,i)=>headers[i]=i===width-1?'수량':names[i]||h);
  }
  return {headers,hasHeader:header,mapping,rowCount:data.length-(header?1:0)};
 }
 function parseStock(text,{columns,hasHeader=true,catalog,expectedTotal=null}={}){
  const data=cells(text),errors=[],warnings=[],rawRows=[],items=new Map(),seen=new Map();
  if(!data.length)throw new Error('엑셀 내용을 붙여넣으세요.');
  if(!Array.isArray(catalog)||!columns||!Number.isInteger(columns.quantity)||columns.quantity<0)throw new Error('현재재고 수량 열을 선택하세요.');
  const width=Math.max(...data.map(r=>r.length)),selected=Object.values(columns).filter(x=>Number.isInteger(x)&&x>=0);
  if(selected.some(x=>x>=width)||new Set(selected).size!==selected.length)throw new Error('서로 다른 올바른 열을 선택하세요.');
  if(!['name','barcode','productId'].some(k=>Number.isInteger(columns[k])&&columns[k]>=0))throw new Error('상품명, 바코드 또는 외부 SKU ID 열을 하나 이상 선택하세요.');
  if(hasHeader && /할당|예약|allocated|reserved/i.test(data[0][columns.quantity]||''))throw new Error('할당수량이 아닌 현재재고 수량 열을 선택하세요.');
  if(hasHeader && columns.productId>=0 && /내부|internal/i.test(data[0][columns.productId]||''))throw new Error('내부 SKU ID를 외부 SKU ID로 선택할 수 없습니다.');
  let sourceTotal=null,duplicateCount=0,total=0,abbreviatedIds=false;
  const get=(r,k)=>Number.isInteger(columns[k])&&columns[k]>=0?(r[columns[k]]||'').trim():'';
  data.slice(hasHeader?1:0).forEach((r,index)=>{
   const line=index+(hasHeader?2:1),name=get(r,'name'),barcode=get(r,'barcode'),productId=get(r,'productId'),q=get(r,'quantity'),rowId=get(r,'rowId'),location=get(r,'location');
   const validQty=/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(q);
   const quantity=validQty?Number(q.replace(/,/g,'')):null;
   if(r.some(v=>/^(총합계?|합계|Grand Total)$/i.test(v))){
    if(!validQty||!Number.isSafeInteger(quantity)){errors.push(line+'행 총합 수량 확인 필요');return;}
    if(sourceTotal!==null&&sourceTotal!==quantity)errors.push('총합계가 여러 개이며 숫자가 다릅니다.');
    sourceTotal=quantity;return;
   }
   if(!validQty||!Number.isSafeInteger(quantity)||quantity>10000000){errors.push(line+'행: 현재재고가 비었거나 정수가 아닙니다.');return;}
   if(!name&&!barcode&&!productId){errors.push(line+'행: 상품 식별자가 없습니다.');return;}
   if(barcode&&!/^\d{13}$/.test(barcode)){errors.push(line+'행: 바코드는 13자리 원문 숫자로 복사하세요.');return;}
   if(productId&&!/^\d+$/.test(productId)){errors.push(line+'행: 외부 SKU ID를 원문 숫자로 복사하세요.');return;}
   const byBarcode=barcode?catalog.find(x=>x.barcode===barcode):null,byId=productId?catalog.find(x=>x.productId===productId):null;
   if((byBarcode&&byId&&byBarcode.barcode!==byId.barcode)||(byBarcode?.productId&&productId&&byBarcode.productId!==productId)||(byId&&barcode&&byId.barcode!==barcode)){errors.push(line+'행: 바코드와 외부 SKU ID가 서로 다른 상품을 가리킵니다.');return;}
   const matched=byBarcode||byId||(!barcode&&!productId?catalog.find(x=>[x.name,...(x.aliases||[])].some(a=>normalize(a)===normalize(name))):null);
   const key=matched?'b:'+matched.barcode:JSON.stringify([barcode,productId,normalize(name)]);
   const raw={name,barcode,productId,quantity,rowId,location,line};
   const abbreviated=/^\d+(?:\.\d+)?e[+-]?\d+$/i.test(rowId);
   if(abbreviated)abbreviatedIds=true;
   if(rowId&&!abbreviated){
    const identity=JSON.stringify([rowId,location]),signature=JSON.stringify([key,quantity]);
    if(seen.has(identity)){if(seen.get(identity)!==signature)errors.push(line+'행: 같은 인벤토리 ID의 상품 또는 수량이 다릅니다.');else duplicateCount++;return;}
    seen.set(identity,signature);
   }
   rawRows.push(raw);total+=quantity;
   if(!items.has(key))items.set(key,{name:matched?.name||name||barcode||productId,barcode:barcode||matched?.barcode||'',productId:productId||matched?.productId||'',quantity:0,sourceRowCount:0,status:matched?'확인 완료':'신규 SKU 확인 필요'});
   const item=items.get(key);item.quantity+=quantity;item.sourceRowCount++;
  });
  if(!rawRows.length)errors.push('집계할 재고 행이 없습니다.');
  if(sourceTotal!==null && sourceTotal!==total)errors.push('엑셀 총합 '+sourceTotal+'개와 집계 '+total+'개가 다릅니다.');
  if(expectedTotal!==null && (!Number.isSafeInteger(expectedTotal)||expectedTotal<0||expectedTotal!==total))errors.push('직접 입력한 총합과 집계 수량이 다릅니다.');
  const rows=[...items.values()],pendingCount=rows.filter(x=>x.status!=='확인 완료').length;
  if(sourceTotal===null && expectedTotal===null)warnings.push('원본 총합 미제공: 행별 수량과 SKU별 합계의 일치만 확인했습니다.');
  if(pendingCount)warnings.push('신규 SKU '+pendingCount+'품목은 원문 식별자로 표시하며 확인이 필요합니다.');
  if(duplicateCount)warnings.push('같은 인벤토리 ID·로케이션의 중복 '+duplicateCount+'행을 한 번만 집계했습니다.');
  if(abbreviatedIds)warnings.push('인벤토리 번호가 지수 표기로 축약되었습니다. 번호로 중복 제거하지 않고 복사한 각 행을 합산했습니다.');
  return {rows,total,itemCount:rows.length,sourceRowCount:rawRows.length,duplicateCount,pendingCount,sourceTotal,rawRows,errors,warnings,verified:errors.length===0 && rows.reduce((n,r)=>n+r.quantity,0)===total};
 }
 return {inspect,parseStock};
});
