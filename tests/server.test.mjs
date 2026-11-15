import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createAccounts,emptyState} from '../app/accounts.mjs';
import {getExample} from '../static/examples.js';

test('生产来源校验与一次有额度记录的自动修正；修正仍无效则不返回计划',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'travelwise-server-'));
 let calls=0,alwaysInvalid=false,fixtureCode;const seed=createAccounts(dir,{sendCode:async(e,c)=>fixtureCode=c});
 const provider=http.createServer(async(req,res)=>{
  let body='';for await(const c of req)body+=c;const request=JSON.parse(body);calls++;
  if(calls===1){const context=JSON.parse(request.messages[1].content);assert.equal(context.travelMemory.profile,'喜欢慢旅行');assert.ok(!JSON.stringify(context).includes('example.com'));}if(calls===3)assert.equal(JSON.parse(request.messages[1].content).travelMemory,null);
  if(calls===2)assert.ok(request.messages.at(-1).content.includes('5000'));
  const p=getExample('hangzhou');if(calls===1||alwaysInvalid)p.budget[0].amount=10000;
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{content:JSON.stringify({plans:[p]})}}],usage:{prompt_tokens:20,completion_tokens:30}}));
 });
 await new Promise(r=>provider.listen(0,'127.0.0.1',r));
 const probe=http.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
 const app=spawn(process.execPath,['app/server.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,HOST:'127.0.0.1',PORT:String(port),APP_ENV:'production',SITE_URL:'https://travelwise.test',DATA_DIR:dir,LLM_API_KEY:'fixture-only',LLM_BASE_URL:`http://127.0.0.1:${provider.address().port}`,LLM_MODEL:'fixture',DAILY_CALL_LIMIT:'10',VISITOR_DAILY_LIMIT:'10'},stdio:['ignore','pipe','pipe']});
 try{
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Server did not start')),10000);app.stdout.on('data',()=>{clearTimeout(timer);resolve();});app.once('error',reject);app.once('exit',()=>{clearTimeout(timer);reject(new Error('Server exited'));});});
  const url=`http://127.0.0.1:${port}/api/plan`;
  assert.equal((await fetch(url,{method:'POST',body:'{}'})).status,403);
  assert.equal((await fetch(url,{method:'POST',headers:{Origin:'https://wrong.test'},body:'{}'})).status,403);
  assert.equal(calls,0);
  await seed.requestCode('fixture@example.com','network');
  const origin={Origin:'https://travelwise.test','Content-Type':'application/json'};const base=`http://127.0.0.1:${port}`;
  const login=await fetch(base+'/api/auth/verify',{method:'POST',headers:origin,body:JSON.stringify({email:'fixture@example.com',code:fixtureCode})});assert.equal(login.status,200);
  const me=await login.json(),setCookie=login.headers.get('set-cookie');assert.ok(setCookie.includes('HttpOnly')&&setCookie.includes('Secure')&&setCookie.includes('SameSite=Lax'));const cookie=setCookie.split(';')[0];
  const saved=await fetch(base+'/api/account/state',{method:'PUT',headers:{...origin,Cookie:cookie},body:JSON.stringify({state:{...emptyState(),profile:'喜欢慢旅行'},revision:0})});assert.equal(saved.status,200);
  assert.equal((await fetch(base+'/api/account/history')).status,401);
  const brief={wish:'想在湖边休息',minDays:4,maxDays:5,budget:5000,count:1};
  const request=()=>fetch(url,{method:'POST',headers:{...origin,Cookie:cookie},body:JSON.stringify({...brief,useHistory:!alwaysInvalid})});
  const response=await request();assert.equal(response.status,200);const result=await response.json();
  assert.equal(result.historySaved,true);assert.equal(result.memoryUsed,true);assert.equal((await(await fetch(base+'/api/account/history',{headers:{Cookie:cookie}})).json()).history.length,1);
  assert.equal(result.repaired,true);assert.equal(result.plans[0].source,'ai');assert.equal(calls,2);
  const db=new DatabaseSync(path.join(dir,'usage.sqlite'));
  assert.deepEqual(db.prepare('SELECT status FROM llm_usage ORDER BY id').all().map(r=>r.status),['invalid','success']);
  assert.equal(db.prepare('SELECT SUM(prompt_tokens) AS n FROM llm_usage').get().n,40);db.close();
  // The next request must still pass validation after repair; no unlimited retry.
  await new Promise(r=>setTimeout(r,5100));alwaysInvalid=true;
  const failed=await request();assert.equal(failed.status,502);assert.ok(!(await failed.json()).plans);assert.equal(calls,4);
 }finally{
  app.kill('SIGTERM');if(app.exitCode===null)await once(app,'exit');
  await new Promise(r=>provider.close(r));seed.close();rmSync(dir,{recursive:true,force:true});
 }
});
