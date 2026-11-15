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

const origin=process.env.CHECK_ORIGIN||'http://127.0.0.1:8600';
await call('Page.enable');await call('Runtime.enable');
await call('Page.navigate',{url:origin});await wait('document.querySelector(".site-header")');
await js('localStorage.clear();location.reload()');await wait('document.querySelector("#brief-form")');
for(const width of [1440,1024,768,390]){
 await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width===390});
 assert.equal(await js(`document.documentElement.scrollWidth<=${width}`),true,`overflow at ${width}`);
 assert.equal(await js('getComputedStyle(document.querySelector(".work-aside")).display!=="none"'),true);
 assert.equal(await js('document.querySelectorAll(".form-route [aria-current=step]").length'),1);
 if(width===1440||width===390)await screenshot(`design-${width}.png`);
}
await call('Page.navigate',{url:origin});await wait('document.querySelector(".skip-link")');
await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
assert.equal(await js('document.activeElement.className'),'skip-link');
await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
assert.equal(await js('document.activeElement.id'),'main-content');
await click('[data-action="account"]');await wait('document.querySelector("#login-form")');
assert.equal(await js('document.documentElement.scrollWidth<=390'),true);
await screenshot('design-login-mobile.png');await click('[data-action="close-modal"]');
// Seed only this isolated browser with two clearly marked editorial examples.
await js(`(async()=>{const {getExample}=await import('/examples.js');localStorage.setItem('travelwise-v1',JSON.stringify({workspace:{plans:[getExample('hangzhou'),getExample('quanzhou')],selected:null}}));location.reload()})()`);
await wait('document.querySelector(".site-header")');await click('[data-action="nav"][data-page="plan"]');await wait('document.querySelector(".comparison")');
for(const width of [1440,390]){
 await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width===390});
 assert.equal(await js(`document.documentElement.scrollWidth<=${width}`),true);
 const widths=await js('[...document.querySelector(".comparison").children].map(x=>x.getBoundingClientRect().width)');
 assert.ok(Math.abs(widths[0]-widths[1])<1,'equal comparison weight');
 await screenshot(`design-compare-${width}.png`);
}
await js('localStorage.clear();location.reload()');
console.log('PASS: 1440/1024/768/390 layouts; visible reflection prompts; current step; keyboard skip link; login modal; equal comparison widths. No email or AI calls.');ws.close();
