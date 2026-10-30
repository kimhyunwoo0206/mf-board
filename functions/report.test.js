const {test}=require('node:test');
const assert=require('node:assert/strict');
const {aggregate,createWorkbook}=require('../mf-report');
const groups=require('../mf-groups');
const key=name=>'k_'+Buffer.from(name,'utf8').toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const oyster='[로켓프레시] 위드프레쉬 산지직송 통영 생굴 1kg';
const orders={
 '2026-10-01':{slots:{'1_slot_8':{items:{[key('손질오징어(통) 500g')]:10,[key('생물 홍합 1kg')]:2},parts:{'1-1':{}}},'2_slot_10':{items:{[key('손질오징어(통) 500g')]:3}}}},
 '2026-10-02':{slots:{'1_slot_8':{items:{[key(oyster)]:4}},'4_slot_13':{items:{[key('손질오징어(통) 500g')]:-1,[key('새 상품 1kg')]:2}}}},
 '2026-10-03':{lastStatus:'1차 (8시)',slots:{}},
 '2026-10-05':{slots:{'1_slot_8':{items:{[key('생물 홍합 1kg')]:7}}}}
};
test('period totals per product, slot and day include cancellations and skip days outside the range',()=>{
 const r=aggregate(orders,{from:'2026-10-01',to:'2026-10-04',groups});
 assert.deepEqual(r.dates,['2026-10-01','2026-10-02']);assert.equal(r.total,20);assert.deepEqual(r.slotTotals,[16,3,0,1]);
 const squid=r.products.find(p=>p.name==='손질오징어(통) 500g');assert.deepEqual(squid.slots,[10,3,0,-1]);assert.equal(squid.total,12);assert.equal(squid.days,2);assert.equal(squid.daily['2026-10-02'],-1);
 assert.equal(r.products.find(p=>p.name===oyster).display,'통영생굴 1kg');
 assert.deepEqual(r.products.map(p=>p.group),['오징어','홍합','통영생굴','기타']);
 assert.equal(r.daily.length,5);
});
test('empty range has no products and workbook refuses to download',()=>{
 const r=aggregate(orders,{from:'2026-10-03',to:'2026-10-04',groups});
 assert.equal(r.products.length,0);assert.equal(r.total,0);assert.throws(()=>createWorkbook(r));
});
test('workbook is a zip with three sheets and the period totals',()=>{
 const bytes=createWorkbook(aggregate(orders,{from:'2026-10-01',to:'2026-10-31',groups}));
 assert.equal(bytes[0],0x50);assert.equal(bytes[1],0x4b);
 const text=Buffer.from(bytes).toString('utf8');
 for(const s of ['제품별 누적','일자별 상세','일자별 표','통영생굴 1kg','2026-10-05'])assert.ok(text.includes(s),s);
});
