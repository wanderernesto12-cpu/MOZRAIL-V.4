import {strict as assert} from 'node:assert';
import {spawn} from 'node:child_process';
import {mkdtemp,rm,rmdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomBytes} from 'node:crypto';
const dir=await mkdtemp(join(tmpdir(),'mozrail-verify-'));
const port=43619, origin=`http://127.0.0.1:${port}`, password=randomBytes(24).toString('hex');
const admin='admin@example.invalid', gate='gate@example.invalid';
const server=spawn(process.execPath,['server.mjs'],{cwd:import.meta.dirname,env:{...process.env,HOST:'127.0.0.1',PORT:String(port),PUBLIC_URL:origin,COOKIE_SECURE:'0',DATA_DIR:dir,ADMIN_EMAIL:admin,ADMIN_PASSWORD:password},stdio:['ignore','pipe','inherit']});
function post(path,payload,cookie='',requestOrigin=origin){return fetch(origin+path,{method:'POST',headers:{'Content-Type':'application/json',Origin:requestOrigin,Cookie:cookie},body:JSON.stringify(payload)});}
async function signIn(email){const response=await post('/api/login',{email,password}); assert.equal(response.status,200);const raw=response.headers.get('set-cookie');assert.match(raw,/HttpOnly/);return raw.split(';')[0];}
try {
  await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('O servidor não iniciou.')),5000);server.once('exit',code=>{clearTimeout(t);reject(Error(`Saída ${code}.`));});server.stdout.once('data',()=>{clearTimeout(t);resolve();});});
  assert.equal((await fetch(origin+'/api/data')).status,401);
  assert.equal((await post('/api/login',{email:admin,password},'','https://example.invalid')).status,403);
  const a=await signIn(admin);
  const read=await fetch(origin+'/api/data',{headers:{Cookie:a}});assert.equal((await read.json()).containers.length,0);
  assert.equal((await post('/api/users',{email:gate,name:'Portaria',password,role:'gate'},a)).status,201);
  const g=await signIn(gate);
  assert.equal((await post('/api/change',{action:'tariff',payload:{name:'Serviço',price:1}},g)).status,403);
  const payload={action:'entry',payload:{number:'MOZU1020304',client:'Cliente fictício',size:'40',type:'Dry',load:'Cheio',park:'A',area:2,truck:'MPT TESTE',driver:'Motorista fictício',carrier:'Transporte fictício'}};
  const [first,second]=await Promise.all([post('/api/change',payload,g),post('/api/change',payload,g)]);
  assert.deepEqual([first.status,second.status].sort(),[200,409]);
  const s=await (await fetch(origin+'/api/data',{headers:{Cookie:a}})).json();
  assert.equal(s.containers.length,1);assert.equal(s.documents.length,1);
  const doc=s.documents[0];
  assert.equal((await (await fetch(`${origin}/api/verificar/${doc.id}`)).json()).number,'EIR-E-00001');
  assert.match(await (await fetch(`${origin}/api/qr/${doc.id}`)).text(),/<svg/);
  const shared=await (await post('/api/change',{action:'share',payload:{containerId:s.containers[0].id}},a)).json();
  const publicDoc=await (await fetch(`${origin}/api/portal/${shared.id}/document/${doc.id}`)).json();
  assert.equal(publicDoc.details.Motorista,undefined);assert.equal(publicDoc.details.Contentor,'MOZU1020304');
  await post('/api/change',{action:'revoke',payload:{id:shared.id}},a);
  assert.equal((await fetch(`${origin}/api/portal/${shared.id}`)).status,404);
  console.log('Sessões, perfis, concorrência, QR e portal verificados por HTTP.');
} finally {
  if(server.exitCode===null){const done=new Promise(resolve=>server.once('exit',resolve));server.kill();await done;}
  for(const name of ['terminal.sqlite','terminal.sqlite-shm','terminal.sqlite-wal']) await rm(join(dir,name),{force:true});
  await rmdir(dir);
}
