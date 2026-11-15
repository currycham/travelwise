// Run only on the production host as travelwise. Uses an isolated temporary account,
// sends no email, makes a real model request, then deletes its fixture account.
import assert from 'node:assert/strict';
import {createAccounts,emptyState} from '/srv/travelwise/app/app/accounts.mjs';
const base='https://travelwise.waywise.tech',email=`deployment-${Date.now()}@example.invalid`;let code,tokenCookie,userId;
const seed=createAccounts('/srv/travelwise/data',{sendCode:async(e,c)=>{code=c;}});
const request=async(url,method='GET',body)=>{const res=await fetch(base+url,{method,headers:{Origin:base,...(tokenCookie?{Cookie:tokenCookie}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(190000)});return {res,data:await res.json()};};
try{
 await seed.requestCode(email,'deployment-check');
 const login=await request('/api/auth/verify','POST',{email,code});assert.equal(login.res.status,200);userId=login.data.user.id;tokenCookie=login.res.headers.get('set-cookie').split(';')[0];
 assert.ok(login.res.headers.get('set-cookie').includes('Secure'));console.log('PRODUCTION_LOGIN_OK; fixture only, no email sent');
 const state={...emptyState(),profile:'喜欢安静的湖边和街巷，尽量不换酒店',entries:[{id:'fixture',place:'苏州',liked:'沿河散步',tired:'频繁换乘',next:'少换乘'}]};
 const saved=await request('/api/account/state','PUT',{state,revision:0});assert.equal(saved.res.status,200);
 assert.equal((await request('/api/auth/me')).data.state.profile,state.profile);console.log('CLOUD_SAVE_READ_OK');
 const brief={mode:'destination',destination:'杭州',origin:'上海',wish:'想慢慢看湖和当地生活，希望延续过去喜欢的沿河散步，但少赶路',minDays:3,maxDays:4,budget:5000,count:1,companions:'独自旅行',preferences:['自然山水','当地生活'],constraints:'不自驾，尽量不换酒店',pace:'每天 1–2 件事',priority:'更从容的节奏',useHistory:true};
 const generated=await request('/api/plan','POST',brief);assert.equal(generated.res.status,200,generated.data.error);assert.equal(generated.data.memoryUsed,true);assert.equal(generated.data.historySaved,true);
 const history=(await request('/api/account/history')).data.history;assert.equal(history.length,1);assert.equal(history[0].plans.length,1);console.log('PRODUCTION_MEMORY_AND_HISTORY_OK; days:',history[0].plans[0].days.length);
}finally{
 if(userId){try{await request('/api/account','DELETE');assert.equal((await request('/api/auth/me')).data.user,null);console.log('TEST_ACCOUNT_REMOVED_AND_SESSION_REVOKED');}finally{seed.deleteUser(userId);}}
 seed.close();
}
