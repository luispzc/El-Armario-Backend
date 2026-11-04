import {spawnSync} from 'node:child_process';
import {emitKeypressEvents} from 'node:readline';
import {fileURLToPath} from 'node:url';
import {hashPassword} from '../src/auth.js';
const args=process.argv.slice(2),email=args[args.indexOf('--email')+1]?.trim().toLowerCase();
const local=args.includes('--local'),remote=args.includes('--remote');
if(!args.includes('--email')||!email||!/^([^\s@]+)@([^\s@]+)\.([^\s@]+)$/.test(email)||email.length>254||local===remote){console.error('Uso: npm run admin:create -- --email tu@correo.com --local (o --remote)');process.exit(1);}
function passwordPrompt(label){return new Promise((resolve,reject)=>{
 if(!process.stdin.isTTY){reject(new Error('Abre este comando en una terminal interactiva para escribir tu contraseña de forma privada.'));return;}
 let password='';process.stdout.write(label);emitKeypressEvents(process.stdin);process.stdin.setRawMode(true);process.stdin.resume();
 const cleanup=()=>{process.stdin.off('keypress',handler);process.stdin.setRawMode(false);process.stdin.pause();process.stdout.write('\n');};
 const handler=(text,key)=>{if(key?.ctrl&&key.name==='c'){cleanup();reject(new Error('Cancelado.'));return;}if(key?.name==='return'){cleanup();resolve(password);return;}if(key?.name==='backspace'){if(password.length){password=password.slice(0,-1);process.stdout.write('\b \b');}return;}if(!key?.ctrl&&!key?.meta&&text&&!/\p{C}/u.test(text)&&password.length<256){password+=text;process.stdout.write('*');}};
 process.stdin.on('keypress',handler);
});}
try {
 const password=await passwordPrompt('Contraseña (mínimo 12 caracteres): ');
 if(password.length<12||password.length>256)throw new Error('La contraseña debe tener entre 12 y 256 caracteres.');
 const confirm=await passwordPrompt('Repite la contraseña: ');if(password!==confirm)throw new Error('Las contraseñas no coinciden.');
 const hash=await hashPassword(password),quote=value=>"'"+String(value).replaceAll("'","''")+"'";
 const sql='INSERT INTO admin_users(id,email,password_hash,active,created_at) VALUES('+[quote(crypto.randomUUID()),quote(email),quote(hash),1,Date.now()].join(',')+');';
 const wrangler=fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js',import.meta.url));
 const result=spawnSync(process.execPath,[wrangler,'d1','execute','DB',local?'--local':'--remote','--command',sql],{stdio:'inherit',cwd:fileURLToPath(new URL('..',import.meta.url)),env:{...process.env,WRANGLER_SEND_METRICS:'false'}});
 if(result.status!==0)throw new Error('No se pudo crear el administrador. Revisa las migraciones y si ese correo ya existe.');
 console.log('Administrador creado: '+email+'. Abre /admin en tu frontend para iniciar sesión.');
}catch(error){console.error(error.message);process.exitCode=1;}
