export const areas = ['Prontos para sair', 'Preparados para recondicionamento', 'Intervenções mínimas', 'Intervenções graves'];
export const roles = { admin:'Administrador', gate:'Portaria', supervisor:'Supervisor', office:'Escritório', viewer:'Consulta' };
export const permissions = { entry:['gate'], exit:['gate'], move:['supervisor'], release:['office'], checkRelease:['gate','supervisor'], resolve:['supervisor'], work:['supervisor'], appendWork:['supervisor'], advance:['supervisor'], document:['gate','office'], share:['office'], revoke:['office'], tariff:['office'], activity:['supervisor','office'], finishActivity:['supervisor','office'], daily:['supervisor','office'], fuel:['supervisor'] };
export const allowed = (role, action) => role === 'admin' || (permissions[action] ?? []).includes(role);
export const initialTariffs = [
  ...['Recondicionamento','Manuseamento'].flatMap(service=>['40','20'].flatMap(size=>['Ft','FR','OP'].map(type=>[
    service+' de '+size+' '+type, (service==='Manuseamento'?{20:1354.92,40:2677.58}:{20:11774.90,40:23549.80})[size]
  ]))),
  ['Intervenções grandes',5026],['Reparação de porta',3950],['Reparação de piso',5463],['Reparação de borracha',1500]
].map(([name,price],i)=>({id:'CAT26-'+i,name,price,active:true,date:'2026-01-01'}));
export function upgrade(state){
  state.activities??=[];
  if(state.catalogVersion!==2026){
    for(const row of state.tariffs) if(/^T[1-8]$/.test(row.id)||initialTariffs.some(t=>t.name===row.name)) row.active=false;
    state.tariffs.unshift(...structuredClone(initialTariffs));
    state.catalogVersion=2026;
  }
  return state;
}
export const fresh = () => upgrade({ containers:[], releases:[], jobs:[], documents:[], links:[], tariffs:[], daily:[], fuel:[], audit:[], seq:{} });
export const forms={
  FO:['Inspecção e trabalhos previstos','Data prevista de saída','Prioridade','Observações por trabalho','Materiais necessários','Notas','Supervisor'],
  FS:['Área de operação','Início da operação','Fim da operação','Volume e unidades','Peso e unidade','Quantidades por equipamento','Nomes e quantidades por função'],
  EIR:['Proprietário','Expedidor / consignatário','N.º do BI','N.º da carta de condução','Códigos e localização dos danos','Segurança / inspector'],
  GS:['Camião','Procedência','Hora da entrada','Fronteira de entrada','Registo de entrada','C/Marca','Controlo','Processo','Artigos e quantidades','Observações']
};
function formDetails(kind,p){
  return Object.fromEntries(forms[kind].map(key=>[key,text(p[key],1200)]));
}
export const dayKey = (date=new Date()) => new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Maputo',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
export const stayDays = (start,end=new Date()) => Math.max(0,Math.floor((Date.parse(dayKey(new Date(end)))-Date.parse(dayKey(new Date(start))))/86400000));
export const normalContainer = val => String(val??'').toUpperCase().replace(/[\s-]/g,'');
const fail = (message,status=400) => { throw Object.assign(new Error(message),{ status }); };
const text = (v,max=160) => { const clean=String(v??'').trim(); if(clean.length>max) fail('Um dos textos é demasiado longo.'); return clean; };
function requireText(v, label, max) { const value=text(v,max); if(!value) fail(`Preencha ${label}.`); return value; }
function number(v,label,{whole=false,optional=false}={}) {
  if(v==='' || v===null || v===undefined) { if(optional)return null; fail(`Preencha ${label}.`); }
  const value=Number(v);
  if(!Number.isFinite(value)||value<0||value>1e9|| (whole&&!Number.isInteger(value))) fail(`Verifique ${label}.`);
  return value;
}
function dateField(value) {
  const d=text(value,10), parsed=new Date(d);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(+parsed) || parsed.toISOString().slice(0,10)!==d) fail('Indique uma data válida.');
  return d;
}
function find(rows,id,label) { const row=rows.find(x=>x.id===id); if(!row) fail(`${label} indisponível.`,404); return row; }
function location(p) {
  if(!['A','B'].includes(p.park)||![1,2,3,4].includes(Number(p.area))) fail('Seleccione o parque e a área.');
  return {park:p.park,area:Number(p.area)};
}
function photoList(input, checkPhoto) {
  const ids=Array.isArray(input)?input:[];
  if(ids.length>5||ids.some(id=>typeof id!=='string'||!checkPhoto(id))) fail('Verifique as fotografias.');
  return [...new Set(ids)];
}
function containerNumber(input) { const n=normalContainer(input); if(!/^[A-Z]{4}\d{7}$/.test(n)) fail('O número do contentor deve ter quatro letras e sete algarismos.'); return n; }
function cargoSize(input) { if(!['20','40','45'].includes(input)) fail('Seleccione o tamanho do contentor.'); return input; }
function document(state,kind,fields,now,actor) {
  const id=crypto.randomUUID();
  const count=(state.seq[kind]??0)+1;
  state.seq[kind]=count;
  const row={id,kind,number:`${kind}-${String(count).padStart(5,'0')}`,at:now,actor:actor.email,...structuredClone(fields)};
  state.documents.unshift(row); return row;
}
function movementDetails(p,checkPhoto) {
  return { truck:requireText(p.truck,'a matrícula'), driver:requireText(p.driver,'o motorista'), carrier:requireText(p.carrier,'a transportadora'), condition:text(p.condition,1000), photos:photoList(p.photos,checkPhoto) };
}

export function change(state, action, p, actor, options={}) {
  if(!allowed(actor.role,action) || !Object.hasOwn(permissions,action)) fail('O seu perfil não permite esta acção.',403);
  const now=options.now??new Date().toISOString(), today=dayKey(new Date(now));
  const checkPhoto=options.checkPhoto??(()=>false);
  let target, message;
  switch(action) {
    case 'release': {
      const number=requireText(p.number,'o número do release');
      if(state.releases.some(x=>x.number.toLowerCase()===number.toLowerCase())) fail('Já existe um release com este número.',409);
      target={id:crypto.randomUUID(),number,container:containerNumber(p.container),client:requireText(p.client,'o cliente'),size:cargoSize(p.size),type:requireText(p.type,'o tipo'),validUntil:dateField(p.validUntil),evidence:text(p.evidence,1200),status:'Pendente',at:now};
      state.releases.unshift(target); message='Release registado.'; break;
    }
    case 'checkRelease': case 'resolve': {
      target=find(state.releases,p.id,'Release');
      if(target.usedAt) fail('O release já foi utilizado.',409);
      const reason=text(p.reason,700);
      if(action==='resolve'&&!reason) fail('Indique o motivo da decisão.');
      target.status=target.validUntil<today?'Expirado':((action==='resolve'&&p.decision==='Recusado')?'Recusado':((action==='resolve'||(p.matches===true&&target.evidence))?'Validado':'Pendente'));
      target.reason=reason||({Expirado:'Validade terminada.',Pendente:target.evidence?'Divergência por resolver.':'Falta referência do e-mail.',Validado:'Dados conferidos.'}[target.status]);
      target.checkedAt=now; target.checkedBy=actor.email; message=`Release ${target.status.toLowerCase()}.`; break;
    }
    case 'entry': {
      const number=containerNumber(p.number), client=requireText(p.client,'o cliente'), size=cargoSize(p.size), type=requireText(p.type,'o tipo');
      if(state.containers.some(c=>c.number===number&&!c.exitedAt)) fail('Este contentor já está no terminal.',409);
      if(!['Vazio','Cheio'].includes(p.load)) fail('Seleccione a carga.');
      if(p.load==='Vazio') {
        const release=state.releases.find(r=>r.number.toUpperCase()===String(p.release??'').trim().toUpperCase());
        if(!release || release.usedAt || release.validUntil<today || release.status!=='Validado' || release.container!==number || release.client.toLowerCase()!==client.toLowerCase() || release.size!==size || release.type!==type) fail('A entrada de um vazio exige um release válido e correspondente.');
        release.usedAt=now;
      }
      target={id:crypto.randomUUID(),number,client,size,type,load:p.load,seal:text(p.seal),release:text(p.release),...location(p),entry:movementDetails(p,checkPhoto),enteredAt:now,enteredBy:actor.email,transfers:[]};
      state.containers.unshift(target);
      document(state,'EIR-E',{containerId:target.id,client,title:'EIR de entrada',details:{...formDetails('EIR',p),Contentor:number,Tipo:type,Tamanho:`${size} pés`,Carga:p.load,Parque:target.park,Área:target.area,Selo:target.seal,Release:target.release,Matrícula:target.entry.truck,Motorista:target.entry.driver,Transportadora:target.entry.carrier,Condição:target.entry.condition},photos:target.entry.photos},now,actor);
      message='Entrada registada e EIR emitido.'; break;
    }
    case 'move': {
      target=find(state.containers,p.id,'Contentor');
      if(target.exitedAt) fail('O contentor já saiu do terminal.',409);
      const next=location(p);
      if(next.park===target.park&&next.area===target.area) fail('Seleccione uma localização diferente.');
      target.transfers.unshift({from:`${target.park}${target.area}`,to:`${next.park}${next.area}`,at:now,by:actor.email});
      Object.assign(target,next); message='Transferência registada.'; break;
    }
    case 'exit': {
      target=find(state.containers,p.id,'Contentor');
      if(target.exitedAt) fail('O contentor já saiu do terminal.',409);
      if(state.jobs.some(j=>j.containerId===target.id&&j.stage!=='Concluída')) fail('Conclua as obras abertas para este contentor antes da saída.',409);
      target.exit={...movementDetails(p,checkPhoto),authorizer:requireText(p.authorizer,'quem autorizou'),authorization:requireText(p.authorization,'o número da autorização')};
      target.exitedAt=now; target.exitedBy=actor.email;
      document(state,'EIR-S',{containerId:target.id,client:target.client,title:'EIR de saída',details:{...formDetails('EIR',p),Tipo:target.type,Tamanho:target.size,Carga:target.load,Selo:target.seal,Contentor:target.number,Matrícula:target.exit.truck,Motorista:target.exit.driver,Transportadora:target.exit.carrier,Autorizado:target.exit.authorizer,Documento:target.exit.authorization,Condição:target.exit.condition,'Dias de estadia':stayDays(target.enteredAt,now)},photos:target.exit.photos},now,actor);
      message='Saída registada e EIR emitido.'; break;
    }
    case 'finishActivity': {
      target=find(state.activities,p.id,'Actividade');
      target.status='Concluída';message='Actividade concluída.';break;
    }
    case 'activity':
    case 'appendWork':
    case 'work': {
      const existing = action === 'appendWork' ? find(state.jobs,p.id,'Obra') : null;
      if(existing?.stage==='Concluída') fail('A obra já está concluída.',409);
      const container=find(state.containers,existing?.containerId ?? p.containerId,'Contentor');
      if(container.exitedAt) fail('Seleccione um contentor que esteja no terminal.');
      if(!Array.isArray(p.items)||p.items.length<1||p.items.length>25) fail('Adicione pelo menos um trabalho.');
      const additions=p.items.map(item=>{
        const rate=find(state.tariffs,item.tariffId,'Tarifa');
        if(!rate.active) fail('Seleccione uma tarifa confirmada e activa.');
        const qty=number(item.qty,'a quantidade'); if(qty<=0||qty>10000) fail('Indique uma quantidade positiva.');
        return {name:rate.name,qty,unit:rate.price,value:Math.round(qty*rate.price*100)/100};
      });
      const items=[...(existing?.items ?? []), ...additions];
      const total=Math.round(items.reduce((sum,line)=>sum+line.value,0)*100)/100;
      if(action==='activity'){
        if(!['Pendente','Concluída'].includes(p.status)) fail('Seleccione o estado.');
        target={id:crypto.randomUUID(),container:container.number,containerId:container.id,client:container.client,date:dateField(p.date),items,total,status:p.status};
        state.activities.unshift(target);message='Actividade do contentor registada.';break;
      }
      if(existing){
        target=existing;
        Object.assign(target,{items,total});
        for(const [kind,title] of [['FO','Folha de Obra actualizada'],['COT','Cotação actualizada']]) document(state,kind,{containerId:container.id,client:container.client,title,details:{...target.form,Contentor:container.number,Condição:target.condition,Operador:target.operator},items,total,customer:kind==='COT'},now,actor);
        message='Trabalhos adicionados à obra.'; break;
      }
      target={id:crypto.randomUUID(),containerId:container.id,container:container.number,client:container.client,condition:requireText(p.condition,'a condição observada',1200),materials:text(p.materials,1000),operator:requireText(p.operator,'o operador'),items,total,stage:'Atribuída',before:photoList(p.photos,checkPhoto),at:now};
      state.jobs.unshift(target);
      target.form={...formDetails('FO',p),'Data de entrada':dayKey(new Date(container.enteredAt))};
      const details={...target.form,Contentor:container.number,Condição:target.condition,Materiais:target.materials,Operador:target.operator};
      document(state,'FO',{containerId:container.id,client:container.client,title:'Folha de Obra',details,items,total,photos:target.before},now,actor);
      document(state,'COT',{containerId:container.id,client:container.client,title:'Cotação de serviço',details:{Contentor:container.number},items,total,customer:true},now,actor);
      message='Obra atribuída e cotação emitida.'; break;
    }
    case 'advance': {
      target=find(state.jobs,p.id,'Obra');
      if(target.stage==='Concluída') fail('A obra já está concluída.',409);
      if(target.stage==='Atribuída') {target.stage='Em execução';target.startedAt=now;message='Obra iniciada.';break;}
      target.completed={worked:requireText(p.worked,'o trabalho executado',1200),equipment:text(p.equipment),staff:text(p.staff),photos:photoList(p.photos,checkPhoto)};
      target.stage='Concluída';target.completedAt=now;
      const details={...formDetails('FS',p),Contentor:target.container,Trabalho:target.completed.worked,Equipamento:target.completed.equipment,Pessoal:target.completed.staff};
      document(state,'FS',{containerId:target.containerId,client:target.client,title:'Folha de Serviço',details,items:target.items,total:target.total,photos:target.completed.photos},now,actor);
      document(state,'PF',{containerId:target.containerId,client:target.client,title:'Pré-factura',details:{Contentor:target.container},items:target.items,total:target.total},now,actor);
      message='Obra concluída e Folha de Serviço emitida.'; break;
    }
    case 'document': {
      target=document(state,'GS',{title:'Guia de Saída de armazém',client:requireText(p.client,'o cliente'),details:{...formDetails('GS',p),Carga:requireText(p.cargo,'a carga',1200),Volumes:number(p.volume,'os volumes',{whole:true}),Matrícula:requireText(p.truck,'a matrícula'),Motorista:requireText(p.driver,'o motorista'),Autorização:requireText(p.authorization,'a autorização')}},now,actor);
      message='Guia de Saída emitida.'; break;
    }
    case 'share': {
      const container=find(state.containers,p.containerId,'Contentor');
      target={id:crypto.randomUUID(),containerId:container.id,expires:new Date(Date.parse(now)+7*86400000).toISOString()};
      state.links.unshift(target); message='Link do cliente criado.'; break;
    }
    case 'revoke': {
      target=find(state.links,p.id,'Link'); target.revokedAt=now; message='Link revogado.'; break;
    }
    case 'tariff': {
      const name=requireText(p.name,'o serviço');
      const price=number(p.price,'a tarifa');
      for(const rate of state.tariffs) if(rate.name.toLowerCase()===name.toLowerCase()) rate.active=false;
      target={id:crypto.randomUUID(),name,price,active:true,date:today}; state.tariffs.unshift(target); message='Nova tarifa registada.'; break;
    }
    case 'daily': {
      const date=dateField(p.date), client=requireText(p.client,'o cliente');
      const existing=state.daily.find(r=>r.date===date&&r.client.toLowerCase()===client.toLowerCase());
      const values={};
      for(const key of ['handling','reconditioned','interventions','repaired','hours','timed','moves','billed']) values[key]=number(p[key],key,{whole:key!=='hours',optional:true});
      if(values.billed!==null&&(values.moves===null||values.billed>values.moves)) fail('Os movimentos facturados devem ser iguais ou inferiores ao total da grua.');
      target={id:existing?.id??crypto.randomUUID(),date,client,...values,reference:text(p.reference,800)};
      if(existing) Object.assign(existing,target); else state.daily.unshift(target);
      message='Actividade diária guardada.'; break;
    }
    case 'fuel': {
      const date=dateField(p.date), equipment=requireText(p.equipment,'o equipamento');
      const existing=state.fuel.find(r=>r.date===date&&r.equipment.toLowerCase()===equipment.toLowerCase());
      const values={}; for(const key of ['running','available','litres','cost']) values[key]=number(p[key],key,{optional:true});
      if(values.running!==null&&values.available!==null&&values.running>values.available) fail('As horas de operação excedem as horas disponíveis.');
      target={id:existing?.id??crypto.randomUUID(),date,equipment,...values};
      if(existing) Object.assign(existing,target); else state.fuel.unshift(target);
      message='Registo da grua guardado.'; break;
    }
  }
  state.audit.unshift({id:crypto.randomUUID(),action,subject:target.number??target.container??target.client??target.name??target.equipment??target.id,actor:actor.email,at:now,message});
  return { id:target.id,message };
}

export function portalView(state,id,now=new Date().toISOString()) {
  const link=state.links.find(r=>r.id===id && !r.revokedAt && r.expires>now);
  if(!link) return null;
  const c=state.containers.find(r=>r.id===link.containerId);
  if(!c) return null;
  return {number:c.number,client:c.client,park:c.park,area:c.area,enteredAt:c.enteredAt,exitedAt:c.exitedAt,
    photos:[...new Set([...c.entry.photos,...(c.exit?.photos??[])])],
    documents:state.documents.filter(d=>d.containerId===c.id&&(d.kind.startsWith('EIR')||d.customer===true)).map(d=>({id:d.id,number:d.number,title:d.title,at:d.at}))};
}
