import test from 'node:test';
import assert from 'node:assert/strict';
import {createHandler} from '../src/index.js';
const request=(path='/api/products',options={})=>new Request('https://api.example'+path,options);
test('publica solo campos públicos y maneja comas dentro de nombres',async()=>{
 const handler=createHandler(async()=>new Response('codigo,nombre,precio,privado\nVS-1,"Vestido, floral",100,secreto'),null);
 const response=await handler(request());assert.equal(response.status,200);const data=await response.json();assert.equal(data.products[0].nombre,'Vestido, floral');assert.equal(data.products[0].privado,undefined);
});
test('rechaza respuestas HTML del proveedor',async()=>{const response=await createHandler(async()=>new Response('<html>Login</html>'),null)(request());assert.equal(response.status,502);assert.equal(response.headers.get('Cache-Control'),'no-store');});
test('CORS: permite frontend local y rechaza otros orígenes',async()=>{const handler=createHandler();const ok=await handler(request('/api/health',{headers:{Origin:'http://localhost:5173'}}));assert.equal(ok.headers.get('Access-Control-Allow-Origin'),'http://localhost:5173');assert.equal((await handler(request('/api/health',{headers:{Origin:'https://evil.example'}}))).status,403);});
test('solo lectura, rutas y preflight',async()=>{const handler=createHandler();assert.equal((await handler(request('/api/products',{method:'POST'}))).status,405);assert.equal((await handler(request('/missing'))).status,404);assert.equal((await handler(request('/api/products',{method:'OPTIONS'}))).status,204);});
test('reutiliza caché sin conservar CORS de otro visitante',async()=>{let hits=0;let saved;const pending=[];const cache={default:{match:async()=>saved?.clone(),put:async(_,response)=>{saved=response;}}};const handler=createHandler(async()=>{hits++;return new Response('codigo,nombre,precio\nA,Prenda,50');},cache);await handler(request('/api/products',{headers:{Origin:'http://localhost:5173'}}),{}, {waitUntil:p=>pending.push(p)});await Promise.all(pending);const second=await handler(request('/api/products',{headers:{Origin:'https://el-armario.pages.dev'}}));assert.equal(hits,1);assert.equal(second.headers.get('X-Catalog-Cache'),'HIT');assert.equal(second.headers.get('Access-Control-Allow-Origin'),'https://el-armario.pages.dev');assert.equal((await second.json()).products.length,1);});
