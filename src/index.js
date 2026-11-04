import {readSheets} from './sheets.js';
import {handleAdmin,catalogData} from './admin.js';
import {HttpError} from './products.js';
import {serveImage} from './media.js';
export function createHandler(fetchImpl=fetch,cacheStorage=globalThis.caches) {
 return async function handle(request,env={},ctx={waitUntil:()=>{}}) {
 const url=new URL(request.url),origin=request.headers.get('Origin');
 const allowed=(env.ALLOWED_ORIGINS||'https://el-armario.lezmarucrack.workers.dev,https://el-armario.pages.dev,http://localhost:5173,http://127.0.0.1:5173').split(',').map(v=>v.trim());
 const headers={'Content-Type':'application/json; charset=utf-8','X-Content-Type-Options':'nosniff','Vary':'Origin','Cache-Control':'no-store'};
 if(origin&&allowed.includes(origin)){headers['Access-Control-Allow-Origin']=origin;headers['Access-Control-Allow-Credentials']='true';}
 const json=(data,options={})=>new Response(request.method==='HEAD'?null:JSON.stringify(data),{status:options.status||200,headers:{...headers,...options.headers}});
 if(origin&&!allowed.includes(origin))return json({error:'Origen no permitido'},{status:403});
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'GET, HEAD, POST, PUT, OPTIONS','Access-Control-Allow-Headers':'Content-Type, X-Admin-Request','Access-Control-Max-Age':'86400'}});
 const getSheets=()=>readSheets(request,env,ctx,fetchImpl,cacheStorage);
 try {
 if(url.pathname.startsWith('/api/admin/'))return await handleAdmin(request,env,ctx,json,getSheets,allowed);
 if(!['GET','HEAD'].includes(request.method))return json({error:'Método no permitido'},{status:405,headers:{Allow:'GET, HEAD, OPTIONS'}});
 if(url.pathname==='/api/health')return json({ok:true,service:'el-armario-catalog'});
 if(url.pathname.startsWith('/api/media/'))return await serveImage(request,env);
 if(url.pathname!=='/api/products')return json({error:'Ruta no encontrada'},{status:404});
 const data=await catalogData(env.DB,getSheets);
 return json({products:data.products,updatedAt:data.updatedAt,source:data.source},{headers:{'X-Catalog-Cache':data.cached?'HIT':'MISS'}});
 } catch(error) {
 if(error instanceof HttpError)return json({error:error.message},{status:error.status});
 console.error('Catalog API failed:',error.message);
 return json({error:url.pathname.startsWith('/api/admin/')?'No se pudo completar la operación. Verifica D1, R2 y las migraciones.':'No pudimos cargar el catálogo. Intenta nuevamente.'},{status:url.pathname.startsWith('/api/admin/')?503:502});
 }
 };
}
export default {fetch:createHandler()};
