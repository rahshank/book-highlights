import { useEffect, useState, type FormEvent } from "react";
import { authClient } from "./authClient";
const freshMessage = "For your security, sign out and sign in again, then retry within ten minutes.";
function check(result: { error?: { message?: string; status?: number } | null }) {
  if (result.error) throw new Error(result.error.status === 403 ? freshMessage : result.error.message || "Please try again.");
}
const message = (error: unknown) => error instanceof Error ? error.message : "Please try again.";
async function recovery(path: string, body?: unknown) {
  const response = await fetch(`/api/auth/recovery/${path}`, {
    method: body === undefined ? "GET" : "POST", credentials: "same-origin", cache: "no-store",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(response.status === 403 ? freshMessage : result.message || result.error || "Please try again.");
  return result;
}
export function Login({ onSignedIn, sharedAccountOrigin }: { onSignedIn: () => void | Promise<void>; sharedAccountOrigin?: string }) {
  const [mode, setMode] = useState<"main" | "email" | "code" | "recovery">("main");
  const [email, setEmail] = useState(""), [code, setCode] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  function choose(next: typeof mode) { setMode(next); setCode(""); setError(""); }
  async function passkey() {
    setBusy(true); setError("");
    try { check(await authClient.signIn.passkey()); await onSignedIn(); }
    catch { setError("Passkey sign-in wasn’t completed. Try again, or use an email code or recovery code."); }
    finally { setBusy(false); }
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      if (mode === "email") {
        check(await authClient.emailOtp.sendVerificationOtp({ email: email.trim(), type: "sign-in" })); setMode("code");
      } else {
        if (mode === "recovery") await recovery("sign-in", { code: code.trim() });
        else check(await authClient.signIn.emailOtp({ email: email.trim(), otp: code.replace(/\s/g, "") }));
        setCode(""); await onSignedIn();
      }
    } catch (e) { setError(message(e)); } finally { setBusy(false); }
  }
  if(sharedAccountOrigin)return <section className="login-panel"><h1>Sign in</h1><p>Use your shared account for later and Highlights.</p><button className="btn btn-primary" disabled={busy} onClick={() => { setBusy(true); setError(""); sessionStorage.setItem("shared-sign-in", "pending"); void authClient.signIn.social({provider:"personal",callbackURL:location.origin+"/"+location.hash}).then(check).catch(e=>{setError(message(e));setBusy(false);}); }}>Continue to sign in</button><p className="muted">Passkey, email code or recovery code.</p>{error&&<p role="alert">{error}</p>}</section>;
  return <section className="login-panel"><h1>Sign in</h1><p>Access your saved highlights and notes.</p>
    {mode === "main" ? <div className="stack auth-options">
      <button className="btn btn-primary" disabled={busy} onClick={() => void passkey()}>{busy ? "Please wait…" : "Sign in with a passkey"}</button>
      <button className="text-button" disabled={busy} onClick={() => choose("email")}>Email me a code</button>
      <button className="text-button" disabled={busy} onClick={() => choose("recovery")}>Use a recovery code</button>
    </div> : <form className="stack" onSubmit={submit}>
      {mode === "email" ? <label>Email<input type="email" autoComplete="email" required autoFocus value={email} onChange={e => setEmail(e.target.value)} /></label> : <>
        <p>{mode === "code" ? "Check your email for an eight-digit code. It expires in ten minutes. If needed, check Spam." : "Enter one of your unused recovery codes. Each code works once."}</p>
        <label>{mode === "code" ? "Sign-in code" : "Recovery code"}<input required autoFocus value={code} onChange={e => setCode(e.target.value)} autoComplete={mode === "code" ? "one-time-code" : "off"} inputMode={mode === "code" ? "numeric" : "text"} pattern={mode === "code" ? "[0-9 ]{8,12}" : undefined} spellCheck={false} /></label>
      </>}
      <button className="btn btn-primary" disabled={busy}>{busy ? "Please wait…" : mode === "email" ? "Send code" : "Sign in"}</button>
      {mode === "code" && <button type="button" className="text-button" disabled={busy} onClick={() => choose("email")}>Use another email or request a new code</button>}
      <button type="button" className="text-button" disabled={busy} onClick={() => choose("main")}>Other sign-in options</button>
    </form>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
type Key = { id: string; name?: string | null };
export function Security({sharedAccountOrigin}: {sharedAccountOrigin?:string}) {
 if(sharedAccountOrigin)return <section className="security-panel"><h1>Security</h1><p>Your passkeys and recovery codes are shared by later and Highlights.</p><a className="btn btn-primary" href={sharedAccountOrigin+"/security"}>Manage your account</a><p className="muted">Changes apply to both apps. Saved offline copies remain on their devices until removed or signed out there.</p></section>;
 return <LocalSecurity />;
}
function LocalSecurity() {
  const [keys, setKeys] = useState<Key[]>([]), [remaining, setRemaining] = useState<number | null>(null), [codes, setCodes] = useState<string[]>([]), [name, setName] = useState(""), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState("");
  async function refresh() {
    const [passkeys, status] = await Promise.all([authClient.passkey.listUserPasskeys(), recovery("status")]); check(passkeys);
    setKeys(passkeys.data || []); setRemaining(status.remaining);
  }
  useEffect(() => { let mounted = true; Promise.all([authClient.passkey.listUserPasskeys(), recovery("status")]).then(([passkeys,status]) => { check(passkeys); if(mounted) { setKeys(passkeys.data || []); setRemaining(status.remaining); } }).catch(e => { if(mounted) setError(message(e)); }).finally(() => { if(mounted) setLoading(false); }); return () => { mounted = false; }; }, []);
  async function action(run: () => Promise<void>) { setBusy(true); setError(""); try { await run(); } catch(e) { setError(message(e)); } finally { setBusy(false); } }
  function download() {
    const url = URL.createObjectURL(new Blob([`Highlights recovery codes\n${location.origin}\nEach code works once. Keep these somewhere safe, separate from your passkeys.\n\n${codes.join("\n")}\n`], { type: "text/plain" }));
    const a = document.createElement("a"); a.href = url; a.download = "highlights-recovery-codes.txt"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <section className="security-panel"><h1>Security</h1>
    <p>Add a passkey and keep recovery codes in case you lose access to your email or password manager.</p>
    {error && <p role="alert">{error}</p>}{loading && <p role="status">Loading sign-in options…</p>}
    <section><h2>Passkeys</h2><p>A passkey saved in 1Password can be used on your other devices. You can also add more than one passkey.</p>
      <ul className="passkey-list">{keys.map(key => <li key={key.id}><span>{key.name || "Passkey"}</span><button className="text-button" disabled={busy} onClick={() => { if(window.confirm("Remove this passkey? You can still sign in with email or a recovery code.")) void action(async () => { check(await authClient.passkey.deletePasskey({ id: key.id })); await refresh(); }); }}>Remove<span className="sr-only"> {key.name || "passkey"}</span></button></li>)}</ul>
      {!loading && !keys.length && <p>No passkeys added yet.</p>}
      <form className="stack" onSubmit={e => { e.preventDefault(); void action(async () => { check(await authClient.passkey.addPasskey({ name: name.trim() || "My passkey" })); setName(""); await refresh(); }); }}>
        <label>Passkey name (optional)<input value={name} maxLength={80} placeholder="e.g. 1Password" onChange={e => setName(e.target.value)} /></label>
        <button className="btn btn-primary" disabled={busy || loading}>Add a passkey</button>
      </form>
    </section>
    <section><h2>Recovery codes</h2>{remaining !== null && <p>{remaining} unused recovery {remaining === 1 ? "code" : "codes"}</p>}
      <p>Each code works once and signs out your other sessions. Creating new codes replaces all previous codes.</p>
      {codes.length > 0 && <div className="recovery-codes"><p>Save these now. They won’t be shown again after you leave this page.</p><pre>{codes.join("\n")}</pre><div className="button-row"><button className="btn" onClick={download}>Download codes</button><button className="text-button" onClick={() => setCodes([])}>I’ve saved my codes</button></div></div>}
      <button className="btn" disabled={busy || loading || remaining === null} onClick={() => { if((remaining || codes.length) && !window.confirm("Replace your recovery codes? All previous codes will stop working.")) return; void action(async () => { setCodes([]); const result = await recovery("generate", {}); setCodes(result.codes); setRemaining(result.codes.length); }); }}>{remaining ? "Replace recovery codes" : "Create recovery codes"}</button>
    </section>
    <p className="muted">Adding or removing passkeys and replacing recovery codes requires a sign-in from the last ten minutes.</p>
  </section>;
}
