import {fresh,change,dayKey} from './domain.js';

export function demoState() {
  const data=fresh(), user={email:'demo@example.invalid',role:'admin'};
  const mark=new Date(); mark.setUTCHours(8,0,0,0);
  const when=i=>new Date(mark.getTime()-i*86400000).toISOString();
  const run=(action,body,i=0)=>change(data,action,body,user,{now:when(i)}).id;
  const clients=['Baía Logística','Índico Transportes','Norte Cargas'];
  for(let i=10;i>=0;i--) {
    const number=`MOZU${String(7637400+i)}`, client=clients[i%clients.length], days=i%6;
    const id=run('entry',{number,client,size:i%3===0?'20':'40',type:'Ft',load:'Cheio',park:i%2?'B':'A',area:i%4+1,truck:`MPT ${632+i} MC`,driver:'Motorista de demonstração',carrier:client,condition:'Sem observações na entrada.'},days);
    if(i>=8||i===3) run('exit',{id,authorizer:'Supervisor de demonstração',authorization:`OUT-${124+i}`,truck:'MPT 214 MC',driver:'Motorista de demonstração',carrier:client},i===3?0:2);
    if([0,1,4,5].includes(i)) {
      const job=run('work',{containerId:id,condition:i%2?'Dano ligeiro na porta.':'Preparação para recondicionamento.',materials:'Material de oficina',operator:i%2?'Oficina Norte':'Oficina Sul',items:i===0?[3,13,14].map(index=>({tariffId:data.tariffs[index].id,qty:1})):[{tariffId:data.tariffs[i%2?0:1].id,qty:1}]},days);
      if(i!==1)run('advance',{id:job},Math.max(0,days-1));
      if(i===5)run('advance',{id:job,worked:'Intervenção concluída e conferida.',equipment:'Kit de oficina',staff:'Oficina Norte'},1);
    }
  }
  run('release',{number:'REL-0261',container:'MOZU7642901',client:clients[0],type:'Ft',size:'40',validUntil:dayKey(new Date(mark.getTime()+3*86400000)),evidence:'E-mail de demonstração.'},0);
  run('release',{number:'REL-0260',container:'MOZU7642902',client:clients[1],type:'Ft',size:'20',validUntil:dayKey(new Date(mark.getTime()+2*86400000))},1);
  for(let i=6;i>=0;i--) {
    const moves=[29,32,26,39,30,34,42][6-i];
    run('daily',{date:dayKey(new Date(when(i))),client:clients[i%3],handling:moves-6,reconditioned:2+i%3,interventions:4+i%5,repaired:2+i%4,hours:8+i,timed:1+i%3,moves,billed:moves-(2+i%4)});
    run('fuel',{date:dayKey(new Date(when(i))),equipment:'Grua 01',running:5+i%3,available:8,litres:52+3*i,cost:(52+3*i)*96});
  }
  run('activity',{date:dayKey(),containerId:data.containers.find(c=>!c.exitedAt).id,items:[{tariffId:'CAT26-13',qty:1},{tariffId:'CAT26-14',qty:1}],status:'Pendente'});
  return data;
}
