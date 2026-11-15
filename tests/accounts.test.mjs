import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {createAccounts,normalizeEmail,emptyState} from '../app/accounts.mjs';
test('邮箱验证码注册、同邮箱关联、会话散列、隔离、冲突、记忆与删除',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'travelwise-accounts-'));let store,clock=Date.now(),sent=new Map();
 try{
  store=createAccounts(dir,{now:()=>clock,sendCode:async(e,c)=>sent.set(e,c),linkedProducts:async()=>({products:['readwise'],available:true})});
  assert.equal(normalizeEmail(' A@Example.com '),'a@example.com');
  assert.throws(()=>normalizeEmail('bad\r\nTo: x@example.com'));
  await store.requestCode('a@example.com','network');
  await assert.rejects(()=>store.requestCode('a@example.com','network'),/一分钟/);
  const a=await store.verify(' A@example.com ',sent.get('a@example.com'));
  assert.deepEqual(a.user.links.products,['readwise']);
  assert.equal(store.session(a.token).id,a.user.id);
  const raw=new DatabaseSync(path.join(dir,'accounts.sqlite'));
  assert.notEqual(raw.prepare('SELECT token_hash FROM sessions').get().token_hash,a.token);raw.close();
  await assert.rejects(()=>store.verify('a@example.com',sent.get('a@example.com')),/失效/);
  await store.requestCode('b@example.com','network');const b=await store.verify('b@example.com',sent.get('b@example.com'));
  const state={...emptyState(),profile:'想少赶路',entries:[{place:'泉州',liked:'街巷',tired:'换酒店',next:'多住一晚'}],saved:[{source:'example',destination:'示例不参与记忆'},{source:'ai',destination:'杭州',reason:'想看湖'}]};
  store.save(a.user.id,state,0);assert.throws(()=>store.save(a.user.id,state,0),e=>e.status===409);
  assert.equal(store.pack(store.session(b.token)).state.profile,'');
  const id=store.record(a.user.id,{wish:'想看看湖'},[{title:'湖边',destination:'杭州'}]);
  assert.equal(store.history(b.user.id).length,0);store.removeHistory(b.user.id,id);assert.equal(store.history(a.user.id).length,1);
  const m=store.memory(a.user.id);assert.equal(m.profile,'想少赶路');assert.equal(m.choices.length,1);assert.equal(m.experiences[0].tired,'换酒店');assert.equal(m.pastDrafts.length,1);assert.ok(!JSON.stringify(m).includes('example.com'));
  store.save(a.user.id,{...state,memoryEnabled:false},1);assert.equal(store.memory(a.user.id),null);
  store.removeHistory(a.user.id,id);assert.equal(store.history(a.user.id).length,0);
  store.logout(a.token);assert.equal(store.session(a.token),null);
  clock+=61000;await store.requestCode('a@example.com','network');const again=await store.verify('a@example.com',sent.get('a@example.com'));assert.equal(again.user.id,a.user.id);
  store.deleteUser(a.user.id);assert.equal(store.session(again.token),null);assert.ok(store.session(b.token));
 }finally{store?.close();rmSync(dir,{recursive:true,force:true});}
});
test('验证码错误次数持久化、过期、发信失败不留可用验证码',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'travelwise-codes-'));let clock=Date.now(),code,store;
 try{
  store=createAccounts(dir,{now:()=>clock,sendCode:async(e,c)=>{code=c;}});await store.requestCode('a@example.com','x');
  for(let i=0;i<5;i++)await assert.rejects(()=>store.verify('a@example.com',code==='000000'?'111111':'000000'),/不正确/);
  await assert.rejects(()=>store.verify('a@example.com',code),/失效/);
  clock+=61000;await store.requestCode('a@example.com','x');clock+=600001;await assert.rejects(()=>store.verify('a@example.com',code),/失效/);store.close();
  store=createAccounts(dir,{now:()=>clock,sendCode:async()=>{throw new Error('smtp unavailable');}});await assert.rejects(()=>store.requestCode('b@example.com','x'),/未发送成功/);await assert.rejects(()=>store.verify('b@example.com','123456'),/失效/);
 }finally{store?.close();rmSync(dir,{recursive:true,force:true});}
});
