import Papa from 'papaparse';
const DEFAULT_CSV = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vS95wEXiTqhFt2Hi1-xoNWDqZ2jmKqSass5ADEGQVtIN2Cy4C6M2r27xFOBdxjGq0bdRuFZFnw2UD4M/pub?gid=0&single=true&output=csv';
const PUBLIC_FIELDS=['codigo','nombre','tipo','talla','precio','foto1','foto2','foto3','vendido','genero','descripcion','foto_ia'];
export function createHandler(fetchImpl=fetch, cacheStorage=globalThis.caches) {
 return async function handle(request,env={},ctx={waitUntil:()=>{}}) {
 const url=new URL(request.url), origin=request.headers.get('Origin');
 const allowed=(env.ALLOWED_ORIGINS||'https://el-armario.pages.dev,http://localhost:5173,http://127.0.0.1:5173').split(',').map(v=>v.trim());
 const headers={'Content-Type':'application/json; charset=utf-8','X-Content-Type-Options':'nosniff','Vary':'Origin'};
 if(origin && allowed.includes(origin))headers['Access-Control-Allow-Origin']=origin;
 const json=(data,status=200,extra={})=>new Response(JSON.stringify(data),{status,headers:{...headers,...extra}});
 if(origin && !allowed.includes(origin))return json({error:'Origen no permitido'},403);
 if(!['GET','HEAD','OPTIONS'].includes(request.method))return json({error:'Método no permitido'},405,{'Allow':'GET, HEAD, OPTIONS'});
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'GET, HEAD, OPTIONS','Access-Control-Max-Age':'86400'}});
 if(url.pathname==='/api/health')return json({ok:true,service:'el-armario-catalog'});
 if(url.pathname!=='/api/products')return json({error:'Ruta no encontrada'},404);
 const cache=cacheStorage?.default;
 const cacheKey=new Request(url.origin+'/api/products');
 try {
 const cached=cache?await cache.match(cacheKey):null;
 if(cached){const h=new Headers(cached.headers);Object.entries(headers).forEach(([k,v])=>h.set(k,v));h.set('X-Catalog-Cache','HIT');return new Response(request.method==='HEAD'?null:cached.body,{headers:h});}
 const response=await fetchImpl(env.SHEET_CSV_URL||DEFAULT_CSV,{signal:AbortSignal.timeout(20000),headers:{Accept:'text/csv'}});
 if(!response.ok)throw new Error('Upstream HTTP '+response.status);
 const result=Papa.parse(await response.text(),{header:true,skipEmptyLines:'greedy',transformHeader:h=>h.trim().replace(/^\uFEFF/,'')});
 if(!['codigo','nombre','precio'].every(key=>result.meta.fields?.includes(key))||result.errors.length)throw new Error('Invalid catalog CSV');
 const products=result.data.filter(row=>row.codigo?.trim()&&row.nombre?.trim()).map(row=>Object.fromEntries(PUBLIC_FIELDS.map(key=>[key,String(row[key]??'').trim()])));
 const payload={products,updatedAt:new Date().toISOString(),source:'google-sheets'};
 const canonical=new Response(JSON.stringify(payload),{headers:{'Content-Type':headers['Content-Type'],'Cache-Control':'public, max-age=60, s-maxage=300','X-Content-Type-Options':'nosniff'}});
 if(cache)ctx.waitUntil(cache.put(cacheKey,canonical.clone()));
 return new Response(request.method==='HEAD'?null:canonical.body,{headers:{...Object.fromEntries(canonical.headers),...headers,'X-Catalog-Cache':'MISS'}});
 }catch(error){console.error('Catalog load failed:',error.message);return json({error:'No pudimos cargar el catálogo. Intenta nuevamente.'},502,{'Cache-Control':'no-store'});}
 };
}
export default {fetch:createHandler()};
