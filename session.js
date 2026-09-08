(function(root){'use strict';
const T=typeof module!=='undefined'?require('./transfer.js'):root.RecipeTransfer;
const K=typeof module!=='undefined'?require('./kitchen.js'):root.Kitchen;
const V=typeof module!=='undefined'?require('./versioning.js'):root.RecipeVersions;
function review(r){
 K.validate(r);const warnings=[];
 const omitted=T.coverage(r);if(omitted.length)warnings.push('Ingredients without measured step references: '+omitted.join('; '));
 for(const i of r.ingredients)if(i.amount!==null&&!i.unit)warnings.push('Confirm count or missing unit: '+i.name);
 for(const s of r.steps){
  if(/\{\{/.test(s.replace(/\{\{[\w-]+(?:\|(?:0?\.\d+|1))?\}\}/g,'')))throw Error('Malformed measured ingredient reference.');
  for(const m of s.matchAll(/(-?\d+(?:\.\d+)?)\s*°\s*([FC])(?:\s*\(\s*(-?\d+(?:\.\d+)?)\s*°\s*([FC])\s*\))?/gi)){
   if(!m[3])warnings.push('Confirm both temperature units: '+m[0]);
   else if(m[2].toUpperCase()===m[4].toUpperCase()||Math.abs((m[2].toUpperCase()==='F'?(+m[1]-32)*5/9:+m[1]*9/5+32)-(+m[3]))>5)warnings.push('Temperature pair does not agree: '+m[0]);
  }
 }
 if(/sugar.free|allergen.free|safe for|diabet|certified/i.test(JSON.stringify(r)))warnings.push('Dietary claims need independent checking; this draft cannot certify nutrition or allergen safety.');
 warnings.push('Check that instructions match ingredients and exclusions; automated checks cannot establish cooking safety or quality.');return warnings;
}
class Session{
 constructor(){this.draft=null;this.previous=null;this.messages=[];}
 request(request,preferences='',revision=false){
  if(!request.trim()||request.length>7000||preferences.length>1200)throw Error('Enter a request within the displayed limits.');
  if(revision&&!this.draft)throw Error('Generate a draft first.');
  const format='Return one complete JSON recipe with numeric servings, unique ingredient keys, amounts, units, names, substitutions, measured {{key}} steps, both temperature units and notes. No HTML, unsupported safety claims or invented provenance.';
  return [{role:'system',content:format},...(revision?[{role:'assistant',content:JSON.stringify(this.draft)}]:[]),{role:'user',content:request+'\nVisible household preferences for this request: '+(preferences.trim()||'None') }];
 }
 accept(r,messages,revision){
  review(r);const next=structuredClone(r);
  if(revision){next.id=this.draft.id;next.familyKey=this.draft.familyKey||this.draft.id;}
  else {next.id='creator-'+Array.from(globalThis.crypto.getRandomValues(new Uint32Array(4)),n=>n.toString(16).padStart(8,'0')).join('-');next.familyKey=next.id;}
  this.previous=this.draft;this.draft=next;this.messages=messages;return next;
 }
 discard(){if(this.previous){this.draft=this.previous;this.previous=null;}return this.draft;}
 named(label){if(!this.draft)throw Error('Generate a draft first.');return V.renamed(this.draft,{original:label});}
}
const api={Session,review};if(typeof module!=='undefined')module.exports=api;else root.CreatorSession=api;
})(globalThis);
