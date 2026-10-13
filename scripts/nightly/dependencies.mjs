import {canonicalFindings} from './core.mjs';
import {dependencyAffected} from './versions.mjs';
export function dependencyInventory(lock){
 const out={};
 for(const [path,p]of Object.entries(lock?.packages||{})){
  if(!path.includes('node_modules/'))continue;
  const name=path.split('node_modules/').at(-1);
  (out[name]||=[]).push({path,version:p.version,developmentOnly:p.dev===true});
 }
 for(const values of Object.values(out))values.sort((a,b)=>a.path.localeCompare(b.path));
 return out;
}
export function classifyDependencies(items,lock){
 const inventory=dependencyInventory(lock);
 return canonicalFindings(items).map(f=>{
  if(f.check!=='dependencies')return f;
  const packageName=f.file.split('package-lock.json:')[1],installedInstances=inventory[packageName]||[];
  const exposure=installedInstances.length&&installedInstances.every(p=>p.developmentOnly)?'development-only':installedInstances.length?'runtime-dependency':'unknown';
  const affectedRanges=[...new Set([...(f.affectedRanges||[]),...f.evidence.split('\n').map(line=>line.match(/^npm audit --json: \S+ (.+); https:\/\/github\.com\/advisories\//)?.[1]).filter(Boolean)])];
  return {...f,packageName,installedInstances,exposure,affectedRanges,installedMatchProven:dependencyAffected(installedInstances,affectedRanges),
   exploitability:'not-demonstrated',impact:exposure==='development-only'?
    'Versión vulnerable en herramientas de desarrollo/CI. No se demostró una ruta explotable desde compradores; revisar entradas y configuración no confiables.':
    'Dependencia de runtime o alcance incierto. Priorizar revisión de rutas que reciban entradas no confiables; la presencia no demuestra explotación.',
   suggestion:'Revisar el advisory y actualizar la herramienta o dependencia padre con pruebas de compatibilidad; no usar audit fix --force.'};
 });
}
