"""Start only the isolated local Supabase project; never log CLI credentials."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import tomllib

ROOT = Path(__file__).resolve().parents[1]
PROJECT = 'sfstore-checkout-synthetic-staging'
TEST_SITE = '1x00000000000000000000AA'
TEST_SECRET = '1x0000000000000000000000000000000AA'

def settings(root):
    config = tomllib.loads((root/'staging/supabase/config.toml').read_text())
    if config['project_id'] != PROJECT or config['api']['port'] != 54331 or config['db']['port'] != 54332:
        raise ValueError('Unexpected local project or ports')
    if (root/'staging/supabase/.temp/project-ref').exists():
        raise ValueError('Linked projects are forbidden')
    if not config['auth']['enable_anonymous_sign_ins'] or not config['auth']['captcha']['enabled']:
        raise ValueError('Anonymous Auth and CAPTCHA must remain enabled')
    path=root/'staging/runtime/captcha-test.env'
    if path.is_symlink():
        raise ValueError('Runtime file must not be a symlink')
    if path.stat().st_mode & 0o077:
        raise ValueError('Private runtime file must have mode 0600')
    values={}
    for line in path.read_text().splitlines():
        if line and not line.startswith('#'):
            key,value=line.split('=',1);values[key]=value
    if set(values) != {'SFSTORE_CAPTCHA_TEST_ONLY','NEXT_PUBLIC_CHECKOUT_TURNSTILE_SITE_KEY','SUPABASE_AUTH_CAPTCHA_SECRET'}:
        raise ValueError('Unexpected runtime variables')
    if values.get('SFSTORE_CAPTCHA_TEST_ONLY')!='true' or values.get('NEXT_PUBLIC_CHECKOUT_TURNSTILE_SITE_KEY')!=TEST_SITE or values.get('SUPABASE_AUTH_CAPTCHA_SECRET')!=TEST_SECRET:
        raise ValueError('Only approved official public test keys are accepted here')
    return values

def diagnosis(output):
    if 'public.ecr.aws' in output and 'Forbidden' in output:
        return 'BLOCKED: network policy rejects registry public.ecr.aws'
    if 'certificate' in output.lower():
        return 'BLOCKED: container TLS trust needs the managed CA; keep verification enabled'
    return 'Supabase command failed; raw output withheld to protect credentials'

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cli',default='/workspace/sfstore-staging-tools/supabase')
    parser.add_argument('--preflight',action='store_true')
    args=parser.parse_args();values=settings(ROOT)
    if args.preflight:
        print('Local-only project, unlinked configuration, CAPTCHA test mode and private file verified')
        return 0
    env=os.environ.copy()
    for key in ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH']:
        env.pop(key,None)
    env['DOCKER_HOST']='unix:///var/run/docker.sock'
    env.update(values)
    # No --linked, --db-url, debug, remote migration, secrets in arguments or raw logs.
    command=[args.cli,'start','--workdir','staging','--exclude','realtime,imgproxy,edge-runtime,logflare,vector,supavisor,studio,postgres-meta,mailpit']
    print('Starting isolated local Auth/PostgREST/Storage/DB; CLI output held in memory',flush=True)
    result=subprocess.run(command,cwd=ROOT,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
    if result.returncode:
        print(diagnosis(result.stdout));return result.returncode
    status=subprocess.run([args.cli,'status','--workdir','staging','--output','json'],cwd=ROOT,env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
    if status.returncode:
        print('Local stack started but status collection failed; no credentials written');return status.returncode
    data=json.loads(status.stdout)
    if data.get('API_URL') not in ['http://127.0.0.1:54331','http://localhost:54331']:
        raise ValueError('Unexpected API URL; credentials discarded')
    for name in ['ANON_KEY','SERVICE_ROLE_KEY']:
        if not isinstance(data.get(name),str) or not data[name]:raise ValueError('Missing local API keys')
    runtime=ROOT/'staging/runtime';runtime.mkdir(exist_ok=True,mode=0o700);os.chmod(runtime,0o700)
    mapping={'NEXT_PUBLIC_SUPABASE_URL':data['API_URL'],'NEXT_PUBLIC_SUPABASE_ANON_KEY':data['ANON_KEY'],'SUPABASE_SERVICE_ROLE_KEY':data['SERVICE_ROLE_KEY'],'CHECKOUT_GUEST_ENABLED':'true','NEXT_PUBLIC_CHECKOUT_TURNSTILE_SITE_KEY':TEST_SITE,'ADMIN_ALLOWED_EMAILS':'admin@staging.invalid','SFSTORE_LOCAL_STAGING':'true'}
    path=runtime/'app.env'
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600)
    os.fchmod(fd,0o600)
    with os.fdopen(fd,'w') as file:
        for key,value in mapping.items():file.write(key+'='+value+'\n')
    print('Local services started; local app variables stored privately (0600), values suppressed')
    return 0

if __name__=='__main__':
    try:sys.exit(main())
    except (ValueError,OSError,KeyError,json.JSONDecodeError):
        print('Local staging preflight/configuration failed; values suppressed',file=sys.stderr);sys.exit(1)
