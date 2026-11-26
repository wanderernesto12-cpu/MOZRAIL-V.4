import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { allowed, change, upgrade, fresh, portalView, roles } from './public/domain.js';
import { demoState } from './public/demo.js';
import { qrcode } from './vendor/qrcode.mjs';

const root=fileURLToPath(new URL('./public/',import.meta.url));
const demo=process.argv.includes('--demo');
const host=process.env.HOST??'127.0.0.1', port=Number(process.env.PORT??4173);
const directory=resolve(process.env.DATA_DIR??'data');
if(!demo) await mkdir(directory,{recursive:true});
const db=new DatabaseSync(demo?':memory:':resolve(directory,'terminal.sqlite'));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS users (email TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL, salt TEXT NOT NULL, secret TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, email TEXT NOT NULL, expiry INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS photos (id TEXT PRIMARY KEY, mime TEXT NOT NULL, bytes BLOB NOT NULL, owner TEXT NOT NULL);`);
db.prepare('INSERT OR IGNORE INTO state VALUES(1,?)').run(JSON.stringify(demo?demoState():fresh()));
const state=()=>upgrade(JSON.parse(db.prepare('SELECT value FROM state WHERE id=1').get().value));
const save=s=>db.prepare('UPDATE state SET value=? WHERE id=1').run(JSON.stringify(s));
const userByEmail=email=>db.prepare('SELECT * FROM users WHERE email=?').get(email);
const derive=promisify(scrypt);
const hash=s=>createHash('sha256').update(s).digest('hex');
const random=()=>randomBytes(32).toString('base64url');
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const invalidLogin='E-mail ou palavra-passe incorrectos.';
async function addUser({email,name,role,password}) {
  email=String(email??'').trim().toLowerCase(); name=String(name??'').trim();
  if(email.length>150||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!name||name.length>100||!Object.hasOwn(roles,role)) fail('Verifique o nome, o e-mail e o perfil.');
  if(typeof password!=='string'||password.length<12||password.length>256) fail('A palavra-passe deve ter entre 12 e 256 caracteres.');
  const salt=randomBytes(16).toString('hex'), secret=(await derive(password,salt,64)).toString('hex');
  if(userByEmail(email)) fail('Já existe uma conta com este e-mail.',409);
  db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(email,name,role,salt,secret);
}
if(!db.prepare("SELECT 1 FROM users WHERE role='admin'").get() && !demo) {
  if(!process.env.ADMIN_EMAIL||!process.env.ADMIN_PASSWORD) {
    console.error('Para começar, defina ADMIN_EMAIL e ADMIN_PASSWORD. Para experimentar localmente, execute npm run demo.'); process.exit(1);
  }
  await addUser({email:process.env.ADMIN_EMAIL,name:process.env.ADMIN_NAME??'Administração Mozrail',role:'admin',password:process.env.ADMIN_PASSWORD});
}
const sessionSeconds=8*60*60;
const lookupSession=db.prepare('SELECT users.email, users.name, users.role FROM sessions JOIN users USING(email) WHERE sessions.token=? AND sessions.expiry>?');
function sessionToken(req) { return req.headers.cookie?.match(/(?:^|;\s*)moz_session=([A-Za-z0-9_-]{43})(?:;|$)/)?.[1]; }
function actor(req) {
  if(demo) return {email:'demo@example.invalid',name:'Equipa Mozrail',role:'admin'};
  const token=sessionToken(req);
  return token?lookupSession.get(hash(token),Date.now()):null;
}
function cookie(req,value,age) {
  const secure=Boolean(req.socket.encrypted)||req.headers['x-forwarded-proto']==='https'||process.env.COOKIE_SECURE==='1';
  return `moz_session=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${age}${secure?'; Secure':''}`;
}
function writeGuard(req) {
  const origin=req.headers.origin;
  if(!origin) fail('Origem do pedido inválida.',403);
  const expected=process.env.PUBLIC_URL;
  const requested=new URL(origin);
  if(expected?requested.origin!==new URL(expected).origin:requested.host!==req.headers.host) fail('Origem do pedido inválida.',403);
}
async function body(req,max=256000) {
  const chunks=[]; let length=0;
  for await(const chunk of req) { length+=chunk.length; if(length>max) fail('O ficheiro ou pedido é demasiado grande.',413); chunks.push(chunk); }
  try {const data=JSON.parse(Buffer.concat(chunks)); if(!data||typeof data!=='object'||Array.isArray(data)) throw Error(); return data;}
  catch {fail('O pedido não contém dados válidos.');}
}
const guards={'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','Permissions-Policy':'geolocation=(), microphone=()','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; form-action 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'"};
function respond(res,status,data,headers={}) {res.writeHead(status,{...guards,'Cache-Control':'no-store','Content-Type':'application/json; charset=utf-8',...headers});res.end(typeof data==='string'||Buffer.isBuffer(data)?data:JSON.stringify(data));}
const staticFiles=new Set(['/','/index.html','/app.js','/domain.js','/demo.js','/styles.css','/logo.png','/terminal.webp','/icon.png','/icon-large.png','/manifest.webmanifest','/sw.js']);
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.webp':'image/webp','.webmanifest':'application/manifest+json'};
const attempts=new Map();
function limit(key,max,interval) {
  const now=Date.now(), last=attempts.get(key);
  if(last&&last.until>now) {if(last.count>=max) fail('Demasiadas tentativas. Tente novamente mais tarde.',429); last.count++;}
  else attempts.set(key,{until:now+interval,count:1});
  if(attempts.size>2000) for(const [ip,item] of attempts) {if(item.until<=now) attempts.delete(ip);}
}
const imageTypes={'image/jpeg':b=>b[0]===255&&b[1]===216&&b[2]===255,'image/png':b=>b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),'image/webp':b=>b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP'};
function publicDocument(state,docId,portal) {
  if(!portal.documents.some(d=>d.id===docId)) return null;
  const d=state.documents.find(d=>d.id===docId);
  const details=Object.fromEntries(Object.entries(d.details??{}).filter(([label])=>!['N.º do BI','N.º da carta de condução','Segurança / inspector','Motorista','Matrícula','Autorizado','Documento','Release','Selo'].includes(label)));
  return {id:d.id,title:d.title,number:d.number,at:d.at,client:d.client,details,items:d.items,total:d.total};
}

const server=createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,'http://localhost'), path=url.pathname, method=req.method;
    if(method==='GET'&&path==='/health') return respond(res,200,{status:'ok',demo});
    if(method==='GET'&&staticFiles.has(path)) {
      const file=path==='/'?'/index.html':path;
      try {return respond(res,200,await readFile(root+file.slice(1)),{'Content-Type':types[extname(file)]});}
      catch(err) {if(err.code==='ENOENT') fail('Ficheiro indisponível.',404); throw err;}
    }
    if(!['GET','POST'].includes(method)) fail('Método inválido.',405);
    if(method==='POST') writeGuard(req);
    if(method==='POST'&&path==='/api/login') {
      const input=await body(req,3000), email=String(input.email??'').trim().toLowerCase();
      limit(`ip:${req.socket.remoteAddress}`,80,15*60*1000);
      if(email.length>150||typeof input.password!=='string'||input.password.length>256) fail(invalidLogin,401);
      limit(`email:${email}`,12,15*60*1000);
      const u=userByEmail(email);
      const candidate=await derive(input.password,u?.salt??'d7f378db7e5bea4fd9a26ce9f2292f78',64);
      if(!u||!timingSafeEqual(candidate,Buffer.from(u.secret,'hex'))) fail(invalidLogin,401);
      const key=random();
      db.prepare('DELETE FROM sessions WHERE expiry<=?').run(Date.now());
      db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash(key),u.email,Date.now()+sessionSeconds*1000);
      attempts.delete(`email:${email}`);
      return respond(res,200,{user:{email:u.email,name:u.name,role:u.role}},{'Set-Cookie':cookie(req,key,sessionSeconds)});
    }
    if(method==='POST'&&path==='/api/logout') {
      const token=sessionToken(req); if(token) db.prepare('DELETE FROM sessions WHERE token=?').run(hash(token));
      return respond(res,200,{ok:true},{'Set-Cookie':cookie(req,'',0)});
    }
    if(method==='GET'&&path==='/api/session') return respond(res,200,{user:actor(req),demo});
    if(method==='GET'&&path.startsWith('/api/portal/')) {
      const [id,section,item]=path.slice('/api/portal/'.length).split('/');
      const snapshot=state(), portal=portalView(snapshot,id);
      if(!portal) fail('Este link de consulta está indisponível ou expirou.',404);
      if(!section) return respond(res,200,portal);
      if(section==='document') {const doc=publicDocument(snapshot,item,portal); if(doc) return respond(res,200,doc);}
      if(section==='photo'&&portal.photos.includes(item)) {
        const p=db.prepare('SELECT * FROM photos WHERE id=?').get(item);
        if(p) return respond(res,200,Buffer.from(p.bytes),{'Content-Type':p.mime});
      }
      fail('Elemento indisponível.',404);
    }
    if(method==='GET'&&path.startsWith('/api/verificar/')) {
      const doc=state().documents.find(d=>d.id===path.slice('/api/verificar/'.length));
      if(!doc) fail('Documento indisponível.',404);
      return respond(res,200,{number:doc.number,title:doc.title,at:doc.at});
    }
    if(method==='GET'&&path.startsWith('/api/qr/')) {
      const id=path.slice('/api/qr/'.length);
      if(!state().documents.some(d=>d.id===id)) fail('Documento indisponível.',404);
      const proto=req.socket.encrypted||req.headers['x-forwarded-proto']==='https'?'https':'http';
      const origin=new URL(process.env.PUBLIC_URL??`${proto}://${req.headers.host}`).origin;
      const qr=qrcode(0,'M'); qr.addData(`${origin}/#verificar/${id}`); qr.make();
      return respond(res,200,qr.createSvgTag(3,12),{'Content-Type':'image/svg+xml; charset=utf-8'});
    }
    const who=actor(req);
    if(!who) fail('Inicie sessão para continuar.',401);
    if(method==='GET'&&path==='/api/data') {const item=state(); if(!allowed(who.role,'share'))item.links=[]; return respond(res,200,item);}
    if(path==='/api/users'&&who.role==='admin') {
      if(method==='POST') {
        const input=await body(req,6000);
        await addUser(input);
        const snapshot=state(); snapshot.audit.unshift({id:crypto.randomUUID(),action:'user',subject:input.email,actor:who.email,at:new Date().toISOString(),message:'Conta criada.'}); save(snapshot);
        return respond(res,201,{message:'Conta criada.'});
      }
      return respond(res,200,db.prepare('SELECT email,name,role FROM users ORDER BY name').all());
    }
    if(method==='POST'&&path==='/api/photos') {
      if(!['entry','exit','work','advance'].some(action=>allowed(who.role,action))) fail('O seu perfil não permite carregar fotografias.',403);
      const input=await body(req,2200000), buf=Buffer.from(typeof input.data==='string'?input.data:'','base64');
      if(buf.length>1500000||!Object.hasOwn(imageTypes,input.mime)||!imageTypes[input.mime](buf)) fail('Use uma fotografia JPEG, PNG ou WebP até 1,5 MB.');
      const id=crypto.randomUUID(); db.prepare('INSERT INTO photos VALUES(?,?,?,?)').run(id,input.mime,buf,who.email);
      return respond(res,201,{id});
    }
    if(method==='GET'&&path.startsWith('/api/photos/')) {
      const p=db.prepare('SELECT * FROM photos WHERE id=?').get(path.slice('/api/photos/'.length));
      if(p) return respond(res,200,Buffer.from(p.bytes),{'Content-Type':p.mime});
      fail('Fotografia indisponível.',404);
    }
    if(method==='POST'&&path==='/api/change') {
      const input=await body(req);
      db.exec('BEGIN IMMEDIATE');
      try {
        const snapshot=state(), result=change(snapshot,input.action,input.payload??{},who,{checkPhoto:id=>Boolean(db.prepare('SELECT 1 FROM photos WHERE id=? AND owner=?').get(id,who.email))});
        save(snapshot); db.exec('COMMIT'); return respond(res,200,result);
      } catch(err) {db.exec('ROLLBACK'); throw err;}
    }
    fail('Página ou operação indisponível.',404);
  } catch(error) {
    if(!error.status) console.error(error);
    if(!res.headersSent) respond(res,error.status??500,{error:error.status?error.message:'O serviço não conseguiu concluir o pedido.'});
    else res.end();
  }
});
server.listen(port,host,()=>console.log(`Mozrail Terminal em http://${host}:${port}${demo?' (demonstração em memória)':''}`));
