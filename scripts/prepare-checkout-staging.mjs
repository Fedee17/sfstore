// Builds an isolated NEW-local-database history. Does not execute SQL or contact Supabase.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
// Hash canonical LF text so Windows checkout conversion cannot alter the manifest.
// SQL copies themselves remain byte-identical to their source; no database writes.
export const hashStagingSql = value => createHash('sha256').update(value.replace(/\r\n/g,'\n')).digest('hex');
export function prepareStaging(root) {
  const sources = ['supabase/schema.sql', ...readdirSync(join(root,'supabase/migrations')).filter(f=>f.endsWith('.sql')).sort().map(f=>'supabase/migrations/'+f)];
  const destination=join(root,'staging/supabase/migrations');mkdirSync(destination,{recursive:true});
  const expected=new Set(sources.map(source=>source==='supabase/schema.sql'?'202609100001_staging_baseline.sql':source.endsWith('202609180002_suppliers_admin.sql')?'202609180003_suppliers_admin.sql':source.split('/').at(-1)));
  if(readdirSync(destination).some(file=>file.endsWith('.sql')&&!expected.has(file)))throw new Error('Unexpected staging SQL; inspect generated directory before rebuilding');
  const entries=sources.map(source=>{
    const original=readFileSync(join(root,source),'utf8');
    const name=source==='supabase/schema.sql'?'202609100001_staging_baseline.sql':source.endsWith('202609180002_suppliers_admin.sql')?'202609180003_suppliers_admin.sql':source.split('/').at(-1);
    const content=source==='supabase/schema.sql'?`-- NEW SYNTHETIC STAGING ONLY. Never apply to an existing project.\ncreate schema sfstore_staging;\ncreate table sfstore_staging.identity (id text primary key check(id='SFSTORE_SYNTHETIC_STAGING'));\ninsert into sfstore_staging.identity values ('SFSTORE_SYNTHETIC_STAGING');\n${original}`:original;
    if(existsSync(join(destination,name)) && readFileSync(join(destination,name),'utf8')!==content)throw new Error('Modified staging copy: '+name+'; inspect before replacing');
    writeFileSync(join(destination,name),content);
    return {source,stagingFile:'staging/supabase/migrations/'+name,sourceSha256:hashStagingSql(original),stagingSha256:hashStagingSql(content)};
  }).sort((a,b)=>a.stagingFile.localeCompare(b.stagingFile));
  if(new Set(entries.map(e=>e.stagingFile.split('/').at(-1).split('_')[0])).size!==entries.length)throw new Error('Duplicate staging version');
  const manifest={purpose:'new_local_synthetic_staging_only',canonicalHistoryChanged:false,remoteExecuted:false,collisionResolution:'202609180002_suppliers_admin.sql is byte-identical under staging-only version 202609180003; canonical applied files and ledgers remain untouched',applicationOrder:entries};
  writeFileSync(join(root,'staging/migration-manifest.json'),JSON.stringify(manifest,null,2)+'\n');return manifest;
}
if(process.argv[1]===import.meta.filename) {const result=prepareStaging(resolve(import.meta.dirname,'..'));process.stdout.write(`Prepared ${result.applicationOrder.length} unique local staging migrations. No database execution.\n`);}
