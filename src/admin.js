import {HttpError,validateProduct,databaseRows,mergeProducts} from './products.js';
import {getSession,createSession,verifyPassword,checkLoginLimit,sessionCookie,readToken,digestToken} from './auth.js';
import {readJson,uploadImage} from './media.js';
const DUMMY_HASH='pbkdf2-sha256$100000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
export async function isImported(db){return !!db&&!!(await db.prepare("SELECT value FROM catalog_settings WHERE key='sheets_imported'").first());}
export async function catalogData(db, getSheets, admin=false) {
 const imported=await isImported(db);
 const sheet=imported?{products:[],updatedAt:new Date().toISOString(),cached:false}:await getSheets();
 const stored=await databaseRows(db);
 return {products:mergeProducts(sheet.products,stored,admin),updatedAt:sheet.updatedAt,source:imported?'d1':db?'sheets+d1':'google-sheets',cached:sheet.cached,imported};
}
async function checkManagedPhotos(db,product) {
 for(const key of ['foto1','foto2','foto3','foto_ia']) {
 const id=product[key].match(/^\/api\/media\/([a-f0-9-]{36})\//)?.[1];
 if(id&&!await db.prepare('SELECT id FROM media WHERE id=?').bind(id).first())throw new HttpError(400,'Una de las fotos ya no está disponible. Vuelve a subirla.');
 }
}
function revisionOf(value){if(!Number.isInteger(value)||value<0)throw new HttpError(400,'Versión de prenda no válida.');return value;}
export async function handleAdmin(request,env,ctx,json,getSheets,allowed) {
 const path=new URL(request.url).pathname;
 if(path==='/api/admin/status'&&request.method==='GET')return json({configured:!!env.DB&&!!env.IMAGES,database:!!env.DB,images:!!env.IMAGES});
 if(!env.DB)throw new HttpError(503,'Falta conectar la base D1 y aplicar las migraciones.');
 const unsafe=!['GET','HEAD','OPTIONS'].includes(request.method);
 if(unsafe&&(!allowed.includes(request.headers.get('Origin'))||request.headers.get('X-Admin-Request')!=='1'))throw new HttpError(403,'Solicitud de administración no autorizada.');
 if(path==='/api/admin/login'&&request.method==='POST') {
 const body=await readJson(request);
 const email=String(body.email||'').trim().toLowerCase(),password=String(body.password||'');
 if(email.length>254||password.length>256)throw new HttpError(400,'Credenciales no válidas.');
 if(!await checkLoginLimit(env.DB,email,request.headers.get('CF-Connecting-IP')))throw new HttpError(429,'Demasiados intentos. Espera 15 minutos antes de volver a intentar.');
 const user=await env.DB.prepare('SELECT id,email,password_hash,active FROM admin_users WHERE email=? COLLATE NOCASE').bind(email).first();
 const valid=await verifyPassword(password,user?.password_hash||DUMMY_HASH);
 if(!valid||!user?.active)throw new HttpError(401,'Correo o contraseña incorrectos.');
 const cookie=await createSession(request,env.DB,user.id);
 ctx.waitUntil(env.DB.batch([env.DB.prepare('DELETE FROM admin_sessions WHERE expires_at<?').bind(Date.now()),env.DB.prepare('DELETE FROM login_attempts WHERE window_start<?').bind(Date.now()-86400000)]).catch(()=>{}));
 return json({user:{email:user.email}},{headers:{'Set-Cookie':cookie}});
 }
 if(path==='/api/admin/logout'&&request.method==='POST'){
 const token=readToken(request);if(token)await env.DB.prepare('DELETE FROM admin_sessions WHERE token_hash=?').bind(await digestToken(token)).run();
 return json({ok:true},{headers:{'Set-Cookie':sessionCookie(request,'',0)}});
 }
 const user=await getSession(request,env.DB);
 if(!user)throw new HttpError(401,'Inicia sesión para continuar.');
 if(path==='/api/admin/me'&&request.method==='GET')return json({user:{email:user.email}});
 if(path==='/api/admin/products'&&request.method==='GET')return json(await catalogData(env.DB,getSheets,true));
 if(path==='/api/admin/import'&&request.method==='POST') {
 if(await isImported(env.DB))return json({ok:true,alreadyImported:true});
 const {products}=await getSheets();if(!products.length)throw new HttpError(400,'La hoja no contiene prendas para importar.');
 const now=Date.now(),unique=new Map();for(const row of products){const validated=validateProduct(row);unique.set(validated.codigo,validated);}
 const rows=[...unique.values()];
 for(let i=0;i<rows.length;i+=40)await env.DB.batch(rows.slice(i,i+40).map(row=>env.DB.prepare('INSERT INTO products(code,payload,hidden,revision,created_at,updated_at) VALUES(?,?,0,1,?,?) ON CONFLICT(code) DO NOTHING').bind(row.codigo,JSON.stringify(row),now,now)));
 await env.DB.prepare("INSERT INTO catalog_settings(key,value) VALUES('sheets_imported',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(String(now)).run();
 return json({ok:true,count:rows.length});
 }
 if(path==='/api/admin/uploads'&&request.method==='POST')return json(await uploadImage(request,env,user),{status:201});
 if(path==='/api/admin/products'&&request.method==='POST'){
 const body=await readJson(request),product=validateProduct(body.product);await checkManagedPhotos(env.DB,product);
 const {products}=await catalogData(env.DB,getSheets,true);
 if(products.some(row=>row.codigo===product.codigo))throw new HttpError(409,'Ese código ya existe. Elige otro o edita la prenda existente.');
 const now=Date.now();
 try{await env.DB.prepare('INSERT INTO products(code,payload,hidden,revision,created_at,updated_at) VALUES(?,?,0,1,?,?)').bind(product.codigo,JSON.stringify(product),now,now).run();}
 catch(error){if(/UNIQUE|constraint/i.test(error.message))throw new HttpError(409,'Ese código ya existe.');throw error;}
 return json({product:{...product,revision:1,hidden:false,source:'d1'}},{status:201});
 }
 const match=path.match(/^\/api\/admin\/products\/([A-Za-z0-9_-]{1,40})$/);
 if(match&&request.method==='PUT') {
 const code=match[1].toUpperCase(),body=await readJson(request),revision=revisionOf(body.revision),product=validateProduct(body.product,code);
 if(typeof body.hidden!=='boolean')throw new HttpError(400,'Estado de visibilidad no válido.');
 await checkManagedPhotos(env.DB,product);
 if(revision===0){const {products}=await catalogData(env.DB,getSheets,true);if(!products.some(row=>row.codigo===code))throw new HttpError(404,'La prenda no existe.');}
 const now=Date.now();
 let updated;
 if(revision===0)updated=await env.DB.prepare('INSERT INTO products(code,payload,hidden,revision,created_at,updated_at) VALUES(?,?,?,1,?,?) ON CONFLICT(code) DO NOTHING RETURNING revision').bind(code,JSON.stringify(product),body.hidden?1:0,now,now).first();
 else updated=await env.DB.prepare('UPDATE products SET payload=?,hidden=?,revision=revision+1,updated_at=? WHERE code=? AND revision=? RETURNING revision').bind(JSON.stringify(product),body.hidden?1:0,now,code,revision).first();
 if(!updated)throw new HttpError(409,'Otra sesión modificó esta prenda. Actualiza la lista antes de guardar.');
 return json({product:{...product,revision:updated.revision,hidden:body.hidden,source:'d1'}});
 }
 throw new HttpError(404,'Ruta de administración no encontrada.');
}
