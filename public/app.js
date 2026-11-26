import {forms,upgrade,areas,roles,allowed,stayDays,dayKey,change,portalView} from './domain.js';
import {demoState} from './demo.js';

const root=document.querySelector('#app'), dialog=document.querySelector('#dialog'), notice=document.querySelector('#notice');
const dateFormat=new Intl.DateTimeFormat('pt-MZ',{timeZone:'Africa/Maputo',dateStyle:'medium',timeStyle:'short'});
const integer=new Intl.NumberFormat('pt-MZ'), decimal=new Intl.NumberFormat('pt-MZ',{maximumFractionDigits:1});
const money=new Intl.NumberFormat('pt-MZ',{style:'currency',currency:'MZN'});
const esc=value=>String(value??'').replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
const fmtDate=value=>value?dateFormat.format(new Date(value)):'—';
const clockFormat=new Intl.DateTimeFormat('pt-MZ',{timeZone:'Africa/Maputo',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
const dateLongFormat=new Intl.DateTimeFormat('pt-MZ',{timeZone:'Africa/Maputo',day:'numeric',month:'long',year:'numeric'});
const fmtClock=()=>clockFormat.format(new Date());
const fmtNumber=value=>value===null||value===undefined?'—':integer.format(value);
const fmtPct=value=>value===null?'—':`${decimal.format(value*100)}%`;
const fmtHours=value=>value===null?'—':`${decimal.format(value)} h`;
const fmtMoney=value=>value===null?'—':money.format(value);
const field=(label,name,type='text',opts={})=>`<label>${label}<input name="${name}" type="${type}" ${opts.required?'required':''} ${opts.extra??''} value="${esc(opts.value??'')}"></label>`;
const select=(label,name,choices,{selected='',required=true,placeholder='Seleccione'}={})=>`<label>${label}<select name="${name}" ${required?'required':''}><option value="">${placeholder}</option>${choices.map(raw=>{const [value,text]=Array.isArray(raw)?raw:[raw,raw];return `<option value="${esc(value)}" ${String(value)===String(selected)?'selected':''}>${esc(text)}</option>`;}).join('')}</select></label>`;
const textarea=(label,name,required=false,value='')=>`<label class="full">${label}<textarea name="${name}" rows="3" ${required?'required':''}>${esc(value)}</textarea></label>`;
const photos=label=>`<label class="full">${label}<input type="file" name="photos" accept="image/jpeg,image/png,image/webp" multiple><small>Até 5 fotografias, 1,5 MB por ficheiro.</small></label>`;
const button=(label,action,id='',variant='secondary')=>`<button class="${variant}" data-act="${action}" ${id?`data-id="${esc(id)}"`:''}>${label}</button>`;
const chip=(label,style='neutral')=>`<span class="chip ${style}">${esc(label)}</span>`;
const dateField=(label='Data',name='date',value=dayKey())=>field(label,name,'date',{required:true,value});
const page=(title,subtitle,action='')=>`<div class="page-title"><div><h1>${title}</h1><p>${subtitle}</p></div>${action}</div>`;
const empty=(message='Sem registos para a selecção.')=>`<p class="empty">${message}</p>`;
const table=(head,rows)=>rows.length?`<div class="table-scroll"><table><thead><tr>${head.map(h=>`<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(value=>`<td>${value}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`:empty();
const pages=[['painel','Painel','◫'],['parque','Parques','▦'],['portaria','Portaria','⇄'],['releases','Releases','▤'],['obras','Obras e serviços','◇'],['actividades','Actividade por contentor','◎'],['diario','Registo diário','≡'],['fo','Folha de Obra','◇'],['fs','Folha de Serviço','◇'],['eir','EIR','◇'],['documentos','Documentos','▧'],['clientes','Links de clientes','◎'],['tv','Ecrã TV','▣'],['gestao','Gestão','⚙']];
const category={Validado:'good',Pendente:'warn',Expirado:'danger',Recusado:'danger',Atribuída:'warn','Em execução':'info',Concluída:'good'};
let user=null, data=null, demo=false, local=false, view='painel', currentDialog=null, portalToken='';
let filters={month:dayKey().slice(0,7),client:'',search:'',park:'',area:'',status:'active',doc:'',size:''};
let previewAssets=new Map(), alertTimer;
const demoUser={name:'Equipa Mozrail',email:'demo@example.invalid',role:'admin'};
function flash(message,error=false) {
  notice.textContent=message;notice.classList.toggle('bad',error);notice.classList.add('visible');clearTimeout(alertTimer);
  alertTimer=setTimeout(()=>notice.classList.remove('visible'),4200);
}
async function api(path,body) {
  const response=await fetch(path,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(!response.headers.get('content-type')?.includes('application/json')) throw Error('O servidor está indisponível.');
  const payload=await response.json(); if(!response.ok) throw Error(payload.error??'O pedido falhou.'); return payload;
}
async function hydrate() {
  if(local) {
    if(!data) { try {data=JSON.parse(localStorage.getItem('mozrail-demo-v1'));} catch {/* demo storage unavailable */} }
    data=upgrade(data??demoState());
  } else data=await api('/api/data');
}
async function mutate(action,payload) {
  if(local) {
    const copy=structuredClone(data);
    const result=change(copy,action,payload,user,{checkPhoto:id=>previewAssets.has(id)});
    data=copy; try{localStorage.setItem('mozrail-demo-v1',JSON.stringify(copy));}catch{/* privacy mode */}
    return result;
  }
  const result=await api('/api/change',{action,payload}); await hydrate(); return result;
}
const can=action=>allowed(user?.role,action);
const inYard=()=>data.containers.filter(c=>!c.exitedAt);
const clients=()=>[...new Set([...data.containers,...data.daily,...data.releases].map(row=>row.client))].sort((a,b)=>a.localeCompare(b,'pt'));
const sum=(rows,key)=>rows.some(r=>typeof r[key]==='number')?rows.reduce((n,r)=>n+(r[key]??0),0):null;
function both(rows,a,b) {
  const relevant=rows.filter(r=>r[a]!==null||r[b]!==null);
  if(!relevant.length||relevant.some(r=>r[a]===null||r[b]===null))return null;
  return [sum(relevant,a),sum(relevant,b)];
}
function totals(rows) {
  const m=sum(rows,'moves');
  const complete=rows.every(r=>r.moves===null||r.moves===0||typeof r.billed==='number');
  const b=complete&&m!==null?(sum(rows,'billed')??0):null;
  return {m,b,unbilled:b===null?null:m-b,rate:b!==null&&m>0?b/m:null,pending:rows.filter(r=>r.moves>0&&r.billed===null).length};
}
function login() {
  const emailOptions=demo?{value:demoUser.email,extra:'readonly'}:{required:true,extra:'autocomplete="username"'};
  const passwordOptions=demo?{value:'demonstracao',extra:'readonly'}:{required:true,extra:'autocomplete="current-password"'};
  root.innerHTML=`<section class="sign-in"><div class="sign-photo"><div class="glow"></div><div class="rail-scan"></div><div class="sign-caption"><h1>Mozrail &amp;<br>Terminais, SA</h1></div></div><div class="sign-form"><div class="sign-box"><img class="sign-logo" src="/logo.png" alt="Mozrail"><h2>Iniciar sessão</h2><p>Aceda às operações do terminal.</p><form id="login-form">${field('E-mail','email','email',emailOptions)}<div class="pass-field">${field('Palavra-passe','password','password',passwordOptions)}${button('Mostrar','show-pass')}</div><p class="form-error" role="alert"></p><button class="primary wide" type="submit">${demo?'Abrir demonstração':'Entrar'}</button></form>${demo?'<p class="quiet">A demonstração utiliza dados fictícios.</p>':''}</div></div></section>`;
  root.setAttribute('aria-busy','false');
}
function side() {
  return `<aside class="sidebar" id="sidebar"><a class="brand" href="#painel" aria-label="Painel Mozrail"><img src="/logo.png" alt="Mozrail"></a><nav aria-label="Menu principal">${pages.filter(([key])=>key!=='gestao'||user.role==='admin'||can('tariff')).map(([key,label,mark])=>`<a class="nav-link ${key===view?'active':''}" href="#${key}" ${key===view?'aria-current="page"':''}><span aria-hidden="true">${mark}</span>${label}</a>`).join('')}</nav><div class="side-user"><span class="avatar">${esc(user.name.split(' ').slice(0,2).map(s=>s[0]).join(''))}</span><div><b>${esc(user.name)}</b><small>${roles[user.role]}</small></div>${button('Sair','logout','','exit-btn')}</div></aside>`;
}
const metric=(name,value,label,accent='')=>`<article class="metric ${accent}"><span>${name}</span><strong>${value}</strong><small>${label}</small></article>`;
const reportFilters=()=>`<div class="filters report-filters"><label>Mês<input type="month" value="${esc(filters.month)}" data-filter="month"></label><label>Cliente<select data-filter="client"><option value="">Todos os clientes</option>${clients().map(c=>`<option ${c===filters.client?'selected':''}>${esc(c)}</option>`).join('')}</select></label></div>`;
function chartCanvas(points) {
  requestAnimationFrame(()=>{
    const canvas=document.querySelector('#movements-chart'); if(!canvas)return;
    const rect=canvas.getBoundingClientRect(), scale=window.devicePixelRatio||1, w=Math.max(260,rect.width), h=205;
    canvas.width=w*scale;canvas.height=h*scale;
    const ctx=canvas.getContext('2d');ctx.scale(scale,scale);ctx.font='11px system-ui';
    const W=w-52,H=h-39, max=Math.max(4,...points.map(p=>p.moves??0)), step=Math.ceil(max/4), top=step*4;
    for(let i=0;i<=4;i++){const y=10+i*H/4;ctx.strokeStyle='#ece9ed';ctx.beginPath();ctx.moveTo(35,y);ctx.lineTo(w-12,y);ctx.stroke();ctx.fillStyle='#686470';ctx.fillText(String(top-i*step),3,y+4);}
    const spacing=W/Math.max(1,points.length); const bw=Math.max(3,Math.min(18,spacing*.58));
    points.forEach((p,i)=>{const x=38+(i+.5)*spacing-bw/2, base=10+H;
      if(p.moves!==null){const total=p.moves/top*H,b=(p.billed??0)/top*H;ctx.fillStyle=p.billed===null?'#c0b9c1':'#ead3da';ctx.fillRect(x,base-total,bw,total);if(p.billed!==null){ctx.fillStyle='#bd1c38';ctx.fillRect(x,base-b,bw,b);}}
      if(points.length<=13||i%3===0||i===points.length-1){ctx.fillStyle='#686470';ctx.fillText(p.date.slice(-2),x,base+19);}
    });
  });
}
function dashboard() {
  const yard=inYard(), today=dayKey(), selected=data.daily.filter(r=>r.date.startsWith(filters.month)&&(!filters.client||r.client===filters.client));
  const fuel=data.fuel.filter(r=>r.date.startsWith(filters.month));
  const totalsMonth=totals(selected), utilization=both(fuel,'running','available'), productivity=both(selected,'hours','timed');
  const distinct=[...new Set(selected.map(r=>r.date))].sort();
  const points=distinct.map(date=>{const values=totals(selected.filter(r=>r.date===date));return {date,moves:values.m,billed:values.b};});
  chartCanvas(points);
  const pending=data.releases.filter(r=>r.status==='Pendente'&&r.validUntil>=today).length, open=data.jobs.filter(j=>j.stage!=='Concluída').length;
  const longest=yard.length?Math.max(...yard.map(x=>stayDays(x.enteredAt))):0;
  return `${page('Painel de operações','Acompanhamento do terminal e dos movimentos da grua.',can('entry')?button('Nova entrada','entry','','primary'):'')}
  <div class="metrics top-metrics">${metric('Em parque',yard.length,'Contentores actualmente no terminal','highlight')}${metric('Entradas hoje',data.containers.filter(r=>dayKey(new Date(r.enteredAt))===today).length,'EIR de entrada')}${metric('Obras abertas',open,'Atribuídas ou em execução')}${metric('Releases pendentes',pending,'Aguardam conferência')}</div>
  <section class="panel overview"><div class="panel-title"><div><h2>Actividade do mês</h2><p>Totais do Registo Diário</p></div>${reportFilters()}</div>
  <div class="dashboard-grid"><div><div class="chart-title"><h3>Movimentos da grua</h3><div class="legend"><span class="dot red"></span>Facturados <span class="dot pink"></span>Não facturados</div></div>${points.length?'<canvas id="movements-chart" aria-label="Gráfico de movimentos por dia" role="img"></canvas>':empty('Sem actividade registada para este mês.')}</div>
  <div class="dark-stats"><div><span>Movimentos da grua</span><strong>${fmtNumber(totalsMonth.m)}</strong></div><div><span>Facturados</span><strong>${fmtNumber(totalsMonth.b)}</strong><small>${fmtPct(totalsMonth.rate)} do total</small></div><div><span>Não facturados</span><strong>${fmtNumber(totalsMonth.unbilled)}</strong><small>${fmtPct(totalsMonth.rate===null?null:1-totalsMonth.rate)} do total</small></div>${totalsMonth.pending?`<p>${totalsMonth.pending} registo(s) por conferir.</p>`:''}</div></div></section>
  <div class="metrics lower-metrics">${metric('Recondicionados',fmtNumber(sum(selected,'reconditioned')),'No mês seleccionado')}${metric('Média de trabalho',fmtHours(productivity&&productivity[1]>0?productivity[0]/productivity[1]:null),'Por trabalho cronometrado')}${metric('Utilização da grua',fmtPct(utilization&&utilization[1]>0?utilization[0]/utilization[1]:null),'Horas de operação / disponíveis')}${metric('Consumo de diesel',fmtNumber(sum(fuel,'litres')),sum(fuel,'cost')===null?'Litros · total da grua':`${fmtMoney(sum(fuel,'cost'))} · total da grua`)}</div>
  <section class="panel"><div class="panel-title"><h2>Ocupação por área</h2><a href="#parque">Ver parques</a></div><div class="areas compact">${areas.map((a,i)=>`<article><div><span>Área ${i+1}</span><strong>${yard.filter(c=>c.area===i+1).length}</strong></div><p>${a}</p></article>`).join('')}</div><p class="quiet">Maior estadia em parque: ${longest} dia(s).</p></section>`;
}
const filterInput=(label,key,value,placeholder='')=>`<label>${label}<input type="search" data-filter="${key}" value="${esc(value)}" placeholder="${placeholder}"></label>`;
const filterSelect=(label,key,choices)=>`<label>${label}<select data-filter="${key}">${choices.map(([value,label])=>`<option value="${value}" ${filters[key]===value?'selected':''}>${label}</option>`).join('')}</select></label>`;
function park() {
  const yard=inYard(), term=filters.search.toLowerCase().trim();
  const list=data.containers.filter(c=>(filters.status==='all'||(filters.status==='active'&&!c.exitedAt)||(filters.status==='past'&&c.exitedAt))&&(!term||`${c.number} ${c.client}`.toLowerCase().includes(term))&&(!filters.park||c.park===filters.park)&&(!filters.area||c.area===Number(filters.area))&&(!filters.size||c.size===filters.size));
  return `${page('Parques e contentores','Localize cada contentor e consulte a sua estadia.',can('entry')?button('Nova entrada','entry','','primary'):'')}
  <div class="areas park-areas">${areas.map((a,i)=>`<article><div><span>Área ${i+1}</span><strong>${yard.filter(c=>c.area===i+1).length}</strong></div><p>${a}</p><small>Parque A ${yard.filter(c=>c.area===i+1&&c.park==='A').length} · Parque B ${yard.filter(c=>c.area===i+1&&c.park==='B').length}</small></article>`).join('')}</div>
  <section class="panel"><div class="panel-title"><h2>Lista de contentores</h2></div><div class="filters">${filterInput('Pesquisar','search',filters.search,'N.º do contentor ou cliente')}${filterSelect('Estado','status',[['active','No terminal'],['past','Saíram'],['all','Todos']])}${filterSelect('Parque','park',[['','Todos'],['A','Parque A'],['B','Parque B']])}${filterSelect('Área','area',[['','Todas'],...areas.map((_,i)=>[String(i+1),`Área ${i+1}`])])}${filterSelect('Tamanho','size',[['','Todos'],['20','20 pés'],['40','40 pés']])}</div>${containerTable(list)}</section>`;
}
function containerTable(list) {
  return table(['Contentor','Cliente','Localização','Entrada','Estadia',''],list.map(c=>[`<b>${esc(c.number)}</b><small>${esc(c.size)} pés · ${esc(c.type)}</small>`,esc(c.client),c.exitedAt?chip('Saiu'):chip(`Parque ${c.park} · Área ${c.area}`,'info'),fmtDate(c.enteredAt),`${stayDays(c.enteredAt,c.exitedAt??new Date())} d`,button('Detalhes','container',c.id)]));
}
function gate() {
  const today=dayKey();
  return `${page('Portaria','Registe entradas e saídas e consulte o EIR.',can('entry')?button('Nova entrada','entry','','primary'):'')}
  <section class="panel"><div class="panel-title"><h2>Movimentos do dia</h2><a href="#releases">Conferir release</a></div>${table(['Hora','Contentor','Cliente','Movimento','Documento'],data.documents.filter(d=>d.kind.startsWith('EIR')&&dayKey(new Date(d.at))===today).map(d=>[fmtDate(d.at),esc(d.details.Contentor),esc(d.client),chip(d.kind==='EIR-E'?'Entrada':'Saída',d.kind==='EIR-E'?'good':'info'),button(esc(d.number),'doc',d.id)]))}</section><section class="panel"><div class="panel-title"><h2>Contentores disponíveis para saída</h2></div>${containerTable(inYard())}</section>`;
}
function releases() {
  const term=filters.search.toLowerCase().trim(), today=dayKey();
  const releaseStatus=r=>r.usedAt?'Utilizado':r.validUntil<today?'Expirado':r.status;
  const rows=data.releases.filter(r=>!term||`${r.number} ${r.container} ${r.client}`.toLowerCase().includes(term));
  return `${page('Releases de vazios','Registe a autorização e confira os dados na portaria.',can('release')?button('Novo release','release','','primary'):'')}
  <section class="panel"><div class="filters">${filterInput('Pesquisar','search',filters.search,'N.º do release, contentor ou cliente')}</div>${table(['Release','Contentor','Cliente','Validade','Estado',''],rows.map(r=>[`<b>${esc(r.number)}</b>`,esc(r.container),esc(r.client),esc(r.validUntil),chip(releaseStatus(r),category[releaseStatus(r)]),button('Conferir','release-detail',r.id)]))}</section>`;
}
function jobs() {
  const stages=['Atribuída','Em execução','Concluída'];
  return `${page('Obras e serviços','Da condição observada à Folha de Serviço.',can('work')?button('Nova Folha de Obra','work','','primary'):'')}
  <div class="board">${stages.map(s=>`<section class="panel stage"><div class="panel-title"><h2>${s}</h2>${chip(data.jobs.filter(j=>j.stage===s).length,category[s])}</div>${data.jobs.filter(j=>j.stage===s).map(j=>`<article class="job"><small>${esc(j.client)}</small><h3>${esc(j.container)}</h3><p>${esc(j.condition)}</p><ul>${j.items.map(item=>`<li>${esc(item.name)}</li>`).join('')}</ul><div class="job-footer"><span>${esc(j.operator)}</span>${button('Abrir','job',j.id)}</div></article>`).join('')||empty('Sem obras nesta fase.')}</section>`).join('')}</div>`;
}
function daily() {
  const range=data.daily.filter(r=>r.date.startsWith(filters.month)&&(!filters.client||r.client===filters.client)).sort((a,b)=>b.date.localeCompare(a.date));
  const fuels=data.fuel.filter(r=>r.date.startsWith(filters.month)).sort((a,b)=>b.date.localeCompare(a.date));
  return `${page('Registo diário','Lance as quantidades por data e cliente. Registe o consumo da grua por equipamento.',can('daily')?button('Novo registo diário','daily','','primary'):'')}
  <section class="panel"><div class="panel-title"><h2>Actividade por cliente</h2>${reportFilters()}</div>${table(['Data','Cliente','Manus.','Recond.','Interv.','Repar.','Horas','Grua','Fact.','Não fact.','% fact.',''],range.map(r=>{const t=totals([r]);return [esc(r.date),`<b>${esc(r.client)}</b>`,fmtNumber(r.handling),fmtNumber(r.reconditioned),fmtNumber(r.interventions),fmtNumber(r.repaired),fmtHours(r.hours),fmtNumber(r.moves),fmtNumber(r.billed),fmtNumber(t.unbilled),fmtPct(t.rate),can('daily')?button('Editar','daily',r.id):''];}))}</section>
  <section class="panel"><div class="panel-title"><h2>Grua e diesel</h2>${can('fuel')?button('Registar consumo','fuel'):''}</div>${table(['Data','Equipamento','Em operação','Disponíveis','Diesel (L)','Custo','Utilização',''],fuels.map(r=>[esc(r.date),esc(r.equipment),fmtHours(r.running),fmtHours(r.available),fmtNumber(r.litres),fmtMoney(r.cost),fmtPct(r.running!==null&&r.available>0?r.running/r.available:null),can('fuel')?button('Editar','fuel',r.id):'']))}</section>`;
}
function documents(kind) {
  const term=filters.search.toLowerCase().trim(), items=data.documents.filter(d=>(kind?d.kind.startsWith(kind):(!filters.doc||d.kind===filters.doc))&&(!term||`${d.number} ${d.client} ${d.details.Contentor??''}`.toLowerCase().includes(term)));
  return `${page(({FO:'Folha de Obra',FS:'Folha de Serviço',EIR:'EIR'})[kind]||'Documentos','Emita, consulte e imprima os documentos do terminal.',can('document')?button('Emitir Guia de Saída','document','','primary'):'')}
  <section class="panel"><div class="filters">${filterInput('Pesquisar','search',filters.search,'N.º, cliente ou contentor')}${kind?'':filterSelect('Tipo','doc',[['','Todos'],['EIR-E','EIR de entrada'],['EIR-S','EIR de saída'],['GS','Guia de Saída'],['FO','Folha de Obra'],['FS','Folha de Serviço'],['COT','Cotação'],['PF','Pré-factura']])}</div>${table(['N.º do documento','Tipo','Cliente','Emissão','Total',''],items.map(d=>[`<b>${esc(d.number)}</b>`,esc(d.title),esc(d.client),fmtDate(d.at),fmtMoney(d.total??null),button('Abrir','doc',d.id)]))}</section>`;
}
const linkUrl=id=>{const url=new URL(location.href);url.hash=`consulta/${id}`;return url.href;};
function customerLinks() {
  return `${page('Links de clientes','Crie um endereço de consulta temporária associado a um contentor.',can('share')?button('Criar link','share','','primary'):'')}
  <section class="panel">${table(['Contentor','Cliente','Validade','Estado',''],data.links.map(link=>{const c=data.containers.find(x=>x.id===link.containerId);const active=!link.revokedAt&&link.expires>new Date().toISOString();return [esc(c?.number),esc(c?.client),fmtDate(link.expires),chip(active?'Activo':link.revokedAt?'Revogado':'Expirado',active?'good':'neutral'),active?`${button('Copiar link','copy-link',link.id)} ${can('revoke')?button('Revogar','revoke',link.id,'quiet-btn'):''}`:''];}))}</section>`;
}
function tv() {
  const yard=inYard(), open=data.jobs.filter(j=>j.stage!=='Concluída');
  return `<div class="tv">${page('Operações em tempo real','Parques e tarefas do terminal.',button('Ecrã inteiro','fullscreen','','secondary'))}<div class="metrics top-metrics">${metric('No terminal',yard.length,'Contentores')}${metric('Obras abertas',open.length,'Tarefas em fila')}${metric('Releases pendentes',data.releases.filter(r=>r.status==='Pendente'&&r.validUntil>=dayKey()).length,'Conferência na portaria')}${metric('Saídas hoje',data.containers.filter(c=>c.exitedAt&&dayKey(new Date(c.exitedAt))===dayKey()).length,'Movimentos')}</div><section class="panel"><div class="panel-title"><h2>Tarefas abertas</h2><span class="live"><span class="dot red"></span> Actualização a cada 15 s</span></div>${table(['Equipa','Contentor','Condição','Estado'],open.map(j=>[esc(j.operator),`<b>${esc(j.container)}</b>`,esc(j.condition),chip(j.stage,category[j.stage])]))}</section><section class="panel"><div class="panel-title"><h2>Ocupação por área</h2></div><div class="areas">${areas.map((a,i)=>`<article><div><span>Área ${i+1}</span><strong>${yard.filter(c=>c.area===i+1).length}</strong></div><p>${a}</p></article>`).join('')}</div></section></div>`;
}
function settings() {
  return `${page('Gestão','Tarifas, perfis e histórico de actividade.',user.role==='admin'?button('Utilizadores','users','','primary'):'')}
  <section class="panel"><div class="panel-title"><div><h2>Catálogo de serviços</h2><p>Tarifas de 2026 em meticais por contentor.</p></div>${can('tariff')?button('Registar tarifa','tariff'):''}</div>${table(['Serviço','Tarifa','Data','Estado'],data.tariffs.map(r=>[`<b>${esc(r.name)}</b>`,fmtMoney(r.price),esc(r.date),chip(r.active?'Activa':'Inactiva',r.active?'good':'neutral')]))}</section>
  <section class="panel"><div class="panel-title"><h2>Histórico de actividade</h2></div>${table(['Data e hora','Utilizador','Referência','Alteração'],data.audit.slice(0,100).map(r=>[fmtDate(r.at),esc(r.actor),esc(r.subject),esc(r.message)]))}</section>`;
}
function activities(){
  const rows=data.activities.filter(r=>r.date.startsWith(filters.month)&&(!filters.client||filters.client===r.client)).sort((a,b)=>b.date.localeCompare(a.date));
  return page('Actividade por contentor','Serviços e custos diários por contentor.',can('activity')?button('Registar actividade','activity','','primary'):'')+
    '<section class="panel">'+reportFilters()+table(['Data','Contentor','Cliente','Serviços','Total','Estado',''],rows.map(r=>[esc(r.date),esc(r.container),esc(r.client),r.items.map(i=>esc(i.name)+' × '+decimal.format(i.qty)).join('<br>'),fmtMoney(r.total),chip(r.status,r.status==='Concluída'?'good':'warn'),can('finishActivity')&&r.status==='Pendente'?button('Concluir','finishActivity',r.id):'']))+'</section>';
}
const views={fo:()=>documents('FO'),fs:()=>documents('FS'),eir:()=>documents('EIR'),actividades:activities,painel:dashboard,parque:park,portaria:gate,releases,obras:jobs,diario:daily,documentos:documents,clientes:customerLinks,tv,gestao:settings};
function render() {
  if(!user){login();return;}
  if(!data)return;
  const title=pages.find(([key])=>key===view)?.[1]??'Painel';
  root.innerHTML=`<div class="layout">${side()}<div class="work"><header class="topbar">${button('Menu','menu','','menu-btn')}<span>Terminal <span class="slash">/</span> <b>${title}</b></span><div>${demo?chip('Demonstração','warn'):''}<span class="today">${esc(dateLongFormat.format(new Date()))}</span><span class="live-clock" id="live-clock" aria-label="Hora actual em Maputo">${fmtClock()}</span></div></header><div class="content">${(views[view]??dashboard)()}</div></div></div>`;
  root.setAttribute('aria-busy','false');
}

const containerOptions=(yard=true)=>(yard?inYard():data.containers).map(c=>[c.id,`${c.number} · ${c.client}`]);
const sizeChoices=[['20','20 pés'],['40','40 pés']];
const place=()=>select('Parque','park',[['A','Parque A'],['B','Parque B']])+select('Área','area',areas.map((a,i)=>[i+1,`Área ${i+1} · ${a}`]));
const clientField=(value='')=>`${field('Cliente','client','text',{required:true,value,extra:'list="client-options" autocomplete="off"'})}<datalist id="client-options">${clients().map(c=>`<option value="${esc(c)}"></option>`).join('')}</datalist>`;
const formFields=kind=>forms[kind].map(label=>{
  if(label==='Inspecção e trabalhos previstos'){
    const tasks=['Piso · tábuas partidas ou podres','Piso · parafusos soltos ou em falta','Painéis · furos, fissuras ou rasgos','Estrutura · ferrugem ou amassados','Máscara de letras','Recondicionamento total','Lavagem','Troca de borracha','Porta · alinhamento e dobradiças','Outro'];
    return '<fieldset class="full"><legend>'+label+'</legend>'+tasks.map(task=>`<label class="task-check"><input type="checkbox" name="inspection" value="${esc(task)}">${esc(task)}</label>`).join('')+'</fieldset>';
  }
  const lists={'Prioridade':['Normal','Alta','Urgente'],'Camião':['Com carga','Sem carga'],'Área de operação':['Armazém ambiente','Armazém frigorífico','Contentores','Granel','Peletizado/ensacado']};
  if(lists[label])return select(label,label,lists[label],{required:false});
  if(label==='Códigos e localização dos danos')return textarea(label+' (1 risco, 2 corte, 3 rasgo, 4 buraco, 5 perfurado, 6 partido, 7 dobrado, 8 rasgado, 9 em falta)',label);
  return field(label,label,label==='Data prevista de saída'?'date':label.endsWith('da operação')?'datetime-local':'text');
}).join('');
const transit=()=>field('Matrícula','truck','text',{required:true})+field('Motorista','driver','text',{required:true})+field('Transportadora','carrier','text',{required:true})+textarea('Condição e danos','condition')+formFields('EIR')+photos('Fotografias');
const numField=(label,key,record,step='1')=>field(label,key,'number',{value:record?.[key]??'',extra:`min="0" step="${step}"`});
function modal(title,contents,{large=false,document=false}={}) {
  currentDialog=null;
  dialog.classList.toggle('large',large);dialog.classList.toggle('printable',document);
  dialog.innerHTML=`<div class="dialog-head"><h2 id="dialog-title">${title}</h2>${button('Fechar','close','','quiet-btn')}</div><div class="dialog-body">${contents}</div>`;
  if(!dialog.open)dialog.showModal();
}
function actionForm(title,action,bodyFields,extra={}) {
  modal(title,`<form id="action-form"><div class="form-grid">${bodyFields}</div><p class="form-error" role="alert"></p><div class="form-actions">${button('Cancelar','close','','secondary')}<button class="primary" type="submit">${extra.label??'Guardar'}</button></div></form>`);
  currentDialog={action,fixed:extra.fixed??{}};
}
function docContent(d) {
  const reference=new URL(location.href);reference.hash=`verificar/${d.id}`;
  const code=reference.href;
  return `<article class="paper"><header><img src="/logo.png" alt="Mozrail"><div><strong>${esc(d.number)}</strong><small>${fmtDate(d.at)}</small></div></header><h2>${esc(d.title)}</h2><p>${esc(d.client??'')}</p><dl class="details">${Object.entries(d.details??{}).map(([k,v])=>`<div><dt>${esc(k)}</dt><dd>${esc(v??'—')}</dd></div>`).join('')}</dl>${d.kind.startsWith('EIR')?'<figure class="damage-figure"><img src="/eir.webp" alt="Duas vistas exteriores do contentor e vista interior pelas portas"><figcaption>1 Risco · 2 Corte · 3 Rasgo · 4 Buraco · 5 Perfurado · 6 Partido · 7 Dobrado · 8 Rasgado · 9 Em falta</figcaption></figure>':''}${d.items?.length?`${table(['Trabalho','Qtd.','Unitário','Valor'],d.items.map(x=>[esc(x.name),decimal.format(x.qty),fmtMoney(x.unit),fmtMoney(x.value)]))}<p class="doc-total">Total <b>${fmtMoney(d.total)}</b></p>`:''}${({FO:'Supervisor · Data',FS:'Supervisor · Cliente · Facturação',GS:'Recebi / Mozrail　　　　 Entreguei / Cliente　　　　 Visto / Segurança','EIR-E':'Condutor / operador　　　 Segurança / inspector　　　 Carimbo','EIR-S':'Condutor / operador　　　 Segurança / inspector　　　 Carimbo'})[d.kind]?`<p class="signature">${({FO:'Supervisor · Data',FS:'Supervisor · Cliente · Facturação',GS:'Recebi / Mozrail　　　　 Entreguei / Cliente　　　　 Visto / Segurança','EIR-E':'Condutor / operador　　　 Segurança / inspector　　　 Carimbo','EIR-S':'Condutor / operador　　　 Segurança / inspector　　　 Carimbo'})[d.kind]}</p>`:''}<footer><a href="${esc(code)}" target="_blank" rel="noopener">Verificar ${esc(d.number)}</a>${!local?`<img class="doc-qr" src="/api/qr/${esc(d.id)}" alt="QR de verificação" width="90" height="90">`:''}</footer></article>`;
}
const photoView=(ids,token='')=>ids?.length?`<div class="photos">${ids.map(id=>{const src=local?(previewAssets.get(id)??''):token?`/api/portal/${token}/photo/${id}`:`/api/photos/${id}`;return src?`<a href="${esc(src)}" target="_blank" rel="noopener"><img src="${esc(src)}" alt="Fotografia do contentor"></a>`:'';}).join('')}</div>`:'';
const detailList=entries=>`<dl class="details">${entries.map(([label,value])=>`<div><dt>${label}</dt><dd>${esc(value??'—')}</dd></div>`).join('')}</dl>`;
function showDocument(d) {modal(esc(d.number),`${d.kind==='GS'?`<div class="guide-pair">${docContent(d)}${docContent(d)}</div>`:docContent(d)}<div class="form-actions">${button('Imprimir ou guardar PDF','print','','primary')}</div>`,{large:true,document:true});}
const transRows=c=>c.transfers.map(t=>[esc(t.from),esc(t.to),fmtDate(t.at),esc(t.by)]);
function containerDetail(c) {
  modal(esc(c.number),`<div class="dialog-actions">${!c.exitedAt&&can('move')?button('Transferir','move',c.id):''}${!c.exitedAt&&can('exit')?button('Registar saída','exit',c.id,'primary'):''}${can('share')?button('Criar link para cliente','share',c.id):''}</div>${detailList([['Cliente',c.client],['Tipo',`${c.size} pés · ${c.type}`],['Carga',c.load],['Entrada',fmtDate(c.enteredAt)],['Saída',fmtDate(c.exitedAt)],['Localização',`Parque ${c.park} · Área ${c.area}`],['Estadia',`${stayDays(c.enteredAt,c.exitedAt??new Date())} dias`],['Condição de entrada',c.entry.condition]])}${photoView([...c.entry.photos,...(c.exit?.photos??[])])}<h3>Transferências</h3>${table(['De','Para','Data','Responsável'],transRows(c))}<h3>Documentos</h3><div class="dialog-actions">${data.documents.filter(d=>d.containerId===c.id).map(d=>button(esc(d.number),'doc',d.id)).join('')}</div>`,{large:true});
}
function getFormData(form) { const input=new FormData(form); return Object.fromEntries([...input].filter(([,v])=>typeof v==='string')); }
async function fileUploads(form) {
  const files=[...(form.elements.photos?.files??[])];
  if(files.length>5||files.some(f=>f.size>1500000||!['image/jpeg','image/png','image/webp'].includes(f.type))) throw Error('Use até 5 fotografias JPEG, PNG ou WebP, de 1,5 MB cada.');
  const uploaded=[];
  for(const file of files) {
    if(local){const id=crypto.randomUUID();previewAssets.set(id,URL.createObjectURL(file));uploaded.push(id);continue;}
    const raw=await new Promise((res,rej)=>{const reader=new FileReader();reader.onload=()=>res(reader.result);reader.onerror=rej;reader.readAsDataURL(file);});
    uploaded.push((await api('/api/photos',{mime:file.type,data:raw.split(',')[1]})).id);
  }
  return uploaded;
}
async function routeAction(action,id,el) {
  const c=data?.containers.find(x=>x.id===id), j=data?.jobs.find(x=>x.id===id), r=data?.releases.find(x=>x.id===id);
  switch(action) {
    case 'show-pass': { const input=document.querySelector('[name=password]'); input.type=input.type==='password'?'text':'password';el.textContent=input.type==='password'?'Mostrar':'Ocultar';return; }
    case 'close': dialog.close();return;
    case 'menu': document.querySelector('.sidebar').classList.toggle('opened');return;
    case 'logout': if(!demo)await api('/api/logout',{});user=null;data=null;history.replaceState(null,'',location.pathname);login();return;
    case 'entry': actionForm('Entrada de contentor','entry',field('N.º do contentor','number','text',{required:true,extra:'placeholder="ABCD1234567" autocapitalize="characters"'})+clientField()+select('Tamanho','size',sizeChoices)+select('Tipo','type',['Ft','FR','OP',...new Set([...data.releases,...data.containers].map(r=>r.type).filter(t=>t&&!['Ft','FR','OP'].includes(t)))])+select('Carga','load',['Vazio','Cheio'])+field('Selo','seal')+field('N.º do release (vazios)','release')+place()+transit(),{label:'Registar entrada'});return;
    case 'container': if(c)containerDetail(c);return;
    case 'move': if(c)actionForm(`Transferir ${esc(c.number)}`,'move',place(),{fixed:{id:c.id},label:'Transferir'});return;
    case 'exit': if(c)actionForm(`Saída de ${esc(c.number)}`,'exit',field('Quem autorizou','authorizer','text',{required:true})+field('N.º da autorização','authorization','text',{required:true})+transit(),{fixed:{id:c.id},label:'Registar saída'});return;
    case 'release':actionForm('Novo release','release',field('N.º do release','number','text',{required:true})+field('N.º do contentor','container','text',{required:true})+clientField()+dateField('Data de validade','validUntil')+select('Tamanho','size',sizeChoices)+select('Tipo','type',['Ft','FR','OP',...new Set([...data.releases,...data.containers].map(r=>r.type).filter(t=>t&&!['Ft','FR','OP'].includes(t)))])+textarea('Referência ou conteúdo do e-mail','evidence'));return;
    case 'release-detail': if(r)modal(esc(r.number),`${detailList([['Contentor',r.container],['Cliente',r.client],['Tipo',`${r.size} pés · ${r.type}`],['Validade',r.validUntil],['E-mail',r.evidence||'Por indicar'],['Estado',r.usedAt?'Utilizado':r.validUntil<dayKey()?'Expirado':r.status],['Motivo',r.reason]])}<div class="dialog-actions">${can('checkRelease')&&!r.usedAt?button('Registar conferência','checkRelease',r.id,'primary'):''}${can('resolve')&&!r.usedAt?button('Decidir divergência','resolve',r.id):''}</div>`);return;
    case 'checkRelease': if(r)actionForm('Conferência de release','checkRelease',select('Os dados coincidem com o documento?','matches',[['true','Sim'],['false','Não']])+textarea('Motivo ou observações','reason'),{fixed:{id:r.id}});return;
    case 'resolve': if(r)actionForm('Decidir divergência','resolve',select('Decisão','decision',['Validado','Recusado'])+textarea('Motivo','reason',true),{fixed:{id:r.id}});return;
    case 'work': {
      if(!data.tariffs.some(t=>t.active)){flash('Active uma tarifa confirmada em Gestão antes de abrir a obra.',true);return;}
      const rateChoices=data.tariffs.filter(t=>t.active).map(t=>[t.id,`${t.name} · ${fmtMoney(t.price)}`]);
      actionForm('Nova Folha de Obra','work',select('Contentor','containerId',containerOptions())+field('Operador ou equipa','operator','text',{required:true})+textarea('Condição observada','condition',true)+formFields('FO')+textarea('Materiais previstos','materials')+`<div class="full work-lines"><h3>Trabalhos previstos</h3><div id="work-line-list">${workLine(rateChoices)}</div>${button('Adicionar trabalho','add-line')}</div>`+photos('Fotografias antes da intervenção'));return;
    }
    case 'finishActivity': await mutate('finishActivity',{id});render();return;
    case 'activity': {
      const choices=data.tariffs.filter(t=>t.active).map(t=>[t.id,t.name+' · '+fmtMoney(t.price)]);
      actionForm('Actividade diária do contentor','activity',dateField('Data','date',dayKey())+select('N.º do contentor','containerId',containerOptions())+select('Estado','status',['Pendente','Concluída'],{selected:'Pendente'})+`<div class="full"><div id="work-line-list">${workLine(choices)}</div>${button('Adicionar serviço','add-line')}</div>`);return;
    }
    case 'appendWork': {
      const choices=data.tariffs.filter(t=>t.active).map(t=>[t.id,t.name]);
      if(!choices.length){flash('Active uma tarifa em Gestão.',true);return;}
      actionForm('Adicionar trabalhos · '+j.container,'appendWork',`<div class="full"><div id="work-line-list">${workLine(choices)}</div>${button('Adicionar outra linha','add-line')}</div>`,{fixed:{id:j.id}});return;
    }
    case 'add-line': {const choices=data.tariffs.filter(t=>t.active).map(t=>[t.id,`${t.name} · ${fmtMoney(t.price)}`]);document.querySelector('#work-line-list').insertAdjacentHTML('beforeend',workLine(choices));return;}
    case 'drop-line': if(el.parentElement.parentElement.children.length>1)el.parentElement.remove();return;
    case 'job': if(j)modal(esc(j.container),`${detailList([['Cliente',j.client],['Operador',j.operator],['Condição',j.condition],['Materiais',j.materials],['Estado',j.stage],['Total',fmtMoney(j.total)]])}${table(['Serviço','Qtd.','Valor'],j.items.map(x=>[esc(x.name),decimal.format(x.qty),fmtMoney(x.value)]))}${photoView([...j.before,...(j.completed?.photos??[])])}<div class="dialog-actions">${can('appendWork')&&j.stage!=='Concluída'?button('Adicionar trabalhos','appendWork',j.id):''}${can('advance')&&j.stage!=='Concluída'?button(j.stage==='Atribuída'?'Iniciar obra':'Concluir obra','advance',j.id,'primary'):''}</div>`,{large:true});return;
    case 'advance': if(j)actionForm(j.stage==='Atribuída'?'Iniciar obra':'Encerrar Folha de Serviço','advance',j.stage==='Atribuída'?'<p>Confirme o início da execução.</p>':textarea('Trabalho executado','worked',true)+formFields('FS')+field('Equipamento','equipment')+field('Pessoal','staff')+photos('Fotografias após a intervenção'),{fixed:{id:j.id},label:j.stage==='Atribuída'?'Iniciar':'Concluir'});return;
    case 'daily': {const v=data.daily.find(x=>x.id===id);actionForm(v?'Editar registo diário':'Novo registo diário','daily',dateField('Data','date',v?.date)+clientField(v?.client)+[['Manuseamento','handling'],['Recondicionados','reconditioned'],['Intervenções','interventions'],['Reparados','repaired'],['Horas de trabalho','hours','.1'],['Trabalhos cronometrados','timed'],['Movimentos da grua','moves'],['Movimentos facturados','billed']].map(([label,k,step])=>numField(label,k,v,step)).join('')+'<p class="full quiet" data-daily-preview></p>'+textarea('Fonte ou referência','reference',false,v?.reference));if(v){currentDialog.immutable=true; dialog.querySelector('[name=date]').readOnly=true;dialog.querySelector('[name=client]').readOnly=true;}dailyPreview();return;}
    case 'fuel': {const v=data.fuel.find(x=>x.id===id);actionForm(v?'Editar grua e diesel':'Registar grua e diesel','fuel',dateField('Data','date',v?.date)+field('Equipamento','equipment','text',{required:true,value:v?.equipment})+[['Horas em operação','running'],['Horas disponíveis','available'],['Diesel (litros)','litres'],['Custo (MZN)','cost']].map(([label,k])=>numField(label,k,v,'.01')).join(''));if(v){dialog.querySelector('[name=date]').readOnly=true;dialog.querySelector('[name=equipment]').readOnly=true;}return;}
    case 'document': actionForm('Guia de Saída de armazém','document',clientField()+field('Volumes','volume','number',{required:true,extra:'min="1" step="1"'})+field('Matrícula','truck','text',{required:true})+field('Motorista','driver','text',{required:true})+field('Autorização','authorization','text',{required:true})+formFields('GS')+textarea('Descrição da carga','cargo',true),{label:'Emitir guia'});return;
    case 'doc': {const d=data?.documents.find(x=>x.id===id);if(d)showDocument(d);return;}
    case 'portal-doc': {const d=local?data?.documents.find(x=>x.id===id):await api(`/api/portal/${portalToken}/document/${id}`);if(d)showDocument(d);return;}
    case 'print':window.print();return;
    case 'share': actionForm('Criar link de consulta','share',select('Contentor','containerId',containerOptions(false),{selected:id})+'<p class="full quiet">O endereço permite consultar este contentor durante sete dias.</p>',{label:'Criar link'});return;
    case 'copy-link': { const url=linkUrl(id);if(!navigator.clipboard){const input=dialog.querySelector('input[readonly]');input?.select();flash('Seleccione e copie o endereço.');return;} await navigator.clipboard.writeText(url);flash(local?'Link copiado para este navegador.':'Link copiado.');return; }
    case 'revoke': actionForm('Revogar link','revoke','<p class="full">Confirme o encerramento do acesso a este endereço.</p>',{fixed:{id},label:'Revogar'});return;
    case 'tariff':actionForm('Registar tarifa confirmada','tariff',field('Serviço','name','text',{required:true,extra:'list="tariff-list"'})+`<datalist id="tariff-list">${[...new Set(data.tariffs.map(t=>t.name))].map(n=>`<option value="${esc(n)}"></option>`).join('')}</datalist>`+field('Tarifa (MZN)','price','number',{required:true,extra:'min="0" step=".01"'}));return;
    case 'users': {const users=local||demo?[demoUser]:await api('/api/users');modal('Utilizadores',`${table(['Nome','E-mail','Perfil'],users.map(u=>[esc(u.name),esc(u.email),roles[u.role]]))}${!demo?`<div class="form-actions">${button('Criar utilizador','new-user','','primary')}</div>`:''}`);return;}
    case 'new-user': actionForm('Criar utilizador','user',field('Nome','name','text',{required:true})+field('E-mail','email','email',{required:true})+select('Perfil','role',Object.entries(roles))+field('Palavra-passe inicial','password','password',{required:true,extra:'minlength="12" autocomplete="new-password"'}));return;
    case 'fullscreen': if(document.fullscreenElement)await document.exitFullscreen();else await root.requestFullscreen();return;
  }
}
const workLine=choices=>`<div class="work-line">${select('Serviço','tariffId',choices)}${field('Qtd.','qty','number',{required:true,value:1,extra:'min=".01" step=".01"'})}${button('Remover','drop-line','','quiet-btn')}</div>`;
function dailyPreview() {
  const form=dialog.querySelector('#action-form'), p=form?.querySelector('[data-daily-preview]');if(!p)return;
  const m=form.elements.moves.value,b=form.elements.billed.value;
  p.textContent=m!==''&&b!==''&&Number(b)<=Number(m)?`Não facturados: ${Number(m)-Number(b)} · Facturados: ${Number(m)>0?fmtPct(Number(b)/Number(m)):'—'}`:'A comparação é calculada quando indicar o total e os facturados.';
}
async function showPortal(token) {
  portalToken=token;
  try {
    if(local)await hydrate();
    const p=local?portalView(data,token):await api(`/api/portal/${token}`);
    if(!p)throw Error('Este link está indisponível ou expirou.');
    root.innerHTML=`<div class="public-view"><img src="/logo.png" alt="Mozrail"><section class="panel"><h1>${esc(p.number)}</h1>${detailList([['Cliente',p.client],['Estado',p.exitedAt?'Saiu do terminal':'No terminal'],['Localização',`Parque ${p.park} · Área ${p.area}`],['Entrada',fmtDate(p.enteredAt)],['Saída',fmtDate(p.exitedAt)]])}${photoView(p.photos,token)}<h2>Documentos</h2>${table(['Documento','Tipo','Data',''],p.documents.map(d=>[esc(d.number),esc(d.title),fmtDate(d.at),button('Abrir','portal-doc',d.id)]))}</section></div>`;
  } catch(error) {publicNotice('Consulta de contentor',error.message);}
  root.setAttribute('aria-busy','false');
}
function publicNotice(title,message) {root.innerHTML=`<div class="public-view"><img src="/logo.png" alt="Mozrail"><section class="panel"><h1>${esc(title)}</h1><p>${esc(message)}</p></section></div>`;}
async function showVerification(id) {
  try {
    if(local)await hydrate();
    const item=local?data.documents.find(d=>d.id===id):await api(`/api/verificar/${id}`);
    if(!item)throw Error('Documento indisponível.');
    publicNotice(item.number,`${item.title} · Emitido em ${fmtDate(item.at)}.`);
  }catch(error){publicNotice('Verificação de documento',error.message);}
  root.setAttribute('aria-busy','false');
}
async function route() {
  if(dialog.open)dialog.close();
  const ref=location.hash.slice(1);
  if(ref.startsWith('consulta/'))return showPortal(ref.slice(9));
  if(ref.startsWith('verificar/'))return showVerification(ref.slice(10));
  const next=Object.hasOwn(views,ref)?ref:'painel';
  if(next!==view){filters.search='';window.scrollTo(0,0);}
  view=next; render();
}

document.addEventListener('click',async event=>{
  const el=event.target.closest('[data-act]');
  if(!el)return;
  event.preventDefault();
  try {await routeAction(el.dataset.act,el.dataset.id??'',el);} catch(error){flash(error.message,true);}
});
document.addEventListener('input',event=>{
  if(event.target.matches('[name=moves],[name=billed]'))dailyPreview();
  if(event.target.matches('input[type=search][data-filter]')) {
    const value=event.target.value;
    filters[event.target.dataset.filter]=value;
    const start=event.target.selectionStart, end=event.target.selectionEnd;
    render();
    const replacement=document.querySelector('input[type=search][data-filter]'); replacement?.focus();replacement?.setSelectionRange(start,end);
  }
});
document.addEventListener('change',event=>{
  const field=event.target.dataset.filter;
  if(field&&event.target.type!=='search'){filters[field]=event.target.value;render();}
});
document.addEventListener('submit',async event=>{
  const form=event.target;
  if(!['login-form','action-form'].includes(form.id))return;
  event.preventDefault();
  const errorField=form.querySelector('.form-error'), submit=form.querySelector('[type=submit]');
  errorField.textContent='';submit.disabled=true;
  try {
    const input=getFormData(form);
    if(form.elements.inspection)input['Inspecção e trabalhos previstos']=new FormData(form).getAll('inspection').join(' · ');
    if(form.id==='login-form') {user=demo?demoUser:(await api('/api/login',input)).user;await hydrate();render();return;}
    const {action,fixed}=currentDialog;
    if(action==='user'){const result=await api('/api/users',input);dialog.close();flash(result.message);return;}
    if(input.matches)input.matches=input.matches==='true';
    if(['work','appendWork','activity'].includes(action)) input.items=[...form.querySelectorAll('.work-line')].map(line=>({tariffId:line.querySelector('select').value,qty:line.querySelector('input').value}));
    if(form.elements.photos) input.photos=await fileUploads(form);
    const result=await mutate(action,{...input,...fixed});dialog.close();render();flash(result.message);
    if(action==='share') modal('Link de consulta',`<label>Endereço<input readonly value="${esc(linkUrl(result.id))}"></label><div class="form-actions">${button('Copiar link','copy-link',result.id,'primary')}</div>`);
  }catch(error){errorField.textContent=error.message;}
  finally{submit.disabled=false;}
});
window.addEventListener('hashchange',route);
window.addEventListener('resize',()=>{if(view==='painel'&&user&&data&&!dialog.open)render();});
setInterval(()=>{const clock=document.querySelector('#live-clock');if(clock)clock.textContent=fmtClock();},1000);
setInterval(async()=>{if(user&&view==='tv'&&!dialog.open&&!local){try{await hydrate();render();}catch{/* retry on next refresh */}}},15000);

async function start() {
  if(document.documentElement.dataset.mode==='demo'){demo=true;local=true;}
  else {
    try {const session=await api('/api/session');demo=session.demo;user=demo?null:session.user;}
    catch {publicNotice('Mozrail Terminal','O serviço está indisponível. Recarregue a página para tentar novamente.');root.setAttribute('aria-busy','false');return;}
  }
  if(user) await hydrate();
  await route();
  if(!local&&'serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
}
start().catch(()=>{publicNotice('Mozrail Terminal','Não foi possível carregar o terminal.');root.setAttribute('aria-busy','false');});
