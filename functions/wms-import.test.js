const {test}=require('node:test');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const assert=require('node:assert/strict');
const {looksLikeWms,parseWms}=require('../wms-import');
const {parsePivot}=require('../pivot-import');
const catalog=require('./catalog.json');
const date='2026-11-01';
// 2026-11-01 쿠팡 WMS 화면 사진을 사람이 옮겨 적은 표본입니다(실시간 데이터가 아님).
const head='출고번호\t주문 ID\t배치 ID\t운송장 번호\t박스 타입\tSKU ID\tBarcode\t수량\t출고 마감 시간\t재고 위치\t배송구분';
const row=(no,sku,barcode,qty=1,stamp='2026-11-01 14:00:00.0',loc='672-A1-1-1')=>[no,'118'+no,'1069934217','1033422434'+no,'CSTM',sku,barcode,qty,stamp,loc,'쿠팡배송'].join('\t');
const rows=[
 row('1001','204065303','8809929791202',1,undefined,'672-A1-1-15'),
 row('1002','203690733','8809929791271'),row('1003','203690733','8809929791271'),
 row('1004','209011180','8809929791448'),row('1005','209011180','8809929791448'),
 row('1006','203690733','8809929791271'),row('1007','209011180','8809929791448')
];
const table=[head,...rows].join('\r\n');
const parse=(text=table,d=date)=>parseWms(text,{date:d,catalog});

test('screen table is detected, a pivot is not',()=>{
 assert.equal(looksLikeWms(table),true);
 assert.equal(looksLikeWms('행 레이블\t합계 : 최종수량\r\n261101\t5\r\n8809929791448\t3\r\n총합계\t5'),false);
});
test('rows are summed per barcode and mapped to catalog names, header line ignored',()=>{
 const r=parse();
 assert.deepEqual(r.errors,[]);assert.deepEqual(r.pendingRows,[]);
 assert.equal(r.total,7);assert.equal(r.selectedRowCount,7);
 assert.equal(r.items['손질 백조기 500g 1개'],1);assert.equal(r.items['손질오징어(할복) 500g'],3);assert.equal(r.items['홍가리비 2.5kg'],3);
});
test('works without a header line and with quantity above 1',()=>{
 const r=parse(row('2001','1','8809929791448',5)+'\n'+row('2002','1','8809929791448',2));
 assert.deepEqual(r.errors,[]);assert.equal(r.items['홍가리비 2.5kg'],7);
});
test('pasting the same screen twice is blocked',()=>{
 const r=parse(table+'\r\n'+table);
 assert.match(r.errors.join('\n'),/중복/);
});
test('different shipment rows with equal barcode are not duplicates',()=>{
 assert.deepEqual(parse(table+'\r\n'+row('1008','203690733','8809929791271')).errors,[]);
});
test('wrong shipping date is blocked',()=>{
 assert.match(parse(table,'2026-11-02').errors.join('\n'),/출고 마감일\(2026-11-01\)/);
});
test('unknown barcode is held back as new SKU and does not block known items',()=>{
 const r=parse(table+'\r\n'+row('1009','5','8809929799999',2));
 assert.deepEqual(r.errors,[]);assert.equal(r.pendingRows.length,1);assert.equal(r.pendingRows[0].fieldName,'8809929799999');assert.equal(r.pendingRows[0].quantity,2);
 assert.equal(r.total,9);assert.equal(r.items['홍가리비 2.5kg'],3);
});
test('a row with barcode but without quantity or shipping time is reported',()=>{
 const r=parse(table+'\r\n822397292553\t11814290924\t1069934199\t10334224342816\tCSTM\t204065303\t8809929791202\t쿠팡배송');
 assert.match(r.errors.join('\n'),/행:/);
});
test('empty or unrelated text is rejected',()=>{
 assert.match(parse('출고번호\t주문 ID\t배치 ID').errors.join('\n'),/출고 행을 찾지 못했습니다/);
});
test('pivot import still works unchanged',()=>{
 const r=parsePivot('행 레이블\t합계 : 건수\r\n261101\t5\r\n1\t5\r\n[로켓프레시] 위드프레쉬 산지직송 남해안 활 홍가리비 2.5kg\t5\r\n총합계\t5',{date,slot:1,catalog});
 assert.deepEqual(r.errors,[]);assert.equal(r.items['홍가리비 2.5kg'],5);
});

function adminHarness(){
 const els=new Map(),el=id=>{if(!els.has(id))els.set(id,{value:id==='slot'?'1_slot_8':id==='mode'?'replace':'',textContent:'',className:'',disabled:false,classList:{add(){}},events:{},addEventListener(event,cb){const previous=this.events[event];this.events[event]=(...args)=>{if(previous)previous(...args);return cb(...args);};}});return els.get(id);};
 let writes=0;
 const context=vm.createContext({document:{getElementById:el},firebase:{initializeApp(){},database(){return {ref(){return {once:async()=>({val:()=>null}),transaction:async()=>{writes++;}}}}}},fetch:async()=>({ok:true,json:async()=>catalog}),MfPivotImport:{parsePivot},MfWmsImport:require('../wms-import'),URLSearchParams,Intl,Date,TextEncoder,TextDecoder,Uint8Array,btoa:s=>Buffer.from(s,'binary').toString('base64'),atob:s=>Buffer.from(s,'base64').toString('binary'),sessionStorage:{getItem:()=>null},location:{search:''},setTimeout(){}});
 const html=fs.readFileSync(path.join(__dirname,'../admin.html'),'utf8');
 const script=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('const firebaseConfig'));
 vm.runInContext(script,context);el('date').value=date;el('slot').value='2_slot_10';
 return {el,writes:()=>writes};
}
test('actual admin imports a pasted Coupang screen table without a subtotal and without writing data',async()=>{
 const h=adminHarness();h.el('pivot').value=table;await h.el('convert').events.click();
 assert.ok(h.el('raw').value.includes('홍가리비 2.5kg : 3건'));assert.ok(h.el('raw').value.includes('손질오징어(할복) 500g : 3건'));assert.ok(h.el('raw').value.includes('손질 백조기 500g 1개 : 1건'));
 assert.ok(h.el('pivot-status').textContent.includes('7건'));assert.ok(h.el('pivot-status').textContent.includes('총 건수를 입력하지 않아'));assert.equal(h.writes(),0);
 h.el('pivot-total').value='9';await h.el('convert').events.click();assert.equal(h.el('raw').value,'');assert.ok(h.el('pivot-status').textContent.includes('다릅니다'));
 h.el('pivot-total').value='7';await h.el('convert').events.click();assert.ok(h.el('raw').value.includes('홍가리비 2.5kg : 3건'));
});

test('shipments are stored by 출고번호 and 운송장 번호, cancels resolve by either',()=>{
 const r=parse();const {parseCancel,resolveCancels}=require('../wms-import');
 assert.equal(r.shipments['1002'],'8809929791271:1');assert.equal(r.shipments['10334224341002'],'8809929791271:1');
 const day={slots:{'1_slot_8':{shipments:r.shipments}}};
 // 쿠팡 화면처럼 한 건이 여러 줄로 쪼개져 붙여넣어진 경우(운송장이 배치 ID보다 앞줄, 상태 문구가 줄 끝)
 const txt=['[출고취소]\t쿠팡배송','[새벽배송]\t2.쿠팡_싱글_일반\t10334224341002','2\t1069934217\t1120016665514364929\t11103973384982\t824609689630\t출고 취소',
  '[출고취소]\t쿠팡배송','[새벽배송]\t2.쿠팡_싱글_일반\t10334224349999','3\t-\t1119912698797117440\t4103967166498\t818112024585\t출고 취소',
  '[출고취소]\t쿠팡배송','[새벽배송]\t2.쿠팡_싱글_일반\t10334224341003','2\t1069934217\t1119912698797117441\t4103967166499\t818112024586\t출고 취소'].join('\r\n');
 const c=parseCancel(txt);
 assert.equal(c.rows.length,3);assert.equal(c.notCancelled.length,0);
 assert.deepEqual(c.rows.map(x=>x.hasBatch),[true,false,true]);
 assert.deepEqual(c.rows[0].keys,['824609689630','10334224341002']);
 const res=resolveCancels(day,c.rows,catalog);
 assert.equal(res.matched.length,2);assert.equal(res.noBatch.length,1);assert.equal(res.matched[0].lines[0].name,'손질오징어(할복) 500g');
 day.cancelled={'10334224341002':{}};
 assert.equal(resolveCancels(day,c.rows,catalog).already.length,1);
 assert.equal(parseCancel('1069934217\t111111111111\t정상 출고').notCancelled.length,1);
});
