import {createRequire} from 'node:module';
import {dirname,join} from 'node:path';
const require=createRequire(import.meta.url);
let semver;
for(const path of ['semver',join(dirname(process.execPath),'node_modules/npm/node_modules/semver'),join(dirname(process.execPath),'../lib/node_modules/npm/node_modules/semver')]){
 try{semver=require(path);break;}catch{ /* Missing verifier means resolution stays unverified. */ }
}
export function dependencyResolved(f,inventory){
 if(!inventory||!f.packageName||!f.affectedRanges?.length||!semver)return false;
 if(!f.affectedRanges.every(r=>semver.validRange(r)))return false;
 const installed=inventory[f.packageName]||[];
 return installed.every(p=>semver.valid(p.version)&&f.affectedRanges.every(r=>!semver.satisfies(p.version,r,{includePrerelease:true})));
}
export function dependencyAffected(installed,ranges){
 if(!semver||!installed.length||!ranges.length||!ranges.every(r=>semver.validRange(r)))return false;
 return installed.some(p=>semver.valid(p.version)&&ranges.some(r=>semver.satisfies(p.version,r,{includePrerelease:true})));
}
