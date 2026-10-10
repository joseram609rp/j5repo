import { describe,it,expect } from 'vitest';
import { customerSchema,vehicleSchema,itemSchema,draftSchema,canClose,totalAmount,fullNameSchema,amounts } from '../src/validation.js';
const customer={fullName:'Cliente',identification:'123456789',phone:'88888888',email:' EMAIL@example.com '};
const vehicle={make:'Toyota',model:'Corolla',year:2020,plate:'abc-123',ownerId:crypto.randomUUID()};
const draft={customerName:'Cliente',identification:'123456789',phone:'88888888',email:'',make:'Toyota',model:'Corolla',year:2020,plate:'ABC123',mileage:0,paymentMethod: 'CASH' as const, electronicInvoice: false, notes: 'Observaciones válidas',recommendations:'',items:[{description:'Frenos',price:123.45}]};
describe('validation contracts shared by frontend and backend',()=>{
 it('normalizes names, email and plate',()=>{expect(customerSchema.parse(customer).email).toBe('email@example.com');expect(vehicleSchema.parse(vehicle).plate).toBe('ABC123');expect(fullNameSchema.parse(' Nombre ')).toBe('Nombre');});
 it.each(['','   '])('rejects empty full name %j',fullName=>expect(customerSchema.safeParse({...customer,fullName}).success).toBe(false));
 it.each(['12345678','1234567890','abcdefghi','12345678９'])('rejects identification %s',identification=>expect(customerSchema.safeParse({...customer,identification}).success).toBe(false));
 it.each(['1234567','123456789','8888abcd'])('rejects phone %s',phone=>expect(customerSchema.safeParse({...customer,phone}).success).toBe(false));
 it.each(['wrong','a@','a@b'])('rejects email %s',email=>expect(customerSchema.safeParse({...customer,email}).success).toBe(false));
 it.each(['','AB','ABC!123','ABC🚘','ABCDEFGHIJKLM','ÁBC123','ＡBC123'])('rejects plate %s',plate=>expect(vehicleSchema.safeParse({...vehicle,plate}).success).toBe(false));
 it.each([1949,2020.5])('rejects year %s',year=>expect(vehicleSchema.safeParse({...vehicle,year}).success).toBe(false));
 it.each([{description:' ',price:1},{description:'Frenos',price:0},{description:'Frenos',price:-1},{description:'Frenos',price:1.001},{description:'Frenos',price:10000000000}])('rejects invalid service %j',item=>expect(itemSchema.safeParse(item).success).toBe(false));
 it('requires services and mileage to close',()=>{expect(canClose(draft)).toBe(true);expect(canClose({...draft,items:[]})).toBe(false);expect(canClose({...draft,mileage:null})).toBe(false);expect(canClose({...draft,phone:''})).toBe(false);});
 it.each([{customerName:''},{customerName:'   '},{mileage:null},{year:null},{model:''},{model:'   '},{model:undefined}])('rejects incomplete closing fields %j', missing=>expect(canClose({...draft,...missing})).toBe(false));
 it('old OPEN drafts without model remain valid',()=>{const {model:_,...legacy}=draft;expect(draftSchema.safeParse(legacy).success).toBe(true);expect(canClose(legacy)).toBe(false);});
 it('calculates cents and rejects client totals and aggregate overflow',()=>{expect(totalAmount([{price:0.1},{price:0.2}])).toBe(0.3);expect(draftSchema.safeParse({...draft,totalAmount:1}).success).toBe(false);expect(draftSchema.safeParse({...draft,items:[{description:'a',price:9999999999.99},{description:'b',price:1}]}).success).toBe(false);});
});

it.each(['','   ','\t\n'])('OPEN accepts empty notes %j and numeric mileage only',notes=>{
 expect(draftSchema.parse({...draft,notes,mileage:128400}).mileage).toBe(128400);
 expect(draftSchema.safeParse({...draft,notes,mileage:'128,400'}).success).toBe(false);
});

it.each([1950,2028,2035,100000,2147483647])('accepts year %s without a functional maximum',year=>expect(vehicleSchema.safeParse({...vehicle,year}).success).toBe(true));
it.each(['','   ','\t\n'])('permits close with optional notes %j',notes=>expect(canClose({...draft,notes,recommendations:''})).toBe(true));


it.each(['SINPE','CREDIT_CARD','DEBIT_CARD','CASH','BANK_TRANSFER'] as const)('accepts explicit %s and both invoice choices',paymentMethod=>{
 for(const electronicInvoice of [true,false]) expect(canClose({...draft,paymentMethod,electronicInvoice,notes:'',recommendations:'',items:[{description:'Trabajo',price:1,notes:''}]})).toBe(true);
});
it('payment and invoice are required only to close; blank or absent notes are optional',()=>{
 for(const missing of [{paymentMethod:undefined},{electronicInvoice:undefined}]) {expect(draftSchema.safeParse({...draft,...missing}).success).toBe(true);expect(canClose({...draft,...missing})).toBe(false);}
 const {notes:_,recommendations:__,...legacy}=draft;const parsed=draftSchema.parse(legacy);expect(parsed.notes).toBe('');expect(parsed.recommendations).toBe('');expect(canClose(parsed)).toBe(true);
 expect(itemSchema.safeParse({description:'Trabajo',price:1}).success).toBe(true);expect(itemSchema.safeParse({description:'Trabajo',price:1,notes:'x'.repeat(2001)}).success).toBe(false);
 expect(draftSchema.safeParse({...draft,electronicInvoice:'false'}).success).toBe(false);expect(draftSchema.safeParse({...draft,paymentMethod:'other'}).success).toBe(false);
});
it('IVA is rounded per line and totals are derived in cents',()=>{
 expect(amounts([{price:1000}])).toEqual({subtotal:1000,tax:130,total:1130});
 expect(amounts([{price:100.1},{price:.2}])).toEqual({subtotal:100.3,tax:13.04,total:113.34});
 expect(amounts([{price:.05},{price:.05}])).toEqual({subtotal:.1,tax:.02,total:.12});
 expect(amounts([{price:1000}],0)).toEqual({subtotal:1000,tax:0,total:1000});
});

it.each(['ABC111','ABC1234','CL111111','C111111','111111','AB1234','123ABC'])('accepts flexible plate %s',plate=>{expect(vehicleSchema.parse({...vehicle,plate}).plate).toBe(plate);expect(draftSchema.parse({...draft,plate}).plate).toBe(plate);expect(canClose({...draft,plate})).toBe(true);});
