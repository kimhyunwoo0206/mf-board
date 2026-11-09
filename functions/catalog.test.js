const {test}=require('node:test');
const assert=require('node:assert/strict');
const catalog=require('./catalog.json');
test('42 catalog entries preserve original 22 and add unique barcodes',()=>{assert.equal(catalog.length,42);assert.equal(new Set(catalog.map(x=>x.barcode)).size,42);assert.equal(catalog[21].barcode,'8809929791028');assert.equal(catalog[26].barcode,'8809929791462');assert.equal(catalog[28].barcode,'8809929791486');});
test('new seven SKUs are present with product ids',()=>{const want={'8809929791400':'81246502','8809929791417':'81246516','8809929791707':'82323353','8809929791714':'82323362','8809929791721':'82323342','8809929791738':'82104693','8809929791745':'82104700'};for(const [b,id] of Object.entries(want))assert.equal(catalog.find(x=>x.barcode===b)?.productId,id);});

test('six new SKUs (달마새우·달마새우회·새꼬막) are in the catalog and match by full product name',()=>{
 const want={'8809929791981':'달마새우 150g(해동)','8809929791998':'달마새우 250g(해동)','8809929792001':'달마새우회 120g','8809929792018':'달마새우회 200g','8809929792025':'새꼬막 600g','8809929792032':'새꼬막 1kg'};
 for(const [b,n] of Object.entries(want)){const x=catalog.find(c=>c.barcode===b);assert.equal(x.name,n);assert.ok(x.aliases.length>=3);}
});
