'use strict';
// 기간 집계: mf_orders/{날짜} 발주를 제품별로 합산하고 엑셀(xlsx)로 만듭니다.
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.MfReport=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
 const slotOrder=['1_slot_8','2_slot_10','3_slot_12','4_slot_13'];
 const slotHeadings=['1차','2차','3차','4차'];
 function decodeItemKey(key){
  if(!String(key).startsWith('k_'))return key;
  try{let b64=String(key).slice(2).replace(/-/g,'+').replace(/_/g,'/');while(b64.length%4)b64+='=';const binary=atob(b64);return new TextDecoder().decode(Uint8Array.from(binary,c=>c.charCodeAt(0)));}catch(e){return key;}
 }
 function aggregate(orders,{from,to,groups}){
  const order=new Map(),groupOf=new Map();
  (groups.catalog||[]).forEach((g,gi)=>g.items.forEach((name,ii)=>{order.set(name,gi*1000+ii);groupOf.set(name,g.group);}));
  const display=name=>(groups.displayNames||{})[name]||name;
  const sortKey=name=>order.has(name)?order.get(name):1e9;
  const byProduct=new Map(),daily=[],dates=[];
  const slotTotals=[0,0,0,0];
  for(const date of Object.keys(orders||{}).sort()){
   if(date<from||date>to)continue;
   const slots=orders[date]?.slots||{};
   const dayItems=new Map();
   slotOrder.forEach((slot,si)=>{
    for(const [key,count] of Object.entries(slots[slot]?.items||{})){
     const name=decodeItemKey(key),q=Number(count)||0;if(!q)continue;
     if(!dayItems.has(name))dayItems.set(name,[0,0,0,0]);
     dayItems.get(name)[si]+=q;slotTotals[si]+=q;
    }
   });
   if(!dayItems.size)continue;
   dates.push(date);
   for(const [name,values] of [...dayItems].sort((a,b)=>sortKey(a[0])-sortKey(b[0])||a[0].localeCompare(b[0],'ko'))){
    const total=values.reduce((s,v)=>s+v,0);
    daily.push({date,group:groupOf.get(name)||'기타',name,display:display(name),slots:values,total});
    if(!byProduct.has(name))byProduct.set(name,{group:groupOf.get(name)||'기타',name,display:display(name),slots:[0,0,0,0],total:0,days:0,daily:{}});
    const p=byProduct.get(name);values.forEach((v,i)=>p.slots[i]+=v);p.total+=total;p.days++;p.daily[date]=total;
   }
  }
  const products=[...byProduct.values()].sort((a,b)=>sortKey(a.name)-sortKey(b.name)||a.name.localeCompare(b.name,'ko'));
  return {from,to,dates,products,daily,slotTotals,total:slotTotals.reduce((s,v)=>s+v,0)};
 }

 const encode=s=>new TextEncoder().encode(s);
 const xml=s=>String(s).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
 const col=n=>{let s='';n++;while(n){const m=(n-1)%26;s=String.fromCharCode(65+m)+s;n=Math.floor((n-1)/26);}return s;};
 function zip(files){
  let offset=0;const local=[],central=[];
  const crc=data=>{let n=0xffffffff;for(const b of data){n^=b;for(let k=0;k<8;k++)n=(n>>>1)^((n&1)?0xedb88320:0);}return (n^0xffffffff)>>>0;};
  const header=size=>{const b=new Uint8Array(size);return [b,new DataView(b.buffer)];};
  for(const [name,value] of files){
   const filename=encode(name),data=encode(value),checksum=crc(data);
   const [h,v]=header(30+filename.length);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint16(12,33,true);v.setUint32(14,checksum,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,filename.length,true);h.set(filename,30);local.push(h,data);
   const [c,w]=header(46+filename.length);w.setUint32(0,0x02014b50,true);w.setUint16(4,20,true);w.setUint16(6,20,true);w.setUint16(8,0x800,true);w.setUint16(14,33,true);w.setUint32(16,checksum,true);w.setUint32(20,data.length,true);w.setUint32(24,data.length,true);w.setUint16(28,filename.length,true);w.setUint32(42,offset,true);c.set(filename,46);central.push(c);offset+=h.length+data.length;
  }
  const centralSize=central.reduce((n,b)=>n+b.length,0),[end,e]=header(22);e.setUint32(0,0x06054b50,true);e.setUint16(8,files.length,true);e.setUint16(10,files.length,true);e.setUint32(12,centralSize,true);e.setUint32(16,offset,true);
  const result=new Uint8Array(offset+centralSize+22);let at=0;for(const b of [...local,...central,end]){result.set(b,at);at+=b.length;}return result;
 }
 const declaration='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
 // sheet: {name, grid, headerRow (1-based), widths}
 function sheetXml({grid,headerRow,widths}){
  const width=Math.max(...grid.map(r=>r.length));
  const body=grid.map((row,i)=>'<row r="'+(i+1)+'">'+row.map((value,j)=>{
   if(value===null||value===undefined||value==='')return '';
   const cell=col(j)+(i+1),style=i+1===headerRow?' s="1"':'';
   return typeof value==='number'?'<c r="'+cell+'"'+style+'><v>'+value+'</v></c>':'<c r="'+cell+'"'+style+' t="inlineStr"><is><t xml:space="preserve">'+xml(value)+'</t></is></c>';
  }).join('')+'</row>').join('');
  const cols=(widths||[]).map((w,i)=>'<col min="'+(i+1)+'" max="'+(i+1)+'" width="'+w+'" customWidth="1"/>').join('');
  const last=col(width-1);
  return declaration+'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:'+last+grid.length+'"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="'+headerRow+'" topLeftCell="A'+(headerRow+1)+'" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'+(cols?'<cols>'+cols+'</cols>':'')+'<sheetData>'+body+'</sheetData><autoFilter ref="A'+headerRow+':'+last+headerRow+'"/></worksheet>';
 }
 function workbook(sheets){
  const styles=declaration+'<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="맑은 고딕"/></font><font><b/><sz val="11"/><name val="맑은 고딕"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFDCEAF5"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf/><xf fontId="1" fillId="2" applyFont="1" applyFill="1"/></cellXfs></styleSheet>';
  return zip([
   ['[Content_Types].xml',declaration+'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'+sheets.map((s,i)=>'<Override PartName="/xl/worksheets/sheet'+(i+1)+'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('')+'</Types>'],
   ['_rels/.rels',declaration+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
   ['xl/workbook.xml',declaration+'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'+sheets.map((s,i)=>'<sheet name="'+xml(s.name)+'" sheetId="'+(i+1)+'" r:id="rId'+(i+1)+'"/>').join('')+'</sheets></workbook>'],
   ['xl/_rels/workbook.xml.rels',declaration+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+sheets.map((s,i)=>'<Relationship Id="rId'+(i+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet'+(i+1)+'.xml"/>').join('')+'<Relationship Id="rId'+(sheets.length+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
   ['xl/styles.xml',styles],
   ...sheets.map((s,i)=>['xl/worksheets/sheet'+(i+1)+'.xml',sheetXml(s)])
  ]);
 }
 function createWorkbook(report){
  if(!report||!report.products.length)throw Error('다운로드할 발주가 없습니다.');
  const period=report.from===report.to?report.from:report.from+' ~ '+report.to;
  const info=[['MF 발주 기간 집계'],['기간',period],['발주 일수',report.dates.length,'총 순건수',report.total],[]];
  const summary=[...info,['품목군','상품명',...slotHeadings,'누적','발주 일수'],
   ...report.products.map(p=>[p.group,p.display,...p.slots,p.total,p.days]),
   ['합계','',...report.slotTotals,report.total,'']];
  const detail=[...info,['날짜','품목군','상품명',...slotHeadings,'합계'],
   ...report.daily.map(d=>[d.date,d.group,d.display,...d.slots,d.total])];
  const matrix=[...info,['품목군','상품명',...report.dates,'누적'],
   ...report.products.map(p=>[p.group,p.display,...report.dates.map(d=>p.daily[d]||0),p.total]),
   ['합계','',...report.dates.map(d=>report.daily.filter(x=>x.date===d).reduce((s,x)=>s+x.total,0)),report.total]];
  return workbook([
   {name:'제품별 누적',grid:summary,headerRow:5,widths:[12,34,8,8,8,8,10,10]},
   {name:'일자별 상세',grid:detail,headerRow:5,widths:[12,12,34,8,8,8,8,10]},
   {name:'일자별 표',grid:matrix,headerRow:5,widths:[12,34,...report.dates.map(()=>11),10]}
  ]);
 }
 return {aggregate,createWorkbook,slotHeadings};
});
