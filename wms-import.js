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
    const errors=[],byBarcode=new Map(),stamps=new Map(),seen=new Set(),badDates=new Set(),shipments={},det={};
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
      {const wb=cells.find(x=>/^103\d{11}$/.test(x))||'',key=wb||cells[0],batch=/^\d{10}$/.test(cells[2]||'')?cells[2]:(cells.find(x=>/^\d{10}$/.test(x))||'');
       if(/^\d{4,}$/.test(key)){const d=det[key]||(det[key]={b:batch,s:cells[0],l:{}});d.l[cells[b]]=(d.l[cells[b]]||0)+quantity;}}
      byBarcode.set(cells[b],(byBarcode.get(cells[b])||0)+quantity);
      for(const k of [cells[0],cells.find(x=>/^103\d{11}$/.test(x))])if(k&&/^\d{4,}$/.test(k)){const m=shipments[k]||(shipments[k]={});m[cells[b]]=(m[cells[b]]||0)+quantity;}
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
    const packed={};for(const [id,m] of Object.entries(shipments))packed[id]=Object.entries(m).map(([bc,q])=>bc+':'+q).join(',');
    const details={};for(const [k,d] of Object.entries(det))details[k]=d.b+'|'+d.s+'|'+Object.entries(d.l).map(([bc,q])=>bc+':'+q).join(',');
    return {source:'wms',shipments:packed,details,items,pendingRows,total,sourceTotal:null,dailyTotal:null,errors,selectedRowCount:rowCount,excludedRowCount:0,hasGroups:false,parts:null,notes};
  }

  // 출고 관리 '출고 취소' 목록: 배치 ID(10자리 또는 '-')와 쉬핑먼트 ID(12자리 = 출고번호)를 읽습니다.
  // 배치 ID가 있는 건만 발주 등록분에서 차감 대상입니다(배치 생성 후 취소). '-'는 등록 전 취소라 제외합니다.
  function parseCancel(text){
    // 쿠팡 화면은 셀 안에서 줄바꿈이 되어 한 건이 여러 줄로 붙여넣어지므로, 줄이 아니라 '칸(토큰)' 순서로 읽습니다.
    // 한 건 = 직전 쉬핑먼트 ID 다음 칸부터 이번 쉬핑먼트 ID(12자리)까지. 배치 ID는 그 12자리 바로 앞쪽(계획 출고 ID·주문번호 앞)에 있습니다.
    const rows0=String(text);
    // 운송장 번호(103으로 시작하는 14자리)만 붙여넣은 경우: 붙여넣은 번호를 모두 취소 대상으로 봅니다.
    if(!/(^|[\t\r\n"])\d{12}([\t\r\n"]|$)/.test(rows0)){
      const ws=[...new Set(rows0.match(/\b103\d{11}\b/g)||[])];
      return {rows:ws.map(w=>({id:w,keys:[w],hasBatch:true,batch:''})),notCancelled:[],ignoredLines:0};
    }
    const tokens=String(text).replace(/^\uFEFF/,'').split(/\t|\r?\n/).map(x=>x.replace(/^"+|"+$/g,'').trim()).filter(Boolean);
    const rows=[],seen=new Set(),notCancelled=[];let prev=-1;
    tokens.forEach((t,i)=>{
      if(!/^\d{12}$/.test(t))return;
      const win=tokens.slice(prev+1,i+2);
      const wb=win.find(x=>/^103\d{11}$/.test(x));
      let batch='';
      for(let k=i-1;k>Math.max(prev,i-7);k--){if(/^(\d{10}|-)$/.test(tokens[k])){batch=tokens[k];break;}}
      prev=i;
      if(seen.has(t))return;seen.add(t);
      if(!/cancel|취소/i.test(win.join(' '))){notCancelled.push(t);return;}
      rows.push({id:t,keys:[t,wb].filter(Boolean),hasBatch:/^\d{10}$/.test(batch),batch:/^\d{10}$/.test(batch)?batch:''});
    });
    return {rows,notCancelled,ignoredLines:0};
  }
  // day = mf_orders/{날짜} 저장분. 어느 차수에 등록된 출고번호인지 찾아 차감할 품목·수량을 계산합니다.
  function resolveCancels(day,rows,catalog){
    const slots=(day&&day.slots)||{},done={};
    for(const [id,c] of Object.entries((day&&day.cancelled)||{})){done[id]=1;for(const k of (c&&c.keys)||[])done[k]=1;}
    const res={matched:[],already:[],noBatch:[],notFound:[],unknownBarcode:[]};
    for(const r of rows){
      if(!r.hasBatch){res.noBatch.push(r.id);continue;}
      if((r.keys||[r.id]).some(k=>done[k])){res.already.push(r.id);continue;}
      let found=null,from='';
      for(const [k,slot] of Object.entries(slots)){const key=(r.keys||[r.id]).find(q=>slot&&slot.shipments&&slot.shipments[q]);if(key){found=slot.shipments[key];from=k;break;}}
      if(!found){res.notFound.push(r.id);continue;}
      const parts=String(found).split(',').map(x=>x.split(':'));
      const names=[];let bad=false;
      for(const [bc,q] of parts){const item=catalog.find(x=>x.barcode===bc);if(!item){bad=true;res.unknownBarcode.push(r.id+'('+bc+')');break;}names.push({name:item.name,qty:Number(q)||0});}
      if(!bad)res.matched.push({id:r.id,keys:r.keys||[r.id],from,lines:names});
    }
    return res;
  }
  return {looksLikeWms,parseWms,parseCancel,resolveCancels};
});
