import {HttpError} from './products.js';
export const IMAGE_WIDTHS=[240,480,960,1600];
export async function readBody(request, limit) {
 if(Number(request.headers.get('Content-Length'))>limit)throw new HttpError(413,'El archivo o formulario es demasiado grande.');
 const reader=request.body?.getReader();if(!reader)return new Uint8Array();
 const chunks=[];let length=0;
 try {while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>limit){await reader.cancel();throw new HttpError(413,'El archivo o formulario es demasiado grande.');}chunks.push(value);}}
 finally{reader.releaseLock();}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
}
export async function readJson(request) {
 if(!request.headers.get('Content-Type')?.startsWith('application/json'))throw new HttpError(415,'Se requiere JSON.');
 try{return JSON.parse(new TextDecoder().decode(await readBody(request,32768)));}catch(error){if(error instanceof HttpError)throw error;throw new HttpError(400,'JSON no válido.');}
}
export function isWebp(bytes) {
 return bytes.length>=20&&String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP'&&['VP8 ','VP8L','VP8X'].includes(String.fromCharCode(...bytes.slice(12,16)));
}
export async function uploadImage(request,env,user) {
 if(!env.IMAGES)throw new HttpError(503,'Falta conectar el bucket R2 de imágenes.');
 const today=Date.now()-24*60*60*1000;
 const count=await env.DB.prepare('SELECT COUNT(*) AS total FROM media WHERE user_id=? AND created_at>?').bind(user.id,today).first();
 if(count.total>=200)throw new HttpError(429,'Alcanzaste el límite de 200 fotos por día.');
 const bytes=await readBody(request,12*1024*1024);
 let form;try{form=await new Response(bytes,{headers:{'Content-Type':request.headers.get('Content-Type')||''}}).formData();}catch{throw new HttpError(400,'La subida no es válida.');}
 const parts=[];
 for(const width of IMAGE_WIDTHS){
 const files=form.getAll(String(width));const file=files[0];
 if(files.length!==1||!file||typeof file.arrayBuffer!=='function'||file.type!=='image/webp'||file.size>5*1024*1024)throw new HttpError(400,'Faltan las cuatro versiones WebP de la imagen.');
 const data=new Uint8Array(await file.arrayBuffer());if(!isWebp(data))throw new HttpError(400,'Formato de imagen no válido.');parts.push({width,data});
 }
 const id=crypto.randomUUID();const keys=parts.map(({width})=>id+'/'+width+'.webp');
 try {
 for(const {width,data} of parts)await env.IMAGES.put(id+'/'+width+'.webp',data,{httpMetadata:{contentType:'image/webp',cacheControl:'public, max-age=31536000, immutable'}});
 await env.DB.prepare('INSERT INTO media(id,user_id,created_at) VALUES(?,?,?)').bind(id,user.id,Date.now()).run();
 }catch(error){await env.IMAGES.delete(keys).catch(()=>{});throw error;}
 return {id,url:'/api/media/'+id+'/960.webp'};
}
export async function serveImage(request,env) {
 const match=new URL(request.url).pathname.match(/^\/api\/media\/([a-f0-9-]{36})\/(240|480|960|1600)\.webp$/);
 if(!match||!env.IMAGES)return new Response('No encontrada',{status:404});
 const key=match[1]+'/'+match[2]+'.webp';
 const object=request.method==='HEAD'?await env.IMAGES.head(key):await env.IMAGES.get(key);
 if(!object)return new Response('No encontrada',{status:404});
 const headers=new Headers({'Content-Type':'image/webp','Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff','ETag':object.httpEtag});
 if(request.headers.get('If-None-Match')===object.httpEtag)return new Response(null,{status:304,headers});
 return new Response(request.method==='HEAD'?null:object.body,{headers});
}
