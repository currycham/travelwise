import test from 'node:test';
import assert from 'node:assert/strict';
import {validateBrief,validatePlans} from '../app/planner.mjs';
import {getExample,examples} from '../static/examples.js';
const brief=(extra={})=>({wish:'想在湖边慢下来',minDays:4,maxDays:5,budget:5000,count:1,...extra});
test('输入明确目的地必须填写，未知目的地模式不沿用旧值',()=>{
 assert.throws(()=>validateBrief(brief({mode:'destination'})),/目的地/);
 assert.equal(validateBrief(brief({mode:'discover',destination:'旧目的地'})).destination,'');
});
test('拒绝倒置天数、非整数、预算和空期待',()=>{
 for(const b of [{minDays:6,maxDays:4},{minDays:1},{maxDays:22},{minDays:3.5},{budget:100},{wish:'  '}]) assert.throws(()=>validateBrief(brief(b)));
});
test('所有编辑示例含完整逐日安排、往返、住宿、费用与替代',()=>{
 for(const p of examples){
  const copy=getExample(p.key);
  assert.equal(copy.source,'example');
  assert.equal(copy.verified,false);
  assert.ok(copy.sources[0].url.startsWith('https://'));
  const result=validatePlans({plans:[copy]},validateBrief(brief()));
  assert.equal(result[0].source,'ai');assert.equal(result[0].verified,false);
 }
 assert.equal(getExample('hangzhou').source,'example');
});
test('超过预算、丢失交通与替代活动、天数不符时不采用模型结果',()=>{
 const b=validateBrief(brief());
 const p=getExample('hangzhou');p.budget[0].amount=10000;
 assert.throws(()=>validatePlans({plans:[p]},b),/预算/);
 const q=getExample('hangzhou');delete q.transport;
 assert.throws(()=>validatePlans({plans:[q]},b),/不完整/);
 const r=getExample('hangzhou');delete r.days[0].slots[0].alternative;
 assert.throws(()=>validatePlans({plans:[r]},b),/逐日/);
 assert.throws(()=>validatePlans({plans:[getExample('hangzhou')]},validateBrief(brief({minDays:5,maxDays:6}))),/天数/);
});
test('方案数量符合用户要求，预算不接受负数或文本',()=>{
 assert.throws(()=>validatePlans({plans:[getExample('hangzhou')]},validateBrief(brief({count:2}))),/数量/);
 for(const amount of [-1,'900']){const p=getExample('hangzhou');p.budget[0].amount=amount;assert.throws(()=>validatePlans({plans:[p]},validateBrief(brief())),/预算/);}
});
