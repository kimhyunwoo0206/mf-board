'use strict';
(function(root,factory){
  if(typeof module==='object' && module.exports)module.exports=factory();
  else root.MfWmsImport=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  // 쿠팡 WMS '워크 플로우 상세' 표를 그대로 복사해 붙여넣은 내용을 바코드별로 합산합니다.
  // 열: 출고번호 · 주문 ID · 배치 ID · 운송장 번호 · 박스 타입 · SKU ID · Barcode · 수량 · 출고 마감 시간 · 재고 위치 · 배송구분
  // 머리글 유무와 열 순서가 조금 달라도 '13자리 바코드 바로 오른쪽 숫자 = 수량', '날짜 시간 칸 = 출고 마감 시간'으로 찾습니다.
  const BARCODE=/^\d{13}$/,STAMP=/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/,QTY=/^\d{1,6}$/;
  function lines(text){
    return String(text).replace(/^﻿/,'').split(/\r?\n/)
      .map((line,i)=>({n:i+1,cells:line.split('\t').map(s=>s.trim())}))
      .filter(l=>l.cells.some(Boolean));
  }
  const barcodeAt=cells=>cells.findIndex((s,k)=>BARCODE.test(s)&&QTY.test(cells[k+1]||''));
  function looksLikeWms(text){
    return lines(text).some(l=>l.cells.length>=5&&l.cells.some(s=>STAMP.test(s))&&barcodeAt(l.cells)>=0);
  }
  function parseWms(text,{date,catalog}={}){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error('날짜를 선택하세요.');
    if(!Array.isArray(catalog))throw new Error('품목 기준표를 불러오지 못했습니다.');
    if(String(text).length>3000000)throw new Error('붙여넣은 내용이 너무 큽니다. 나누어 붙여넣으세요.');
    const errors=[],byBarcode=new Map(),stamps=new Map(),seen=new Set(),badDates=new Set();
    let rowCount=0,total=0,duplicates=0,duplicateExample='';
    for(const {n,cells} of lines(text)){
      const b=barcodeAt(cells),s=cells.findIndex(x=>STAMP.test(x));
      if(b<0&&s<0){                               // 머리글·안내 문구 줄은 건너뛰되, 바코드가 있는 데이터 행은 조용히 버리지 않습니다.
        if(cells.length>=5&&cells.some(x=>BARCODE.test(x)))errors.push(n+'행: 바코드 오른쪽의 수량과 출고 마감 시간을 찾지 못했습니다.');
        continue;
      }
      if(b<0||s<0){errors.push(n+'행: 바코드(13자리)와 수량, 출고 마감 시간을 함께 찾지 못했습니다.');continue;}
      const quantity=Number(cells[b+1]);
      if(!Number.isSafeInteger(quantity)||quantity<1){errors.push(n+'행: 수량을 확인하세요.');continue;}
      const key=cells.join('\t');
      if(seen.has(key)){duplicates++;duplicateExample=duplicateExample||cells[0];continue;}
      seen.add(key);
      const [,day,time]=STAMP.exec(cells[s]);
      if(day!==date)badDates.add(day);
      stamps.set(time,(stamps.get(time)||0)+1);
      byBarcode.set(cells[b],(byBarcode.get(cells[b])||0)+quantity);
      rowCount++;total+=quantity;
    }
    if(duplicates)errors.push('똑같은 행이 '+duplicates+'개 중복되어 있습니다(출고번호 '+duplicateExample+' 등). 같은 화면을 두 번 붙여넣지 않았는지 확인하고 다시 붙여넣으세요.');
    if(badDates.size)errors.push('복사한 출고 마감일('+[...badDates].sort().join(', ')+')과 선택한 발주 날짜('+date+')가 다릅니다. 날짜를 확인하세요.');
    if(!rowCount&&!errors.length)errors.push('붙여넣은 내용에서 출고 행을 찾지 못했습니다. 쿠팡 화면의 표(출고번호~배송구분)를 복사해 붙여넣으세요.');
    const items={},pendingRows=[];
    for(const [barcode,quantity] of byBarcode){
      const item=catalog.find(x=>x.barcode===barcode);
      if(item)items[item.name]=(items[item.name]||0)+quantity;
      else pendingRows.push({name:barcode,fieldName:barcode,barcode,quantity,status:'신규 SKU 확인 필요'});
    }
    const notes=['쿠팡 화면 표 · 출고 마감 시간 '+[...stamps].sort().map(([t,c])=>t+' ('+c+'행)').join(', ')+' · 바코드 '+byBarcode.size+'종'];
    return {source:'wms',items,pendingRows,total,sourceTotal:null,dailyTotal:null,errors,selectedRowCount:rowCount,excludedRowCount:0,hasGroups:false,parts:null,notes};
  }
  return {looksLikeWms,parseWms};
});
