/* Recipe variants, inline quantities and deduplication. No network calls. */
(function(root){'use strict';
const C=typeof module!=='undefined'?require('./core.js'):root.RecipeCore;
const V=typeof module!=='undefined'?require('./versioning.js'):root.RecipeVersions;
const clone=x=>structuredClone(x), norm=s=>String(s||'').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
function dual(text){
 const held=[]; let s=String(text).replace(/(\d+(?:\.\d+)?)\s*(?:degrees?\s*)?([FC])\b/g, '$1°$2').replace(/\d+(?:\.\d+)?\s*°[FC]\s*(?:\/\s*|\(\s*)\d+(?:\.\d+)?\s*°[FC]\)?/gi,m=>{held.push(m);return `\uE000${held.length-1}\uE001`;});
 s=s.replace(/(\d+(?:\.\d+)?)\s*°([FC])/gi,(_,n,u)=>{n=Number(n);if(u.toUpperCase()==='F'){let c=(n-32)*5/9;c=n>=250?Math.round(c/5)*5:Math.round(c);return `${n}°F (${c}°C)`;}let f=n*9/5+32;f=n>=120?Math.round(f/5)*5:Math.round(f);return `${f}°F (${n}°C)`;});
 return s.replace(/\uE000(\d+)\uE001/g,(_,i)=>held[i]);
}
function ingredientText(i,factor=1){const a=i.amount===null?null:i.amount*factor;let u=C.unit(i.unit); if(a>1&&['cup','tbsp','tsp','piece','clove','slice','can','egg'].includes(u)&&!['tbsp','tsp'].includes(u))u+='s';let label=[C.fmt(a),u,i.name].filter(Boolean).join(' ');return label;}
function steps(r,servings=r.servings){return r.steps.map(s=>{for(const i of r.ingredients.filter(i=>i.amount===0&&i.name==='Omitted')){const token='\\{\\{'+i.key+'(?:\\|[\\d.]+)?\\}\\}';s=s.replace(new RegExp('(?:,?\\s+and\\s+|,\\s*)'+token,'g'),'').replace(new RegExp(token+',\\s*','g'),'').replace(new RegExp(token,'g'),'the omitted ingredient');}return dual(s.replace(/\{\{([a-z0-9_-]+)(?:\|([\d.]+))?\}\}/gi,(_,key,part)=>{const i=r.ingredients.find(x=>x.key===key);return i?ingredientText({...i,name:/^(Badia|Worcestershire|Dijon|Greek|Moroccan|MSG)\b/.test(i.name)?i.name:i.name.charAt(0).toLowerCase()+i.name.slice(1)},servings/r.servings*Number(part||1)):'[ingredient needs review]';}));});}
function variants(r){return [{id:'original',label:V.name(r,'original')},...(r.variants||[]).map(v=>({id:v.id,label:V.name(r,'variant:'+v.id)}))];}
function resolve(r,choice={}){
 let out=clone(r); const v=(r.variants||[]).find(v=>v.id===choice.variant);
 if(v)out={...out,...clone(v),id:r.id,title:r.title,activeVariantLabel:v.label,variants:r.variants};
 out.activeVariantLabel=V.name(r,v?'variant:'+v.id:'original');
 out.activeNotes=[]; out.applied=[]; out.choice=clone(choice);
 for(const mode of [choice.sugar,choice.dairy]){
  if(!mode||mode==='regular'||mode==='original')continue;
  const a=(out.adaptations||{})[mode];
  if(!a){out.activeNotes.push(mode==='sugarFree'?'A genuinely sugar-free version has not been verified. No-added-sugar is a different option; milk and fruit can still contain sugars.':'This variation is not available for this recipe.');continue;}
  if(a.supported===false){out.activeNotes.push(a.note);continue;}
  for(const [key,patch] of Object.entries(a.replace||{})){
   const i=out.ingredients.findIndex(x=>x.key===key);if(i<0)continue;if(mode===choice.dairy&&out.ingredients[i].name==='Omitted')continue;
   if(patch===null){out.ingredients[i]={...out.ingredients[i],amount:0,name:'Omitted',substitution:''};}
   else {out.ingredients[i]={...out.ingredients[i],...clone(patch)}; if(!Object.hasOwn(patch,'substitution'))out.ingredients[i].substitution='';}
  }
  if(a.steps)out.steps=clone(a.steps);
  if(a.note)out.activeNotes.push(a.note);
  out.applied.push(mode);
 }
 if(out.applied.includes('noAddedSugar')){
  for(const i of out.ingredients){
   if(i.name!=='Omitted'&&/yogurt|milk|cream|chocolate|sauce|mustard|mayonnaise|seasoning|biscuits/i.test(i.name)&&!/unsweetened|no.added.sugar/i.test(i.name))i.name+=' (no added sugar; check label)';
  }
 }
 return out;
}
function validate(r){
 C.validRecipe(r);
 if(r.pinned!==undefined&&typeof r.pinned!=='boolean')throw Error('Invalid pin setting.');
 if(r.cookCount!==undefined&&(!Number.isInteger(r.cookCount)||r.cookCount<0||r.cookCount>100000))throw Error('Invalid cooking count.');
 if(r.rating!==undefined&&(!Number.isInteger(r.rating)||r.rating<0||r.rating>5))throw Error('Ratings must be 0–5 stars.');
 if(r.history)for(const h of r.history)validate(h);
 const keys=new Set(); for(const i of r.ingredients){if(i.key!==undefined){if(!/^[a-z0-9_-]{1,50}$/i.test(i.key)||keys.has(i.key))throw Error('Ingredient references must be unique.');keys.add(i.key);}if(i.substitution!==undefined&&(typeof i.substitution!=='string'||i.substitution.length>1500))throw Error('Invalid substitution note.');}
 for(const s of r.steps){for(const m of s.matchAll(/\{\{([a-z0-9_-]+)(?:\|([\d.]+))?\}\}/gi)){if(!keys.has(m[1])||m[2]&&!(Number(m[2])>0&&Number(m[2])<=1))throw Error('A step references an ingredient that is missing.');}}
 if(r.variants){if(!Array.isArray(r.variants)||r.variants.length>20)throw Error('Too many recipe variations.');const ids=new Set();for(const v of r.variants){if(!v.id||ids.has(v.id)||v.id==='original'||v.variants||v.history)throw Error('Invalid recipe variation.');ids.add(v.id);validate({...r,...v,variants:undefined,history:undefined});}}
 if(r.adaptations){if(typeof r.adaptations!=='object'||Array.isArray(r.adaptations))throw Error('Invalid recipe adaptations.');for(const [key,a] of Object.entries(r.adaptations)){if(!['regularDairy','lactoseFree','dairyFree','noAddedSugar','sugarFree'].includes(key)||!a||typeof a!=='object'||typeof a.note!=='string'||a.note.length>3000)throw Error('Invalid adaptation note.');if(a.replace){for(const [k,p] of Object.entries(a.replace)){if(!keys.has(k))throw Error('An adaptation references an ingredient that is missing.');if(p!==null){const base=r.ingredients.find(i=>i.key===k);C.validRecipe({...r,variants:undefined,adaptations:undefined,history:undefined,ingredients:[{...base,...p}],steps:['Validate replacement.']});}}}if(a.steps&&(!Array.isArray(a.steps)||a.steps.some(s=>typeof s!=='string'||!s.trim()||s.length>10000)))throw Error('Invalid adapted steps.');}}
 return r;
}
function fingerprint(r){return JSON.stringify({title:norm(r.title),ingredients:r.ingredients.map(i=>[norm(i.name),C.unit(i.unit),i.amount===null?null:Number((i.amount/r.servings).toFixed(6))]).sort(),steps:r.steps.map(norm)});}
function versionSignature(r){return JSON.stringify([r.title,r.servings,r.ingredients,r.steps,r.notes||'',r.adaptations||{},r.variants||[]]);}
function merge(existing,incoming){
 const recipes=clone(existing);let added=0,conflicts=0,skipped=0;
 for(const r of incoming){validate(r);const old=recipes.find(x=>x.id===r.id||(x.familyKey&&r.familyKey&&x.familyKey===r.familyKey)||fingerprint(x)===fingerprint(r));
  if(!old){recipes.push(clone(r));added++;continue;}
  // Cosmetic names follow the matching formulation, not merely its shared recipe ID.
  const same=versionSignature(old)===versionSignature(r);
  old.versionNames={...(same?(r.versionNames||{}):{}),...(old.versionNames||{})};
  for(const version of [r,...(r.history||[])]){
   if(versionSignature(version)===versionSignature(old))continue;
   const hk=V.historyKey(version),label=version===r?r.versionNames?.original:(r.versionNames?.[hk]||version.versionNames?.original);
   if(label&&!old.versionNames[hk])old.versionNames[hk]=label;
  }
  if(!Object.keys(old.versionNames).length)delete old.versionNames;
  const seen=new Set([versionSignature(old),...(old.history||[]).map(versionSignature)]);
  const additions=[];
  for(const version of [r,...(r.history||[])]){
   if(seen.has(versionSignature(version))){skipped++;continue;}
   const copy=clone(version);delete copy.history;copy.id=old.id;
   copy.versionNote='Imported version · '+(version.versionNote||version.title);
   additions.push(copy);seen.add(versionSignature(version));
  }
  if((old.history||[]).length+additions.length>20)throw Error('This import would exceed 20 saved versions for one recipe. Nothing was changed. Keep your backup and trim unwanted versions before importing.');
  old.history=[...additions,...(old.history||[])];conflicts+=additions.length;
  old.rating=Math.max(old.rating||0,r.rating||0);old.favorite=!!old.favorite||!!r.favorite;old.pinned=!!old.pinned||!!r.pinned;
 }
 if(recipes.length>500)throw Error('The collection limit is 500 recipes.');return {recipes,added,conflicts,skipped};
}
const api={norm,dual,ingredientText,steps,resolve,variants,validate,fingerprint,merge};if(typeof module!=='undefined')module.exports=api;else root.Kitchen=api;
})(typeof globalThis!=='undefined'?globalThis:this);
