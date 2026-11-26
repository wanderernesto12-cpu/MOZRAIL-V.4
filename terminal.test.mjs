import {strict as assert} from 'node:assert';
import {test} from 'node:test';
import {fresh,change,portalView} from './public/domain.js';
import {demoState} from './public/demo.js';

const now='2026-11-24T08:00:00.000Z';
const admin={role:'admin',email:'local-test@example.invalid'};
const gate={role:'gate',email:'gate@example.invalid'};
const details={number:'MOZU1234567',client:'Cliente de teste',size:'40',type:'Dry',load:'Vazio',park:'A',area:4,truck:'TESTE',driver:'Motorista',carrier:'Transportadora'};
const run=(s,action,p,who=admin)=>change(s,action,p,who,{now});

test('o release é conferido antes de receber um vazio e usado uma vez',()=>{
  const s=fresh();
  assert.throws(()=>run(s,'entry',details,gate),/release válido/);
  const id=run(s,'release',{...details,number:'R1',container:details.number,validUntil:'2026-11-25',evidence:'Referência'}).id;
  assert.throws(()=>run(s,'resolve',{id,reason:'Conferido'},gate),{status:403});
  run(s,'checkRelease',{id,matches:true},gate);
  const cid=run(s,'entry',{...details,release:'R1'},gate).id;
  assert.equal(s.documents[0].kind,'EIR-E');
  assert.throws(()=>run(s,'entry',{...details,release:'R1'},gate),{status:409});
  run(s,'move',{id:cid,park:'B',area:3});
  assert.deepEqual(s.containers[0].transfers.map(r=>[r.from,r.to]),[['A4','B3']]);
  run(s,'exit',{...details,id:cid,authorizer:'Supervisor',authorization:'AUT-1'},gate);
  assert.equal(s.documents[0].kind,'EIR-S');
  assert.throws(()=>run(s,'entry',{...details,release:'R1'},gate),/release válido/);
});

test('a cotação e o serviço preservam a tarifa registada na obra',()=>{
  const s=fresh(); const c=run(s,'entry',{...details,load:'Cheio'}).id;
  const rate=run(s,'tariff',{name:'Reparação geral',price:100}).id;
  const job=run(s,'work',{containerId:c,condition:'Porta danificada',operator:'Oficina',items:[{tariffId:rate,qty:2}]}).id;
  run(s,'tariff',{name:'Reparação geral',price:120});
  assert.throws(()=>run(s,'exit',{...details,id:c,authorizer:'Supervisor',authorization:'AUT-1'},gate),/obras abertas/);
  run(s,'advance',{id:job});run(s,'advance',{id:job,worked:'Porta substituída'});
  assert.equal(s.documents.find(d=>d.kind==='FS').total,200);
  assert.equal(s.documents.find(d=>d.kind==='PF').total,200);
  const link=run(s,'share',{containerId:c}).id;
  assert.deepEqual(portalView(s,link,now).documents.map(d=>d.title),['Cotação de serviço','EIR de entrada']);
  run(s,'revoke',{id:link});assert.equal(portalView(s,link,now),null);
});

test('volumes zero, vazios e divergências são distintos',()=>{
  const s=fresh(), base={date:'2026-11-24',client:'Cliente A',moves:'10'};
  run(s,'daily',base);assert.equal(s.daily[0].billed,null);
  run(s,'daily',{...base,client:'cliente a',billed:'0'});
  assert.equal(s.daily.length,1);assert.equal(s.daily[0].billed,0);
  assert.throws(()=>run(s,'daily',{...base,billed:'11'}),/inferiores/);
  assert.throws(()=>run(s,'fuel',{date:base.date,equipment:'G1',running:12,available:8}),/excedem/);
  assert.equal(s.audit.length,2);
});

test('a demonstração contém os principais fluxos e dados por dia',()=>{
  const s=demoState(); assert.equal(s.daily.length,7); assert.equal(s.fuel.length,7);
  for(const type of ['EIR-E','EIR-S','FO','FS','COT','PF']) assert.ok(s.documents.some(d=>d.kind===type));
});
