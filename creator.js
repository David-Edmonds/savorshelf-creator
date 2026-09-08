/* Standalone browser companion. Never bundle the remote SDK in Android's privileged WebView. */
'use strict';
const $=id=>document.getElementById(id);
let recipe=null,loaded=false,signed=false,busy=false,operation=0,canCancel=false;
const session=new CreatorSession.Session();
function status(message,error=false){$('status').textContent=message;$('status').classList.toggle('error',error);}
function update(){const consent=$('consent').checked;$('connect').disabled=busy||loaded||!consent;$('sign-in').disabled=busy||!loaded||!consent;$('generate').disabled=busy||!signed||!consent;$('revise').disabled=busy||!signed||!consent||!recipe;$('cancel').disabled=!canCancel;$('discard').disabled=busy||!session.previous;$('load-base').disabled=busy;}
function messageOf(error){return typeof error==='string'?error:String(error?.message||error?.msg||error?.error?.message||'Connection failed. Check your sign-in, allowance and network.');}
function element(tag,text,cls){const el=document.createElement(tag);el.textContent=text;if(cls)el.className=cls;return el;}
function responseRecipe(response){
 if(['length','max_tokens','content_filter','refusal'].includes(response?.finish_reason))throw Error('The provider returned an incomplete or blocked recipe. Nothing was saved.');
 let text=response?.message?.content;if(Array.isArray(text))text=text.filter(x=>x?.type==='text').map(x=>x.text).join('\n');
 if(typeof text!=='string'||!text.trim()||text.length>100000)throw Error('The provider did not return a usable recipe. Nothing was saved.');
 const raw=JSON.parse(text.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));
 const candidate=Array.isArray(raw)?raw[0]:raw.recipes?.[0]||raw.recipe||raw;
 if(!Number.isInteger(candidate?.servings)||candidate.servings<1||candidate.servings>1000)throw Error('The provider must return a valid numeric serving count.');
 const parsed=RecipeTransfer.parse(text);if(parsed.recipes.length!==1)throw Error('Expected one recipe, not a collection. Nothing was saved.');
 const r=parsed.recipes[0];r.source='AI draft created with Puter. Not kitchen-tested or independently verified.';r.versionNote='Puter draft · review before cooking';
 Kitchen.validate(r);return r;
}
function preview(r){
 $('recipe-title').textContent=r.title;$('recipe-meta').textContent=r.servings+' servings'+(r.minutes?' · '+r.minutes+' minutes':'');
 const box=$('recipe-preview');box.replaceChildren(element('h3','Ingredients'));
 const ul=document.createElement('ul');for(const i of r.ingredients){const li=element('li',Kitchen.ingredientText(i));if(i.substitution)li.append(element('span','Substitution: '+i.substitution,'sub'));ul.append(li);}box.append(ul,element('h3','Instructions'));
 const ol=document.createElement('ol');for(const step of Kitchen.steps(r,r.servings))ol.append(element('li',step));box.append(ol);
 if(r.notes)box.append(element('h3','Notes'),element('p',r.notes,'notes'));
 const missing=RecipeTransfer.coverage(r);if(missing.length)box.append(element('p','Check the steps: these ingredients do not have linked quantities: '+missing.join('; '),'warning'));
 const warnings=CreatorSession.review(r);$('checks').textContent=warnings.join('\n');$('comparison').textContent=session.previous?'Previous: '+session.previous.title+' · '+session.previous.servings+' servings. Current: '+r.title+' · '+r.servings+' servings. Review the complete ingredients and steps below.':'';$('previous-preview').textContent=session.previous?[session.previous.title,session.previous.servings+' servings','Ingredients',...session.previous.ingredients.map(Kitchen.ingredientText),'Instructions',...Kitchen.steps(session.previous,session.previous.servings)].join('\n'):'';$('result').hidden=false;
}
function payload(){if(!recipe)throw Error('Generate a recipe first.');return JSON.stringify({recipes:[session.named($('version-name').value)]},null,2);}
// Receive an explicit app request only; the full library is never included. Clear the URL immediately.
try{const params=new URLSearchParams(location.hash.slice(1));const q=params.get('request');if(q){if(q.length>7000)throw Error('That request is too long. Enter a shorter one.');$('request').value=q;}if(location.hash)history.replaceState(null,'',location.href.split('#')[0]);}catch(e){status(messageOf(e),true);}
$('consent').addEventListener('change',update);
$('connect').addEventListener('click',()=>{
 if(!$('consent').checked||loaded||busy)return;
 busy=true;update();status('Loading the Puter connection. No recipe request has been sent.');
 const script=document.createElement('script');script.src='https://js.puter.com/v2/';script.async=true;
 const timer=setTimeout(()=>{busy=false;status('Loading is taking longer than expected. Check your connection and reload this page before trying again.',true);update();},30000);
 script.onload=()=>{clearTimeout(timer);loaded=!!window.puter;busy=false;status(loaded?'Connection ready. Press Sign in with Puter.':'Puter did not load. Reload to try again.',!loaded);update();};
 script.onerror=()=>{clearTimeout(timer);busy=false;script.remove();status('Could not load Puter. Check your connection and try again.',true);update();};document.head.append(script);
});
$('sign-in').addEventListener('click',async()=>{
 if(!loaded||!$('consent').checked||busy)return;
 busy=true;update();try{const result=await SavorShelfProvider.signIn();if(result?.success===false)throw Error('Sign-in was not completed.');signed=true;status('Signed in. Review your request, then press Generate. Your Puter usage allowance applies.');}catch(e){signed=false;status(messageOf(e),true);}finally{busy=false;update();}
});
async function generate(revision=false){
 if(!loaded||!signed||!$('consent').checked||busy)return;
 const request=$(revision?'revision':'request').value.trim();
 let messages;try{messages=session.request(request,$('preferences').value,revision);}catch(e){status(messageOf(e),true);return;}
 const ticket=++operation;busy=true;canCancel=true;update();status('Creating your recipe. This request uses your Puter allowance.');
 const timer=setTimeout(()=>{if(ticket===operation)cancel('Timed out locally.');},90000);
 try{
  const response=await SavorShelfProvider.generate(messages,$('model').value);
  if(ticket!==operation)return;
  if(recipe)session.draft=RecipeVersions.renamed(recipe,{original:$('version-name').value});
  recipe=session.accept(responseRecipe(response),messages,revision);
  $('version-name').value=revision?($('revision').value.trim().slice(0,160)||'Revised version'):'Original draft';
  preview(recipe);status('Draft ready. Review it and name this version before sending it to SavorShelf.');
 }catch(e){if(ticket===operation)status(messageOf(e)+' Your last valid draft is retained. No automatic retry was made.',true);}
 finally{clearTimeout(timer);if(ticket===operation){busy=false;canCancel=false;update();}}
}
function cancel(reason='Stopped waiting locally.'){
 operation++;busy=false;canCancel=false;status(reason+' A provider request may still finish and use allowance. Late results will be ignored; no automatic retry.',true);update();
}
$('generate').addEventListener('click',()=>generate(false));
$('revise').addEventListener('click',()=>generate(true));
$('cancel').addEventListener('click',()=>cancel());
$('discard').addEventListener('click',()=>{recipe=session.discard();$('version-name').value=recipe.versionNames?.original||'Original draft';preview(recipe);update();status('Restored the previous draft. Nothing was sent to the app.');});
$('load-base').addEventListener('click',()=>{try{const parsed=RecipeTransfer.parse($('base-recipe').value);if(parsed.recipes.length!==1)throw Error('Paste exactly one recipe to revise.');recipe=parsed.recipes[0];session.draft=recipe;session.previous=null;$('version-name').value=recipe.versionNames?.original||'Saved version';preview(recipe);update();status('Recipe loaded locally. Review it, then request a change. Its identity will be preserved.');}catch(e){status(messageOf(e),true);}});
$('share').addEventListener('click',async()=>{try{if(!navigator.share)throw Error('Sharing is unavailable in this browser. Use Copy recipe or Save recipe file instead.');await navigator.share({title:recipe.title,text:payload()});status('Shared. Choose SavorShelf and review the import before saving.');}catch(e){if(e.name!=='AbortError')status(messageOf(e),true);}});
$('copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(payload());status('Copied. In SavorShelf, open Create → Bring back a recipe, paste, review and save.');}catch(e){status('Clipboard access failed. Use Save recipe file instead.',true);}});
$('download').addEventListener('click',()=>{try{const url=URL.createObjectURL(new Blob([payload()],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='SavorShelf-created-recipe.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);status('Recipe file prepared. Import it into SavorShelf and review before saving.');}catch(e){status(messageOf(e),true);}});
window.SavorShelfCreator={responseRecipe};update();
