/** Local-only operator helper. Never reads .env, accepts URLs, or connects to Production. */
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,relative,isAbsolute} from 'node:path';
import {Client} from 'pg';

function args(argv){const result={};for(let i=0;i<argv.length;i+=2){if(!argv[i]?.startsWith('--')||!argv[i+1])throw Error('ARGUMENTS_INVALID');result[argv[i].slice(2)]=argv[i+1];}return result;}
const uuid=/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
let db;
try{
 const options=args(process.argv.slice(2)), mode=options.mode??'preflight';
 if(!['preflight','apply-local','review-sql'].includes(mode))throw Error('MODE_INVALID');
 const host=options.host??'127.0.0.1';
 if(mode!=='review-sql'&&!['127.0.0.1','::1'].includes(host))throw Error('LOCAL_DATABASE_ONLY');
 const manifest=JSON.parse(await readFile(resolve(options.manifest??''),'utf8'));
 for(const k of ['purchaseId','recipeId','operationKey','actorId'])if(!uuid.test(manifest[k]??''))throw Error('MANIFEST_ID_INVALID');
 for(const k of ['cc','lightning'])if(!Number.isSafeInteger(manifest[k])||manifest[k]<0)throw Error('MANIFEST_QUANTITY_INVALID');
 if(manifest.cc+manifest.lightning<1)throw Error('MANIFEST_QUANTITY_INVALID');
 const fingerprint=options.fingerprint;
 if(mode!=='preflight'&&!/^[a-f\d]{64}$/.test(fingerprint??''))throw Error('FINGERPRINT_REQUIRED');
 const runtime=resolve('staging/runtime');
 function privateOutput(file){if(!file)throw Error('PRIVATE_OUTPUT_REQUIRED');const target=resolve(file),r=relative(runtime,target);if(r.startsWith('..')||isAbsolute(r)||!r)throw Error('OUTPUT_MUST_BE_IGNORED_RUNTIME');return target;}
 if(mode==='review-sql'){
  const sql=`-- REVIEW ONLY: future Production execution requires explicit owner authorization.\nbegin;\nset local lock_timeout='3s';\nset local statement_timeout='30s';\nselect public.apply_component_conversion('${manifest.operationKey}'::uuid,'${manifest.actorId}'::uuid,'${manifest.purchaseId}'::uuid,'${manifest.recipeId}'::uuid,${manifest.cc},${manifest.lightning},'${fingerprint}');\ncommit;\n`;
  await writeFile(privateOutput(options.output),sql,{flag:'wx'});
  console.log(JSON.stringify({status:'REVIEW_SQL_PREPARED',executedSQL:false}));
 }else{
  // No connection object is constructed until this host check passes.
  if(!['127.0.0.1','::1'].includes(host))throw Error('LOCAL_DATABASE_ONLY');
  const port=Number(options.port);if(!Number.isInteger(port)||port<1024||port>65535)throw Error('LOCAL_PORT_REQUIRED');
  db=new Client({host,port,user:'postgres',database:'postgres',password:process.env.PGPASSWORD,connectionTimeoutMillis:3000});await db.connect();
  await db.query(mode==='preflight'?'begin read only':'begin');
  await db.query("set local statement_timeout='30s';set local lock_timeout='3s'");
  const a=[manifest.purchaseId,manifest.recipeId,manifest.cc,manifest.lightning];
  if(mode==='preflight'){
   const plan=(await db.query('select public.get_component_conversion_plan($1,$2,$3,$4) plan',a)).rows[0].plan;
   await db.query('rollback');await writeFile(privateOutput(options.output),JSON.stringify(plan,null,2),{flag:'wx'});
   console.log(JSON.stringify({status:'LOCAL_DRY_RUN_COMPLETE',fingerprint:plan.fingerprint,physicalPieces:plan.physical_pieces,writes:false}));
  }else{
   await db.query('select public.apply_component_conversion($1,$2,$3,$4,$5,$6,$7)',[manifest.operationKey,manifest.actorId,...a,fingerprint]);
   await db.query('commit');console.log(JSON.stringify({status:'LOCAL_CONVERSION_COMMITTED',productionConnected:false}));
  }
 }
}catch(error){try{await db?.query('rollback');}catch{}console.error(JSON.stringify({status:'STOPPED',code:/^[A-Z_]+$/.test(error.message)?error.message:'LOCAL_OPERATION_FAILED_DETAILS_WITHHELD'}));process.exitCode=1;}
finally{await db?.end();}
