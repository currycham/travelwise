import assert from 'node:assert/strict';
const base='http://127.0.0.1:8600';
for(const file of ['/','/app.js','/style.css','/examples.js','/icon.svg']){const r=await fetch(base+file);assert.equal(r.status,200,file);assert.ok(r.headers.get('content-security-policy'));}
assert.equal((await fetch(base+'/missing')).status,404);
assert.equal((await fetch(base+'/%2e%2e%2f.env')).status,404);
assert.equal((await fetch(base+'/api/plan',{method:'POST',headers:{Origin:'https://example.com'},body:'{}'})).status,403);
const status=await(await fetch(base+'/api/status')).json();
if(status.ai)assert.equal((await fetch(base+'/api/plan',{method:'POST',body:'{"wish":""}'})).status,400);
console.log('PASS: static assets, traversal rejection, origin check, invalid input; no model call made.');
