// Optional local browser acceptance check. Launch an isolated Chrome at port 9227.
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const tabs=await(await fetch('http://127.0.0.1:9227/json')).json();
const ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
let id=0;const callbacks=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const cb=callbacks.get(m.id);callbacks.delete(m.id);m.error?cb.reject(m.error):cb.resolve(m.result);}};
const call=(method,params={})=>new Promise((resolve,reject)=>{const i=++id;callbacks.set(i,{resolve,reject});ws.send(JSON.stringify({id:i,method,params}));});
const js=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
const wait=async expression=>{for(let i=0;i<100;i++){if(await js(expression))return;await new Promise(r=>setTimeout(r,100));}throw new Error('Timed out: '+expression);};
const click=async selector=>js(`document.querySelector(${JSON.stringify(selector)}).click()`);
const type=async(selector,text)=>js(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(text)};e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
const screenshot=async name=>{await js('document.querySelector("#toast")?.classList.remove("show")');await new Promise(r=>setTimeout(r,150));const metrics=await call('Page.getLayoutMetrics');const r=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width:metrics.cssContentSize.width,height:metrics.cssContentSize.height,scale:1}});await writeFile(new URL('../docs/screenshots/'+name,import.meta.url),Buffer.from(r.data,'base64'));};
await call('Page.enable');await call('Runtime.enable');
await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
await call('Page.navigate',{url:'http://127.0.0.1:8600'});await wait('document.querySelector("#brief-form")');
await js('localStorage.clear();location.reload()');await wait('document.querySelector("#brief-form")');
await screenshot('desktop.png');
assert.equal(await js('document.documentElement.scrollWidth<=innerWidth'),true);
await type('[name="wish"]','想安静地看山看水，不想换酒店');
await type('[name="origin"]','上海');
await click('#brief-form [type="submit"]');await wait('document.querySelector("[name=past]")');
await type('[name="past"]','喜欢上次在河边发呆的下午');
await click('#brief-form [type="submit"]');await wait('document.querySelector("[name=constraints]")');
// Preserve API credits here; real model generation is checked separately.
if(!await js('document.querySelector(".pill").textContent.includes("AI 已连接")')){
 await click('#brief-form [type="submit"]');await wait('document.querySelector("#modal").open');
 assert.ok(await js('document.querySelector("#modal").textContent.includes("固定的编辑示例")'));
}
await click('[data-action="example"][data-key="hangzhou"]');await wait('document.querySelectorAll(".day").length===4');
assert.ok(await js('document.body.textContent.includes("编辑示例")'));
await click('[data-action="save"]');
await click('[data-action="plan-tab"][data-tab="reason"]');await type('#reason','想把时间留给湖边，愿意少去几个景点');await click('[data-action="save-reason"]');
await click('[data-action="plan-tab"][data-tab="days"]');
await click('[data-action="remove-slot"]');assert.ok(await js('document.querySelector(".slot h4").textContent.includes("自由时间")'));
await click('[data-action="plan-tab"][data-tab="reason"]');await click('[data-action="undo"]');
await click('[data-action="plan-tab"][data-tab="days"]');assert.ok(await js('!document.querySelector(".slot h4").textContent.includes("自由时间")'));
await click('[data-action="edit-slot"]');await type('#slot-title','到达后先休息半天');await click('[data-action="confirm-edit"]');
assert.equal(await js('document.querySelector(".slot h4").textContent'),'到达后先休息半天');
await screenshot('plan.png');
await click('[data-action="plan-tab"][data-tab="budget"]');await click('[data-action="edit-budget"]');await type('[data-budget="0"]','800');await click('[data-action="confirm-budget"]');
assert.ok(await js('document.body.textContent.includes("¥800")'));
await click('[data-action="plan-tab"][data-tab="checks"]');await click('[data-check="0"]');assert.equal(await js('document.querySelectorAll(".check-item.done").length'),1);
await click('[data-action="nav"][data-page="saved"]');assert.equal(await js('document.querySelectorAll(".saved-card").length'),1);
await click('[data-action="review"]');await type('[name="liked"]','湖边的下午让我真正放松');await type('[name="tired"]','换乘有点累');await type('[name="next"]','下次想少换乘');await click('#journal-form [type="submit"]');assert.equal(await js('document.querySelectorAll(".journal-entry").length'),1);
await click('[data-action="reuse-entry"]');assert.ok(await js('document.querySelector("[name=past]").value.includes("湖边的下午")'));
await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
await click('[data-action="nav"][data-page="explore"]');await screenshot('mobile.png');assert.equal(await js('document.documentElement.scrollWidth<=390'),true);
await click('[data-action="nav"][data-page="saved"]');await click('[data-action="open-saved"]');await screenshot('mobile-plan.png');assert.equal(await js('document.documentElement.scrollWidth<=390'),true);
await js('location.reload()');await wait('document.querySelector(".nav")');await click('[data-action="nav"][data-page="saved"]');await click('[data-action="open-saved"]');
assert.equal(await js('document.querySelector(".slot h4").textContent'),'到达后先休息半天');
await click('[data-action="plan-tab"][data-tab="reason"]');assert.ok(await js('document.querySelector("#reason").value.includes("湖边")'));
await click('[data-action="nav"][data-page="journal"]');assert.equal(await js('document.querySelectorAll(".journal-entry").length'),1);
// Leave the preview with a clean start rather than test data.
await js('localStorage.clear();location.reload()');
console.log('PASS: expectations → explicit example → saved plan → edit/undo → budget/checks → reflection → reuse → reload persistence; 1440px and 390px no overflow.');
ws.close();
