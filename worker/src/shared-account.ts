import { betterAuth } from 'better-auth';
import { genericOAuth } from 'better-auth/plugins';
import type { WorkerEnv } from './types';

export function sharedAuth(env: WorkerEnv, send: typeof fetch = fetch) {
 if(!env.SHARED_AUTH_ORIGIN||!env.SHARED_CLIENT_SECRET||!env.BETTER_AUTH_SECRET||!env.APP_ORIGIN)throw new Error('Shared account is not configured');
 const issuer=env.SHARED_AUTH_ORIGIN+'/api/auth';
 // Per-request closure binds the issued upstream token to THIS local session.
 let authenticatedToken: string | undefined;
 return betterAuth({appName:'Highlights',baseURL:env.APP_ORIGIN,secret:env.BETTER_AUTH_SECRET,database:env.DB,trustedOrigins:[env.APP_ORIGIN],telemetry:{enabled:false},
  advanced:{useSecureCookies:env.APP_ORIGIN.startsWith('https:'),cookiePrefix:'highlights',ipAddress:{ipAddressHeaders:['cf-connecting-ip']}},
  session:{expiresIn:30*86400,updateAge:86400,cookieCache:{enabled:false},additionalFields:{sharedAccessToken:{type:'string',required:false,input:false,returned:false}}},
  account:{accountLinking:{enabled:true,trustedProviders:['personal']}},
  user:{validateUserInfo:async({user})=>{if(!user.emailVerified||user.email?.toLowerCase()!==env.OWNER_EMAIL.toLowerCase())return {error:'owner_only'};}},
  databaseHooks:{user:{create:{before:async()=>false}},session:{create:{before:async session=>{
   const owner=await env.DB.prepare('SELECT email,emailVerified FROM user WHERE id=?').bind(session.userId).first<{email:string,emailVerified:number}>();
   if(!authenticatedToken||!owner?.emailVerified||owner.email.toLowerCase()!==env.OWNER_EMAIL.toLowerCase())return false;
   return {data:{...session,sharedAccessToken:authenticatedToken}};
  }}}},
  plugins:[genericOAuth({config:[{providerId:'personal',clientId:'highlights',clientSecret:env.SHARED_CLIENT_SECRET,discoveryUrl:issuer+'/.well-known/openid-configuration',requireIdTokenVerification:true,pkce:true,scopes:['openid','email','profile'],disableSignUp:true,postLogoutRedirectURI:env.APP_ORIGIN+'/',
   getUserInfo:async tokens=>{
    if(!tokens.accessToken)return null;
    const r=await send(issuer+'/oauth2/userinfo',{headers:{Authorization:'Bearer '+tokens.accessToken},signal:AbortSignal.timeout(10000)});if(!r.ok)return null;
    const u=await r.json() as {sub:string;email:string;email_verified:boolean;name?:string};
    if(!u.sub||!u.email_verified||u.email?.toLowerCase()!==env.OWNER_EMAIL.toLowerCase())return null;
    authenticatedToken=tokens.accessToken;
    return {id:u.sub,sub:u.sub,email:u.email,emailVerified:true,name:u.name||'Owner'};
   }
  }]})],
 });
}
export async function sharedSession(request:Request,env:WorkerEnv,send:typeof fetch=fetch){
 const session=await sharedAuth(env,send).api.getSession({headers:request.headers});
 if(!session?.user.emailVerified||session.user.email.toLowerCase()!==env.OWNER_EMAIL.toLowerCase())return null;
 const row=await env.DB.prepare('SELECT sharedAccessToken FROM session WHERE id=?').bind(session.session.id).first<{sharedAccessToken:string|null}>();
 if(!row?.sharedAccessToken)return null;
 const r=await send(env.SHARED_AUTH_ORIGIN+'/api/auth/oauth2/introspect',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:'highlights',client_secret:env.SHARED_CLIENT_SECRET!,token:row.sharedAccessToken}),signal:AbortSignal.timeout(10000)});
 if(!r.ok)throw new Error('Shared account temporarily unavailable');
 const result=await r.json() as {active:boolean;client_id?:string};
 return result.active&&result.client_id==='highlights'?session:null;
}
