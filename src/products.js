export const PUBLIC_FIELDS=['codigo','nombre','tipo','talla','precio','foto1','foto2','foto3','vendido','genero','descripcion','foto_ia'];
export class HttpError extends Error {constructor(status,message){super(message);this.status=status;}}
export function validateProduct(input, code = null) {
 if(!input||typeof input!=='object'||Array.isArray(input))throw new HttpError(400,'Datos de prenda no válidos.');
 const output=Object.fromEntries(PUBLIC_FIELDS.map(key=>[key,String(input[key]??'').trim()]));
 output.codigo=(code||output.codigo).toUpperCase();
 if(!/^[A-Z0-9][A-Z0-9_-]{0,39}$/.test(output.codigo))throw new HttpError(400,'Usa un código de hasta 40 letras, números, guiones o guiones bajos.');
 if(output.nombre.length<2||output.nombre.length>150)throw new HttpError(400,'El nombre debe tener entre 2 y 150 caracteres.');
 for(const field of ['tipo','talla'])if(!output[field]||output[field].length>60)throw new HttpError(400,'Completa tipo y talla (máximo 60 caracteres).');
 const price=Number(output.precio.replace(',','.'));
 if(!output.precio||!Number.isFinite(price)||price<0||price>1000000)throw new HttpError(400,'El precio debe ser un número entre 0 y 1.000.000.');
 output.precio=String(Math.round(price*100)/100);
 if(!['dama','varon',''].includes(output.genero))throw new HttpError(400,'Colección no válida.');
 output.vendido=['si','sí','true','1'].includes(output.vendido.toLowerCase())?'si':'no';
 if(output.descripcion.length>4000)throw new HttpError(400,'La descripción admite hasta 4000 caracteres.');
 for(const key of ['foto1','foto2','foto3','foto_ia']) {
 const value=output[key];if(!value)continue;
 const managed=/^\/api\/media\/[a-f0-9-]{36}\/(240|480|960|1600)\.webp$/.test(value);
 let external=false;try{const url=new URL(value);external=url.protocol==='https:'&&value.length<=2048;}catch{}
 if(!managed&&!external)throw new HttpError(400,'Las fotos deben ser archivos subidos o enlaces HTTPS válidos.');
 }
 if(![output.foto1,output.foto2,output.foto3,output.foto_ia].some(Boolean))throw new HttpError(400,'Añade al menos una foto.');
 return output;
}
export async function databaseRows(db) {
 if(!db)return [];
 return (await db.prepare('SELECT code,payload,hidden,revision,updated_at FROM products ORDER BY created_at DESC,code').all()).results;
}
export function mergeProducts(sheets, stored, admin = false) {
 const merged=new Map(sheets.map(row=>[row.codigo,{...row,...(admin?{revision:0,hidden:false,source:'sheets'}:{})}]));
 for(const row of stored) {
 if(row.hidden&&!admin){merged.delete(row.code);continue;}
 const product=JSON.parse(row.payload);
 merged.set(row.code,{...product,...(admin?{revision:row.revision,hidden:!!row.hidden,source:'d1'}:{})});
 }
 return [...merged.values()];
}
