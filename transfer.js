/* Importing is a reviewed data operation. Imported content is never executed. */
(function(root){'use strict';
const K=typeof module!=='undefined'?require('./kitchen.js'):root.Kitchen;
const C=typeof module!=='undefined'?require('./core.js'):root.RecipeCore;
const clone=x=>structuredClone(x);
function signature(r){return JSON.stringify([r.title,r.servings,r.ingredients,r.steps,r.notes||'',r.adaptations||{},r.variants||[]]);}
function shortHash(s){let h=2166136261,g=5381;for(let n=0;n<s.length;n++){h=Math.imul(h^s.charCodeAt(n),16777619);g=Math.imul(g,33)^s.charCodeAt(n);}return (h>>>0).toString(16)+'-'+(g>>>0).toString(16);}
function migrate(state,seeds,baselines,revision=3){
 const out=clone(state),report={added:0,updated:0,preserved:0};if((out.libraryVersion||0)>=revision)return {state:out,report};
 const deleted=new Set(out.deletedBundledIds||[]);
 for(const seed of seeds){
  if(deleted.has(seed.id))continue;
  const i=out.recipes.findIndex(r=>r.id===seed.id||(r.familyKey&&r.familyKey===seed.familyKey));
  if(i<0){out.recipes.push(clone(seed));report.added++;continue;}
  const r=out.recipes[i];if(signature(r)===signature(seed))continue;
  const unchanged=baselines[r.id]===shortHash(signature(r));
  if(unchanged){
   const fresh=clone(seed);for(const key of ['rating','pinned','favorite','photo','cookCount','lastCookedAt','preferredChoice'])if(Object.hasOwn(r,key))fresh[key]=clone(r[key]);
   const previous=clone(r);delete previous.history;previous.versionNote='Before library update · '+(r.versionNote||'saved version');
   if((r.history||[]).length>=20){report.preserved++;continue;}
   fresh.history=[previous,...(r.history||[])];out.recipes[i]=fresh;report.updated++;
  }else{
   // Personal edits stay active; a new library recipe is offered in history, not written over them.
   const history=r.history||[];
   if(!history.some(v=>signature(v)===signature(seed))&&history.length<20){const v=clone(seed);delete v.history;v.id=r.id;v.versionNote='Library update · '+(seed.versionNote||'new revision');r.history=[v,...history];}
   report.preserved++;
  }
 }
 out.libraryVersion=revision;out.lastLibraryUpdate=report;return {state:out,report};
}
function cleanString(x,max,def=''){if(x===undefined||x===null)return def;if(typeof x!=='string'||x.length>max)throw Error('Recipe text is too long or has the wrong type.');return x.trim();}
function ingredientLine(line,index=0){
 let text=line.trim().replace(/^[-*•]\s*/,'');let amount=null,unit='';
 const match=text.match(/^((?:\d+\s+)?\d+\/\d+|\d+(?:\.\d+)?(?:\s*[½¼¾⅓⅔⅛⅜⅝⅞⅙⅚])?|[½¼¾⅓⅔⅛⅜⅝⅞⅙⅚])\s*/);
 if(match){amount=C.quantity(match[1]);text=text.slice(match[0].length);}
 const m=text.match(/^(cups?|tablespoons?|tbsp|teaspoons?|tsp|kilograms?|kg|grams?|g|millilit(?:er|re)s?|ml|lit(?:er|re)s?|l|ounces?|oz|pounds?|lb|cloves?|cans?)\b\.?\s*/i);
 if(m){unit=C.unit(m[1]);text=text.slice(m[0].length);}
 const sub=text.match(/\s+\((?:or|substitute|swap)\s+(.+)\)\s*$/i);let substitution='';if(sub){substitution=sub[1];text=text.slice(0,sub.index);}
 if(!text.trim())throw Error('An ingredient is missing its name.');
 return {key:'item-'+index,amount,unit,name:text.trim(),substitution};
}
function linkAmounts(r){
 const escaped=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 r.steps=r.steps.map(step=>{
  // Only exact quantity+unit+ingredient phrases are auto-linked. No guessing from pronouns.
  const held=[];let s=step.replace(/\{\{[^}]+\}\}/g,m=>{held.push(m);return '\uE002'+(held.length-1)+'\uE003';});
  for(const i of [...r.ingredients].sort((a,b)=>b.name.length-a.name.length)){
   if(i.amount===null)continue;
   const forms=new Set([K.ingredientText(i),[String(i.amount),i.unit,i.name].filter(Boolean).join(' ')]);
   for(const f of forms){const p=escaped(f).replace(/\s+/g,'\\s+');s=s.replace(new RegExp('(^|[^a-z0-9])('+p+')(?![a-z0-9])','gi'),(_m,b)=>b+'{{'+i.key+'}}');}
  }
  return s.replace(/\uE002(\d+)\uE003/g,(_,n)=>held[n]);
 });return r;
}
function normalize(input,index=0){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('A recipe must be a JSON object.');
 let ingredients=input.ingredients;if(!Array.isArray(ingredients)||!ingredients.length||ingredients.length>150)throw Error('Include an ingredients array.');
 ingredients=ingredients.map((i,n)=>{
  if(typeof i==='string')return ingredientLine(i,n);
  if(!i||typeof i!=='object')throw Error('Invalid ingredient.');
  let a=i.amount??i.quantity??null;if(typeof a==='string')a=C.quantity(a);
  return {key:cleanString(i.key,50,'item-'+n),amount:a,unit:cleanString(i.unit,40),name:cleanString(i.name,300),substitution:cleanString(i.substitution,1500)};
 });
 const title=cleanString(input.title,160);const now=new Date().toISOString();
 const r={id:cleanString(input.id,100,'chat-'+shortHash(title+JSON.stringify(ingredients))),title,category:cleanString(input.category,100,'Other'),description:cleanString(input.description,10000,'Imported recipe draft. Review before cooking.'),servings:Number(input.servings||4),yieldUnit:cleanString(input.yieldUnit,100,'servings'),minutes:Number(input.minutes||0),ingredients,steps:input.steps||input.instructions,notes:cleanString(input.notes,10000),source:cleanString(input.source,10000,'Imported from ChatGPT or pasted text; not independently verified.'),versionNote:'Imported draft · review before cooking',updatedAt:now,photo:'',history:[],rating:0,pinned:false,favorite:false};
 if(!Array.isArray(r.steps)||r.steps.some(s=>typeof s!=='string'))throw Error('Include a steps array of instruction strings.');
 if(input.versionNames)r.versionNames=clone(input.versionNames);
 if(input.baseLabel)r.baseLabel=cleanString(input.baseLabel,160);
 if(input.familyKey)r.familyKey=cleanString(input.familyKey,100);
 if(input.adaptations)r.adaptations=clone(input.adaptations);
 if(input.variants)r.variants=clone(input.variants);
 linkAmounts(r);K.validate(r);return r;
}
function plain(text){
 const lines=text.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);let title='',mode='',ings=[],steps=[],notes=[];let servings=4;
 for(const raw of lines){const l=raw.replace(/^#{1,6}\s*/,'').replace(/^\*\*(.+)\*\*:?$/,'$1');
  if(/^(ingredients|what you need)\s*:$/i.test(l)||/^ingredients$/i.test(l)){mode='ingredients';continue;}
  if(/^(instructions|directions|method|steps|how to make it)\s*:?$/i.test(l)){mode='steps';continue;}
  if(/^(notes|tips)\s*:?$/i.test(l)){mode='notes';continue;}
  const sv=l.match(/^(?:serves|servings|yield)\s*:?\s*(\d+)/i);if(sv){servings=Number(sv[1]);continue;}
  if(!title){title=l.replace(/^title:\s*/i,'');continue;}
  if(mode==='ingredients')ings.push(l);else if(mode==='steps')steps.push(l.replace(/^(?:\d+[.)]|[-*•])\s*/,''));else notes.push(l);
 }
 if(!ings.length||!steps.length)throw Error('Paste recipe JSON, or text with a title, Ingredients heading and Instructions heading. Nothing was imported.');
 return normalize({title,servings,ingredients:ings,steps,notes:notes.join('\n')});
}
function parse(text){
 if(typeof text!=='string'||text.length>2000000)throw Error('Use recipe text under 2 MB.');text=text.trim();if(!text)throw Error('Paste a recipe first.');
 const block=text.match(/```(?:json)?\s*([\s\S]*?)```/i);if(block)text=block[1].trim();
 let data;if(/^[\[{]/.test(text)){try{data=JSON.parse(text);}catch(_){throw Error('The JSON is incomplete. Copy the entire recipe block, including its closing brackets.');}}
 else return {recipes:[plain(text)],kind:'text'};
 if(['Our Table','SavorShelf'].includes(data.app)&&data.schema===1){const b=C.parseBackup(JSON.stringify(data));b.recipes.forEach(K.validate);return {recipes:b.recipes,kind:'backup'};}
 const rs=Array.isArray(data)?data:data.recipes||[data.recipe||data];if(!Array.isArray(rs)||rs.length<1||rs.length>500)throw Error('Import 1–500 recipes at a time.');
 return {recipes:rs.map(normalize),kind:'recipe-pack'};
}
function merge(existing,incoming){
 // Normalized titles also identify conflicts. Distinct formulations remain inside history.
 const mapped=incoming.map(r=>{const old=existing.find(x=>x.id===r.id||(x.familyKey&&r.familyKey&&x.familyKey===r.familyKey))||existing.find(x=>K.norm(x.title)===K.norm(r.title));return old?{...r,id:old.id}:r;});
 return K.merge(existing,mapped);
}
function coverage(r){const used=new Set(r.steps.flatMap(s=>[...s.matchAll(/\{\{([\w-]+)/g)].map(m=>m[1])));return r.ingredients.filter(i=>!used.has(i.key)).map(i=>K.ingredientText(i));}
function prompt(request,options={}){
 const q=cleanString(request,1800);if(!q)throw Error('Describe what you would like to cook first.');
 // An explicit request such as “for 8, lactose-free” beats untouched default controls.
 const lower=q.toLowerCase(),count=Number(lower.match(/(?:for|serves?|feeding)\s+(\d+)\b/)?.[1]||options.servings||4);
 if(!Number.isInteger(count)||count<1||count>20)throw Error('Choose 1–20 servings for a created recipe.');
 options={...options,servings:count};
 if(/lactose[ -]?free/.test(lower))options.dairy='lactoseFree';
 else if(/dairy[ -]?free|no dairy/.test(lower))options.dairy='dairyFree';
 if(/no[ -]?added[ -]?sugar/.test(lower))options.sugar='noAddedSugar';
 else if(/sugar[ -]?free|zero sugar/.test(lower))options.sugar='sugarFree';
 return 'Create a complete, practical recipe for SavorShelf. Request: '+q+'\nServings: '+(options.servings||4)+'. Dairy: '+(options.dairy||'regular')+'. Sweetness: '+(options.sugar||'original')+'. Exclusions: '+(options.avoid||'none specified')+'.\nReturn ONLY a JSON object with title, category, servings (number), minutes (number), ingredients (array of {key, amount:number or null, unit, name, substitution}), steps (array of strings), and notes. Use unique simple ingredient keys. In the steps repeat measured amounts using {{key}}; a divided amount uses {{key|0.5}}. Include both °F and °C for all temperatures and exact quantities for substitutions. Respect exclusions. No added sugar is not sugar-free; never claim verified zero sugar or medical suitability. Give appropriate food thermometer checks and call new recipes untested drafts. Do not invent that this is one of my previous recipes. The app will preview the JSON before I save it.';
}
const api={signature,shortHash,migrate,ingredientLine,linkAmounts,normalize,parse,merge,coverage,prompt};if(typeof module!=='undefined')module.exports=api;else root.RecipeTransfer=api;
})(typeof globalThis!=='undefined'?globalThis:this);
