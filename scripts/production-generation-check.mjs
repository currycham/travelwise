// Manual acceptance check: makes a real, billable model request using fictitious data.
import {writeFileSync} from 'node:fs';
const base='https://travelwise.waywise.tech';
const status=await(await fetch(base+'/api/status')).json();
if(!status.ai||!status.production)throw new Error('Production model is not enabled');
const brief={mode:'discover',origin:'上海',destination:'',date:'明年春天，非节假日',wish:'想离开工作的节奏，看看山水和当地生活，不想赶路，希望比较两种不同的旅行方式',minDays:4,maxDays:5,budget:5000,companions:'独自旅行',preferences:['自然山水','当地生活'],past:'去过杭州和苏州，喜欢湖边散步，但这次想换个地方',avoid:'不重访杭州和苏州，不去主题乐园',constraints:'不自驾，每天步行不超过5公里，尽量不换酒店',priority:'更从容的节奏',pace:'每天 1–2 件事',count:2};
const start=Date.now();const response=await fetch(base+'/api/plan',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify(brief),signal:AbortSignal.timeout(190000)});const result=await response.json();
if(!response.ok){console.log('线上生成结果：',response.status,result.error);process.exitCode=1;}else{writeFileSync(new URL('../docs/live-production-sample.json',import.meta.url),JSON.stringify({testedAt:new Date().toISOString(),elapsedSeconds:Math.round((Date.now()-start)/1000),brief,...result},null,2));console.log('线上真实生成通过：',result.plans.length,'套；目的地：',result.plans.map(p=>p.destination).join(' / '),'；天数：',result.plans.map(p=>p.days.length).join(' / '),'；预算：',result.plans.map(p=>p.budget.reduce((a,b)=>a+b.amount,0)).join(' / '),'；耗时：',Math.round((Date.now()-start)/1000),'秒；自动修正：',result.repaired);}
