import {sharedAuth,sharedSession} from './shared-account';
import { betterAuth } from 'better-auth';
import { emailOTP } from 'better-auth/plugins';
import { passkey } from '@better-auth/passkey';
import { createAuthMiddleware, APIError } from 'better-auth/api';
import { recoveryPlugin } from './recovery.mjs';
import { authenticated as legacyAuthenticated, authRoute as legacyRoute } from './legacy-auth';
import { json, rateLimit, type WorkerEnv } from './types';

// Compatibility is bounded to the original migration window, never extended by login.
export const LEGACY_AUTH_UNTIL = Date.parse('2026-11-01T00:00:00Z');
const allowed = new Set(['/get-session','/sign-out','/email-otp/send-verification-otp','/sign-in/email-otp','/passkey/generate-register-options','/passkey/generate-authenticate-options','/passkey/verify-registration','/passkey/verify-authentication','/passkey/list-user-passkeys','/passkey/delete-passkey','/recovery/status','/recovery/generate','/recovery/sign-in']);
const challengePaths = new Set(['/passkey/generate-register-options','/passkey/generate-authenticate-options']);
export function sameOriginChallenge(request:Request,origin:string){
 const o=request.headers.get('Origin'),r=request.headers.get('Referer'),site=request.headers.get('Sec-Fetch-Site');
 if(site==='cross-site'||site==='same-site'||(o&&o!==origin))return false;
 if(r){try{if(new URL(r).origin!==origin)return false;}catch{return false;}}
 return o===origin||Boolean(r)||site==='same-origin';
}
const sensitive = new Set(['/passkey/generate-register-options','/passkey/verify-registration','/passkey/delete-passkey','/recovery/generate']);
type OtpMessage = {email:string;otp:string;type:string};
export async function sendOtp(env: WorkerEnv, {email,otp,type}:OtpMessage, send:typeof fetch=fetch) {
 if(email.toLowerCase()!==env.OWNER_EMAIL.toLowerCase()||type!=='sign-in')return;
 if(!env.RESEND_API_KEY)throw new Error('Sign-in email unavailable');
 const response=await send('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({from:'Highlights <onboarding@resend.dev>',to:[email],subject:'Your Highlights sign-in code',text:`Your Highlights sign-in code is ${otp}.\n\nIt expires in 10 minutes. If you did not request it, ignore this email.`}),signal:AbortSignal.timeout(15000)});
 await response.body?.cancel();if(!response.ok)throw new Error('Sign-in email unavailable');
}
export function createAuth(env:WorkerEnv,send:(message:OtpMessage)=>Promise<void> = message=>sendOtp(env,message)){
 if(!env.APP_ORIGIN||!env.BETTER_AUTH_SECRET||!env.OWNER_EMAIL)throw new Error('Authentication is not configured');
 return betterAuth({appName:'Highlights',baseURL:env.APP_ORIGIN,secret:env.BETTER_AUTH_SECRET,database:env.DB,trustedOrigins:[env.APP_ORIGIN],telemetry:{enabled:false},
  session:{expiresIn:30*24*60*60,updateAge:86400,freshAge:600,cookieCache:{enabled:false}},
  emailAndPassword:{enabled:false,disableSignUp:true},
  rateLimit:{enabled:true,storage:'database',window:60,max:60,customRules:{'/email-otp/send-verification-otp':{window:300,max:3},'/sign-in/email-otp':{window:300,max:5},'/recovery/sign-in':{window:300,max:5}}},
  advanced:{useSecureCookies:env.APP_ORIGIN.startsWith('https:'),cookiePrefix:'highlights',ipAddress:{ipAddressHeaders:['cf-connecting-ip']}},
  databaseHooks:{user:{create:{before:async()=>false}},session:{create:{before:async session=>{
   const user=await env.DB.prepare('SELECT email,emailVerified FROM user WHERE id=?').bind(session.userId).first<{email:string,emailVerified:number}>();
   return Boolean(user?.emailVerified&&user.email.toLowerCase()===env.OWNER_EMAIL.toLowerCase());
  }}}},
  hooks:{before:createAuthMiddleware(async ctx=>{
   if(challengePaths.has(ctx.path)&&ctx.request&&!sameOriginChallenge(ctx.request,env.APP_ORIGIN!))throw new APIError('FORBIDDEN',{message:'Request not allowed'});
   if(!allowed.has(ctx.path))throw new APIError('NOT_FOUND',{message:'Not found'});
   if(ctx.path==='/email-otp/send-verification-otp'&&ctx.body?.type!=='sign-in')throw new APIError('BAD_REQUEST',{message:'Request not allowed'});
   if(sensitive.has(ctx.path)){
    const s=await ctx.context.internalAdapter.findSession((await ctx.getSignedCookie(ctx.context.authCookies.sessionToken.name,ctx.context.secret))||'');
    if(!s?.user.emailVerified||s.user.email.toLowerCase()!==env.OWNER_EMAIL.toLowerCase()||Date.now()-s.session.createdAt.getTime()>600000)throw new APIError('FORBIDDEN',{message:'Sign in again before changing security settings.'});
   }
  })},
  plugins:[emailOTP({otpLength:8,expiresIn:600,allowedAttempts:5,storeOTP:'hashed',disableSignUp:true,sendVerificationOTP:send}),passkey({rpID:new URL(env.APP_ORIGIN).hostname,rpName:'Highlights',origin:env.APP_ORIGIN,authenticatorSelection:{userVerification:'required'},authentication:{afterVerification:async({verification})=>{if(!verification.authenticationInfo.userVerified)throw new APIError('UNAUTHORIZED',{message:'Verify with your device PIN or biometrics to sign in.'});}}}),recoveryPlugin(env,{onRecovery:async()=>{await env.DB.batch([env.DB.prepare('DELETE FROM auth_sessions'),env.DB.prepare('DELETE FROM auth_challenges')]);}})],
 });
}
export async function ensureOwner(env:WorkerEnv){
 // Stable identity; changing OWNER_EMAIL alone cannot silently reassign the account.
 await env.DB.prepare('INSERT OR IGNORE INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,?,?,?)').bind('highlights-owner','Owner',env.OWNER_EMAIL.toLowerCase(),1,Date.now(),Date.now()).run();
}
export async function authenticated(request:Request,env:WorkerEnv){
 if(env.SHARED_AUTH_ORIGIN)return Boolean(await sharedSession(request,env));
 if(Date.now()<LEGACY_AUTH_UNTIL&&await legacyAuthenticated(request,env))return true;
 if(!env.BETTER_AUTH_SECRET||!env.APP_ORIGIN)return false;
 const session=await createAuth(env).api.getSession({headers:request.headers});
 return Boolean(session?.user.emailVerified&&session.user.email.toLowerCase()===env.OWNER_EMAIL.toLowerCase());
}
export async function authRoute(request:Request,env:WorkerEnv,body:Record<string,unknown>,send:typeof fetch=fetch):Promise<Response>{
 const path=new URL(request.url).pathname.slice('/api/auth'.length);
 if(env.SHARED_AUTH_ORIGIN){
  if(path==='/session'&&request.method==='GET')return json({signedIn:Boolean(await sharedSession(request,env,send)),sharedAccountOrigin:env.SHARED_AUTH_ORIGIN});
  if(path==='/logout'&&request.method==='POST'){const result=await sharedAuth(env,send).handler(new Request(env.APP_ORIGIN+'/api/auth/sign-out',{method:'POST',headers:request.headers,body:JSON.stringify({callbackURL:env.APP_ORIGIN+'/'})}));return result;}
  if(!['/sign-in/social','/callback/personal','/get-session','/sign-out'].includes(path))return json({error:'Use your shared account. Reload Highlights to continue.'},409);
  if(path==='/get-session')return json(await sharedSession(request,env,send));
  await ensureOwner(env);
  return sharedAuth(env,send).handler(request);
 }
 if(path==='/session'&&request.method==='GET')return json({signedIn:await authenticated(request,env)});
 if(path==='/logout'&&request.method==='POST'){
  const old=await legacyRoute(request,env,body,send);
  if(!env.BETTER_AUTH_SECRET||!env.APP_ORIGIN)return old;
  const result=await createAuth(env).handler(new Request(env.APP_ORIGIN+'/api/auth/sign-out',{method:'POST',headers:request.headers,body:'{}'}));
  const response=new Response(result.body,result);response.headers.append('Set-Cookie',old.headers.get('Set-Cookie')!);return response;
 }
 if(path==='/request'||path==='/verify'){
  if(Date.now()>=LEGACY_AUTH_UNTIL)return json({error:'Reload Highlights to sign in.'},409);
  return legacyRoute(request,env,body,send);
 }
 if(!allowed.has(path))return json({error:'Not found'},404);
 if(path==='/email-otp/send-verification-otp'){
  // Limit by owner as well as IP, without revealing membership.
  if(typeof body.email==='string'&&body.email.trim().toLowerCase()===env.OWNER_EMAIL.toLowerCase()){
   if(!await rateLimit(env,'better-auth-owner-mail',5,600))return json({message:'Please wait a few minutes before requesting another code.'},429);
   await ensureOwner(env);
  }
 }
 if(['/sign-in/email-otp','/recovery/sign-in'].includes(path)&&!await rateLimit(env,'auth-guess:'+path,20,300))return json({message:'Please wait a few minutes before trying again.'},429);
 const result=await createAuth(env,message=>sendOtp(env,message,send)).handler(request);const response=new Response(result.body,result);response.headers.set('Cache-Control','private, no-store');return response;
}
