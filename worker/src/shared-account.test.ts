// @vitest-environment node
import {test,expect,vi} from 'vitest';
import {Miniflare} from 'miniflare';
import {readFile} from 'node:fs/promises';
import {betterAuth} from 'better-auth';
import {jwt,emailOTP} from 'better-auth/plugins';
import {oauthProvider} from '@better-auth/oauth-provider';
import {sharedAuth,sharedSession} from './shared-account';
import {ensureOwner,authRoute} from './auth';
import type {WorkerEnv} from './types';

test('real shared OAuth login preserves owner, binds each session and honors central revocation',async()=>{
 const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-07-05',d1Databases:['DB','AUTH']});
 try{
 const DB=await mf.getD1Database('DB'),AUTH=await mf.getD1Database('AUTH');
 for(const name of ['DB','AUTH']){
  const db=name==='DB'?DB:AUTH;
  for(const file of ['worker/migrations/0003_better_auth.sql',name==='DB'?'worker/migrations/0004_shared_account.sql':'worker/fixtures/shared-provider.sql'])for(const sql of (await readFile(file,'utf8')).split(';').filter(x=>x.trim()))await db.prepare(sql).run();
 }
 const env={DB,APP_ORIGIN:'https://highlights.example.com',SHARED_AUTH_ORIGIN:'https://later.example.com',OWNER_EMAIL:'owner@example.com',BETTER_AUTH_SECRET:'local-client-secret-abcdefghijklmnopqrstuvwxyz123456',SHARED_CLIENT_SECRET:'local-oauth-client-secret-abcdefghijklmnopqrstuvwxyz'} as unknown as WorkerEnv;
 let otp='';
 const authority=betterAuth({baseURL:env.SHARED_AUTH_ORIGIN,secret:'local-authority-secret-abcdefghijklmnopqrstuvwxyz123456',database:AUTH,plugins:[jwt(),emailOTP({disableSignUp:true,sendVerificationOTP:async m=>{otp=m.otp;}}),oauthProvider({loginPage:'/login',consentPage:'/login',scopes:['openid','email','profile'],generateClientId:()=> 'highlights',generateClientSecret:()=>env.SHARED_CLIENT_SECRET!})]});
 const send:typeof fetch=async(input,init)=>{const req=new Request(input,init);if(new URL(req.url).origin!==env.SHARED_AUTH_ORIGIN)throw new Error('Unexpected test network');return authority.handler(req);};vi.stubGlobal('fetch',send);
 await AUTH.prepare('INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,?,?,?)').bind('central-owner','Owner',env.OWNER_EMAIL,1,Date.now(),Date.now()).run();await ensureOwner(env);
 const central=(path:string,body?:unknown,cookie?:string)=>authority.handler(new Request(env.SHARED_AUTH_ORIGIN+'/api/auth/'+path,{method:body?'POST':'GET',headers:{Origin:env.SHARED_AUTH_ORIGIN!,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(body?{body:JSON.stringify(body)}:{})}));
 await central('email-otp/send-verification-otp',{email:env.OWNER_EMAIL,type:'sign-in'});const login=await central('sign-in/email-otp',{email:env.OWNER_EMAIL,otp});const ownerCookie=login.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
 await authority.api.adminCreateOAuthClient({headers:new Headers({Cookie:ownerCookie}),body:{client_name:'Highlights',redirect_uris:[env.APP_ORIGIN+'/api/auth/callback/personal'],scope:'openid email profile',token_endpoint_auth_method:'client_secret_post',grant_types:['authorization_code'],require_pkce:true,skip_consent:true,enable_end_session:true,post_logout_redirect_uris:[env.APP_ORIGIN+'/']}});
 const client=sharedAuth(env,send);
 const start=await client.handler(new Request(env.APP_ORIGIN+'/api/auth/sign-in/social',{method:'POST',headers:{Origin:env.APP_ORIGIN!,'Content-Type':'application/json'},body:JSON.stringify({provider:'personal',callbackURL:env.APP_ORIGIN+'/#capture'})}));expect(start.status).toBe(200);const {url}=await start.json() as {url:string};expect(new URL(url).searchParams.get('code_challenge_method')).toBe('S256');
 const authorization=await authority.handler(new Request(url,{headers:{Cookie:ownerCookie}}));expect(authorization.status).toBe(302);
 const callback=await sharedAuth(env,send).handler(new Request(authorization.headers.get('location')!,{headers:{Cookie:start.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ')}}));
 expect(callback.headers.get('location')).toBe(env.APP_ORIGIN+'/#capture');
 const localCookie=callback.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');expect(localCookie).toContain('session_token');
 const request=new Request(env.APP_ORIGIN+'/api/auth/session',{headers:{Cookie:localCookie}});
 expect((await sharedSession(request,env,send))?.user.id).toBe('highlights-owner');
 const raw=await DB.prepare('SELECT sharedAccessToken FROM session').first<{sharedAccessToken:string}>();expect(raw?.sharedAccessToken).toBeTruthy();
 const publicSession=await authRoute(new Request(env.APP_ORIGIN+'/api/auth/get-session',{headers:{Cookie:localCookie}}),env,{},send);expect(await publicSession.text()).not.toContain(raw!.sharedAccessToken);
 expect((await authRoute(new Request(env.APP_ORIGIN+'/api/auth/sign-in/email-otp',{method:'POST'}),env,{},send)).status).toBe(409);
 const logout=await authRoute(new Request(env.APP_ORIGIN+'/api/auth/logout',{method:'POST',headers:{Origin:env.APP_ORIGIN!,'Content-Type':'application/json',Cookie:localCookie},body:'{}'}),env,{},send);
 const result=await logout.json() as {url?:string};expect(result.url).toContain('/oauth2/end-session');
 const ended=await authority.handler(new Request(result.url!,{headers:{Cookie:ownerCookie}}));expect(ended.status).toBe(302);expect(ended.headers.get('location')).toBe(env.APP_ORIGIN+'/');
 expect(await sharedSession(request,env,send)).toBeNull();
 }finally{vi.unstubAllGlobals();await mf.dispose();}
},20000);
