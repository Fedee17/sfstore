'use strict';
const fs=require('node:fs');
const path=require('node:path');
const root=process.env.AUDIT_OUTPUT||'audit-output/browser';
const load=file=>{try{return JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));}catch{return null;}};
const browser=load('results.json'), lh=load('lighthouse-mobile.json');
const scores=lh?.categories?Object.fromEntries(Object.entries(lh.categories).map(([k,v])=>[k,v.score===null?null:Math.round(v.score*100)])):null;
const audits=lh?.audits||{};
const vitals=lh?Object.fromEntries([['LCP','largest-contentful-paint'],['CLS','cumulative-layout-shift'],['TBT','total-blocking-time'],['FCP','first-contentful-paint'],['Speed index','speed-index']].map(([name,id])=>[name,audits[id]?.displayValue??null])):null;
const checks=browser?.checks||[];
const failures=checks.filter(x=>x.status==='FAIL'),warnings=checks.filter(x=>x.status==='WARN'||x.status==='NO VERIFICADO');
const summary={
  date:new Date().toISOString(),target:'https://sfstore-ten.vercel.app/',
  browser:{status:browser?'EXECUTED':'UNAVAILABLE',checks:checks.length,passed:checks.filter(x=>x.status==='PASS').length,failed:failures.length,warnings:warnings.length,blockedMutations:browser?.blockedMutations??null},
  lighthouse:{status:lh?.categories?'EXECUTED':'UNAVAILABLE',scores,vitals,disclaimer:'Lighthouse lab data is not CrUX field data; INP is not measured in lab.'},
  failedChecks:failures.slice(0,15),
  warnings:warnings.slice(0,12),
  screenshots:browser?.screenshots??[]
};
fs.mkdirSync(root,{recursive:true});
fs.writeFileSync(path.join(root,'summary.json'),JSON.stringify(summary,null,2));
let md='# SFSTORE — auditoría automática\n\n';
md+='**Destino:** '+summary.target+' · **Fecha UTC:** '+summary.date+'\n\n';
md+='**Navegador:** '+summary.browser.status+' — '+summary.browser.passed+'/'+summary.browser.checks+' comprobaciones PASS, '+summary.browser.failed+' FAIL y '+summary.browser.warnings+' WARN/NO VERIFICADO.\n\n';
md+='**Lighthouse móvil (laboratorio):** '+(scores?Object.entries(scores).map(([k,v])=>k+' '+(v??'N/D')).join(' · '):'NO VERIFICADO')+'\n\n';
if(vitals)md+='**Métricas de laboratorio:** '+Object.entries(vitals).map(([k,v])=>k+' '+(v??'N/D')).join(' · ')+'\n\n';
md+='**Fallos:**\n'+(failures.length?failures.slice(0,15).map(x=>'- '+x.name+': '+String(x.evidence).replace(/[\r\n]/g,' ').slice(0,450)).join('\n'):'- Ninguno registrado')+'\n\n';
md+='**Advertencias/no verificados:**\n'+(warnings.length?warnings.slice(0,12).map(x=>'- '+x.name+': '+String(x.evidence).replace(/[\r\n]/g,' ').slice(0,450)).join('\n'):'- Ninguno registrado')+'\n\n';
md+='Este reporte NO demuestra conciliación bancaria ni pagos reales. El ciclo de pedido y transferencia ficticia se prueba por separado en PostgreSQL aislado.\n';
fs.writeFileSync(path.join(root,'summary.md'),md);
if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,md);
console.log('SFSTORE_AUDIT_SUMMARY_JSON='+JSON.stringify(summary));
