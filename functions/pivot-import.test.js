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
