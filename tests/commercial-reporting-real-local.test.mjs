import assert from "node:assert/strict";
import { test } from "node:test";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import { createServer } from "node:http";
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { Client } from "pg";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { createRequire } from "node:module";
import { COMMERCIAL_EVIDENCE } from "../lib/commercial-reporting/evidence.ts";
import { createCommercialPageReader } from "../lib/commercial-reporting/postgrest.ts";
import { readCompleteSnapshot } from "../lib/commercial-reporting/reader.ts";

// Explicit opt-in. Real PostgreSQL17.6 + PostgREST16.4 in owned disposable containers.
// Auth is the existing *local* Supabase project; no CAPTCHA change or Production access.
const enabled = process.env.SFSTORE_REAL_LOCAL_COMMERCIAL_HISTORY === "true";
const uiMode = process.env.SFSTORE_REAL_LOCAL_COMMERCIAL_HISTORY_UI === "true";
const root = resolve(import.meta.dirname, "..");
const localProject = "sfstore-checkout-synthetic-staging";
const productionRef = "xspvoicelbxlmtqoiolc";

test("commercial history: actual Next admin guard + local Auth + PostgREST + PostgreSQL", {
  skip: !enabled, timeout: 360000,
}, async t => {
  const run = randomUUID(), name = `sfstore-history-${run.slice(0,8)}`;
  const work = join(root,"staging/runtime/commercial-history-integration",run);
  mkdirSync(work,{recursive:true});
  const results=[], resources=[], authUsers=[];
  let fixtureCounts=null;
  let db, proxy, server, localAuth, serviceKey, anonKey, jwtSecret;
  let browser,serverOutput="";
  let proxyRestUrl, restGets=0, forbiddenRestMethods=0, failRest=false, nextStopped=false,allowOperationalWrites=false;
  const restQueries=[];
  const requestMethods=new Set();
  function docker(args, env={}) {
    const result=spawnSync("docker",args,{encoding:"utf8",timeout:30000,windowsHide:true,env:{...process.env,...env}});
    if(result.status!==0)throw new Error("LOCAL_DOCKER_OPERATION_FAILED");
    return result.stdout.trim();
  }
  const inspect = name => JSON.parse(docker(["inspect",name]))[0];
  const envOf = info => Object.fromEntries(info.Config.Env.map(s=>{const i=s.indexOf("=");return[s.slice(0,i),s.slice(i+1)];}));
  async function q(sql,args=[]) {return (await db.query(sql,args)).rows;}
  async function checked(label,fn) {await t.test(label,async()=>{try{const started=performance.now();await fn();results.push({case:label,status:"PASS",durationMs:Math.round(performance.now()-started)});}catch(error){results.push({case:label,status:"FAIL",code:error.code??error.name});writeFileSync(join(work,"server-error-private.log"),serverOutput);throw error;}});}
  const sum = values => values.reduce((a,b)=>a+b,0);
  async function fingerprint() {
    const tables=await q("select tablename from pg_tables where schemaname='public' order by tablename");
    const hash=createHash("sha256");
    for(const {tablename} of tables) {
      assert.match(tablename,/^[a-z_]+$/);
      const rows=await q(`select to_jsonb(x) value from public."${tablename}" x order by to_jsonb(x)::text`);
      hash.update(tablename+JSON.stringify(rows));
    }
    return {sha256:hash.digest("hex"),movements:(await q("select count(*)::int n from inventory_movements"))[0].n};
  }
  async function mintSession(email,proxyUrl) {
    const user=await localAuth.auth.admin.createUser({email,email_confirm:true,user_metadata:{synthetic:true,purpose:"commercial-history-local",run}});
    assert.equal(user.error,null,"LOCAL_SYNTHETIC_AUTH_CREATE_FAILED");authUsers.push(user.data.user.id);
    const link=await localAuth.auth.admin.generateLink({type:"magiclink",email});
    assert.equal(link.error,null,"LOCAL_SYNTHETIC_LINK_FAILED");
    const cookies=[];
    const auth=createServerClient(proxyUrl,anonKey,{cookies:{getAll:()=>cookies,setAll:items=>{
      for(const item of items){const i=cookies.findIndex(x=>x.name===item.name);if(i<0)cookies.push(item);else cookies[i]=item;}
    }}});
    const result=await auth.auth.verifyOtp({type:"magiclink",token_hash:link.data.properties.hashed_token});
    assert.equal(result.error,null,"LOCAL_SYNTHETIC_OTP_FAILED");
    return cookies.filter(x=>x.value).map(x=>`${x.name}=${x.value}`).join("; ");
  }
  try {
    assert.equal(docker(["context","show"]),"desktop-linux","LOCAL_DOCKER_CONTEXT_REQUIRED");
    assert.ok(!process.env.DOCKER_HOST || process.env.DOCKER_HOST.startsWith("npipe:"),"REFUSE_REMOTE_DOCKER_HOST");
    for(const file of [".env",".env.local",".env.development",".env.development.local"])assert.equal(existsSync(join(root,file)),false,"NO_WORKTREE_ENV_FILES_ALLOWED");
    const originalRest=inspect(`supabase_rest_${localProject}`),originalAuth=inspect(`supabase_auth_${localProject}`),kong=inspect(`supabase_kong_${localProject}`);
    for(const c of [originalRest,originalAuth,kong])assert.equal(c.Config.Labels["com.supabase.cli.project"],localProject);
    assert.equal(envOf(originalAuth).GOTRUE_SECURITY_CAPTCHA_ENABLED,"true","KEEP_LOCAL_CAPTCHA_ENABLED");
    jwtSecret=envOf(originalRest).PGRST_JWT_SECRET;assert.ok(jwtSecret,"LOCAL_JWT_VERIFIER_REQUIRED");
    const kongConfig=docker(["exec",kong.Id,"cat","/home/kong/kong.yml"]);
    for(const token of kongConfig.match(/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)??[]) {
      const payload=JSON.parse(Buffer.from(token.split(".")[1],"base64url").toString());
      assert.notEqual(payload.ref,productionRef,"REFUSE_PRODUCTION_CREDENTIAL");
      if(payload.role==="service_role")serviceKey=token;
      if(payload.role==="anon")anonKey=token;
    }
    assert.ok(serviceKey&&anonKey);
    localAuth=createClient("http://127.0.0.1:54331",serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
    docker(["network","create","--label",`sfstore.test.run=${run}`,name]);resources.push({kind:"network",name});
    docker(["run","-d","--pull","never","--name",name+"-db","--label",`sfstore.test.run=${run}`,"--network",name,"--network-alias","db","-p","127.0.0.1::5432","--tmpfs","/var/lib/postgresql/data","--env","POSTGRES_HOST_AUTH_METHOD=trust","postgres:17.6"]);
    resources.push({kind:"container",name:name+"-db"});
    const dbPort=Number(inspect(name+"-db").NetworkSettings.Ports["5432/tcp"][0].HostPort);
    for(let i=0;i<60;i++) {
      const candidate=new Client({host:"127.0.0.1",port:dbPort,user:"postgres",database:"postgres",connectionTimeoutMillis:1000,statement_timeout:15000});
      try {await candidate.connect();db=candidate;break;}catch{await candidate.end().catch(()=>{});await delay(300);}
    }
    assert.ok(db,"ISOLATED_POSTGRES_NOT_READY");
    assert.equal((await q("select current_setting('server_version_num') n"))[0].n,"170006");
    assert.equal((await q("select count(*)::int n from pg_tables where schemaname='public'"))[0].n,0,"REFUSE_NONEMPTY_FIXTURE_DATABASE");
    await q("create role anon;create role authenticated;create role service_role bypassrls;create role authenticator login noinherit;grant anon,authenticated,service_role to authenticator;");
    await db.query(readFileSync(join(root,"tests/fixtures/storage-permissions.sql"),"utf8"));
    const manifest=JSON.parse(readFileSync(join(root,"staging/migration-manifest.json"),"utf8"));
    for(const entry of manifest.applicationOrder)await db.query(readFileSync(join(root,entry.stagingFile),"utf8"));
    assert.equal((await q("select id from sfstore_staging.identity"))[0].id,"SFSTORE_SYNTHETIC_STAGING");
    await checked("00 release preflight runs READ ONLY on isolated schema",async()=>{
      const statements=readFileSync(join(root,"reports/commercial-history-release-preflight-read-only.sql"),"utf8");
      const output=await db.query(statements);const row=output.flatMap(x=>x.rows??[]).find(x=>x.preflight)?.preflight;
      assert.ok(row);assert.equal(row.commercial_rows_read,false);assert.equal(row.all_checks_passed,true);assert.equal(row.checks.read_only,true);assert.deepEqual(row.checks.missing_columns,[]);
      assert.equal((await q("select current_setting('transaction_read_only') r"))[0].r,"off");
    });
    // All fixture DML below is on this newly created database, never on local checkout or Production.
    const category=randomUUID(),a=randomUUID(),b=randomUUID(),supplier=randomUUID(),actor=randomUUID();
    await q("insert into categories(id,name,slug) values($1,'SYNTHETIC HISTORY UNIT',$2)",[category,`unit-${run}`]);
    for(const [id,cost] of [[a,40],[b,null]])await q("insert into products(id,category_id,name,slug,short_description,price,transfer_price,cost,stock,status) values($1,$2,'SYNTHETIC UNIT',$3,'SYNTHETIC ONLY',100,75,$4,1000,'active')",[id,category,`unit-${id}`,cost]);
    await q("insert into suppliers(id,name,normalized_name) values($1,'SYNTHETIC SUPPLIER',$2)",[supplier,`unit-${run}`]);
    const batch=COMMERCIAL_EVIDENCE.sourceBatches[0];
    await q("insert into historical_import_batches(id,source_file,source_sha256) values($1,'SYNTHETIC FORMAT FIXTURE - NOT EXCEL',$2)",[batch.id,batch.sha256]);
    const fp=n=>createHash("sha256").update(run+":"+n).digest("hex");
    const historicalPurchases=[];
    for(let i=0;i<6;i++){
      const r=(await q("select import_historical_purchase($1,'Control de compras',$2,$3,'2026-10-01',$4,'SYNTHETIC SUPPLIER','SYNTHETIC IMPUTED DATE',$5) result",[batch.id,154+i,fp(`purchase${i}`),supplier,JSON.stringify([{product_id:a,quantity:1,unit_cost:24965,source_total:24965}])]))[0].result;
      historicalPurchases.push(r.purchase_id);
    }
    for(let i=0;i<(uiMode?174:1);i++)await q("select import_historical_purchase($1,'Control de compras',$2,$3,$4,$5,'SYNTHETIC SUPPLIER','SYNTHETIC DOCUMENTED DATE',$6)",[batch.id,1000+i,fp(`documented${i}`),i%2?'2025-06-20':'2026-07-30',supplier,JSON.stringify([{product_id:a,quantity:1,unit_cost:10,source_total:10}])]);
    const historicalSales=[];
    for(let i=0;i<(uiMode?129:3);i++) {
      const r=(await q("select import_historical_sale($1,'Control de ventas',$2,$3,'2026-10-03','SYNTHETIC HISTORY',$4,$5,$6) result",[batch.id,i+1,fp(`sale${i}`),JSON.stringify([{product_id:a,quantity:1,unit_price:100,source_total:100},{product_id:b,quantity:1,unit_price:50,source_total:50}]),!uiMode&&i===2?null:"transfer",!uiMode&&i===2?null:150]))[0].result;
      historicalSales.push(r.order_id);
    }
    async function current(items,payments) {
      return (await q("select create_store_sale_atomic($1,$2,'SYNTHETIC BUYER','SYNTHETIC UNIT',$3,$4) result",[randomUUID(),actor,JSON.stringify(items.map(item=>({...item,unit_price:75}))),JSON.stringify(payments)]))[0].result.order_id;
    }
    const currentIds=[];
    for(let i=0;i<122;i++)currentIds.push(await current([{product_id:a,quantity:1,unit_price:100}],[{method:"cash",amount:75}]));
    const combined=await current([{product_id:a,quantity:1,unit_price:100},{product_id:b,quantity:1,unit_price:100}],[{method:"cash",amount:50},{method:"transfer",amount:100}]);
    const earlier=await current([{product_id:a,quantity:1,unit_price:100}],[{method:"transfer",amount:75}]);
    await q("update orders set created_at='2026-10-15T12:00:00Z' where not historical_import");
    await q("update order_payments set paid_at='2026-10-15T12:01:00Z' where paid_at is not null");
    await q("update orders set created_at='2026-09-15T12:00:00Z' where id=$1",[earlier]);
    await q("update orders set created_at='2026-11-01T02:59:59.999Z' where id=$1",[currentIds[0]]);
    await q("update orders set created_at='2026-11-01T03:00:00Z' where id=$1",[currentIds[1]]);
    const partial=(await q("select create_store_sale($1,$2,'SYNTHETIC PARTIAL','SYNTHETIC UNIT',$3) result",[randomUUID(),actor,JSON.stringify([{product_id:a,quantity:1,unit_price:75}])]))[0].result.order_id;
    await q("select record_order_payment($1,'transfer',20,'approved',$2,null,'2026-10-15T12:00:00Z',false)",[partial,`unit-${run}`]);
    await q("update orders set created_at='2026-10-15T12:00:00Z' where id=$1",[partial]);
    const online=randomUUID(),synthetic=COMMERCIAL_EVIDENCE.excludedOrderIds[0];
    for(const [id,status,paid] of [[online,"pending",false],[synthetic,"paid",true]]) {
      await q("insert into orders(id,order_number,channel,status,payment_status,payment_method,shipping_method,subtotal,discount,total,created_at) values($1,$2,'web',$3,$4,'transfer','pickup',100,25,75,'2026-10-15T12:00:00Z')",[id,`UNIT-${id}`,status,paid?"paid":"pending"]);
      await q("insert into order_items(order_id,product_id,product_name,product_slug,category_name,unit_price,quantity,subtotal) values($1,$2,'SYNTHETIC UNIT','synthetic-unit','UNIT',75,1,75)",[id,a]);
      if(paid)await q("insert into order_payments(order_id,method,amount,status,paid_at) values($1,'transfer',75,'approved','2026-10-15T12:00:00Z')",[id]);
    }
    const purchase=(await q("select save_purchase_draft(null,$1,'2026-10-04',4,null,$2,$3) result",[supplier,actor,JSON.stringify([{product_id:a,quantity:2,unit_purchase_cost:20}])]))[0].result;
    await q("select confirm_purchase($1,$2)",[purchase,actor]);
    const draft=(await q("select save_purchase_draft(null,$1,'2026-10-04',0,null,$2,$3) result",[supplier,actor,JSON.stringify([{product_id:a,quantity:2,unit_purchase_cost:20}])]))[0].result;
    if(!uiMode)await q("alter role authenticator set default_transaction_read_only=on");
    docker(["run","-d","--pull","never","--name",name+"-rest","--label",`sfstore.test.run=${run}`,"--network",name,"-p","127.0.0.1::3000","--env","PGRST_DB_URI=postgres://authenticator@db:5432/postgres","--env","PGRST_DB_SCHEMAS=public","--env","PGRST_DB_ANON_ROLE=anon","--env","PGRST_DB_MAX_ROWS=7","--env","PGRST_JWT_SECRET","public.ecr.aws/supabase/postgrest:v16.4"],{PGRST_JWT_SECRET:jwtSecret});
    resources.push({kind:"container",name:name+"-rest"});
    proxyRestUrl=`http://127.0.0.1:${inspect(name+"-rest").NetworkSettings.Ports["3000/tcp"][0].HostPort}`;
    for(let i=0;i<60;i++){try{const response=await fetch(proxyRestUrl+"/",{signal:AbortSignal.timeout(1000)});if(response.ok)break;}catch{}if(i===59)throw new Error("ISOLATED_POSTGREST_NOT_READY");await delay(250);}
    proxy=createServer(async(req,res)=>{
      try {
        const url=new URL(req.url,"http://127.0.0.1");let target;
        if(url.pathname.startsWith("/rest/v1/")) {
          restGets++;requestMethods.add(req.method);restQueries.push({path:url.pathname,search:url.search});
          if(req.method!=="GET"&&!(allowOperationalWrites&&req.method==="POST"&&["/rest/v1/rpc/create_store_sale_atomic","/rest/v1/rpc/save_purchase_draft","/rest/v1/rpc/confirm_purchase"].includes(url.pathname))){forbiddenRestMethods++;res.writeHead(405);return res.end();}
          if(failRest){res.writeHead(503,{"content-type":"application/json"});return res.end('{"message":"SYNTHETIC TRANSIENT FAILURE"}');}
          target=proxyRestUrl+url.pathname.slice("/rest/v1".length)+url.search;
        } else if(url.pathname.startsWith("/auth/v1/")) target="http://127.0.0.1:54331"+url.pathname+url.search;
        else {res.writeHead(404);return res.end();}
        const chunks=[];for await(const chunk of req)chunks.push(chunk);
        const headers=Object.fromEntries(Object.entries(req.headers).filter(([k])=>!["host","connection","content-length"].includes(k)));
        const upstream=await fetch(target,{method:req.method,headers,body:["GET","HEAD"].includes(req.method)?undefined:Buffer.concat(chunks),redirect:"manual",signal:AbortSignal.timeout(15000)});
        const responseHeaders={"content-type":upstream.headers.get("content-type")??"application/json"};if(upstream.headers.has("content-range"))responseHeaders["content-range"]=upstream.headers.get("content-range");
        res.writeHead(upstream.status,responseHeaders);res.end(Buffer.from(await upstream.arrayBuffer()));
      }catch{res.writeHead(502);res.end();}
    });
    await new Promise(r=>proxy.listen(0,"127.0.0.1",r));const proxyUrl=`http://127.0.0.1:${proxy.address().port}`;
    const adminEmail=`history-admin-${run}@staging.invalid`;
    const adminCookie=await mintSession(adminEmail,proxyUrl),buyerCookie=await mintSession(`history-buyer-${run}@staging.invalid`,proxyUrl);
    const harness=join(work,"next-harness");mkdirSync(join(harness,"app/probe"),{recursive:true});mkdirSync(join(harness,"app/admin/login"),{recursive:true});
    writeFileSync(join(harness,"package.json"),JSON.stringify({name:"sfstore-local-read-probe",private:true}));
    writeFileSync(join(harness,"tsconfig.json"),JSON.stringify({extends:join(root,"tsconfig.json"),compilerOptions:{baseUrl:root,paths:{"@/*":[join(root,"*")]}},include:["**/*.ts","**/*.tsx",".next/types/**/*.ts"]}));
    writeFileSync(join(harness,"next.config.mjs"),`export default {devIndicators:false,webpack(config){config.resolve.alias["@"]= ${JSON.stringify(root.replaceAll("\\","/"))};return config;}};\n`);
    writeFileSync(join(harness,"app/layout.tsx"),"export default function Layout({children}:{children:React.ReactNode}){return <html><body>{children}</body></html>}\n");
    writeFileSync(join(harness,"app/probe/route.ts"),'import {getCommercialMonth} from "@/services/commercial-history"; export async function GET(req:Request){return Response.json(await getCommercialMonth(new URL(req.url).searchParams.get("month")??"2026-10"));}\n');
    writeFileSync(join(harness,"app/admin/login/page.tsx"),'export default function Page(){return <p>LOCAL AUTH REQUIRED</p>}\n');
    if(uiMode){
      mkdirSync(join(harness,"app/analytics-probe"),{recursive:true});
      writeFileSync(join(harness,"app/analytics-probe/route.ts"),'import {getCommercialAnalytics} from "@/services/commercial-history";export async function GET(req:Request){return Response.json(await getCommercialAnalytics(new URL(req.url).searchParams.get("month")??"2026-10"));}');
      mkdirSync(join(harness,"app/list"),{recursive:true});
      writeFileSync(join(harness,"app/list/route.ts"),'import {getCommercialList} from "@/services/commercial-history";export async function GET(req:Request){const p=new URL(req.url).searchParams;return Response.json(await getCommercialList({kind:p.get("kind")==="purchases"?"purchases":"sales",origin:(p.get("origin")??"all") as "all",page:Number(p.get("page")??1),channel:(p.get("channel")??"all") as "all",date:p.get("date")??""}));}');
      for(const route of ["compras","compras/nueva","compras/[id]","compras/[id]/editar","ventas","ventas/nueva","ventas/[id]","analytics"]){const dir=join(harness,"app/admin",route);mkdirSync(dir,{recursive:true});writeFileSync(join(dir,"page.tsx"),`export {default} from "@/app/admin/${route}/page";`);}
      writeFileSync(join(harness,"postcss.config.mjs"),readFileSync(join(root,"postcss.config.mjs"),"utf8"));
      writeFileSync(join(harness,"app/layout.tsx"),'import "@/app/globals.css";export default function Layout({children}:{children:React.ReactNode}){return <html><body>{children}</body></html>}');
    }
    const env=Object.fromEntries(["PATH","Path","SystemRoot","SYSTEMROOT","COMSPEC","PATHEXT","TEMP","TMP","USERPROFILE","LOCALAPPDATA","APPDATA"].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
    Object.assign(env,{NEXT_PUBLIC_SUPABASE_URL:proxyUrl,NEXT_PUBLIC_SUPABASE_ANON_KEY:anonKey,SUPABASE_SERVICE_ROLE_KEY:serviceKey,ADMIN_ALLOWED_EMAILS:adminEmail,NEXT_TELEMETRY_DISABLED:"1"});
    const port=3158,base=`http://127.0.0.1:${port}`;
    // Fixed loopback port must be unused; never attach to an unknown existing process.
    try{await fetch(base,{signal:AbortSignal.timeout(500)});throw new Error("LOCAL_PROBE_PORT_IN_USE");}catch(e){if(e.message==="LOCAL_PROBE_PORT_IN_USE")throw e;}
    server=spawn(process.execPath,[join(root,"node_modules/next/dist/bin/next"),"dev",harness,"--hostname","127.0.0.1","--port",String(port),"--webpack"],{cwd:root,env,windowsHide:true,stdio:["ignore","pipe","pipe"]});
    server.stdout.on("data",x=>{serverOutput=(serverOutput+x).slice(-16000);});server.stderr.on("data",x=>{serverOutput=(serverOutput+x).slice(-16000);});server.on("error",()=>{nextStopped=true;});
    for(let i=0;i<100;i++){
      if(nextStopped||server.exitCode!==null){writeFileSync(join(work,"server-error-private.log"),serverOutput);throw new Error("LOCAL_NEXT_PROBE_STOPPED");}
      try{const response=await fetch(base+"/admin/login",{signal:AbortSignal.timeout(1000)});if(response.status===200)break;}catch{}
      if(i===99){writeFileSync(join(work,"server-error-private.log"),serverOutput);throw new Error("LOCAL_NEXT_PROBE_NOT_READY");}await delay(400);
    }
    fixtureCounts=(await q("select (select count(*)::int from orders) orders,(select count(*)::int from order_items) sale_lines,(select count(*)::int from order_payments) payments,(select count(*)::int from purchases) purchases"))[0];
    const before=await fingerprint();
    const get=async(cookie,month="2026-10")=>fetch(`${base}/probe?month=${month}`,{headers:cookie?{cookie}:{},redirect:"manual",signal:AbortSignal.timeout(90000)});
    await checked("01 unauthenticated request denied before PostgREST",async()=>{const n=restGets,r=await get();assert.equal(r.status,307);assert.equal(r.headers.get("location"),"/admin/login");assert.equal(restGets,n);});
    await checked("02 real local Auth user outside allowlist denied",async()=>{const n=restGets,r=await get(buyerCookie);assert.equal(r.status,307);assert.equal(restGets,n);});
    let october,november;
    await checked("03 authorized getCommercialMonth crosses real Next/Auth/PostgREST",async()=>{
      const response=await get(adminCookie);if(response.status!==200){writeFileSync(join(work,"server-error-private.log"),serverOutput);throw new Error("AUTHORIZED_REPORT_NOT_OK");}
      october=await response.json();assert.equal(october.timeZone,"America/Argentina/Buenos_Aires");assert.ok(restGets>0);
    });
    if(!october)throw new Error("REPORT_UNAVAILABLE_STOP_REMAINING_ASSERTIONS");
    await checked("04 current and historic operations have unique IDs and unchanged origin",async()=>{assert.equal(new Set(october.sales.map(x=>x.id)).size,october.sales.length);assert.equal(october.sales.filter(x=>x.origin==="physical_historical").length,uiMode?129:3);assert.ok(october.sales.filter(x=>x.origin==="physical_current").length>100);assert.ok(october.sales.some(x=>x.id===online&&x.origin==="online"));});
    await checked("05 multiple products and combined actual payment rows are not multiplied",async()=>{const s=october.sales.find(x=>x.id===combined);assert.equal(s.totalCents,15000);assert.equal(s.approvedCents,15000);assert.equal(s.lines.length,2);assert.equal(s.payments.length,2);assert.deepEqual(s.payments.map(x=>Number(x.amount)).sort((a,b)=>a-b),[50,100]);});
    await checked("06 historical approved paid_at NULL is never turned into a date",async()=>{const receipts=october.undatedReceiptsAttributedToSales.filter(x=>historicalSales.includes(x.orderId));assert.equal(receipts.length,uiMode?129:2);assert.equal(sum(receipts.map(x=>x.amountCents)),uiMode?1935000:30000);assert.ok(receipts.every(x=>x.paidAt===null&&x.occurredOn===null));});
    await checked("07 pending totals are not approved income",async()=>{assert.equal(october.sales.find(x=>x.id===online).approvedCents,0);const p=october.sales.find(x=>x.id===partial);assert.equal(p.approvedCents,2000);assert.equal(p.pendingCents,5500);assert.equal(p.confirmed,false);});
    await checked("08 actual monthly Argentina boundary and earlier-order cash",async()=>{const r=await get(adminCookie,"2026-11");assert.equal(r.status,200);november=await r.json();assert.ok(october.sales.some(x=>x.id===currentIds[0]));assert.ok(!october.sales.some(x=>x.id===currentIds[1]));assert.ok(november.sales.some(x=>x.id===currentIds[1]));assert.ok(october.datedReceipts.some(x=>x.orderId===earlier));assert.ok(!october.sales.some(x=>x.id===earlier));});
    await checked("09 six imputed purchases use exact ledger and certified-format batch",async()=>{const ps=october.purchases.filter(x=>historicalPurchases.includes(x.id));assert.equal(ps.length,6);assert.ok(ps.every(x=>x.dateQuality==="imputed"));assert.equal(october.totals.imputedPurchasesCents,14979000);assert.ok(october.purchases.some(x=>x.id===purchase&&x.origin==="current"));});
    await checked("10 unknown historic and current costs stay NULL",async()=>{assert.ok(october.sales.filter(x=>historicalSales.includes(x.id)).every(x=>x.lineCosts.every(c=>c.unitCostCents===null)));const s=october.sales.find(x=>x.id===combined);assert.equal(s.linesWithUnknownCost,1);assert.equal(s.linesWithVerifiedCost,1);});
    await checked("11 known synthetic order excluded from receipts and commercial totals",async()=>{const s=october.sales.find(x=>x.id===synthetic);assert.equal(s.excluded,true);assert.ok(!october.datedReceipts.some(x=>x.orderId===synthetic));const wanted=await q("select sum(total)::text n from orders where status<>'cancelled' and id<>$1 and (case when historical_import then historical_occurred_on else (created_at at time zone 'America/Argentina/Buenos_Aires')::date end)>='2026-10-01' and (case when historical_import then historical_occurred_on else (created_at at time zone 'America/Argentina/Buenos_Aires')::date end)<'2026-11-01'",[synthetic]);assert.equal(october.totals.registeredSalesCents,Math.round(Number(wanted[0].n)*100));});
    const sdk=createClient(proxyUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
    await checked("12 real PostgREST clamp of seven returns complete data beyond 100",async()=>{const snapshot=await readCompleteSnapshot(createCommercialPageReader(sdk));assert.equal(snapshot.orders.length,(await q("select count(*)::int n from orders"))[0].n);assert.ok(snapshot.orders.length>100);});
    await checked("13 actual transport failure is explicit, never partial zero totals",async()=>{failRest=true;try{await assert.rejects(()=>readCompleteSnapshot(createCommercialPageReader(sdk)),/COMMERCIAL_READ_FAILED_NO_PARTIAL_REPORT/);}finally{failRest=false;}});
    await checked("14 reader generated only GETs and no business writes",async()=>{const after=await fingerprint();assert.deepEqual(after,before);assert.equal(forbiddenRestMethods,0);assert.deepEqual([...requestMethods],["GET"]);});
    await checked("15 future DTO contracts retain originals, separate temporal scopes and caveats",async()=>{assert.equal(october.consistency,"best_effort_multi_select_not_transaction_snapshot");assert.equal(october.provisional,true);assert.ok(october.sales.every(x=>x.original&&x.lines&&x.payments));assert.ok(october.purchases.every(x=>x.original&&x.dateQuality));assert.ok(october.paymentMethodsForSales.some(x=>x.method==="transfer"));});

    if(uiMode){
      const allBefore=await fingerprint();
      await checked("16 bounded real pagination reaches all180 purchases and129 sales",async()=>{
        for(const[kind,total]of[["purchases",180],["sales",129]]){
          const seen=[];
          for(let page=1;page<=Math.ceil(total/20);page++){
            const n=restQueries.length;
            const response=await fetch(`${base}/list?kind=${kind}&origin=historical&page=${page}`,{headers:{cookie:adminCookie}});
            assert.equal(response.status,200);const data=await response.json();assert.equal(data.total,total);seen.push(...data[kind].map(x=>x.id));
            const parent=restQueries.slice(n).filter(x=>x.path.endsWith(kind==="sales"?"/orders":"/purchases"));
            assert.ok(parent.every(x=>Number(new URLSearchParams(x.search).get("limit"))<=20));
            const related=restQueries.slice(n).filter(x=>!parent.includes(x));
            assert.ok(related.every(x=>{const p=new URLSearchParams(x.search);return["id","order_id","purchase_id","target_id"].some(k=>p.get(k)?.startsWith("in.("));}));
          }
          assert.equal(seen.length,total);assert.equal(new Set(seen).size,total);
        }
      });
      await checked("17 real current/historical/all and commercial date filters",async()=>{
        for(const origin of ["all","current","historical"]){const response=await fetch(`${base}/list?kind=sales&origin=${origin}`,{headers:{cookie:adminCookie}});assert.equal(response.status,200);const d=await response.json();assert.ok(d.sales.every(x=>origin==="all"||x.original.historical_import===(origin==="historical")));}
        const response=await fetch(`${base}/list?kind=sales&channel=store&date=2026-10-31`,{headers:{cookie:adminCookie}});assert.equal(response.status,200);const d=await response.json();assert.equal(d.sales.length,1);assert.equal(d.sales[0].id,currentIds[0]);
      });
      const modulePath=process.env.SFSTORE_TEST_PLAYWRIGHT_MODULE;
      assert.ok(modulePath,"LOCAL_PLAYWRIGHT_MODULE_REQUIRED");
      const {chromium}=createRequire(import.meta.url)(modulePath);browser=await chromium.launch({headless:true,channel:"msedge"});
      const context=await browser.newContext();
      await context.route("**/*",route=>{const url=new URL(route.request().url());return[url.origin===base,url.origin===proxyUrl].some(Boolean)?route.continue():route.abort();});
      await context.addCookies(adminCookie.split("; ").map(s=>{const i=s.indexOf("=");return{name:s.slice(0,i),value:s.slice(i+1),url:base,httpOnly:true,sameSite:"Lax"};}));
      const page=await context.newPage();page.setDefaultTimeout(20000);
      await checked("18 historical pages and details at notebook and mobile have no commercial actions or overflow",async()=>{
        for(const[device,viewport]of[["notebook",{width:1366,height:900}],["mobile",{width:390,height:844}]]){
          await page.setViewportSize(viewport);
          for(const[kind,url]of[["compras-list","/admin/compras?origin=historical"],["ventas-list","/admin/ventas?origin=historical"],["compra-detail",`/admin/compras/${historicalPurchases[0]}`],["venta-detail",`/admin/ventas/${historicalSales[0]}`]]){
            await page.goto(base+url);await page.getByText("Histórico · Excel",{exact:true}).first().waitFor();
            if(kind.endsWith("detail")){
              assert.equal(await page.getByRole("button",{name:/Agregar pago|Confirmar compra|Cancelar borrador/}).count(),0);
              assert.equal(await page.getByRole("link",{name:"Editar",exact:true}).count(),0);
              if(kind.startsWith("venta")){await page.getByText("Costo no disponible",{exact:true}).first().waitFor();await page.getByText("Fecha de acreditación no disponible",{exact:true}).first().waitFor();}
              else await page.getByText("Fecha imputada",{exact:true}).waitFor();
            }
            await page.waitForLoadState("networkidle");
            assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
            await page.screenshot({path:join(work,`${device}-${kind}.png`),fullPage:true});
          }
        }
      });
      await checked("19 forged historical payment and confirmation Server Actions reject before mutation",async()=>{
        await page.goto(`${base}/admin/ventas/${partial}`);await page.waitForLoadState("networkidle");
        await page.locator('[name=orderId]').evaluate((el,id)=>{el.value=id;},historicalSales[0]);
        await page.getByRole("button",{name:"Agregar pago",exact:true}).click();await page.getByRole("alert").filter({hasText:"Los registros históricos son de solo lectura."}).waitFor();
        await page.goto(`${base}/admin/compras/${draft}`);await page.waitForLoadState("networkidle");
        await page.locator('[name=purchaseId]').last().evaluate((el,id)=>{el.value=id;},historicalPurchases[0]);
        page.once("dialog",dialog=>dialog.accept());await page.getByRole("button",{name:"Confirmar compra",exact:true}).click();await page.getByRole("alert").filter({hasText:"Los registros históricos son de solo lectura."}).waitFor();
        assert.deepEqual(await fingerprint(),allBefore);
      });
      await checked("21 monthly analytics real Auth, complete ledger and six-month single read",async()=>{
        for(const cookie of [null,buyerCookie]){const n=restGets;const response=await fetch(`${base}/analytics-probe`,{headers:cookie?{cookie}:{},redirect:"manual"});assert.equal(response.status,307);assert.equal(restGets,n);}
        const n=restQueries.length,response=await fetch(`${base}/analytics-probe?month=2026-10`,{headers:{cookie:adminCookie}});assert.equal(response.status,200);const data=await response.json();
        assert.deepEqual(data.report.totals,october.totals);assert.equal(data.trend.length,6);assert.equal(data.trend.at(-1).confirmedSalesCents,october.totals.confirmedSalesCents);
        assert.equal(data.report.totals.undatedApprovedForSalesCents,1935000);assert.equal(data.counts.imputedPurchases,6);assert.ok(data.margin.unknownRevenueCents>0);assert.ok(data.margin.unknownCostLines>=258);
        assert.equal(data.channels.reduce((n,x)=>n+x.amountCents,0),october.totals.confirmedSalesCents);
        for(const table of ["orders","order_items","order_payments","purchases","purchase_items","historical_import_records","products","historical_import_batches"]){const firstPages=restQueries.slice(n).filter(x=>x.path.endsWith('/'+table)&&!new URLSearchParams(x.search).has("id"));assert.equal(firstPages.length,1,`SINGLE_SNAPSHOT_${table}`);}
        assert.deepEqual(await fingerprint(),allBefore);
      });
      await checked("22 monthly analytics responsive UI, filters, empty and explicit error states",async()=>{
        for(const[device,viewport]of[["notebook",{width:1366,height:900}],["mobile",{width:390,height:844}]]){
          await page.setViewportSize(viewport);await page.goto(`${base}/admin/analytics?month=2026-10`);await page.getByRole("heading",{name:"Resumen comercial mensual",exact:true}).waitFor();await page.locator('[data-testid=commercial-analytics]').waitFor();
          await page.getByRole("heading",{name:"Facturación comercial confirmada",exact:true}).waitFor();await page.getByText("Sin fecha de acreditación, atribuidos a ventas del mes",{exact:true}).waitFor();
          await page.waitForLoadState("networkidle");assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);await page.screenshot({path:join(work,`${device}-analytics.png`),fullPage:true});
        }
        await page.getByLabel("Mes y año").fill("2025-01");await page.getByRole("button",{name:"Consultar",exact:true}).click();await page.getByText("No hay ventas registradas en este mes.",{exact:true}).waitFor();assert.ok(page.url().includes("month=2025-01"));
        await page.goto(`${base}/admin/analytics?month=bad`);await page.getByRole("alert").filter({hasText:"Elegí un mes válido"}).waitFor();assert.equal(await page.locator('[data-testid=commercial-analytics]').count(),0);
        failRest=true;try{await page.goto(`${base}/admin/analytics?month=2026-10`);await page.getByRole("alert").filter({hasText:"No se muestran totales parciales"}).waitFor();assert.equal(await page.locator('[data-testid=commercial-analytics]').count(),0);}finally{failRest=false;}
        assert.deepEqual(await fingerprint(),allBefore);assert.equal(forbiddenRestMethods,0);
      });
      await checked("20 existing current purchase and sale forms still persist on isolated fixtures",async()=>{
        allowOperationalWrites=true;
        // Normal local PostgREST write mode was prepared initially for this final fixture-only stage.
        await page.goto(`${base}/admin/compras/${draft}`);await page.waitForLoadState("networkidle");
        const stockBefore=Number((await q("select stock from products where id=$1",[a]))[0].stock);
        page.once("dialog",dialog=>dialog.accept());await page.getByRole("button",{name:"Confirmar compra",exact:true}).click();
        for(let i=0;i<60;i++){if((await q("select status from purchases where id=$1",[draft]))[0].status==="confirmed")break;await delay(100);}
        assert.equal((await q("select status from purchases where id=$1",[draft]))[0].status,"confirmed","CURRENT_PURCHASE_CONFIRMATION_FAILED");
        await page.getByText("Confirmada",{exact:true}).waitFor();assert.equal(Number((await q("select stock from products where id=$1",[a]))[0].stock),stockBefore+2);
        await page.goto(`${base}/admin/compras/nueva`);await page.getByRole("heading",{name:"Nueva compra",exact:true}).waitFor();await page.getByRole("button",{name:"Guardar borrador",exact:true}).waitFor();
        await page.waitForLoadState("networkidle");await page.locator('[name=supplierId]').selectOption(supplier);await page.locator('[name=purchaseDate]').fill("2026-10-10");
        await page.getByRole("searchbox").first().fill("SYNTHETIC UNIT");await page.getByRole("button",{name:"SYNTHETIC UNIT",exact:true}).first().click();
        await page.locator('[name=quantity]').first().fill("1");await page.locator('[name=unitPurchaseCost]').first().fill("20");await page.locator('[name=shippingCost]').fill("0");
        await page.getByRole("button",{name:"Guardar borrador",exact:true}).click();await page.waitForURL(/\/admin\/compras\/[0-9a-f-]{36}$/);
        const savedId=page.url().split('/').at(-1);assert.equal((await q("select status from purchases where id=$1",[savedId]))[0].status,"draft");
        await page.goto(`${base}/admin/ventas/nueva`);await page.waitForLoadState("networkidle");
        await page.getByRole("searchbox").fill("SYNTHETIC UNIT");await page.getByRole("button",{name:/SYNTHETIC UNIT/}).first().click();
        await page.locator('[name=quantity]').fill("1");await page.locator('[name=paymentMethod]').first().selectOption("cash");await page.locator('[name=paymentAmount]').first().fill("75");
        await page.getByRole("button",{name:"Registrar venta",exact:true}).click();await page.getByRole("status").filter({hasText:"Venta cobrada y confirmada"}).waitFor();
        const href=await page.getByRole("link",{name:"Ver venta",exact:true}).getAttribute("href");
        const row=(await q("select total,payment_status from orders where id=$1",[href.split('/').at(-1)]))[0];assert.equal(Number(row.total),75);assert.equal(row.payment_status,"paid");
      });
      await context.close();
    }
  } catch(error) {
    results.push({case:"SETUP_OR_FATAL",status:"FAIL",code:String(error.code??error.message??error.name).slice(0,160)});
    throw error;
  } finally {
    await browser?.close().catch(()=>{});
    if(server?.pid){spawnSync("taskkill",["/PID",String(server.pid),"/T","/F"],{stdio:"ignore",windowsHide:true});}
    if(proxy)await new Promise(r=>proxy.close(r));
    await db?.end().catch(()=>{});
    const authCleanup={created:authUsers.length,removed:0};
    for(const id of authUsers) {
      try {const result=await localAuth.auth.admin.deleteUser(id);if(!result.error)authCleanup.removed++;}catch{}
    }
    const cleanup=[];
    for(const resource of resources.reverse())try{
      if(resource.kind==="container")assert.equal(inspect(resource.name).Config.Labels["sfstore.test.run"],run);
      else assert.equal(JSON.parse(docker(["network","inspect",resource.name]))[0].Labels["sfstore.test.run"],run);
      docker(resource.kind==="container"?["rm","-f",resource.name]:["network","rm",resource.name]);cleanup.push({kind:resource.kind,removed:true});
    }catch{cleanup.push({kind:resource.kind,removed:false});}
    writeFileSync(join(work,"result.json"),JSON.stringify({run,localOnly:true,uiMode,postgres:"17.6",postgrest:"16.4",localAuthProject:localProject,captchaUnchanged:true,authMethod:"synthetic local users + admin email OTP + real getUser/SSR cookies; no CAPTCHA claim",existingCheckoutCommercialTablesNotUsedForFixtures:true,postgrestLoginDefaultsReadOnly:!uiMode,fixtureCounts,authCleanup,restGets,forbiddenRestMethods,results,cleanup,finishedAt:new Date().toISOString()},null,2));
    // Remove only this run's generated application, never reports or other worktrees.
    const generated=resolve(work,"next-harness");
    assert.equal(resolve(generated,".."),resolve(work));
    assert.ok(resolve(work).startsWith(resolve(root,"staging/runtime/commercial-history-integration")));
    if(existsSync(generated))rmSync(generated,{recursive:true,force:false});
    assert.equal(authCleanup.removed,authCleanup.created,"LOCAL_SYNTHETIC_AUTH_CLEANUP_INCOMPLETE");
    assert.ok(cleanup.every(x=>x.removed),"OWNED_LOCAL_CONTAINER_CLEANUP_INCOMPLETE");
  }
});
