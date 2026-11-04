export const COOKIE_NAME = 'armario_admin';
export const SESSION_SECONDS = 8 * 60 * 60;
const encoder = new TextEncoder();
const toBase64 = bytes => btoa(String.fromCharCode(...bytes));
const fromBase64 = text => Uint8Array.from(atob(text), c => c.charCodeAt(0));
export async function hashPassword(password) {
 const salt=crypto.getRandomValues(new Uint8Array(16));
 const key=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);
 const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations:100000},key,256);
 return ['pbkdf2-sha256','100000',toBase64(salt),toBase64(new Uint8Array(bits))].join('$');
}
export async function verifyPassword(password, stored) {
 try {
 const [algorithm,iterations,salt,digest]=stored.split('$');
 if(algorithm!=='pbkdf2-sha256'||iterations!=='100000')return false;
 const key=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);
 const actual=new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:fromBase64(salt),iterations:100000},key,256));
 const expected=fromBase64(digest);if(expected.length!==actual.length)return false;
 let difference=0;for(let i=0;i<actual.length;i++)difference|=actual[i]^expected[i];return difference===0;
 } catch {return false;}
}
export async function digestToken(value) {
 const digest=await crypto.subtle.digest('SHA-256',encoder.encode(value));
 return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
}
export function sessionCookie(request, token, maxAge = SESSION_SECONDS) {
 const secure=new URL(request.url).protocol==='https:';
 return COOKIE_NAME+'='+token+'; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age='+maxAge+(secure?'; Secure':'');
}
export function readToken(request) {
 const token=request.headers.get('Cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith(COOKIE_NAME+'='))?.slice(COOKIE_NAME.length+1);
 return token && /^[a-f0-9]{64}$/.test(token)?token:null;
}
export async function getSession(request, db) {
 const token=readToken(request);if(!token)return null;
 return db.prepare('SELECT u.id, u.email, s.token_hash FROM admin_sessions s JOIN admin_users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.active=1').bind(await digestToken(token),Date.now()).first();
}
export async function createSession(request,db,userId) {
 const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
 const now=Date.now();
 await db.prepare('INSERT INTO admin_sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)').bind(await digestToken(token),userId,now+SESSION_SECONDS*1000,now).run();
 return sessionCookie(request,token);
}
export async function checkLoginLimit(db,email,ip) {
 const now=Date.now(),window=15*60*1000;
 for (const [label,value,limit] of [['email',email,10],['ip',ip||'unknown',40]]) {
 const key=await digestToken(label+':'+value);
 const row=await db.prepare('INSERT INTO login_attempts(key,window_start,attempts) VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN window_start<=? THEN 1 ELSE attempts+1 END, window_start=CASE WHEN window_start<=? THEN excluded.window_start ELSE window_start END RETURNING attempts').bind(key,now,now-window,now-window).first();
 if(row.attempts>limit)return false;
 }
 return true;
}
