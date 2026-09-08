/* Replace this adapter to change providers; recipe state belongs to SavorShelf. */
'use strict';
window.SavorShelfProvider = {
 name: 'Puter',
 signIn: () => window.puter.auth.signIn(),
 generate: (messages, model) => window.puter.ai.chat(messages, {model, max_tokens:3500, stream:false, normalize:true})
};
