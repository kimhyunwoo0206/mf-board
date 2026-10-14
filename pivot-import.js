'use strict';
(function(root,factory){
  if(typeof module==='object' && module.exports)module.exports=factory();
  else root.MfPivotImport=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const normalize=name=>String(name).trim().replace(/^\[로켓프레시\]\s*/,'').replace(/^(?:위드프레쉬|워드프레쉬)\s*산지직송\s*/,'').replace(/^국내산\s*/,'')
    .replace(/^남해안\s*활\s*홍가리비/,'홍가리비').replace(/^손질\s*갑오징어/,'갑오징어')
    .replace(/^생물\s*손질\s*오징어/,'손질오징어(통)').replace(/^손질\s*오징어\s*\(해동\)/,'손질오징어(할복)')
    .replace(/^(갑오징어\s*\d+(?:\.\d+)?(?:kg|g))\s*\(해동\)$/,'$1').replace(/\s/g,'');
  function parsePivot(text,{date,slot,catalog}) {
    const n=Number(String(slot).split('_')[0]);
    if(![1,2,3,4].includes(n)||!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error('날짜와 차수를 선택하세요.');
    if(!Array.isArray(catalog))throw new Error('품목 기준표를 불러오지 못했습니다.');
    const lines=String(text).replace(/^\uFEFF/,'').split(/\r?\n/).filter(s=>s.trim());
    if(!lines.length)throw new Error('엑셀의 상품명과 수량 두 열을 복사해 붙여넣으세요.');
    const rows=[],totals=[],errors=[];
    let currentDate=null,currentSlot=null,currentPart=null,dailyTotal=null,hasGroups=false,selectedGroupCount=0;
    const dates=new Set(),partTotals={},partHeaderCounts={};
    const quantity=s=>/^\d{1,3}(?:,\d{3})*$|^\d+$/.test(s)&&Number.isSafeInteger(Number(s.replace(/,/g,'')))&&Number(s.replace(/,/g,''))<=100000?Number(s.replace(/,/g,'')):null;
    lines.forEach((line,i)=>{
      const cells=line.split('\t').map(s=>s.trim()),label=(cells[0]||'').replace(/^[+−-]\s*(?=\d)/,'');
      const rest=cells.slice(1).filter(Boolean);
      const q=rest.length===1?quantity(rest[0]):null;
      if(!label){errors.push((i+1)+'행 상품명이 비어 있습니다. 상품명과 수량 두 열을 복사하세요.');return;}
      if(/^(행\s*레이블|Row Labels)$|^합계\s*[:：]|^Sum of /i.test(label))return;
      if(/^(?:\d{6}|\d{8}|\d{4}-\d{2}-\d{2})$/.test(label)){
        currentDate=label.length===6?'20'+label.slice(0,2)+'-'+label.slice(2,4)+'-'+label.slice(4,6):label.length===8?label.slice(0,4)+'-'+label.slice(4,6)+'-'+label.slice(6):label;
        dates.add(currentDate);currentSlot=null;currentPart=null;return;
      }
      // 1차는 1-1·1-2 두 번에 나뉘어 들어오며, 두 묶음을 합쳐 1차로 등록합니다.
      const part=label.match(/^1\s*(?:차)?\s*-\s*([12])\s*(?:차)?$/);
      if(part){
        currentSlot=1;currentPart='1-'+part[1];hasGroups=true;
        if(n===1 && (!currentDate||currentDate===date)){partHeaderCounts[currentPart]=(partHeaderCounts[currentPart]||0)+1;(partTotals[currentPart]=partTotals[currentPart]||[]).push(q);}
        return;
      }
      const group=label.match(/^([1-4])\s*(?:차)?(?:\s*\((?:8|10|12|13)시(?:\s*마감)?\))?$/)||label.match(/^(8|10|12|13)시$/);
      if(group){
        currentSlot=label.endsWith('시')?{'8':1,'10':2,'12':3,'13':4}[group[1]]:Number(group[1]);currentPart=null;hasGroups=true;
        if(currentSlot===n && (!currentDate||currentDate===date)){selectedGroupCount++;totals.push(q);}
        return;
      }
      if(/^(총합계?|총계|Grand Total)$/i.test(label)){dailyTotal=q;currentSlot=null;currentPart=null;return;}
      if(/^소계$/.test(label)){if(currentSlot===n && (!currentDate||currentDate===date)){if(currentPart)partTotals[currentPart].push(q);else totals.push(q);}return;}
      rows.push({name:label,quantity:q,slot:currentSlot,part:currentPart,date:currentDate,line:i+1,validColumns:cells.length>=2 && rest.length===1});
    });
    const partNames=Object.keys(partHeaderCounts).sort();
    if(dates.size && !dates.has(date))errors.push('복사한 피벗 날짜와 선택한 발주 날짜가 다릅니다.');
    if(partNames.some(p=>partHeaderCounts[p]!==1))errors.push('1-1·1-2 머리글을 각각 한 번만 포함해 복사하세요.');
    if(hasGroups && selectedGroupCount>1)errors.push('선택한 '+n+'차 머리글을 한 번만 포함해 복사하세요. 전체 피벗도 복사할 수 있습니다.');
    if(hasGroups && !selectedGroupCount && !partNames.length)errors.push('선택한 '+n+'차 머리글을 포함해 복사하세요.'+(n===1?' 1차는 1-1·1-2 머리글을 포함하세요.':'')+' 전체 피벗도 복사할 수 있습니다.');
    const selected=rows.filter(r=>(!r.date||r.date===date)&&(!hasGroups||r.slot===n));
    if(!selected.length)errors.push('선택한 '+n+'차의 상품 행이 없습니다. 차수를 펼친 뒤 복사하세요.');
    if(partNames.length && selected.some(r=>!r.part))errors.push('1차 상품 행이 1-1·1-2 머리글 밖에 있습니다. 1-1·1-2 머리글을 포함해 다시 복사하세요.');
    const items={},pendingRows=[],parts={};
    for(const p of partNames)parts[p]={items:{},total:0,sourceTotal:null};
    for(const r of selected){
      if(r.part)parts[r.part].total+=r.quantity||0;
      if(!r.validColumns||r.quantity===null){errors.push(r.line+'행 수량 확인 필요: 상품명(A열)과 수량(B열)만 함께 복사하세요.');continue;}
      const item=catalog.find(x=>[x.name,...(x.aliases||[])].some(a=>normalize(a)===normalize(r.name)));
      if(!item){pendingRows.push({...r,fieldName:r.name,status:'신규 SKU 확인 필요'});continue;}
      if(r.quantity){items[item.name]=(items[item.name]||0)+r.quantity;if(r.part)parts[r.part].items[item.name]=(parts[r.part].items[item.name]||0)+r.quantity;}
    }
    const consistent=(list,label)=>{const usable=list.filter(q=>q!==null);if(usable.some(q=>q!==usable[0])){errors.push(label+' 머리글 합계와 소계가 다릅니다.');return null;}return usable.length?usable[0]:null;};
    for(const p of partNames){
      const s=consistent(partTotals[p],p);parts[p].sourceTotal=s;
      if(s!==null && parts[p].total!==s)errors.push(p+' 소계 '+s+'건과 붙여넣은 상품 합 '+parts[p].total+'건이 다릅니다. 누락된 행을 포함해 다시 복사하세요.');
    }
    const total=selected.reduce((sum,r)=>sum+(r.quantity||0),0);
    let sourceTotal=consistent(totals,'선택 차수의');
    if(sourceTotal===null && partNames.length && partNames.every(p=>parts[p].sourceTotal!==null))sourceTotal=partNames.reduce((s,p)=>s+parts[p].sourceTotal,0);
    if(sourceTotal!==null && total!==sourceTotal)errors.push(n+'차 소계 '+sourceTotal+'건과 붙여넣은 상품 합 '+total+'건이 다릅니다. 누락된 행을 포함해 다시 복사하세요.');
    return {items,pendingRows,total,sourceTotal,dailyTotal,errors,selectedRowCount:selected.length,excludedRowCount:rows.length-selected.length,hasGroups,parts:partNames.length?parts:null};
  }
  return {parsePivot};
});

