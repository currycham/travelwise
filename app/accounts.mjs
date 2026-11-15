import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {randomBytes,randomInt,randomUUID,createHmac,createHash,timingSafeEqual} from 'node:crypto';
const hash=s=>createHash('sha256').update(s).digest('hex');
export const normalizeEmail=value=>{const s=String(value||'').trim().toLowerCase();if(s.length>200||!/^[-a-z0-9.!#$%&'*+/=?^_`{|}~]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(s))throw new Error('请填写有效邮箱');return s;};
export const emptyState=()=>({saved:[],entries:[],profile:'',memoryEnabled:true});
export function createAccounts(directory,{sendCode,linkedProducts=async()=>({products:[],available:false}),now=()=>Date.now()}={}){
 mkdirSync(directory,{recursive:true,mode:0o700});const secretPath=path.join(directory,'account-secret');let secret;
 try{secret=readFileSync(secretPath,'utf8');}catch(e){if(e.code!=='ENOENT')throw e;secret=randomBytes(32).toString('hex');writeFileSync(secretPath,secret,{mode:0o600,flag:'wx'});}
 const digest=s=>createHmac('sha256',secret).update(s).digest('hex');
 const db=new DatabaseSync(path.join(directory,'accounts.sqlite'));db.exec(`PRAGMA journal_mode=WAL;PRAGMA foreign_keys=ON;PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE,created_at TEXT NOT NULL,last_seen_at TEXT,state TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 0,links TEXT NOT NULL DEFAULT '{}');
 CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS login_codes(email TEXT PRIMARY KEY,code_hash TEXT NOT NULL,expires_at INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,sent_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS mail_limits(id INTEGER PRIMARY KEY,at INTEGER NOT NULL,network TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS history(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,at TEXT NOT NULL,brief TEXT NOT NULL,plans TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS user_history ON history(user_id,at);`);
 const user=id=>db.prepare('SELECT * FROM users WHERE id=?').get(id);
 const session=token=>{if(!token)return null;const s=db.prepare('SELECT user_id FROM sessions WHERE token_hash=? AND expires_at>?').get(hash(token),now());return s?user(s.user_id):null;};
 const pack=(u,{allHistory=false}={})=>({user:{id:u.id,email:u.email,links:JSON.parse(u.links)},state:JSON.parse(u.state),revision:u.revision,history:db.prepare('SELECT id,at,brief,plans FROM history WHERE user_id=? ORDER BY at DESC'+(allHistory?'':' LIMIT 100')).all(u.id).map(x=>({...x,brief:JSON.parse(x.brief),plans:JSON.parse(x.plans)}))});
 return {
  session,pack,
  async requestCode(email,address){
   email=normalizeEmail(email);if(!sendCode)throw Object.assign(new Error('邮件服务尚未就绪，请先免登录体验'),{status:503});
   const at=now(),network=digest(address||'unknown');
   db.exec('BEGIN IMMEDIATE');let code;
   try{
    db.prepare('DELETE FROM mail_limits WHERE at<?').run(at-86400000);db.prepare('DELETE FROM login_codes WHERE expires_at<?').run(at-86400000);db.prepare('DELETE FROM sessions WHERE expires_at<?').run(at);
    const last=db.prepare('SELECT sent_at FROM login_codes WHERE email=?').get(email);
    if(last&&at-last.sent_at<60000)throw Object.assign(new Error('验证码刚发过，请一分钟后再试'),{status:429});
    if(db.prepare('SELECT count(*) AS n FROM mail_limits WHERE network=? AND at>?').get(network,at-3600000).n>=10||db.prepare('SELECT count(*) AS n FROM mail_limits WHERE at>?').get(at-86400000).n>=100)throw Object.assign(new Error('验证码请求较多，请稍后再试'),{status:429});
    code=String(randomInt(1000000)).padStart(6,'0');
    db.prepare('INSERT OR REPLACE INTO login_codes VALUES(?,?,?,0,?)').run(email,digest(email+':'+code),at+600000,at);
    db.prepare('INSERT INTO mail_limits(at,network) VALUES(?,?)').run(at,network);db.exec('COMMIT');
   }catch(e){db.exec('ROLLBACK');throw e;}
   try{await sendCode(email,code);}catch{db.prepare('DELETE FROM login_codes WHERE email=? AND code_hash=?').run(email,digest(email+':'+code));throw Object.assign(new Error('验证码暂未发送成功，请稍后重试'),{status:503});}
   return {ok:true,retryAfter:60};
  },
  async verify(email,code,oldToken){
   email=normalizeEmail(email);code=String(code||'').trim();
   const row=db.prepare('SELECT * FROM login_codes WHERE email=?').get(email);
   if(!row||row.expires_at<=now()||row.attempts>=5)throw new Error('验证码失效，请重新获取');
   db.prepare('UPDATE login_codes SET attempts=attempts+1 WHERE email=?').run(email);
   if(!/^\d{6}$/.test(code)||!timingSafeEqual(Buffer.from(row.code_hash),Buffer.from(digest(email+':'+code))))throw new Error('验证码不正确');
   const token=randomBytes(32).toString('base64url');let uid;
   db.exec('BEGIN IMMEDIATE');try{
    // Consume before any asynchronous bridge operation: a code cannot be redeemed twice.
    const consumed=db.prepare('DELETE FROM login_codes WHERE email=? AND code_hash=?').run(email,row.code_hash);if(consumed.changes!==1)throw new Error('验证码已使用');
    let u=db.prepare('SELECT id FROM users WHERE email=?').get(email);uid=u?.id||randomUUID();const at=new Date(now()).toISOString();
    if(!u)db.prepare('INSERT INTO users(id,email,created_at,last_seen_at,state) VALUES(?,?,?,?,?)').run(uid,email,at,at,JSON.stringify(emptyState()));
    db.prepare('UPDATE users SET last_seen_at=? WHERE id=?').run(at,uid);
    if(oldToken)db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hash(oldToken));
    db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash(token),uid,now()+30*86400000);db.exec('COMMIT');
   }catch(e){db.exec('ROLLBACK');throw e;}
   try{const links=await linkedProducts(email);db.prepare('UPDATE users SET links=? WHERE id=?').run(JSON.stringify(links),uid);}catch{db.prepare('UPDATE users SET links=? WHERE id=?').run(JSON.stringify({products:[],available:false}),uid);}
   return {token,...pack(user(uid))};
  },
  logout(token){if(token)db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hash(token));},
  save(uid,state,revision){
   if(!state||!Array.isArray(state.saved)||!Array.isArray(state.entries)||state.saved.length>100||state.entries.length>300||typeof state.profile!=='string'||state.profile.length>5000||JSON.stringify(state).length>800000)throw new Error('资料过大或格式无效，请先导出整理');
   const clean={saved:state.saved,entries:state.entries,profile:state.profile,memoryEnabled:state.memoryEnabled!==false,useHistory:state.useHistory!==false,brief:state.brief||{},workspace:state.workspace||{plans:[],selected:null}};
   if(db.prepare('UPDATE users SET state=?,revision=revision+1 WHERE id=? AND revision=?').run(JSON.stringify(clean),uid,revision).changes!==1)throw Object.assign(new Error('另一处资料已更新，请重新加载云端记录；本机修改仍保留，可先导出'),{status:409});
   return {revision:revision+1};
  },
  record(uid,brief,plans){const id=randomUUID();db.prepare('INSERT INTO history VALUES(?,?,?,?,?)').run(id,uid,new Date(now()).toISOString(),JSON.stringify(brief),JSON.stringify(plans));return id;},
  history(uid){return pack(user(uid)).history;},
  removeHistory(uid,id){db.prepare('DELETE FROM history WHERE id=? AND user_id=?').run(id,uid);},
  memory(uid){const s=JSON.parse(user(uid).state);if(s.memoryEnabled===false)return null;return {profile:String(s.profile||'').slice(0,5000),choices:(s.saved||[]).filter(p=>p.source!=='example').slice(0,5).map(p=>({destination:p.destination,title:p.title,reason:String(p.reason||'').slice(0,800)})),experiences:(s.entries||[]).slice(0,5).map(e=>({place:String(e.place||'').slice(0,200),liked:String(e.liked||'').slice(0,1000),tired:String(e.tired||'').slice(0,1000),next:String(e.next||'').slice(0,1000)})),pastDrafts:db.prepare('SELECT brief,plans FROM history WHERE user_id=? ORDER BY at DESC LIMIT 3').all(uid).map(r=>{const b=JSON.parse(r.brief);return {wish:b.wish,plans:JSON.parse(r.plans).map(p=>({destination:p.destination,title:p.title}))};})};},
  deleteUser(uid){db.exec('BEGIN IMMEDIATE');try{const u=user(uid);if(u)db.prepare('DELETE FROM login_codes WHERE email=?').run(u.email);db.prepare('DELETE FROM users WHERE id=?').run(uid);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}},
  close(){db.close();}
 };
}
