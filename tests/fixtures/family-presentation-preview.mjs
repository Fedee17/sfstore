// Local, GET-only synthetic catalogue. No real credentials or database writes.
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {fixtureId,startPublicFixtureServer,publicRows} from './search-public-catalog.mjs';
const root=process.cwd();
for(const file of ['.env','.env.local','.env.development','.env.development.local'])assert.equal(existsSync(resolve(root,file)),false,'REFUSE_ENV_FILE');
const env={...process.env};for(const key of Object.keys(env))if(/SUPABASE|TURNSTILE|CAPTCHA|ADMIN_|MERCADO|MP_|TOKEN|SECRET|PASSWORD/i.test(key))delete env[key];
const cover='https://xspvoicelbxlmtqoiolc.supabase.co/storage/v1/object/public/product-images/products/5585ed23-1d19-40b0-a443-81953a999e9c/7b39b57749fafde6eddde539961f1724.webp';
const syntheticImage=(label)=>'data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500"><rect width="500" height="500" fill="#eef2f6"/><text x="250" y="220" text-anchor="middle" fill="#102033" font-family="Arial" font-size="24">PRUEBA LOCAL</text><text x="250" y="265" text-anchor="middle" fill="#102033" font-family="Arial" font-size="20">${label}</text></svg>`);
const colors=['Negro','Gris','Morado','Rosa claro','Verde'];
const rows=colors.map((color,i)=>({...publicRows[2],id:color==='Gris'?'475f74c8-622e-5f0b-801b-309041a3dc3e':fixtureId(300+i),
 name:`Termo Stanley 1L — Pico MateSystem — ${color} · PRUEBA LOCAL`,slug:`stanley-${i}-prueba`,
 family_id:'e0eab95c-2f62-5e54-8d12-69870bffbaf8',family_name:'Termo Stanley 1L — Pico MateSystem · PRUEBA LOCAL',family_slug:'familia-p03-prueba',
 variant_options:{Color:color},sku:`PRUEBA-${i}`,price:color==='Morado'?60000:46666.67,stock:color==='Verde'?0:2,
 product_images:[{url:color==='Gris'?cover:syntheticImage(color),alt:`${color} — prueba local`,is_primary:true,sort_order:0},
 {url:syntheticImage(`Detalle ${color}`),alt:`Detalle ${color} — prueba local`,is_primary:false,sort_order:1}],
}));
const fixture=await startPublicFixtureServer({rows:[...rows,publicRows[0]],offers:[]});
Object.assign(env,{NEXT_PUBLIC_SUPABASE_URL:fixture.url,NEXT_PUBLIC_SUPABASE_ANON_KEY:'synthetic-fixture-no-privileges',NEXT_TELEMETRY_DISABLED:'1',CHECKOUT_GUEST_ENABLED:'false'});
const build=process.argv.includes('--build');
const child=spawn(process.execPath,[resolve(root,'node_modules/next/dist/bin/next'),...(build?['build','--webpack']:['dev','--hostname','127.0.0.1','--port','3154','--webpack'])],{cwd:root,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
child.stdout.pipe(process.stdout);child.stderr.pipe(process.stderr);
let closing=false;
async function stop(){if(closing)return;closing=true;if(child.exitCode===null){if(process.platform==='win32')spawnSync('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});else child.kill('SIGTERM');}fixture.server.closeAllConnections();await new Promise(done=>fixture.server.close(done));console.log(JSON.stringify({closed:true,writes:fixture.requests.filter(r=>r.method!=='GET').length}));}
process.once('SIGINT',()=>stop().then(()=>process.exit(0)));process.once('SIGTERM',()=>stop().then(()=>process.exit(0)));child.once('exit',code=>{process.exitCode=code??1;stop()});
console.log(JSON.stringify({localOnly:true,url:'http://127.0.0.1:3154/producto/familia-p03-prueba',credentials:'synthetic',databaseWrites:false}));
