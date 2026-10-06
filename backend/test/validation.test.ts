import { describe,it,expect } from 'vitest';
import { customerSchema,vehicleSchema,itemSchema,draftSchema,canClose,totalAmount,fullNameSchema } from '../src/validation.js';
const customer={fullName:'Cliente',identification:'123456789',phone:'88888888',email:' EMAIL@example.com '};
const vehicle={make:'Toyota',model:'Corolla',year:2020,plate:'abc-123',ownerId:crypto.randomUUID()};
const draft={customerName:'Cliente',identification:'123456789',phone:'88888888',email:'',make:'Toyota',model:'Corolla',year:2020,plate:'ABC123',mileage:0,notes:'Observaciones válidas',recommendations:'',items:[{description:'Frenos',price:123.45}]};
describe('validation contracts shared by frontend and backend',()=>{
 it('normalizes names, email and plate',()=>{expect(customerSchema.parse(customer).email).toBe('email@example.com');expect(vehicleSchema.parse(vehicle).plate).toBe('ABC123');expect(fullNameSchema.parse(' Nombre ')).toBe('Nombre');});
 it.each(['','   '])('rejects empty full name %j',fullName=>expect(customerSchema.safeParse({...customer,fullName}).success).toBe(false));
 it.each(['12345678','1234567890','abcdefghi','12345678９'])('rejects identification %s',identification=>expect(customerSchema.safeParse({...customer,identification}).success).toBe(false));
 it.each(['1234567','123456789','8888abcd'])('rejects phone %s',phone=>expect(customerSchema.safeParse({...customer,phone}).success).toBe(false));
 it.each(['wrong','a@','a@b'])('rejects email %s',email=>expect(customerSchema.safeParse({...customer,email}).success).toBe(false));
 it.each(['AB1234','ABCD12','ABC12','123ABC'])('rejects plate %s',plate=>expect(vehicleSchema.safeParse({...vehicle,plate}).success).toBe(false));
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
