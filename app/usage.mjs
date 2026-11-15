import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {createHmac,randomBytes} from 'node:crypto';

export function createUsageStore(directory, {dailyLimit=30, visitorLimit=5}={}) {
  mkdirSync(directory,{recursive:true,mode:0o700});
  const saltPath=path.join(directory,'visitor-salt');
  let salt;try{salt=readFileSync(saltPath,'utf8');}catch(e){if(e.code!=='ENOENT')throw e;salt=randomBytes(32).toString('hex');writeFileSync(saltPath,salt,{mode:0o600,flag:'wx'});}
  const db=new DatabaseSync(path.join(directory,'usage.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS llm_usage (
      id INTEGER PRIMARY KEY, at TEXT NOT NULL, day TEXT NOT NULL, visitor TEXT NOT NULL,
      task TEXT NOT NULL DEFAULT 'travel_plan', model TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending', prompt_tokens INTEGER, completion_tokens INTEGER,
      cost REAL, cost_basis TEXT NOT NULL DEFAULT 'unpriced', elapsed_ms INTEGER);
    CREATE INDEX IF NOT EXISTS usage_day ON llm_usage(day);
    CREATE INDEX IF NOT EXISTS usage_visitor ON llm_usage(day,visitor);`);
  return {
    reserve(address,model) {
      const visitor=createHmac('sha256',salt).update(address||'unknown').digest('hex');
      const day=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai'}).format(new Date());
      db.exec('BEGIN IMMEDIATE');
      try {
        if(db.prepare('SELECT count(*) AS n FROM llm_usage WHERE day=?').get(day).n>=dailyLimit)throw new Error('今天的站点生成额度已用完，请明天再来；已保存的计划仍可使用。');
        if(db.prepare('SELECT count(*) AS n FROM llm_usage WHERE day=? AND visitor=?').get(day,visitor).n>=visitorLimit)throw new Error('当前网络今天的生成额度已用完，请明天再试；可以继续调整已生成的计划。');
        const row=db.prepare('INSERT INTO llm_usage(at,day,visitor,model) VALUES(?,?,?,?)').run(new Date().toISOString(),day,visitor,model);
        db.exec('COMMIT');return Number(row.lastInsertRowid);
      }catch(e){db.exec('ROLLBACK');throw e;}
    },
    finish(id,status,tokens,elapsed) {
      const safe=n=>Number.isInteger(n)&&n>=0?n:null;
      db.prepare('UPDATE llm_usage SET status=?,prompt_tokens=?,completion_tokens=?,elapsed_ms=? WHERE id=?')
        .run(status,safe(tokens?.prompt_tokens),safe(tokens?.completion_tokens),elapsed,id);
    },
    close(){db.close();}
  };
}
