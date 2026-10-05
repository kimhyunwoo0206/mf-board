const {test}=require('node:test');
const assert=require('node:assert/strict');
const {catalog,validateImage,validateExtraction,fieldName,validateScope,validateScopedExtraction}=require('./validation');
const {extractOrder,instructions,schema,MODEL}=require('./extraction');
const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=';
const photoRows=[['생물 손질 오징어 500g',36],['생물 손질 오징어 900g',5],['손질 고등어 900g',2],['손질 백조기 500g 1개',10],['손질 백조기 900g 1개',1],['손질 황돔 500g 1개',4],['생물 홍합 1kg',6],['손질 고등어 500g',1],['생물 홍합 3kg',2],['손질 오징어(해동) 500g',7],['활새우 1.2kg',1],['생물 대합 1kg 1개',4],['생물 대합 600g 1개',2],['남해안 활 홍가리비 2.5kg',1]];
// Manually transcribed from the attached 2026-10-03 slot 1 photo, not a live OCR result.
const fixture={rows:photoRows.map(([name,quantity])=>({name:'[로켓프레시] 위드프레쉬 산지직송 국내산 '+name,quantity,barcode:null,uncertain:false})),total:82,warnings:[],tableComplete:true};
test('27 catalog entries preserve original 22 and add five unique barcodes',()=>{assert.equal(catalog.length,27);assert.equal(new Set(catalog.map(x=>x.barcode)).size,27);assert.equal(catalog[21].barcode,'8809929791028');assert.equal(catalog[26].barcode,'8809929791462');});
test('photo transcription matches all 14 rows and sums to 82',()=>{const r=validateExtraction(fixture);assert.equal(r.total,82);assert.equal(r.sourceTotal,82);assert.equal(r.needsReview,false);assert.equal(r.registeredTotal,82);assert.equal(r.pendingRows.length,0);assert.equal(r.rows.length,14);assert.equal(r.rows.find(x=>x.name==='홍가리비 2.5kg').quantity,1);assert.equal(r.rows.find(x=>x.name==='손질오징어(할복) 500g').quantity,7);});
test('new five SKUs match photo names with weights intact',()=>{const names=['남해안 활 홍가리비 1kg','남해안 활 홍가리비 1.5kg','남해안 활 홍가리비 2.5kg','손질 갑오징어 400g (해동)','손질 갑오징어 600g (해동)'];const r=validateExtraction({rows:names.map(name=>({name:'[로켓프레시] 위드프레쉬 산지직송 '+name,barcode:null,quantity:1,uncertain:false})),total:5,warnings:[],tableComplete:true});assert.equal(r.pendingRows.length,0);assert.deepEqual(r.rows.map(r=>r.name),catalog.slice(22).map(r=>r.name));});
test('72 vs 82 prevents ALL catalog matching',()=>{const r=validateExtraction({...fixture,rows:fixture.rows.filter((_,i)=>i!==3)});assert.equal(r.total,72);assert.equal(r.needsReview,true);assert.deepEqual(r.rows,[]);assert.deepEqual(r.pendingRows,[]);});
test('uncertain, missing total, warnings and malformed rows block',()=>{for(const v of [{...fixture,total:null},{...fixture,warnings:['표 잘림'],tableComplete:false},{...fixture,rows:[{name:'x',quantity:null,barcode:null,uncertain:true}]}])assert.equal(validateExtraction(v).needsReview,true);});
test('new SKU does not fall back from unknown barcode or block known items',()=>{const r=validateExtraction({rows:[{name:catalog[0].name,barcode:'unknown',quantity:1,uncertain:false},{name:catalog[1].name,barcode:catalog[1].barcode,quantity:2,uncertain:false}],total:3,warnings:[],tableComplete:true});assert.equal(r.rows.length,1);assert.equal(r.pendingRows.length,1);assert.equal(r.needsReview,false);});
test('field naming preserves weight',()=>{assert.equal(fieldName('손질 갑오징어 900g'),'갑오징어 900g');assert.equal(fieldName('남해안 활 홍가리비 2.5kg'),'홍가리비 2.5kg');});
test('duplicate product rows aggregate after verification',()=>{const row={name:catalog[0].name,barcode:null,quantity:2,uncertain:false};const r=validateExtraction({rows:[row,row],total:4,warnings:[],tableComplete:true});assert.equal(r.rows.length,1);assert.equal(r.total,4);});
test('invalid and remote images rejected',()=>{for(const v of ['https://example.com/a.png','data:image/png;base64,a','data:image/png;base64,'+'A'.repeat(7_000_000)])assert.throws(()=>validateImage(v));});
test('informational warnings do not block complete verified rows',()=>{const r=validateExtraction({...fixture,warnings:['행 레이블이 보임']});assert.equal(r.needsReview,false);assert.equal(r.rows.length,14);});
test('absent barcode placeholders are not treated as unknown SKUs',()=>{for(const barcode of ['null','없음','N/A','none']){const r=validateExtraction({...fixture,rows:fixture.rows.map(row=>({...row,barcode}))});assert.equal(r.registeredTotal,82);assert.equal(r.pendingRows.length,0);}});
test('date and slot group rows block even if totals happen to match',()=>{const r=validateExtraction({rows:[{name:'261003',quantity:82,barcode:null,uncertain:false}],total:82,warnings:[],tableComplete:true});assert.equal(r.needsReview,true);assert.equal(r.rows.length,0);});

test('brand-only OCR spelling variant preserves exact product and weight matching',()=>{const r=validateExtraction({rows:[{name:'워드프레쉬 산지직송 국내산 생물 손질 오징어 500g',barcode:null,quantity:36,uncertain:false}],total:36,tableComplete:true,warnings:[]});assert.equal(r.registeredTotal,36);assert.equal(r.pendingRows.length,0);});


const scope={date:'2026-10-05',slot:2};
const scoped={rows:[
 {slot:1,name:'생물 손질 오징어 500g',quantity:95,barcode:null,uncertain:false},
 {slot:2,name:'생물 손질 오징어 500g',quantity:12,barcode:null,uncertain:false},
 {slot:2,name:'생물 홍합 1kg',quantity:8,barcode:null,uncertain:false}
],slotTotals:[{slot:1,quantity:95},{slot:2,quantity:20}],dailyTotal:115,detectedDate:scope.date,targetVisible:true,targetComplete:true,warnings:[]};
const reply=value=>({ok:true,status:200,json:async()=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}]})});
const run=opts=>extractOrder({image,...scope,key:'mock',reserve:async()=>{},...opts});
test('selected slot 2 excludes earlier identical product and daily total 115',()=>{
 const r=validateScopedExtraction(scoped,scope);
 assert.equal(r.needsReview,false);assert.equal(r.total,20);assert.equal(r.sourceTotal,20);assert.equal(r.dailyTotal,115);
 assert.equal(r.excludedRowCount,1);assert.equal(r.rows.find(x=>x.name==='손질오징어(통) 500g').quantity,12);
 assert.equal(r.rawRows.length,2);assert.equal(r.registeredTotal,20);
});
test('selecting slot 1 of the same image registers only 95',()=>{
 const r=validateScopedExtraction(scoped,{...scope,slot:1});assert.equal(r.total,95);assert.equal(r.sourceTotal,95);assert.equal(r.rows.length,1);
});
test('slot subtotal missing never falls back to daily total even if equal',()=>{
 const r=validateScopedExtraction({...scoped,slotTotals:[],dailyTotal:20},scope);
 assert.equal(r.needsReview,true);assert.equal(r.sourceTotal,null);assert.deepEqual(r.rows,[]);
});
test('missing product row blocks selected slot before catalog matching',()=>{
 const r=validateScopedExtraction({...scoped,rows:scoped.rows.slice(0,2)},scope);
 assert.equal(r.total,12);assert.equal(r.needsReview,true);assert.deepEqual(r.rows,[]);
});
test('hidden target, actual truncation, wrong date, ambiguous slot and duplicate subtotal block',()=>{
 for(const changes of [
 {targetVisible:false},{targetComplete:false},{detectedDate:'2026-10-04'},
 {rows:[...scoped.rows,{...scoped.rows[0],slot:null}]},
 {slotTotals:[...scoped.slotTotals,{slot:2,quantity:20}]}
 ]){const r=validateScopedExtraction({...scoped,...changes},scope);assert.equal(r.needsReview,true);assert.deepEqual(r.rows,[]);}
});
test('unreadable earlier row does not block complete target rows',()=>{
 const rows=scoped.rows.map(r=>r.slot===1?{...r,uncertain:true,quantity:null}:r);
 assert.equal(validateScopedExtraction({...scoped,rows},scope).needsReview,false);
});
test('missing date is allowed but missing selected slot never is',()=>{
 assert.equal(validateScopedExtraction({...scoped,detectedDate:null},scope).needsReview,false);
 assert.equal(validateScopedExtraction({...scoped,rows:scoped.rows.slice(0,1)},scope).needsReview,true);
});
test('scope accepts only valid calendar dates and supported slots before API cost',async()=>{
 assert.deepEqual(validateScope({date:scope.date,slot:'2_slot_10'}),scope);
 for(const context of [{date:'2026-02-30',slot:2},{date:scope.date,slot:5},{date:scope.date,slot:'2'},{slot:2},{date:scope.date}]){
   let calls=0,reserves=0;
   await assert.rejects(()=>extractOrder({image,key:'mock',...context,reserve:async()=>reserves++,fetchImpl:async()=>calls++}));
   assert.equal(calls,0);assert.equal(reserves,0);
 }
});
test('GPT request uses selected scope, original photo, strict JSON and no stored response',async()=>{
 let reserves=0;
 const r=await run({key:'test-secret',reserve:async()=>reserves++,fetchImpl:async(url,opts)=>{
  assert.equal(MODEL,'gpt-5.4');assert.equal(url,'https://api.openai.com/v1/responses');
  assert.equal(opts.headers.Authorization,'Bearer test-secret');assert.ok(opts.signal instanceof AbortSignal);
  const b=JSON.parse(opts.body);assert.equal(b.store,false);assert.equal(b.instructions,instructions);
  assert.equal(b.input[0].content[1].image_url,image);assert.equal(b.input[0].content[1].detail,'original');
  assert.ok(b.input[0].content[0].text.includes('2026-10-05'));assert.ok(b.input[0].content[0].text.includes('2차'));
  assert.deepEqual(b.text.format.schema,schema);assert.equal(b.text.format.strict,true);
  assert.ok(!b.instructions.includes(JSON.stringify(catalog)));
  return reply(scoped);
 }});
 assert.equal(reserves,1);assert.equal(r.total,20);assert.equal(r.detail,'original');
});
test('one independent recheck recovers omitted rows without previous guessed quantities',async()=>{
 const prompts=[];let reserves=0;
 const r=await run({reserve:async()=>reserves++,fetchImpl:async(_,opts)=>{
  prompts.push(JSON.parse(opts.body).input[0].content[0].text);
  return reply(prompts.length===1?{...scoped,rows:scoped.rows.slice(0,2)}:scoped);
 }});
 assert.equal(r.attempts,2);assert.equal(reserves,2);assert.equal(r.total,20);
 assert.ok(prompts[1].includes('독립적으로'));assert.ok(!prompts[1].includes('12'));
});
test('persistent mismatch stops after two calls and cannot register',async()=>{
 let calls=0;const r=await run({fetchImpl:async()=>{calls++;return reply({...scoped,slotTotals:[{slot:2,quantity:99}]});}});
 assert.equal(calls,2);assert.equal(r.needsReview,true);assert.deepEqual(r.rows,[]);
});
test('quota, invalid image, HTTP failure, incomplete and refused responses fail closed',async()=>{
 let calls=0;await assert.rejects(()=>run({reserve:async()=>{throw Error('quota')},fetchImpl:async()=>calls++}));assert.equal(calls,0);
 await assert.rejects(()=>run({image:'bad',fetchImpl:async()=>calls++}));assert.equal(calls,0);
 await assert.rejects(()=>run({fetchImpl:async()=>({ok:false,status:401,json:async()=>({error:{message:'private-key'}})})}),e=>e.message==='GPT 판독 실패(401)');
 for(const body of [{status:'incomplete',output:[]},{status:'completed',output:[]},{status:'completed',output:[{content:[{type:'refusal'}]}]}]){
  await assert.rejects(()=>run({fetchImpl:async()=>({ok:true,json:async()=>body})}));
 }
});
test('only unsupported original detail falls back to high and consumes quota',async()=>{
 let calls=0,reserves=0;
 const r=await run({reserve:async()=>reserves++,fetchImpl:async(_,opts)=>{
  calls++;assert.equal(JSON.parse(opts.body).input[0].content[1].detail,calls===1?'original':'high');
  return calls===1?{ok:false,status:400,json:async()=>({error:{param:'detail',message:'original detail is not supported'}})}:reply(scoped);
 }});
 assert.equal(calls,2);assert.equal(reserves,2);assert.equal(r.detail,'high');
});
