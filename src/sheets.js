import Papa from 'papaparse';
import {PUBLIC_FIELDS} from './products.js';
const DEFAULT_CSV='https://docs.google.com/spreadsheets/d/e/2PACX-1vS95wEXiTqhFt2Hi1-xoNWDqZ2jmKqSass5ADEGQVtIN2Cy4C6M2r27xFOBdxjGq0bdRuFZFnw2UD4M/pub?gid=0&single=true&output=csv';
export async function readSheets(request,env,ctx,fetchImpl,cacheStorage) {
 const cache=cacheStorage?.default;
 const source=env.SHEET_CSV_URL||DEFAULT_CSV;
 const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(source));
 const version=Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
 const key=new Request(new URL(request.url).origin+'/internal/sheet-cache/'+version);
 const cached=cache?await cache.match(key):null;
 if(cached)return {...await cached.json(),cached:true};
 const response=await fetchImpl(source,{signal:AbortSignal.timeout(20000),headers:{Accept:'text/csv'}});
 if(!response.ok)throw new Error('Sheet upstream HTTP '+response.status);
 const result=Papa.parse(await response.text(),{header:true,skipEmptyLines:'greedy',transformHeader:h=>h.trim().replace(/^\uFEFF/,'')});
 if(!['codigo','nombre','precio'].every(key=>result.meta.fields?.includes(key))||result.errors.length)throw new Error('Invalid catalog CSV');
 const products=result.data.filter(row=>row.codigo?.trim()&&row.nombre?.trim()).map(row=>Object.fromEntries(PUBLIC_FIELDS.map(key=>[key,String(row[key]??'').trim()])));
 const payload={products,updatedAt:new Date().toISOString()};
 if(cache)ctx.waitUntil(cache.put(key,new Response(JSON.stringify(payload),{headers:{'Content-Type':'application/json','Cache-Control':'public, max-age=300'}})));
 return {...payload,cached:false};
}
