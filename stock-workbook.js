'use strict';
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.MfStockWorkbook=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
 const encode=s=>new TextEncoder().encode(s);
 const xml=s=>String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
 function zip(files){
  let offset=0;const local=[],central=[];
  const crc=data=>{let n=0xffffffff;for(const b of data){n^=b;for(let k=0;k<8;k++)n=(n>>>1)^((n&1)?0xedb88320:0);}return (n^0xffffffff)>>>0;};
  const header=(size)=>{const b=new Uint8Array(size);return [b,new DataView(b.buffer)];};
  for(const [name,value] of files){
   const filename=encode(name),data=encode(value),checksum=crc(data);
   const [h,v]=header(30+filename.length);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint16(12,33,true);v.setUint32(14,checksum,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,filename.length,true);h.set(filename,30);local.push(h,data);
   const [c,w]=header(46+filename.length);w.setUint32(0,0x02014b50,true);w.setUint16(4,20,true);w.setUint16(6,20,true);w.setUint16(8,0x800,true);w.setUint16(14,33,true);w.setUint32(16,checksum,true);w.setUint32(20,data.length,true);w.setUint32(24,data.length,true);w.setUint16(28,filename.length,true);w.setUint32(42,offset,true);c.set(filename,46);central.push(c);offset+=h.length+data.length;
  }
  const centralSize=central.reduce((n,b)=>n+b.length,0),[end,e]=header(22);e.setUint32(0,0x06054b50,true);e.setUint16(8,files.length,true);e.setUint16(10,files.length,true);e.setUint32(12,centralSize,true);e.setUint32(16,offset,true);
  const result=new Uint8Array(offset+centralSize+22);let at=0;for(const b of [...local,...central,end]){result.set(b,at);at+=b.length;}return result;
 }
 function create(snapshot,rows){
  if(!snapshot||!Array.isArray(rows)||!rows.length)throw Error('다운로드할 재고가 없습니다.');
  const total=rows.reduce((n,r)=>n+r.quantity,0);
  if(!Number.isSafeInteger(total)||total!==snapshot.total)throw Error('재고 총합을 확인하세요.');
  const grid=[['MF 현재고'],['재고 기준 날짜·시간',snapshot.asOf.replace('T',' ')],['등록 시각',new Date(snapshot.savedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})],['기준 SKU',27,'표시 품목',rows.length],['현장명','현재재고','상품 바코드','외부 SKU ID','확인 상태'],...rows.map(r=>[r.name,r.quantity,r.barcode||'',r.productId||'',r.status]),['총 재고',total]];
  const body=grid.map((row,i)=>'<row r="'+(i+1)+'">'+row.map((value,j)=>{const cell=String.fromCharCode(65+j)+(i+1);return typeof value==='number'?'<c r="'+cell+'"><v>'+value+'</v></c>':'<c r="'+cell+'" t="inlineStr"><is><t xml:space="preserve">'+xml(value)+'</t></is></c>';}).join('')+'</row>').join('');
  const declaration='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const sheet=declaration+'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:E'+grid.length+'"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="5" topLeftCell="A6" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="1" width="40" customWidth="1"/><col min="2" max="2" width="24" customWidth="1"/><col min="3" max="4" width="22" customWidth="1"/><col min="5" max="5" width="24" customWidth="1"/></cols><sheetData>'+body+'</sheetData><autoFilter ref="A5:E'+(grid.length-1)+'"/></worksheet>';
  return zip([
   ['[Content_Types].xml',declaration+'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'],
   ['_rels/.rels',declaration+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
   ['xl/workbook.xml',declaration+'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="현재고" sheetId="1" r:id="rId1"/></sheets></workbook>'],
   ['xl/_rels/workbook.xml.rels',declaration+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'],
   ['xl/worksheets/sheet1.xml',sheet]
  ]);
 }
 return {create};
});
