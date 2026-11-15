import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createUsageStore} from '../app/usage.mjs';
test('调用额度持久化，失败也计数，网络额度和全站额度相互独立',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'travelwise-usage-'));let store;
 try{
  store=createUsageStore(dir,{dailyLimit:3,visitorLimit:2});
  const id=store.reserve('test-client-a','model');store.finish(id,'failed',null,200);
  store.close();store=createUsageStore(dir,{dailyLimit:3,visitorLimit:2});
  const next=store.reserve('test-client-a','model');store.finish(next,'success',{prompt_tokens:10,completion_tokens:20},300);
  assert.throws(()=>store.reserve('test-client-a','model'),/当前网络/);
  store.reserve('test-client-b','model');assert.throws(()=>store.reserve('test-client-c','model'),/站点/);
  assert.ok(!readFileSync(path.join(dir,'usage.sqlite')).includes(Buffer.from('test-client-a')));
 }finally{store?.close();rmSync(dir,{recursive:true,force:true});}
});
