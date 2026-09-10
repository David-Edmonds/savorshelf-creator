/* SavorShelf: pure, dependency-free recipe and backup helpers. */
(function(root) {
  'use strict';
  const unicode = {'½':'1/2','¼':'1/4','¾':'3/4','⅓':'1/3','⅔':'2/3','⅛':'1/8','⅜':'3/8','⅝':'5/8','⅞':'7/8','⅙':'1/6','⅚':'5/6'};
  function quantity(value) {
    let s=String(value??'').trim();
    if(!s) return null;
    s=s.replace(/(\d)([½¼¾⅓⅔⅛⅜⅝⅞⅙⅚])/g,'$1 $2').replace(/[½¼¾⅓⅔⅛⅜⅝⅞⅙⅚]/g,c=>unicode[c]);
    if(/^\d+(?:\.\d+)?$/.test(s)) return Number(s);
    const m=s.match(/^(?:(\d+)\s+)?(\d+)\/(\d+)$/);
    return m && Number(m[3]) ? Number(m[1]||0)+Number(m[2])/Number(m[3]) : NaN;
  }
  function fmt(n) {
    if(n===null||n===undefined) return '';
    if(!Number.isFinite(n)) return '?';
    const whole=Math.floor(n), rem=n-whole;
    const fractions=[[1/6,'⅙'],[5/6,'⅚'],[.125,'⅛'],[.25,'¼'],[1/3,'⅓'],[.375,'⅜'],[.5,'½'],[.625,'⅝'],[2/3,'⅔'],[.75,'¾'],[.875,'⅞']];
    if(Math.abs(rem)<.00001) return String(whole);
    const f=fractions.find(([v])=>Math.abs(v-rem)<.00001);
    return f ? (whole ? whole+' ' : '')+f[1] : String(n>0&&n<.01?Number(n.toPrecision(2)):Number(n.toFixed(2)));
  }
  const unitAliases={tablespoon:'tbsp',tablespoons:'tbsp',tbs:'tbsp',teaspoon:'tsp',teaspoons:'tsp',cups:'cup',grams:'g',gram:'g',kilograms:'kg',kilogram:'kg',milliliters:'ml',millilitres:'ml',liters:'l',litres:'l',ounces:'oz',ounce:'oz',pounds:'lb',pound:'lb',pieces:'piece',eggs:'egg'};
  function unit(s) {s=String(s||'').trim().toLowerCase().replace(/\.$/,'');return Object.prototype.hasOwnProperty.call(unitAliases,s)?unitAliases[s]:s;}
  function scaled(recipe,servings) {
    if(!(servings>0&&servings<=1000&&recipe.servings>0)) throw Error('Choose a yield from 1 to 1,000.');
    return recipe.ingredients.map(i=>({...i,amount:i.amount===null?null:i.amount*servings/recipe.servings}));
  }
  function shopping(recipes,batches,extras=[]) {
    const map=new Map();
    for(const batch of batches) {
      const r=recipes.find(r=>r.id===batch.recipeId); if(!r) continue;
      for(const i of scaled(r,batch.servings)) {
        let amount=i.amount,u=unit(i.unit); // Combine metric mass/volume, but never convert a cup to grams.
        if(amount!==null && u==='kg'){amount*=1000;u='g';}
        if(amount!==null && u==='l'){amount*=1000;u='ml';}
        const key=i.name.trim().toLowerCase()+'|'+u+'|'+(amount===null?'unmeasured':'measured');
        const row=map.get(key)||{key,name:i.name,unit:u,amount:amount===null?null:0,sources:[]};
        if(amount!==null) row.amount+=amount;
        if(!row.sources.includes(r.title))row.sources.push(r.title);
        map.set(key,row);
      }
    }
    return [...map.values(),...extras.map(e=>({...e,key:'extra:'+e.id,amount:null,unit:'',sources:[]}))];
  }
  function safeText(s,max=10000){return typeof s==='string'&&s.length<=max;}
  function validRecipe(r) {
    if(!r||!safeText(r.id,100)||!r.id||!safeText(r.title,160)||!r.title.trim())throw Error('Every recipe needs a name and ID.');
    if(!Number.isFinite(r.servings)||r.servings<1||r.servings>1000)throw Error('Invalid recipe yield.');
    if(!Array.isArray(r.ingredients)||r.ingredients.length<1||r.ingredients.length>150)throw Error('Invalid ingredient list.');
    r.ingredients.forEach(i=>{if(!i||!safeText(i.name,300)||!i.name.trim()||!safeText(i.unit,40)||(i.amount!==null&&(!Number.isFinite(i.amount)||i.amount<0||i.amount>1000000)))throw Error('Invalid ingredient quantity or name.');});
    if(!Array.isArray(r.steps)||!r.steps.length||r.steps.length>100||r.steps.some(s=>!safeText(s,10000)||!s.trim()))throw Error('Invalid recipe steps.');
    for(const field of ['notes','description','versionNote','source','category','yieldUnit'])if(r[field]!==undefined&&!safeText(r[field]))throw Error('Invalid recipe text.');
    if(r.versionNames!==undefined){
      if(!r.versionNames||typeof r.versionNames!=='object'||Array.isArray(r.versionNames)||Object.keys(r.versionNames).length>200)throw Error('Invalid version names.');
      for(const [key,name] of Object.entries(r.versionNames))if(!/^(original|variant:[a-zA-Z0-9_-]{1,100}|history:[a-f0-9-]{1,40}|adaptation:(?:original|[a-zA-Z0-9_-]{1,100}):(?:regularDairy|lactoseFree|dairyFree|noAddedSugar|sugarFree))$/.test(key)||!safeText(name,160)||!name.trim())throw Error('Version names must contain 1–160 characters.');
    }
    if(r.photo&&!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(r.photo))throw Error('Photos must be embedded image files.');
    if(r.photo&&r.photo.length>600000)throw Error('This photo is too large.');
    if(r.minutes!==undefined&&(!Number.isFinite(r.minutes)||r.minutes<0||r.minutes>100000))throw Error('Invalid recipe time.');
    if(r.history!==undefined){if(!Array.isArray(r.history)||r.history.length>20)throw Error('Invalid version history.');r.history.forEach(h=>{if(h.history)throw Error('Nested history is not supported.');validRecipe(h);});}
    return r;
  }
  function parseBackup(text) {
    if(text.length>12000000)throw Error('The backup is too large (maximum 12 MB).');
    const data=JSON.parse(text);
    if(!['Our Table','SavorShelf'].includes(data.app)||data.schema!==1||!Array.isArray(data.recipes)||data.recipes.length>2000)throw Error('Choose a SavorShelf or Our Table version 1 backup.');
    data.recipes.forEach(validRecipe);
    const ids=data.recipes.map(r=>r.id);if(new Set(ids).size!==ids.length)throw Error('The backup contains duplicate recipe IDs.');
    return data;
  }
  function mergeRecipes(existing,incoming) {
    const result=structuredClone(existing);
    let added=0,conflicts=0;
    for(const item of incoming){const old=result.find(r=>r.id===item.id);if(!old){result.push(structuredClone(item));added++;}
      else if(JSON.stringify(old)!==JSON.stringify(item)){result.push({...structuredClone(item),id:'import-'+Date.now()+'-'+result.length,title:(item.title+' (imported copy)').slice(0,160)});conflicts++;}}
    if(result.length>2000)throw Error('This import would exceed 2,000 recipes. Export and split your collection first.');
    return {recipes:result,added,conflicts};
  }
  const api={quantity,fmt,unit,scaled,shopping,validRecipe,parseBackup,mergeRecipes};
  if(typeof module!=='undefined')module.exports=api; else root.RecipeCore=api;
})(typeof globalThis!=='undefined'?globalThis:this);
