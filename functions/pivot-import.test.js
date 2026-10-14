const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {parsePivot}=require('../pivot-import');
const catalog=require('./catalog.json');
const date='2026-10-05';
// Human transcription of the 10/05 photos; not an AI OCR result.
const first=[['생물 물바지락 700g 1개',2],['생물 손질 오징어 500g',59],['생물 손질 오징어 900g',3],['손질 고등어 900g',2],['손질 황돔 500g 1개',2],['손질 백조기 500g 1개',5],['생물 홍합 1kg',2],['손질 고등어 500g',2],['생물 홍합 3kg',1],['손질 오징어(해동) 500g',10],['생물 물바지락 1kg 1개',6],['남해안 활 홍가리비 2.5kg',1]];
const second=[['생물 물바지락 700g 1개',1],['생물 손질 오징어 500g',12],['생물 홍합 1kg',4],['손질 고등어 500g',1],['손질 오징어(해동) 500g',2]];
const lines=rows=>rows.map(([name,q])=>'[로켓프레시] 위드프레쉬 산지직송 국내산 '+name+'\t'+q).join('\r\n');
const pivot='행 레이블\t합계 : 건수\r\n261005\t115\r\n1\t95\r\n'+lines(first)+'\r\n2\t20\r\n'+lines(second)+'\r\n총합계\t115';
const parse=(text=pivot,slot=2)=>parsePivot(text,{date,slot,catalog});
test('Excel complete pivot imports selected slot 2 only, matching 20 vs daily 115',()=>{
 const r=parse();assert.deepEqual(r.errors,[]);assert.equal(r.total,20);assert.equal(r.sourceTotal,20);assert.equal(r.dailyTotal,115);
 assert.equal(r.selectedRowCount,5);assert.equal(r.excludedRowCount,12);assert.equal(r.items['손질오징어(통) 500g'],12);assert.equal(r.pendingRows.length,0);
});
test('same full pivot imports all 12 first-slot products, preserving 95',()=>{
 const r=parse(pivot,'1_slot_8');assert.deepEqual(r.errors,[]);assert.equal(r.total,95);assert.equal(Object.keys(r.items).length,12);assert.equal(r.items['손질오징어(통) 500g'],59);
});
test('product-only TSV returns missing subtotal instead of claiming verification',()=>{
 const r=parse(lines(second));assert.equal(r.sourceTotal,null);assert.equal(r.total,20);assert.equal(r.hasGroups,false);
});
test('truncated products, wrong date and absent selected group produce errors',()=>{
 assert.ok(parse(pivot.replace(lines(second),lines(second.slice(0,4)))).errors.length);
 assert.ok(parse(pivot.replace('261005','261004')).errors.length);
 assert.ok(parse(pivot,4).errors.length);
});
test('malformed quantity or extra nonempty columns fail rather than guessing from weights',()=>{
 for(const s of ['생물 홍합 1kg','생물 홍합 1kg\t숫자불명','생물 홍합 1kg\t1\t2'])assert.ok(parse(s).errors.length);
});
test('unknown SKU is preserved for review, known items remain importable and totals include both',()=>{
 const r=parse('2\t3\n생물 홍합 1kg\t2\n새로운 상품 700g\t1');assert.deepEqual(r.errors,[]);assert.equal(r.total,3);assert.equal(r.items['생물 홍합 1kg'],2);assert.equal(r.pendingRows.length,1);
});
test('brand spelling, thousands separators and exact weight matching',()=>{
 const r=parse('2\t1,001\n워드프레쉬 산지직송 국내산 생물 손질 오징어 500g\t1,000\n손질 갑오징어 600g (해동)\t1');
 assert.deepEqual(r.errors,[]);assert.equal(r.items['손질오징어(통) 500g'],1000);assert.equal(r.items['갑오징어 600g'],1);
});
function adminHarness(){
 const els=new Map(),el=id=>{if(!els.has(id))els.set(id,{value:id==='slot'?'1_slot_8':id==='mode'?'replace':'',textContent:'',className:'',disabled:false,classList:{add(){}},events:{},addEventListener(event,cb){const previous=this.events[event];this.events[event]=(...args)=>{if(previous)previous(...args);return cb(...args);};}});return els.get(id);};
 let writes=0;
 const context=vm.createContext({document:{getElementById:el},firebase:{initializeApp(){},database(){return {ref(){return {once:async()=>({val:()=>null}),transaction:async()=>{writes++;}}}}}},fetch:async()=>({ok:true,json:async()=>catalog}),MfPivotImport:{parsePivot},URLSearchParams,Intl,Date,TextEncoder,TextDecoder,Uint8Array,btoa:s=>Buffer.from(s,'binary').toString('base64'),atob:s=>Buffer.from(s,'base64').toString('binary'),sessionStorage:{getItem:()=>null},location:{search:''},setTimeout(){}});
 const html=fs.readFileSync(path.join(__dirname,'../admin.html'),'utf8');
 const script=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('const firebaseConfig'));
 vm.runInContext(script,context);el('date').value=date;el('slot').value='2_slot_10';
 return {el,writes:()=>writes};
}
test('actual admin import populates review list without writing production data',async()=>{
 const h=adminHarness();h.el('pivot').value=pivot;await h.el('convert').events.click();
 assert.ok(h.el('raw').value.includes('손질오징어(통) 500g : 12건'));assert.ok(!h.el('raw').value.includes('59건'));
 assert.ok(h.el('pivot-status').textContent.includes('20건'));assert.equal(h.writes(),0);
 h.el('slot').value='1_slot_8';h.el('slot').events.change();assert.equal(h.el('raw').value,'');
});
test('actual admin requires a correct manual subtotal for product-only paste',async()=>{
 const h=adminHarness();h.el('pivot').value=lines(second);await h.el('convert').events.click();assert.equal(h.el('raw').value,'');
 h.el('pivot-total').value='115';await h.el('convert').events.click();assert.equal(h.el('raw').value,'');
 h.el('pivot-total').value='20';await h.el('convert').events.click();assert.ok(h.el('raw').value.includes('12건'));assert.equal(h.writes(),0);
});

// 1차는 1-1·1-2 두 묶음으로 나뉘어 들어옵니다.
const split='행 레이블\t합계 : 건수\r\n261005\t115\r\n1-1\t73\r\n'+lines(first.slice(0,6))+'\r\n1-2\t22\r\n'+lines(first.slice(6))+'\r\n2\t20\r\n'+lines(second)+'\r\n총합계\t115';
test('1-1 and 1-2 are combined into slot 1 with per-part checks',()=>{
 const r=parse(split,'1_slot_8');assert.deepEqual(r.errors,[]);assert.equal(r.total,95);assert.equal(r.sourceTotal,95);
 assert.equal(r.items['손질오징어(통) 500g'],59);assert.equal(Object.keys(r.items).length,12);
 assert.deepEqual(Object.keys(r.parts),['1-1','1-2']);assert.equal(r.parts['1-1'].total,73);assert.equal(r.parts['1-2'].total,22);
 assert.equal(r.excludedRowCount,5);
});
test('slot 2 import ignores 1-1 and 1-2 rows',()=>{
 const r=parse(split,'2_slot_10');assert.deepEqual(r.errors,[]);assert.equal(r.total,20);assert.equal(r.parts,null);
});
test('one part pasted alone, header variants and nested 1 header are accepted',()=>{
 const only='1-2\t22\n'+lines(first.slice(6));const r=parse(only,'1_slot_8');assert.deepEqual(r.errors,[]);assert.deepEqual(Object.keys(r.parts),['1-2']);assert.equal(r.total,22);
 assert.deepEqual(parse(only.replace('1-2','1차-2'),'1_slot_8').errors,[]);
 assert.deepEqual(parse(only.replace('1-2','1-2차'),'1_slot_8').errors,[]);
 const nested=parse('1\t95\r\n'+split.split('\r\n').slice(2,split.split('\r\n').indexOf('2\t20')).join('\r\n'),'1_slot_8');assert.deepEqual(nested.errors,[]);assert.equal(nested.total,95);
});
test('part subtotal mismatch or duplicated part header is rejected',()=>{
 assert.ok(parse(split.replace('1-1\t73','1-1\t74'),'1_slot_8').errors.length);
 assert.ok(parse(split+'\r\n1-1\t1\r\n생물 홍합 1kg\t1','1_slot_8').errors.length);
});
test('admin save keeps the other stored part and stores the 1차 sum',async()=>{
 let day={slots:{'1_slot_8':{label:'1차 (8시)',items:{},parts:{}}}};
 const els=new Map(),el=id=>{if(!els.has(id))els.set(id,{value:id==='slot'?'1_slot_8':id==='mode'?'replace':'',textContent:'',className:'',disabled:false,classList:{add(){}},events:{},addEventListener(event,cb){const previous=this.events[event];this.events[event]=(...args)=>{if(previous)previous(...args);return cb(...args);};}});return els.get(id);};
 const context=vm.createContext({document:{getElementById:el},firebase:{initializeApp(){},database(){return {ref(){return {once:async()=>({val:()=>day.slots['1_slot_8']}),transaction:async fn=>{day=fn(JSON.parse(JSON.stringify(day)));}}}}}},fetch:async()=>({ok:true,json:async()=>catalog}),MfPivotImport:{parsePivot},URLSearchParams,Intl,Date,TextEncoder,TextDecoder,Uint8Array,btoa:s=>Buffer.from(s,'binary').toString('base64'),atob:s=>Buffer.from(s,'base64').toString('binary'),sessionStorage:{getItem:()=>null},location:{search:''},setTimeout(){}});
 const html=fs.readFileSync(path.join(__dirname,'../admin.html'),'utf8');
 vm.runInContext([...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('const firebaseConfig')),context);
 el('date').value=date;el('slot').value='1_slot_8';
 const sum=slot=>Object.values(slot.items).reduce((s,v)=>s+v,0);
 el('pivot').value='1-1\t73\n'+lines(first.slice(0,6));await el('convert').events.click();await el('save').events.click();
 assert.equal(sum(day.slots['1_slot_8']),73);
 el('pivot').value='1-2\t22\n'+lines(first.slice(6));el('pivot').events.input();await el('convert').events.click();await el('save').events.click();
 assert.equal(sum(day.slots['1_slot_8']),95);assert.deepEqual(Object.keys(day.slots['1_slot_8'].parts).sort(),['1-1','1-2']);
 el('pivot').value=split;el('pivot').events.input();await el('convert').events.click();await el('save').events.click();
 assert.equal(sum(day.slots['1_slot_8']),95);
 assert.ok(el('existing').textContent.includes('1-1')&&el('existing').textContent.includes('1-2'));
});
