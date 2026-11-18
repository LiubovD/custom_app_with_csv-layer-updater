import assert from 'node:assert/strict'
import { parseCSV, coordinates, convert, uniqueKey } from './core.mjs'
let count = 0
function test(name, fn) { fn(); count++; console.log('PASS', name) }
test('BOM, CRLF, quoted commas, multiline, escaped quotes', () => {
 const t = parseCSV('\uFEFFid,note\r\n001,"a,b\n""c"""\r\n')
 assert.deepEqual(t, {headers:['id','note'],rows:[['001','a,b\n"c"']]})
})
test('Reject malformed CSV', () => { for (const s of ['id,id\na,b', 'id,x\na', 'id\n"bad', 'id\n"a"z', 'id\na"b']) assert.throws(() => parseCSV(s)) })
test('Blank coordinate is never zero', () => assert.throws(() => coordinates('', '41')))
test('Out of range and DMS rejected', () => {assert.throws(() => coordinates('-181','41')); assert.throws(() => coordinates('71°W','41'))})
test('Valid negative longitude', () => assert.deepEqual(coordinates('-71.4','41.8'),[-71.4,41.8]))
test('String IDs preserve leading zeroes', () => assert.equal(uniqueKey('001',{name:'id',type:'string'}),'001'))
test('Numeric IDs normalize consistently', () => assert.equal(uniqueKey('001',{name:'id',type:'integer'}),'1'))
test('Integer range and length enforced', () => {assert.throws(() => convert('32768',{name:'id',type:'small-integer'})); assert.throws(() => convert('abc',{name:'x',type:'string',length:2}))})
test('Domain codes validated', () => {assert.throws(() => convert('Closed',{name:'s',type:'string',domain:{type:'coded-value',codedValues:[{code:'C'}]}}))})
test('Row limit enforced', () => assert.throws(() => parseCSV('id\n'+Array.from({length:501},(_,i)=>i).join('\n'))))
console.log(`${count} tests passed`)
const { CSV_FIELDS, schemaMapping, planAdditions } = await import('./core.mjs')
const fields = CSV_FIELDS.map(name => ({name,type:['longitude','latitude'].includes(name)?'double':'string',editable:true,nullable:true,length:2000}))
function inputRow(id, lon='-71.4', lat='41.8') { return CSV_FIELDS.map(n => n==='id'?id:n==='longitude'?lon:n==='latitude'?lat:n==='name'?'Site name':`value for ${n}`) }
function plan(rows, ids=[]) { return planAdditions({headers:CSV_FIELDS,rows},fields,ids,false) }
test('Existing IDs skipped even with invalid coordinates; new row gets all 17 attributes', () => {
 const p=plan([inputRow('OLD','',''),inputRow('NEW')],['OLD'])
 assert.equal(p.additions.length,1); assert.equal(p.report[0].action,'Skipped')
 assert.deepEqual(Object.keys(p.additions[0].attributes),CSV_FIELDS)
 assert.equal(p.additions[0].attributes.longitude,-71.4)
 assert.equal(p.additions[0].attributes.description,'value for description')
 assert.equal(p.additions[0].attributes.id,'NEW')
})
test('Second import is idempotent after additions',()=>{
 const p=plan([inputRow('NEW')],['NEW']); assert.equal(p.additions.length,0);assert.equal(p.report[0].action,'Skipped')
})
test('Invalid new coordinates reported while valid new point retained',()=>{
 const p=plan([inputRow('BAD','',''),inputRow('GOOD')]);assert.equal(p.additions.length,1);assert.equal(p.report[0].action,'Invalid')
})
test('All duplicate new rows excluded',()=>{
 const p=plan([inputRow('DUP'),inputRow('DUP')]); assert.equal(p.additions.length,0); assert.ok(p.report.every(r=>r.action==='Invalid'))
})
test('Missing schema field fails before edits',()=>assert.throws(()=>schemaMapping(fields.slice(1),CSV_FIELDS)))
test('Blank text retained as empty string',()=>{
 const r=inputRow('NEW');r[CSV_FIELDS.indexOf('description')]='';assert.equal(plan([r]).additions[0].attributes.description,'')
})
test('Case-insensitive target field names mapped to actual names',()=>{
 const fs=fields.map(f=>({...f,name:f.name.toUpperCase()}));const p=planAdditions({headers:CSV_FIELDS,rows:[inputRow('NEW')]},fs,[],false);assert.equal(p.additions[0].attributes.ID,'NEW')
})
test('Existing duplicate target IDs still skip without mutation',()=>assert.equal(plan([inputRow('OLD')],['OLD','OLD']).additions.length,0))
test('Blank new ID and oversized attribute do not create features',()=>{
 const r=inputRow('NEW');r[CSV_FIELDS.indexOf('name')]='x'.repeat(2001);assert.equal(plan([inputRow(''),r]).additions.length,0)
})
console.log(`${count} total tests passed`)
const { shouldCollapse } = await import('./core.mjs')
test('Collapse after confirmed full success',()=>assert.equal(shouldCollapse(true,1,[{}],[{action:'Add'}]),true))
test('Keep failures and incomplete results open',()=>{assert.equal(shouldCollapse(true,1,[{error:{message:'Denied'}}],[]),false);assert.equal(shouldCollapse(true,2,[{}],[]),false)})
test('Keep invalid rows and no-write runs open',()=>{assert.equal(shouldCollapse(true,1,[{}],[{action:'Invalid'}]),false);assert.equal(shouldCollapse(true,0,[],[]),false)})
test('Respect auto-collapse checkbox',()=>assert.equal(shouldCollapse(false,1,[{}],[]),false))
console.log(`${count} total tests passed`)
const { validateProjectedPoint } = await import('./core.mjs')
const targetSR={wkid:3438}; const sr={equals:other=>other.wkid===3438}
test('Accept finite point in target StatePlane reference',()=>assert.doesNotThrow(()=>validateProjectedPoint({type:'point',x:355000,y:261000,spatialReference:sr},targetSR)))
test('Reject missing or invalid projection output',()=>{assert.throws(()=>validateProjectedPoint(null,targetSR));assert.throws(()=>validateProjectedPoint({type:'point',x:NaN,y:2,spatialReference:sr},targetSR))})
test('Reject wrong spatial reference',()=>assert.throws(()=>validateProjectedPoint({type:'point',x:-71,y:41,spatialReference:{equals:()=>false}},targetSR)))
console.log(`${count} total tests passed`)
const { suggestMapping } = await import('./core.mjs')
const shortened = fields.map(f => ({...f, name:f.name.slice(0,10)}))
test('All 17 truncated fields preserve attributes and ID skip', () => {
 const p=planAdditions({headers:CSV_FIELDS,rows:[inputRow('NEW'),inputRow('OLD')]},shortened,['OLD'],false)
 assert.equal(p.additions.length,1)
 assert.equal(Object.keys(p.additions[0].attributes).length,17)
 assert.ok('geocode_ad' in p.additions[0].attributes)
 assert.ok(!('geocode_address' in p.additions[0].attributes))
 assert.equal(p.report[1].action,'Skipped')
})
test('Numbered names require explicit mapping or exact alias',()=>{
 const fs=shortened.map(f=>f.name==='geocode_ad'?{...f,name:'geocode_1'}:f)
 assert.throws(()=>schemaMapping(fs))
 assert.equal(schemaMapping(fs,undefined,{geocode_address:'geocode_1'}).geocode_address.name,'geocode_1')
 fs.find(f=>f.name==='geocode_1').alias='geocode_address'
 assert.equal(suggestMapping(fs).geocode_address,'geocode_1')
})
test('Reject reused, empty and nonexistent destination selections',()=>{
 for(const overrides of [{town:'name'},{town:''},{town:'absent'}]) assert.throws(()=>schemaMapping(fields,undefined,overrides))
})
console.log(`${count} total tests passed`)
test('moshup_site is preserved and respects target domain',()=>{
 const row=inputRow('MOSHUP_NEW');row[CSV_FIELDS.indexOf('category')]='moshup_site'
 const table={headers:CSV_FIELDS,rows:[row]}
 assert.equal(planAdditions(table,fields,[],false).additions[0].attributes.category,'moshup_site')
 const restricted=fields.map(f=>f.name==='category'?{...f,domain:{type:'coded-value',codedValues:[{code:'sacred_site'}]}}:f)
 assert.equal(planAdditions(table,restricted,[],false).additions.length,0)
 restricted.find(f=>f.name==='category').domain.codedValues.push({code:'moshup_site'})
 assert.equal(planAdditions(table,restricted,[],false).additions.length,1)
})
