const {test}=require('node:test');
const assert=require('node:assert/strict');
const {inspect,parseStock}=require('./stock-import'),{validateRecord,makeInventoryService}=require('./inventory'),catalog=require('./catalog.json');
const text='상품명\t상품 바코드\t외부 SKU ID\t현재재고\t할당수량\t인벤토리 ID\t로케이션\n생물 손질 오징어 500g\t8809929791226\t77611130\t10\t9\tA01\tL1\n생물 손질 오징어 500g\t8809929791226\t77611130\t20\t5\tA02\tL2\n생물 홍합 1kg\t8809929791004\t77732486\t0\t3\tB01\tL1\n총합계\t\t\t30';
const columns={name:0,barcode:1,productId:2,quantity:3,rowId:5,location:6};
const parse=(t=text,extra={})=>parseStock(t,{columns,hasHeader:true,catalog,...extra});
const payload={date:'2026-10-05',time:'08:00',text,columns,hasHeader:true,expectedTotal:null,requestId:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'};
const auth={uid:'test-user',token:{email:'youngmooff@gmail.com',email_verified:true}};
test('headers recognize current stock, external not internal SKU, and location',()=>{const r=inspect(text);assert.equal(r.hasHeader,true);assert.deepEqual(r.mapping,columns);const internal=inspect('내부 SKU ID\t상품명\t수량\n1\t생물 홍합 1kg\t2');assert.equal(internal.mapping.productId,-1);assert.equal(internal.mapping.quantity,2);});
test('separate location rows sum to 30, zero stock retained, allocation not subtracted',()=>{const r=parse();assert.equal(r.verified,true);assert.equal(r.total,30);assert.equal(r.rows.length,2);assert.equal(r.rows[0].name,'손질오징어(통) 500g');assert.equal(r.rows[0].quantity,30);assert.equal(r.rows[0].sourceRowCount,2);assert.equal(r.rows[1].quantity,0);assert.equal(r.sourceRowCount,3);});
test('repeated inventory ID/location preserves every source row',()=>{const lines=text.split('\n');const r=parse([...lines.slice(0,2),lines[1],...lines.slice(2,-1),'총합계\t\t\t40'].join('\n'));assert.equal(r.duplicateCount,1);assert.equal(r.total,40);assert.equal(r.sourceRowCount,4);assert.equal(r.verified,true);});
test('same inventory ID with changed quantity is summed and footer still checked',()=>{const lines=text.split('\n');const t=[...lines.slice(0,2),lines[1].replace('\t10\t9','\t11\t9'),...lines.slice(2,-1)].join('\n');const r=parse(t);assert.equal(r.total,41);assert.equal(r.verified,true);assert.equal(parse(t+'\n총합계\t\t\t30').verified,false);});
test('without inventory ID identical products are separate valid location rows',()=>{const r=parseStock('상품명\t수량\n생물 홍합 1kg\t2\n생물 홍합 1kg\t2',{catalog,columns:{name:0,quantity:1},hasHeader:true});assert.equal(r.total,4);assert.equal(r.duplicateCount,0);});
test('barcode and external SKU conflict cannot merge',()=>{assert.equal(parse(text.replace('77611130','77732486')).verified,false);assert.equal(parse(text.replace('8809929791226','8809929791271')).verified,false);});
test('unknown SKU retains original identifiers and joins total with review flag',()=>{const r=parseStock('상품명\t바코드\t외부 SKU ID\t현재재고\n새 상품 400g\t8800000000001\t12345678\t5',{catalog,columns:{name:0,barcode:1,productId:2,quantity:3},hasHeader:true});assert.equal(r.verified,true);assert.equal(r.total,5);assert.equal(r.pendingCount,1);assert.equal(r.rows[0].barcode,'8800000000001');assert.equal(r.rows[0].status,'신규 SKU 확인 필요');});
test('blank, negative, decimal, scientific identifiers and malformed thousands reject',()=>{for(const value of ['','-1','1.5','1,00','확인필요'])assert.equal(parse(text.replace('\t10\t9','\t'+value+'\t9')).verified,false);assert.equal(parse(text.replace('8809929791226','8.80993E+12')).verified,false);});
test('allocated stock, internal SKU and duplicate column selections are rejected',()=>{assert.throws(()=>parse(text,{columns:{...columns,quantity:4}}));assert.throws(()=>parseStock('내부 SKU ID\t수량\n123\t2',{catalog,hasHeader:true,columns:{productId:0,quantity:1}}));assert.throws(()=>parse(text,{columns:{name:0,quantity:0}}));});
test('footers and provided total verify exactly; omitted footer is disclosed',()=>{assert.equal(parse(text.replace('총합계\t\t\t30','총합계\t\t\t31')).verified,false);assert.equal(parse(text,{expectedTotal:31}).verified,false);const r=parse(text.split('\n').slice(0,-1).join('\n'));assert.equal(r.verified,true);assert.ok(r.warnings.some(w=>w.includes('총합 미제공')));});
test('quoted Excel cells, CRLF, commas and leading zeros remain accurate',()=>{const r=parseStock('상품명\t수량\r\n"생물 홍합 1kg"\t"1,000"\r\n',{catalog,hasHeader:true,columns:{name:0,quantity:1}});assert.equal(r.total,1000);assert.throws(()=>inspect('"열\t수량\n값\t2'));});
test('product-only two-column paste can be mapped without headers',()=>{const info=inspect('생물 홍합 1kg\t2');assert.equal(info.hasHeader,false);assert.equal(info.mapping.quantity,1);assert.equal(parseStock('생물 홍합 1kg\t2',{catalog,hasHeader:false,columns:{name:0,quantity:1}}).total,2);});
test('calendar, time, future and request identity are checked server-side',()=>{const now=new Date('2026-10-05T01:00:00Z');assert.equal(validateRecord(payload,now).parsed.total,30);for(const changes of [{date:'2026-02-30'},{time:'25:00'},{date:'2026-10-06'},{requestId:'path/slash'},{hasHeader:'false'}])assert.throws(()=>validateRecord({...payload,...changes},now));});
function fakeFirestore(){
 const map=new Map();
 const snap=path=>({exists:map.has(path),data:()=>map.get(path)});
 function collection(name){
  const query=(filters=[],descending=false,max=Infinity)=>({
   where(field,op,value){return query([...filters,[op,value]],descending,max);},
   orderBy(field,direction){return query(filters,direction==='desc',max);},
   limit(n){return query(filters,descending,n);},
   async get(){let entries=[...map].filter(([key])=>key.startsWith(name+'/')).map(([key,value])=>({id:key.slice(name.length+1),value}));entries=entries.filter(x=>filters.every(([op,v])=>op==='>='?x.id>=v:x.id<v));entries.sort((a,b)=>descending?b.id.localeCompare(a.id):a.id.localeCompare(b.id));return {docs:entries.slice(0,max).map(x=>({data:()=>x.value}))};}
  });
  return {...query(),doc(id){const path=name+'/'+id;return {path,get:async()=>snap(path)};}};
 }
 return {map,collection,async runTransaction(fn){const writes=[];const result=await fn({get:async ref=>snap(ref.path),create(ref,value){assert.equal(map.has(ref.path),false);writes.push([ref.path,value]);},set(ref,value){writes.push([ref.path,value]);}});writes.forEach(([p,v])=>map.set(p,v));return result;}};
}
function setup(){const db=fakeFirestore();let instant=new Date('2026-10-05T01:00:00Z');return {db,setNow:s=>instant=new Date(s),service:makeInventoryService({db,documentId:'__name__',allowedEmails:['youngmooff@gmail.com'],now:()=>instant})};}
test('unauthenticated, unapproved and unverified writes are denied',async()=>{const {db,service}=setup();for(const a of [null,{...auth,token:{...auth.token,email:'stranger@example.com'}},{...auth,token:{...auth.token,email_verified:false}}])await assert.rejects(()=>service.save({auth:a,data:payload}),e=>e.code==='permission-denied');assert.equal(db.map.size,0);});
test('dry run validates on server without creating a record',async()=>{const {db,service}=setup();const r=await service.save({auth,data:{...payload,dryRun:true}});assert.equal(r.preview,true);assert.equal(r.total,30);assert.equal(db.map.size,0);});
test('immutable snapshot survives retry and publishes neither UID nor raw source rows',async()=>{const {db,service}=setup();const first=await service.save({auth,data:payload});const again=await service.save({auth,data:payload});assert.equal(first.snapshot.id,again.snapshot.id);assert.equal(db.map.size,3);const r=await service.get();assert.equal(r.snapshot.total,30);assert.equal(r.history.length,1);assert.equal(r.snapshot.createdBy,undefined);assert.equal(r.snapshot.inputHash,undefined);assert.equal(r.snapshot.rawRows,undefined);});
test('same request ID with changed valid input cannot overwrite',async()=>{const {service}=setup();await service.save({auth,data:payload});const changed={...payload,text:'상품명\t현재재고\n生物\t5',columns:{name:0,quantity:1}};await assert.rejects(()=>service.save({auth,data:changed}),e=>e.code==='already-exists');assert.equal((await service.get()).snapshot.total,30);});
test('same-day later snapshot preserves both records and links recover exact old record',async()=>{const {service,setNow}=setup();const first=await service.save({auth,data:payload});setNow('2026-10-05T04:00:00Z');const next=await service.save({auth,data:{...payload,time:'12:00',requestId:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'}});const current=await service.get();assert.equal(current.snapshot.id,next.snapshot.id);assert.equal(current.history.length,2);assert.equal((await service.get({date:payload.date,id:first.snapshot.id})).snapshot.asOf,'2026-10-05T08:00');});
test('backdated import does not replace latest; same as-of later save does',async()=>{const {service,setNow}=setup();await service.save({auth,data:payload});setNow('2026-10-05T02:00:00Z');const old=await service.save({auth,data:{...payload,date:'2026-10-04',requestId:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'}});assert.equal((await service.get()).snapshot.date,'2026-10-05');assert.equal((await service.get({date:'2026-10-04'})).snapshot.id,old.snapshot.id);const sameTime=await service.save({auth,data:{...payload,requestId:'00000000-0000-0000-0000-000000000000'}});assert.equal((await service.get()).snapshot.id,sameTime.snapshot.id);});
test('empty day and invalid query return honest empty state or input rejection',async()=>{const {service}=setup();assert.equal((await service.get()).snapshot,null);await assert.rejects(()=>service.get({date:'2026-02-30'}));await assert.rejects(()=>service.get({id:'../../x'}));});

test('headerless Coupang A-to-quantity range auto-connects nine visible columns',()=>{
 const t='4.42E+10\t피킹\t672-A1-1\t204568955\t78159156\tC\t8809929791028\t[로켓프레시] 위드프레쉬 산지직송 국내산 생물 대합 1kg 1개\t19\n4.43E+10\t피킹\t672-A1-1\t204568899\t78159077\tB\t8809929791035\t생물 대합 600g 1개\t29\n4.42E+10\t피킹\t672-A1-1\t204568896\t78159103\tB\t8809929791103\t생물 물바지락 1kg 1개\t29';
 const info=inspect(t);assert.equal(info.hasHeader,false);assert.equal(info.mapping.quantity,8);assert.equal(info.mapping.barcode,6);assert.equal(info.mapping.productId,4);
 const r=parseStock(t,{catalog,hasHeader:info.hasHeader,columns:info.mapping});assert.equal(r.total,77);assert.equal(r.verified,true);assert.equal(r.duplicateCount,0);assert.equal(r.rows.length,3);assert.ok(r.warnings.some(w=>w.includes('지수 표기')));
});
test('hidden I column pasted as empty still maps final J quantity correctly',()=>{
 const t='4.42E+10\t피킹\t672-A1-1\t204568955\t78159156\tC\t8809929791028\t생물 대합 1kg 1개\t\t19';
 const info=inspect(t);assert.equal(info.mapping.quantity,9);assert.equal(parseStock(t,{catalog,hasHeader:false,columns:info.mapping}).total,19);
});


test('registration code permits signed-out preview and immutable save without publishing code',async()=>{
 const db=fakeFirestore(),service=makeInventoryService({db,allowedEmails:[],registrationCode:'test-only-code-1234',now:()=>new Date('2026-10-05T01:00:00Z')});
 const data={...payload,registrationCode:'test-only-code-1234'};
 assert.equal((await service.save({data:{...data,dryRun:true}})).total,30);
 assert.equal(db.map.size,0);
 const result=await service.save({data});
 assert.equal(result.snapshot.total,30);
 assert.equal(JSON.stringify([...db.map.values()]).includes('test-only-code-1234'),false);
 assert.equal(result.snapshot.createdBy,undefined);
});
test('wrong registration codes are denied and throttled after five failures',async()=>{
 const db=fakeFirestore(),service=makeInventoryService({db,allowedEmails:[],registrationCode:'test-only-code-1234',now:()=>new Date('2026-10-05T01:00:00Z')});
 for(let i=0;i<5;i++)await assert.rejects(()=>service.save({data:{...payload,registrationCode:'wrong-code-1234'}}),e=>e.code==='permission-denied');
 await assert.rejects(()=>service.save({data:{...payload,registrationCode:'wrong-code-1234'}}),e=>e.code==='resource-exhausted');
 assert.equal([...db.map.keys()].some(k=>k.startsWith('mf_stock_snapshots/')),false);
});
