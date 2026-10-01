// @vitest-environment node
import { beforeEach, afterEach, it, expect } from 'vitest';
import { Miniflare } from 'miniflare';
import { readFileSync } from 'node:fs';
import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { isoCBOR } from '@simplewebauthn/server/helpers';
import { createAuth, ensureOwner } from './auth';
import type { WorkerEnv } from './types';
let mf: Miniflare, env: WorkerEnv, auth: ReturnType<typeof createAuth>, mail: string[];
beforeEach(async()=>{
 mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-07-05',d1Databases:['DB']});
 const DB=await mf.getD1Database('DB');
 env={DB,OWNER_EMAIL:'owner@example.test',APP_ORIGIN:'https://highlights.example.test',BETTER_AUTH_SECRET:'test-secret-very-long-for-auth-only-123456789'} as unknown as WorkerEnv;
 for(const f of ['0001_initial.sql','0002_private_sync.sql','0003_better_auth.sql']) await DB.exec(readFileSync('worker/migrations/'+f,'utf8').replace(/\n/g,' '));
 await ensureOwner(env);mail=[];auth=createAuth(env,async({otp})=>{mail.push(otp);});
});
afterEach(async()=>{await mf?.dispose();});
function call(path:string,body?:unknown,cookie?:string){return auth.handler(new Request(env.APP_ORIGIN+'/api/auth/'+path,{method:body===undefined?'GET':'POST',headers:{Origin:env.APP_ORIGIN!,'Content-Type':'application/json','CF-Connecting-IP':'203.0.113.7',...(cookie?{Cookie:cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})}));}
async function login(){expect((await call('email-otp/send-verification-otp',{email:env.OWNER_EMAIL,type:'sign-in'})).status).toBe(200);const res=await call('sign-in/email-otp',{email:env.OWNER_EMAIL,otp:mail.at(-1)});expect(res.status).toBe(200);return res.headers.get('set-cookie')!.split(';')[0];}
it('allows only seeded owner and never enables public signup',async()=>{
 expect((await call('sign-up/email',{email:'stranger@example.test',password:'long-password123',name:'Stranger'})).status).not.toBe(200);
 await call('email-otp/send-verification-otp',{email:'stranger@example.test',type:'sign-in'});expect(mail).toHaveLength(0);
 const cookie=await login();const session=await auth.api.getSession({headers:new Headers({Cookie:cookie})});expect(session?.user.email).toBe(env.OWNER_EMAIL);
 expect((await call('sign-in/email-otp',{email:env.OWNER_EMAIL,otp:mail.at(-1)})).status).not.toBe(200);
});
it('requires a fresh session for passkey enrollment and uses this host as RP',async()=>{
 expect((await call('passkey/generate-register-options')).status).not.toBe(200);
 const cookie=await login();const response=await call('passkey/generate-register-options',undefined,cookie);expect(response.status).toBe(200);const options=await response.json() as {rp:{id:string},authenticatorSelection:{authenticatorAttachment?:string}};expect(options.rp.id).toBe('highlights.example.test');expect(options.authenticatorSelection.authenticatorAttachment).toBeUndefined();
 await env.DB.prepare('update session set createdAt=?').bind(Date.now()-11*60*1000).run();
 expect((await call('passkey/generate-register-options',undefined,cookie)).status).not.toBe(200);
 expect((await call('recovery/generate',{},cookie)).status).not.toBe(200);
});
it('recovery codes are hashed, single-use and revoke old sessions; rotation replaces the batch',async()=>{
 const cookie=await login();const generated=await call('recovery/generate',{},cookie);expect(generated.status).toBe(200);const {codes}=await generated.json() as {codes:string[]};expect(codes).toHaveLength(10);
 const stored=await env.DB.prepare('select * from recoveryCode').all();expect(JSON.stringify(stored)).not.toContain(codes[0]);
 const recovered=await call('recovery/sign-in',{code:codes[0]});expect(recovered.status).toBe(200);expect(await auth.api.getSession({headers:new Headers({Cookie:cookie})})).toBeNull();
 expect((await call('recovery/sign-in',{code:codes[0]})).status).not.toBe(200);
 const nextCookie=recovered.headers.get('set-cookie')!.split(';')[0];expect((await call('recovery/generate',{},nextCookie)).status).toBe(200);expect((await call('recovery/sign-in',{code:codes[1]})).status).not.toBe(200);
});

it('rejects cross-site or missing-origin challenge requests',async()=>{
 for(const headers of [{Origin:'https://evil.test'},{'Sec-Fetch-Site':'same-site',Referer:env.APP_ORIGIN+'/'},{}] as Record<string,string>[]){
 const result=await auth.handler(new Request(env.APP_ORIGIN+'/api/auth/passkey/generate-authenticate-options',{headers}));expect(result.status).toBe(403);
 }
 const result=await call('passkey/generate-authenticate-options');expect(result.status).toBe(200);
});

it('verifies a synced software passkey cryptographically and rejects absent UV, wrong origin, wrong RP and replay',async()=>{
 const ownerCookie=await login();
 const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
 const jwk=publicKey.export({format:'jwk'}),credentialId=randomBytes(32),id=credentialId.toString('base64url');
 const encode=(bytes:Uint8Array)=>Buffer.from(bytes).toString('base64url');
 const sha=(input:string|Uint8Array)=>createHash('sha256').update(input).digest();
 const cookies=(response:Response)=>response.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
 const rp=new URL(env.APP_ORIGIN!).hostname;
 const optionsResponse=await call('passkey/generate-register-options',undefined,ownerCookie);
 expect(optionsResponse.status).toBe(200);
 const options=await optionsResponse.json() as {challenge:string};
 const clientData=Buffer.from(JSON.stringify({type:'webauthn.create',challenge:options.challenge,origin:env.APP_ORIGIN,crossOrigin:false}));
 const cose=isoCBOR.encode(new Map<number,number|Uint8Array>([[1,2],[3,-7],[-1,1],[-2,Buffer.from(jwk.x!,'base64url')],[-3,Buffer.from(jwk.y!,'base64url')]]));
 const length=Buffer.alloc(2);length.writeUInt16BE(credentialId.length);
 // UP + UV + backup eligible + backed up + attested credential: a synced passkey.
 const authData=Buffer.concat([sha(rp),Buffer.from([0x5d]),Buffer.alloc(4),Buffer.alloc(16),length,credentialId,cose]);
 const attestation=isoCBOR.encode(new Map<string,string|Map<string,never>|Uint8Array>([['fmt','none'],['attStmt',new Map<string,never>()],['authData',authData]]));
 const registered=await call('passkey/verify-registration',{name:'Software synced passkey',response:{id,rawId:id,type:'public-key',clientExtensionResults:{},response:{clientDataJSON:encode(clientData),attestationObject:encode(attestation),transports:['internal','hybrid']}}},ownerCookie+'; '+cookies(optionsResponse));
 expect(registered.status,await registered.clone().text()).toBe(200);
 const stored=await env.DB.prepare('SELECT deviceType,backedUp FROM passkey WHERE credentialID=?').bind(id).first();
 expect(stored?.deviceType).toBe('multiDevice');expect(Boolean(stored?.backedUp)).toBe(true);
 await env.DB.prepare('DELETE FROM session').run();
 let counter=0;
 async function assertion({uv=true,origin=env.APP_ORIGIN!,rpId=rp}={}){
  const challengeResponse=await call('passkey/generate-authenticate-options');expect(challengeResponse.status).toBe(200);
  const {challenge}=await challengeResponse.json() as {challenge:string};
  const client=Buffer.from(JSON.stringify({type:'webauthn.get',challenge,origin,crossOrigin:false}));
  const count=Buffer.alloc(4);count.writeUInt32BE(++counter);
  const authenticator=Buffer.concat([sha(rpId),Buffer.from([uv?0x1d:0x19]),count]);
  const signature=sign('sha256',Buffer.concat([authenticator,sha(client)]),privateKey);
  const body={response:{id,rawId:id,type:'public-key',clientExtensionResults:{},response:{clientDataJSON:encode(client),authenticatorData:encode(authenticator),signature:encode(signature),userHandle:Buffer.from('highlights-owner').toString('base64url')}}};
  const cookie=cookies(challengeResponse);
  return {response:await call('passkey/verify-authentication',body,cookie),body,cookie};
 }
 for(const scenario of [{uv:false},{origin:'https://evil.example'},{rpId:'evil.example'}]){
  const attempt=await assertion(scenario);expect(attempt.response.status).not.toBe(200);
  if('uv' in scenario){expect(attempt.response.status).toBe(401);expect(await attempt.response.json()).toMatchObject({message:'Verify with your device PIN or biometrics to sign in.'});}
  const sessions=await env.DB.prepare('SELECT COUNT(*) AS count FROM session').first();expect(sessions?.count).toBe(0);
 }
 const good=await assertion();expect(good.response.status,await good.response.clone().text()).toBe(200);
 const session=await auth.api.getSession({headers:new Headers({Cookie:cookies(good.response)})});expect(session?.user.email).toBe(env.OWNER_EMAIL);
 expect((await call('passkey/verify-authentication',good.body,good.cookie)).status).not.toBe(200);
});
