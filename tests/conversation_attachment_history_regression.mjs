import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
const source=readFileSync(new URL('../public/conversation-attachments.js',import.meta.url),'utf8');
const bytes=new TextEncoder().encode('synthetic document bytes');
const hash='sha256:'+Buffer.from(await webcrypto.subtle.digest('SHA-256',bytes)).toString('hex');
const records=new Map();let metadataReads=0,originalReads=0,downloads=0,workspace='qa-workspace',deferred;
class Node {
 constructor(tag='span'){this.tag=tag;this.children=[];this.attributes={};this.handlers={};this.dataset={};this.textContent='';this.disabled=false;}
 append(node){node.parent=this;this.children.push(node);}
 setAttribute(k,v){this.attributes[k]=v;}
 removeAttribute(k){delete this.attributes[k];}
 addEventListener(k,v){this.handlers[k]=v;}
 querySelectorAll(selector){return this.children.filter(n=>selector==='button'?n.tag==='button':n.className===selector.slice(1));}
 remove(){this.parent.children=this.parent.children.filter(n=>n!==this);}
 click(){downloads++;}
}
const root={crypto:webcrypto,File,Blob,URL:{createObjectURL:()=> 'blob:synthetic',revokeObjectURL(){}},setTimeout:fn=>fn(),localStorage:{getItem:()=>workspace},
 document:{documentElement:{lang:'zh-CN'},addEventListener(){},createElement:tag=>new Node(tag)},
 AriadneContentDatabase:{open:async()=>({close(){},batchGet:async(_,ids)=>{metadataReads++;if(deferred)return deferred;return ids.map(id=>records.get(id));},getRecord:async(_,id)=>{originalReads++;return records.get(id);}})}};
vm.runInNewContext(source,root);const api=root.AriadneConversationAttachments;
const forms=[['candidate-workspace-composer','CANDIDATE'],['candidate-conversation-form','CANDIDATE'],['job-workspace-composer','JOB'],['job-conversation-form','JOB'],['personal-conversation-form','PERSONAL'],['job-overview-form','JOB_OVERVIEW']];
function fixture(formId){const bubble=new Node('p'),form={id:formId},pane={querySelector:()=>form},scroll={scrollTop:20,clientHeight:100,scrollHeight:500};const target={isConnected:true,closest:s=>s.startsWith('.v1-conversation-pane')?pane:scroll,querySelectorAll:()=>[bubble,new Node('p')]};return{bubble,target,scroll};}
for(const[formId,domain]of forms){
 const id='turn-'+formId,conversation=domain==='PERSONAL'||domain==='JOB_OVERVIEW'?domain:'conversation-'+formId;
 records.set(id,{request_id:id,domain,conversation_id:conversation,authority:'SOURCE_INPUT_ONLY',files:[{name:'项目说明.docx',mime_type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',size:bytes.length,content_hash:hash,file:new File([bytes],'项目说明.docx')}]});
 const f=fixture(formId),user={role:'USER',turn_id:id,conversation_id:conversation},messages=[user,{role:'ASSISTANT',turn_id:id}];
 await api.decorate(f.target,messages);assert.equal(f.bubble.children.length,1);const button=f.bubble.children[0].children[0];assert.match(button.textContent,/项目说明.docx/);assert.equal(originalReads,0,'history does not hydrate or hash original files');assert.equal(f.scroll.scrollTop,20,'attachment restoration preserves a reader in history');
 await api.decorate(f.target,messages);assert.equal(f.bubble.children.length,1,'re-renders cannot duplicate attachment cards');
 if(domain==='PERSONAL'){
  await button.handlers.click();assert.equal(downloads,1);assert.equal(originalReads,1,'bytes are loaded only on download');
  records.get(id).files[0].file=new File([new Uint8Array(bytes.length)],'项目说明.docx');await button.handlers.click();assert.equal(button.attributes['aria-invalid'],'true');assert.equal(downloads,1,'corrupted original cannot be downloaded');
  originalReads=0;
 }
 const wrong=fixture(formId);await api.decorate(wrong.target,[{...user,conversation_id:'different'}]);assert.equal(wrong.bubble.children.length,0,'exact conversation identity is required');
}
assert.equal(metadataReads,6,'one keyed metadata read per turn; no repeated all-history reads');
const legacy=fixture('personal-conversation-form');await api.decorate(legacy.target,[{role:'USER',id:'old-user',text:'same words'}]);assert.equal(legacy.bubble.children.length,0,'unlinked old files cannot be guessed from message text');
let resolve;deferred=new Promise(r=>resolve=r);const stale=fixture('personal-conversation-form');const waiting=api.decorate(stale.target,[{role:'USER',turn_id:'delayed'}]);await Promise.resolve();await api.decorate(stale.target,[]);resolve([{...records.get('turn-personal-conversation-form'),request_id:'delayed'}]);await waiting;assert.equal(stale.bubble.children.length,0,'late reads cannot decorate replaced messages');
console.log('Attachment history PASS: six forms, metadata-only reads, reload, exact identity, corruption, stale reads, legacy boundaries');
