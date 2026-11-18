import {parseCSV,CSV_FIELDS,suggestMapping,schemaMapping,planAdditions,validateProjectedPoint,shouldCollapse} from './core.mjs?v=1.3.0';
import {filterSQL} from './filters.mjs?v=1.3.0';
const $=id=>document.getElementById(id), status=text=>{$('status').textContent=text;};
function panel(id,open){$(id).hidden=!open;document.querySelector(`[data-panel="${id}"]`).setAttribute('aria-expanded',String(open));}
document.querySelectorAll('[data-panel]').forEach(b=>b.onclick=()=>{const open=$(b.dataset.panel).hidden;document.querySelectorAll('[data-panel]').forEach(x=>panel(x.dataset.panel,false));panel(b.dataset.panel,open);});
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>{panel(b.dataset.close,false);document.querySelector(`[data-panel="${b.dataset.close}"]`).focus();});
const modules=['WebMap','views/MapView','layers/FeatureLayer','Graphic','geometry/Point','geometry/operators/projectOperator','identity/OAuthInfo','identity/IdentityManager','widgets/BasemapGallery','widgets/Legend','widgets/Search','widgets/Home','widgets/Print'];
try{
const [WebMap,MapView,FeatureLayer,Graphic,Point,project,OAuthInfo,identity,BasemapGallery,Legend,Search,Home,Print]=await new Promise((resolve,reject)=>window.require(modules.map(x=>'esri/'+x),(...args)=>resolve(args),reject));
const response=await fetch('../cdn/7/config.json');if(!response.ok)throw Error('Could not load app configuration.');const config=await response.json();
const portal=config.attributes.portalUrl,clientId=config.attributes.clientId,webmapId=config.dataSources.dataSource_1.itemId;
const targetUrl='https://services3.arcgis.com/zrjd7IdrONctjbYR/arcgis/rest/services/wampanoag_places_agol_coordinates/FeatureServer/0';
const previousTarget=Object.values(config.widgets).find(w=>w.uri==='widgets/csv-layer-updater/')?.config.layerUrl;
if(!clientId)throw Error('Configure the AGOL Client ID in cdn/7/config.json.');
identity.registerOAuthInfos([new OAuthInfo({appId:clientId,portalUrl:portal,popup:false,flowType:'auto'})]);
let layer,view,displayLayer,baseWhere='',table,plan,busy=false,report={},mapping={},timer,started=false,categoryField,moshupField;

const message=text=>{$('import-status').textContent=text;};
function invalidate(){plan=null;$('confirm').checked=false;$('save').disabled=true;}
async function run(fn){if(busy)return;busy=true;clearTimeout(timer);$('import-controls').disabled=true;try{await fn();}catch(e){invalidate();message(e.message||String(e));}finally{busy=false;$('import-controls').disabled=!layer;}}
function fields(){const system=Object.values(layer.editFieldsInfo||{});return layer.fields.filter(f=>!system.includes(f.name));}
function mappingUI(){const names=[...CSV_FIELDS,...(table?.headers.includes('moshup_site')?['moshup_site']:[])];$('mapping').replaceChildren();mapping=suggestMapping(fields());for(const name of names){const label=document.createElement('label');label.textContent=name;const select=document.createElement('select');select.add(new Option('Select destination field…',''));for(const f of fields().filter(f=>f.editable!==false&&['string','integer','small-integer','double','single'].includes(f.type)))select.add(new Option(f.name,f.name));select.value=mapping[name]||'';select.onchange=()=>{mapping[name]=select.value;invalidate();};label.append(select);$('mapping').append(label);}}
async function snapshot(source=layer){const ids=await source.queryObjectIds({where:'1=1'})||[];if(ids.length>50000)throw Error('Maximum 50,000 target records supported.');ids.sort((a,b)=>a-b);const rows=[];for(let i=0;i<ids.length;i+=100){const part=ids.slice(i,i+100),res=await source.queryFeatures({objectIds:part,outFields:['*'],returnGeometry:true});if(res.exceededTransferLimit||res.features.length!==part.length)throw Error('Could not read all target records.');rows.push(...res.features);}rows.sort((a,b)=>a.attributes[source.objectIdField]-b.attributes[source.objectIdField]);return {rows,signature:JSON.stringify(rows.map(f=>f.toJSON()))};}
async function applyFilters(){displayLayer.definitionExpression=filterSQL(baseWhere,categoryField.name,$('category').value,moshupField?.name,$('moshup').value==='yes');$('filter-note').textContent=$('moshup').value==='yes'?'Showing Moshup features within the selected category.':'Showing the selected category.';}
async function start(){if(started)return;started=true;status('Loading your map…');try{
 await connectTarget();
 const map=new WebMap({portalItem:{id:webmapId,portal:{url:portal}}});view=new MapView({container:'map',map});await view.when();await map.loadAll();
 displayLayer=map.allLayers.find(l=>l.type==='feature'&&l.url&&`${l.url.replace(/\/$/,'')}${/\/\d+$/.test(l.url)?'':'/'+l.layerId}`.toLowerCase()===targetUrl.replace(/\/$/,'').toLowerCase());
 if(!displayLayer){displayLayer=new FeatureLayer({url:targetUrl,title:'Wampanoag Sacred Sites'});map.add(displayLayer);}
 if(previousTarget&&previousTarget.toLowerCase()!==targetUrl.toLowerCase()){map.allLayers.forEach(l=>{if(l!==displayLayer&&l.url&&`${l.url.replace(/\/$/,'')}${/\/\d+$/.test(l.url)?'':'/'+l.layerId}`.toLowerCase()===previousTarget.replace(/\/$/,'').toLowerCase())l.visible=false;});}await displayLayer.load();baseWhere=displayLayer.definitionExpression||'';

 categoryField=displayLayer.fields.find(f=>f.name.toLowerCase()==='category');moshupField=displayLayer.fields.find(f=>f.name.toLowerCase()==='moshup_site');
 new BasemapGallery({view,container:'basemap-content'});new Legend({view,container:'legend-content'});new Print({view,container:'print-content',printServiceUrl:config.utilities?.utility_1?.url});view.ui.add(new Search({view}),'top-left');view.ui.add(new Home({view}),'top-left');
 if(categoryField){const snap=await snapshot(displayLayer);const values=[...new Set(snap.rows.map(f=>f.attributes[categoryField.name]).filter(v=>v!=null&&v!==''))].sort();values.forEach(v=>$('category').add(new Option(String(v),String(v))));$('category').disabled=false;$('reset').disabled=false;}else throw Error('Category field not found.');
 $('moshup').disabled=!moshupField;$('filter-note').textContent=moshupField?'Combine the two filters to narrow the map.':'Moshup features is unavailable until the layer has a moshup_site field.';
 $('category').onchange=()=>applyFilters().catch(e=>status(e.message));$('moshup').onchange=$('category').onchange;$('reset').onclick=()=>{$('category').value='';$('moshup').value='';applyFilters().catch(e=>status(e.message));};
 message('Ready. Choose a CSV to preview new points.');status('Map ready.');$('login').textContent='Signed in';$('login').disabled=true;
 }catch(e){status(e.message);message(e.message);started=false;}}
$('login').onclick=async()=>{try{await identity.getCredential(portal+'/sharing');await start();}catch(e){status('Sign-in failed: '+e.message);}};
async function connectTarget(){
 layer=null;invalidate();$('import-controls').disabled=true;
 message('Connecting to the destination layer…');
 const candidate=new FeatureLayer({url:targetUrl});await candidate.load();
 if(candidate.geometryType!=='point'||candidate.hasZ||candidate.hasM||candidate.typeIdField)throw Error('Importer requires a 2D point layer without subtypes.');
 if(!candidate.capabilities?.operations?.supportsQuery)throw Error('Query access is required to check existing IDs.');
 const m=candidate.fields.find(f=>f.name.toLowerCase()==='moshup_site');
 if(!m)throw Error('The destination needs a nullable Text field named moshup_site. Add it in AGOL and reload this app; the column will not be skipped.');
 if(m.type!=='string'||m.editable===false)throw Error('moshup_site must be an editable Text field.');
 layer=candidate;mappingUI();$('import-controls').disabled=false;
 message('Ready. Choose a CSV to preview new points.');
}
$('file').onchange=()=>run(async()=>{invalidate();table=null;$('report').replaceChildren();const f=$('file').files[0];if(!f)return;if(f.size>5*1024*1024)throw Error('Maximum file size is 5 MB.');table=parseCSV(await f.text());if(!table.headers.includes('moshup_site')){table=null;throw Error('CSV must include a moshup_site column with yes/no values.');}mappingUI();message(`${table.rows.length} rows loaded. Review mappings, then preview.`);});
$('preview').onclick=()=>run(async()=>{invalidate();if(!layer)throw Error('Connect the target layer first.');if(!table)throw Error('Choose a CSV first.');if(!table.headers.includes('moshup_site'))throw Error('CSV must include moshup_site.');const map=schemaMapping(fields(),table.headers,mapping);const before=await snapshot();const result=planAdditions(table,fields(),before.rows.map(f=>f.attributes[map.id.name]),layer.spatialReference.isWebMercator,mapping);if(result.additions.length&&!layer.capabilities.operations.supportsAdd)throw Error('This account/connection does not allow additions.');await project.load();const adds=result.additions.map(a=>{const p=new Point({x:a.longitude,y:a.latitude,spatialReference:{wkid:4326}}),geometry=layer.spatialReference.isWGS84?p:project.execute(p,layer.spatialReference);validateProjectedPoint(geometry,layer.spatialReference);return new Graphic({geometry,attributes:a.attributes});});plan={adds,signature:before.signature,time:Date.now(),rows:result.report,targetUrl:layer.url};report={stage:'preview',targetUrl:layer.url,rows:result.report};$('download').hidden=false;$('report').replaceChildren();for(const r of result.report){const p=document.createElement('p');p.textContent=`Row ${r.row} · ${r.id}: ${r.action} — ${r.reason}`;$('report').append(p);}message(`${adds.length} new points; ${result.report.filter(r=>r.action==='Skipped').length} skipped; ${result.report.filter(r=>r.action==='Invalid').length} invalid.`);});
$('confirm').onchange=()=>{$('save').disabled=!plan?.adds.length||!$('confirm').checked;};
$('save').onclick=()=>run(async()=>{const pending=plan;if(!pending||!$('confirm').checked||!pending.adds.length)return;invalidate();if(pending.targetUrl!==layer.url)throw Error('Destination changed. Preview again.');if(Date.now()-pending.time>300000)throw Error('Preview expired. Validate again.');if((await snapshot()).signature!==pending.signature)throw Error('Target records changed. Validate again.');message('Saving… Keep this tab open.');let results;try{results=(await layer.applyEdits({addFeatures:pending.adds},{rollbackOnFailureEnabled:true})).addFeatureResults;}catch(e){throw Error('Save outcome uncertain. Check the layer before retrying. '+e.message);}report={stage:'save',targetUrl:pending.targetUrl,rows:pending.rows,results};const complete=results.length===pending.adds.length&&results.every(r=>!r.error);message(complete?`Added ${results.length} points. Existing IDs were skipped.`:'Service errors or incomplete results. Review the report and layer before retrying.');layer.refresh();displayLayer?.refresh();if(shouldCollapse($('autoclose').checked,pending.adds.length,results,pending.rows))timer=setTimeout(()=>panel('importer',false),1800);});
$('download').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='csv-import-report.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
try{await identity.checkSignInStatus(portal+'/sharing');await start();}catch{status('Sign in with your organization account to begin.');}
}catch(e){status(e.message||String(e));}
