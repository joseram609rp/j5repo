import { customerSchema, vehicleSchema, mileageSchema, itemSchema } from '../../backend/src/validation';
import type { Draft } from './autosave';
export type Section = 'Datos del cliente' | 'Datos del vehículo' | 'Trabajos realizados' | 'Observaciones generales';
export type FieldError = {field:string; section:Section; message:string};
export function fieldErrors(d:Draft): FieldError[] {
 const errors:FieldError[]=[];
 const add=(field:string,section:Section,message:string)=>errors.push({field,section,message});
 const customer=customerSchema.safeParse({fullName:d.customerName,identification:d.identification ?? '',phone:d.phone ?? '',email:d.email ?? ''});
 const messages:Record<string,string>={fullName:'Escribe el nombre completo.',identification:'La cédula debe tener exactamente 9 dígitos.',phone:'El teléfono debe tener exactamente 8 dígitos.',email:'Escribe un correo válido o deja el campo vacío.'};
 if(!customer.success) for(const issue of customer.error.issues) {const key=String(issue.path[0]);add(key==='fullName'?'customerName':key,'Datos del cliente',messages[key]!);}
 const vehicle=vehicleSchema.safeParse({make:d.make ?? '',model:d.model ?? '',year:d.year,plate:d.plate,ownerId:'00000000-0000-4000-8000-000000000000'});
 const vehicleMessages:Record<string,string>={make:'Escribe la marca.',model:'Escribe el modelo.',year:'Indica un año entero igual o mayor que 1950.',plate:'La placa debe tener 3 letras y 3 números (ABC123).'};
 if(!vehicle.success) for(const issue of vehicle.error.issues) {const key=String(issue.path[0]);add(key,'Datos del vehículo',vehicleMessages[key]!);}
 if(d.mileage===null || !mileageSchema.safeParse(d.mileage).success) add('mileage','Datos del vehículo','Indica el kilometraje: un entero entre 0 y 10,000,000.');
 for(const [i,item] of (d.items ?? []).entries()) {const result=itemSchema.safeParse(item);if(!result.success) for(const issue of result.error.issues) {const key=String(issue.path[0]);add(`item-${i}-${key}`,'Trabajos realizados',key==='price'?'Indica un precio positivo con hasta dos decimales.':'Escribe la descripción del trabajo.');}}

 return errors;
}
export function visibleErrors(d:Draft,touched:ReadonlySet<string>,closing=false) {
 const errors=fieldErrors(d);
 if(closing && !d.items?.length) errors.push({field:'items',section:'Trabajos realizados',message:'Agrega al menos un trabajo con descripción y precio.'});
 return errors.filter(error=>closing || touched.has(error.field) || (error.field.startsWith('item-') ? (()=>{const [,index,key]=error.field.split('-');const item=d.items?.[Number(index)];return key==='price' ? !!item?.price : !!item?.description;})() : (()=>{const value=d[error.field as keyof Draft];return value!==null && value!==undefined && value!=='';})()));
}
// Numeric inputs stay numeric. This preview cannot change payload values or cursor position.
export function formatMileage(value:number | null | undefined) {
 return typeof value==='number' && Number.isInteger(value) && value>=0 ? new Intl.NumberFormat('en-US').format(value)+' km' : '';
}
export function formatCRC(value:number) {
 return '₡ ' + new Intl.NumberFormat('es-CR',{minimumFractionDigits:Number.isInteger(value)?0:2,maximumFractionDigits:2}).format(value);
}
