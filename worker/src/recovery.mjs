import {createAuthEndpoint,APIError,sessionMiddleware,freshSessionMiddleware} from 'better-auth/api';
import {setSessionCookie} from 'better-auth/cookies';
import * as z from 'zod';
const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),n=>n.toString(16).padStart(2,'0')).join('');
const normalize=code=>code.replace(/[\s-]/g,'').toLowerCase();
const deny=()=>new APIError('UNAUTHORIZED',{message:'Unable to sign in. Check your code or use another method.'});
function owner(ctx,env){const s=ctx.context.session;if(!s?.user.emailVerified||s.user.email.toLowerCase()!==env.OWNER_EMAIL.toLowerCase())throw deny();return s;}
export function recoveryPlugin(env,{onRecovery=async()=>{}}={}){
 return {id:'owner-recovery',rateLimit:[{pathMatcher:p=>p==='/recovery/sign-in',window:300,max:5}],endpoints:{
  recoveryStatus:createAuthEndpoint('/recovery/status',{method:'GET',use:[sessionMiddleware]},async ctx=>{const s=owner(ctx,env);const r=await env.DB.prepare('SELECT COUNT(*) AS remaining FROM recoveryCode WHERE userId=?').bind(s.user.id).first();return ctx.json({remaining:r?.remaining||0});}),
  recoveryGenerate:createAuthEndpoint('/recovery/generate',{method:'POST',use:[freshSessionMiddleware]},async ctx=>{
   const s=owner(ctx,env);if(Date.now()-new Date(s.session.createdAt).getTime()>600000)throw new APIError('FORBIDDEN',{message:'Sign in again before changing recovery codes.'});
   const codes=Array.from({length:10},()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('').match(/.{8}/g).join('-'));
   const hashes=await Promise.all(codes.map(c=>hash(normalize(c))));
   await env.DB.batch([env.DB.prepare('DELETE FROM recoveryCode WHERE userId=?').bind(s.user.id),...hashes.map(h=>env.DB.prepare('INSERT INTO recoveryCode(hash,userId,createdAt) VALUES(?,?,?)').bind(h,s.user.id,Date.now()))]);
   ctx.setHeader('Cache-Control','no-store');return ctx.json({codes});
  }),
  recoverySignIn:createAuthEndpoint('/recovery/sign-in',{method:'POST',body:z.object({code:z.string().max(100)})},async ctx=>{
   const code=normalize(ctx.body.code);if(!/^[a-f0-9]{32}$/.test(code))throw deny();
   const user=await ctx.context.internalAdapter.findUserByEmail(env.OWNER_EMAIL.toLowerCase());if(!user?.user.emailVerified)throw deny();
   const consumed=await env.DB.prepare('DELETE FROM recoveryCode WHERE hash=? AND userId=? RETURNING userId').bind(await hash(code),user.user.id).first();if(!consumed)throw deny();
   await ctx.context.internalAdapter.deleteUserSessions(user.user.id);await onRecovery(user.user.id);
   const session=await ctx.context.internalAdapter.createSession(user.user.id);if(!session)throw deny();
   await setSessionCookie(ctx,{session,user:user.user});return ctx.json({success:true});
  })
 }};
}
