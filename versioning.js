/* Cosmetic names for recipe variations and saved edits. No recipe ID changes. */
(function(root){
'use strict';
const adaptationLabels={regularDairy:'Regular dairy',lactoseFree:'Lactose-free',dairyFree:'Dairy-free',noAddedSugar:'No added sugar',sugarFree:'Sugar-free ingredient version'};
function historyKey(h){
 const s=JSON.stringify([h.title,h.servings,h.ingredients,h.steps,h.notes||'',h.adaptations||{},h.variants||[]]);
 let a=2166136261,b=5381;for(let i=0;i<s.length;i++){a=Math.imul(a^s.charCodeAt(i),16777619);b=Math.imul(b,33)^s.charCodeAt(i);}
 return 'history:'+(a>>>0).toString(16)+'-'+(b>>>0).toString(16);
}
function name(r,key){
 if(r.versionNames&&Object.hasOwn(r.versionNames,key))return r.versionNames[key];
 if(key==='original')return r.baseLabel||r.versionNote||'Saved version';
 if(key.startsWith('adaptation:'))return adaptationLabels[key.split(':')[2]]||'Dietary adaptation';
 if(key.startsWith('variant:'))return r.variants?.find(v=>'variant:'+v.id===key)?.label||'Recipe variation';
 const h=r.history?.find(h=>historyKey(h)===key);return h?.versionNames?.original||h?.baseLabel||h?.versionNote||h?.title||'Earlier version';
}
function entries(r){
 const all=[{key:'original',type:'Main recipe',name:name(r,'original')}];
 for(const v of r.variants||[])all.push({key:'variant:'+v.id,type:'Recipe variation',name:name(r,'variant:'+v.id)});
 for(const base of [{...r,id:'original'},...(r.variants||[]).map(v=>({...r,...v}))]){for(const [mode,a] of Object.entries(base.adaptations||{})){if(a.supported===false)continue;const key='adaptation:'+base.id+':'+mode;all.push({key,type:adaptationLabels[mode]+' · '+name(r,base.id==='original'?'original':'variant:'+base.id),name:name(r,key)});}}
 const seen=new Set();for(const h of r.history||[]){const key=historyKey(h);if(!seen.has(key)){all.push({key,type:'Saved earlier edit',name:name(r,key)});seen.add(key);}}
 return all;
}
function renamed(r,updates){
 if(!updates||typeof updates!=='object'||Array.isArray(updates))throw Error('Enter the version names first.');
 const permitted=new Set(entries(r).map(x=>x.key)), names={...(r.versionNames||{})};
 for(const [key,value] of Object.entries(updates)){
  if(!permitted.has(key))throw Error('This recipe version no longer exists. Close and reopen the names screen.');
  if(typeof value!=='string'||!value.trim()||value.trim().length>160)throw Error('Give every version a name of 1–160 characters.');
  names[key]=value.trim();
 }
 // Expired history names are not kept forever. Only keys belonging to a live version remain.
 for(const key of Object.keys(names))if(!permitted.has(key))delete names[key];
 return {...structuredClone(r),versionNames:names};
}
function creatorURL(raw){
 if(typeof raw!=='string'||raw.length>1000)throw Error('Use a creator page address under 1,000 characters.');
 let u;try{u=new URL(String(raw).trim());}catch(_){throw Error('Enter the HTTPS address of your hosted creator page.');}
 if(u.protocol!=='https:'||u.username||u.password||u.port||u.search||u.hash||!u.hostname.includes('.')||/^[\d.]+$/.test(u.hostname)||/\.(?:local|localhost|internal)$/.test(u.hostname))throw Error('Use a public HTTPS page address without login details, query text or a fragment.');
 return u.href;
}
const api={adaptationLabels,historyKey,name,entries,renamed,creatorURL};if(typeof module!=='undefined')module.exports=api;else root.RecipeVersions=api;
})(typeof globalThis!=='undefined'?globalThis:this);
