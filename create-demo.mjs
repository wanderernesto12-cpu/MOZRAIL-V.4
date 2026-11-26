import {readFile,writeFile} from 'node:fs/promises';
const publicFile=name=>new URL(`./public/${name}`,import.meta.url);
const read=name=>readFile(publicFile(name),'utf8');
const image=async(name,mime)=>`data:${mime};base64,${(await readFile(publicFile(name))).toString('base64')}`;
const [entry,css,domain,demo,app,logo,background,icon]=await Promise.all([
  read('index.html'),read('styles.css'),read('domain.js'),read('demo.js'),read('app.js'),image('logo.png','image/png'),image('terminal.webp','image/webp'),image('icon.png','image/png'),
]);
const diagram=await image('eir.webp','image/webp');
const strip=code=>code.replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'');
const out=entry.replace('<html lang="pt-MZ">','<html lang="pt-MZ" data-mode="demo">')
  .replace('href="/icon.png"',`href="${icon}"`)
  .replace('  <link rel="manifest" href="/manifest.webmanifest">\n','')
  .replace('<link rel="stylesheet" href="/styles.css">',`<style>${css.replaceAll('/terminal.webp',background)}</style>`)
  .replace('<script type="module" src="/app.js"></script>',()=>`<script type="module">
  const domainModule=(()=>{${strip(domain)}\nreturn {forms,upgrade,areas,roles,allowed,stayDays,dayKey,change,portalView,fresh};})();
  const {forms,upgrade,areas,roles,allowed,stayDays,dayKey,change,portalView}=domainModule;
  const {demoState}=(()=>{const {fresh,change,dayKey}=domainModule;${strip(demo)}\nreturn {demoState};})();
  ${strip(app).replaceAll('/logo.png',logo).replaceAll('/eir.webp',diagram)}\n</script>`);
const target=process.argv[2];
if(!target)throw new Error('Indique o caminho do HTML de demonstração.');
await writeFile(target,out);
