const {test}=require('node:test');
const assert=require('node:assert/strict');
const {catalog,validateImage,validateExtraction,fieldName}=require('./validation');
const {extractOrder,instructions,schema,MODEL}=require('./extraction');
const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=';
const photoRows=[['생물 손질 오징어 500g',36],['생물 손질 오징어 900g',5],['손질 고등어 900g',2],['손질 백조기 500g 1개',10],['손질 백조기 900g 1개',1],['손질 황돔 500g 1개',4],['생물 홍합 1kg',6],['손질 고등어 500g',1],['생물 홍합 3kg',2],['손질 오징어(해동) 500g',7],['활새우 1.2kg',1],['생물 대합 1kg 1개',4],['생물 대합 600g 1개',2],['남해안 활 홍가리비 2.5kg',1]];
// Manually transcribed from the attached 2026-10-03 slot 1 photo, not a live OCR result.
const fixture={rows:photoRows.map(([name,quantity])=>({name:'[로켓프레시] 위드프레쉬 산지직송 국내산 '+name,quantity,barcode:null,uncertain:false})),total:82,warnings:[],tableComplete:true};
const reply=value=>({ok:true,status:200,json:async()=>({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(value)}]}}]})});
test('27 catalog entries preserve original 22 and add five unique barcodes',()=>{assert.equal(catalog.length,27);assert.equal(new Set(catalog.map(x=>x.barcode)).size,27);assert.equal(catalog[21].barcode,'8809929791028');assert.equal(catalog[26].barcode,'8809929791462');});
test('photo transcription matches all 14 rows and sums to 82',()=>{const r=validateExtraction(fixture);assert.equal(r.total,82);assert.equal(r.sourceTotal,82);assert.equal(r.needsReview,false);assert.equal(r.registeredTotal,82);assert.equal(r.pendingRows.length,0);assert.equal(r.rows.length,14);assert.equal(r.rows.find(x=>x.name==='홍가리비 2.5kg').quantity,1);assert.equal(r.rows.find(x=>x.name==='손질오징어(할복) 500g').quantity,7);});
test('new five SKUs match photo names with weights intact',()=>{const names=['남해안 활 홍가리비 1kg','남해안 활 홍가리비 1.5kg','남해안 활 홍가리비 2.5kg','손질 갑오징어 400g (해동)','손질 갑오징어 600g (해동)'];const r=validateExtraction({rows:names.map(name=>({name:'[로켓프레시] 위드프레쉬 산지직송 '+name,barcode:null,quantity:1,uncertain:false})),total:5,warnings:[],tableComplete:true});assert.equal(r.pendingRows.length,0);assert.deepEqual(r.rows.map(r=>r.name),catalog.slice(22).map(r=>r.name));});
test('72 vs 82 prevents ALL catalog matching',()=>{const r=validateExtraction({...fixture,rows:fixture.rows.filter((_,i)=>i!==3)});assert.equal(r.total,72);assert.equal(r.needsReview,true);assert.deepEqual(r.rows,[]);assert.deepEqual(r.pendingRows,[]);});
test('uncertain, missing total, warnings and malformed rows block',()=>{for(const v of [{...fixture,total:null},{...fixture,warnings:['표 잘림'],tableComplete:false},{...fixture,rows:[{name:'x',quantity:null,barcode:null,uncertain:true}]}])assert.equal(validateExtraction(v).needsReview,true);});
test('new SKU does not fall back from unknown barcode or block known items',()=>{const r=validateExtraction({rows:[{name:catalog[0].name,barcode:'unknown',quantity:1,uncertain:false},{name:catalog[1].name,barcode:catalog[1].barcode,quantity:2,uncertain:false}],total:3,warnings:[],tableComplete:true});assert.equal(r.rows.length,1);assert.equal(r.pendingRows.length,1);assert.equal(r.needsReview,false);});
test('field naming preserves weight',()=>{assert.equal(fieldName('손질 갑오징어 900g'),'갑오징어 900g');assert.equal(fieldName('남해안 활 홍가리비 2.5kg'),'홍가리비 2.5kg');});
test('duplicate product rows aggregate after verification',()=>{const row={name:catalog[0].name,barcode:null,quantity:2,uncertain:false};const r=validateExtraction({rows:[row,row],total:4,warnings:[],tableComplete:true});assert.equal(r.rows.length,1);assert.equal(r.total,4);});
test('invalid and remote images rejected',()=>{for(const v of ['https://example.com/a.png','data:image/png;base64,a','data:image/png;base64,'+'A'.repeat(7_000_000)])assert.throws(()=>validateImage(v));});
test('one automatic independent retry recovers 72 to 82',async()=>{let calls=0,reserves=0;const r=await extractOrder({image,key:'mock',reserve:async()=>reserves++,fetchImpl:async(_,opts)=>{const b=JSON.parse(opts.body);assert.equal(b.contents[0].parts[1].inlineData.mimeType,'image/png');assert.equal(b.systemInstruction.parts[0].text,instructions);assert.ok(!b.systemInstruction.parts[0].text.includes(JSON.stringify(catalog)));calls++;return reply(calls===1?{...fixture,rows:fixture.rows.filter((_,i)=>i!==3)}:fixture);}});assert.equal(calls,2);assert.equal(reserves,2);assert.equal(r.total,82);assert.equal(r.attempts,2);});
test('persistent mismatch stops after two analyses',async()=>{let calls=0;const r=await extractOrder({image,key:'mock',reserve:async()=>{},fetchImpl:async()=>{calls++;return reply({...fixture,total:99});}});assert.equal(calls,2);assert.equal(r.needsReview,true);});
test('quota or unrelated API failures never bypass controls',async()=>{let calls=0;await assert.rejects(()=>extractOrder({image,key:'mock',reserve:async()=>{throw Error('quota')},fetchImpl:async()=>{calls++;}}));assert.equal(calls,0);await assert.rejects(()=>extractOrder({image,key:'mock',reserve:async()=>{},fetchImpl:async()=>({ok:false,status:401,json:async()=>({error:{message:'invalid key'}})})}));});
test('informational warnings do not block complete verified rows',()=>{const r=validateExtraction({...fixture,warnings:['행 레이블이 보임']});assert.equal(r.needsReview,false);assert.equal(r.rows.length,14);});
test('absent barcode placeholders are not treated as unknown SKUs',()=>{for(const barcode of ['null','없음','N/A','none']){const r=validateExtraction({...fixture,rows:fixture.rows.map(row=>({...row,barcode}))});assert.equal(r.registeredTotal,82);assert.equal(r.pendingRows.length,0);}});
test('date and slot group rows block even if totals happen to match',()=>{const r=validateExtraction({rows:[{name:'261003',quantity:82,barcode:null,uncertain:false}],total:82,warnings:[],tableComplete:true});assert.equal(r.needsReview,true);assert.equal(r.rows.length,0);});

test('brand-only OCR spelling variant preserves exact product and weight matching',()=>{const r=validateExtraction({rows:[{name:'워드프레쉬 산지직송 국내산 생물 손질 오징어 500g',barcode:null,quantity:36,uncertain:false}],total:36,tableComplete:true,warnings:[]});assert.equal(r.registeredTotal,36);assert.equal(r.pendingRows.length,0);});

test('Gemini request uses the official 3.1 Pro ID, private header, image and required schema',async()=>{
  let reserves=0;
  const r=await extractOrder({image,key:'test-secret',reserve:async()=>reserves++,fetchImpl:async(url,opts)=>{
    assert.equal(MODEL,'gemini-3.1-pro-preview');
    assert.equal(url,'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent');
    assert.ok(!url.includes('test-secret'));
    assert.equal(opts.headers['x-goog-api-key'],'test-secret');
    assert.equal(opts.method,'POST');
    assert.ok(opts.signal instanceof AbortSignal);
    const b=JSON.parse(opts.body);
    assert.equal(b.contents[0].parts[1].inlineData.data,image.split(',')[1]);
    assert.deepEqual(b.generationConfig.responseFormat.text,{mimeType:'application/json',schema});
    assert.deepEqual(schema.required,['rows','total','warnings','tableComplete']);
    assert.deepEqual(schema.properties.rows.items.required,['barcode','name','quantity','uncertain']);
    assert.deepEqual(schema.properties.rows.items.properties.quantity.type,['integer','null']);
    assert.equal(b.generationConfig.maxOutputTokens,10000);
    assert.ok(!('store' in b));
    return reply(fixture);
  }});
  assert.equal(reserves,1);assert.equal(r.detail,'auto');assert.equal(r.registeredTotal,82);
});
test('Gemini independent recheck never contains previous guessed quantities',async()=>{
  const prompts=[];
  await extractOrder({image,key:'mock',reserve:async()=>{},fetchImpl:async(_,opts)=>{
    prompts.push(JSON.parse(opts.body).contents[0].parts[0].text);
    return reply(prompts.length===1?{...fixture,total:99}:fixture);
  }});
  assert.equal(prompts.length,2);
  assert.ok(prompts[1].includes('독립적으로'));
  assert.ok(!prompts[1].includes('99'));
});
test('blocked, truncated, missing candidate and empty Gemini results are rejected',async()=>{
  for(const body of [
    {promptFeedback:{blockReason:'SAFETY'}},
    {candidates:[]},
    {candidates:[{finishReason:'MAX_TOKENS',content:{parts:[{text:JSON.stringify(fixture)}]}}]},
    {candidates:[{finishReason:'SAFETY',content:{parts:[{text:JSON.stringify(fixture)}]}}]},
    {candidates:[{content:{parts:[{text:JSON.stringify(fixture)}]}}]},
    {candidates:[{finishReason:'STOP',content:{parts:[]}}]}
  ]){
    await assert.rejects(()=>extractOrder({image,key:'mock',reserve:async()=>{},fetchImpl:async()=>({ok:true,json:async()=>body})}));
  }
});
test('Gemini combines answer text parts while ignoring thought parts',async()=>{
  const txt=JSON.stringify(fixture),mid=Math.floor(txt.length/2);
  const r=await extractOrder({image,key:'mock',reserve:async()=>{},fetchImpl:async()=>({ok:true,json:async()=>({
    candidates:[{finishReason:'STOP',content:{parts:[{thought:true,text:'private reasoning'}, {text:txt.slice(0,mid)},{text:txt.slice(mid)}]}}]
  })})});
  assert.equal(r.total,82);assert.equal(r.needsReview,false);
});
test('invalid image fails before quota reservation or network access',async()=>{
  let reserves=0,calls=0;
  await assert.rejects(()=>extractOrder({image:'bad',key:'mock',reserve:async()=>reserves++,fetchImpl:async()=>calls++}));
  assert.equal(reserves,0);assert.equal(calls,0);
});
test('malformed JSON is rejected and HTTP errors do not expose upstream details',async()=>{
  await assert.rejects(()=>extractOrder({image,key:'mock',reserve:async()=>{},fetchImpl:async()=>({ok:true,json:async()=>({candidates:[{finishReason:'STOP',content:{parts:[{text:'bad json'}]}}]})})}));
  await assert.rejects(()=>extractOrder({image,key:'private-key',reserve:async()=>{},fetchImpl:async()=>({ok:false,status:403,json:async()=>({error:{message:'private-key'}})})}),e=>e.message==='Gemini 판독 실패(403)'&&!e.message.includes('private-key'));
});
