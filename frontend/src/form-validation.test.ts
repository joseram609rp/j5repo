import { expect, it } from 'vitest';
import { fieldErrors, visibleErrors, formatCRC } from './form-validation';
import { fresh } from './autosave';
const complete={customerName:'Cliente',identification:'123456789',phone:'88888888',email:'',plate:'ABC123',make:'Toyota',model:'Corolla',year:2020,mileage:0,notes:'',recommendations:'',items:[{description:'Frenos',price:125000}]};
it('empty first render is quiet; blur reveals only touched required fields',()=>{
 expect(visibleErrors(fresh().draft,new Set())).toEqual([]);
 expect(visibleErrors(fresh().draft,new Set(['customerName'])).map(e=>e.field)).toEqual(['customerName']);
});
it.each(['customerName','mileage','year','model'] as const)('requires %s inline and when closing',field=>{
 const draft={...complete,[field]:['mileage','year'].includes(field)?null:'   '};
 expect(fieldErrors(draft).some(e=>e.field===field)).toBe(true);
 expect(visibleErrors(draft,new Set(),true).some(e=>e.field===field)).toBe(true);
});
it('valid model and zero mileage pass; all missing close fields are exposed',()=>{
 expect(fieldErrors(complete)).toEqual([]);
 expect(visibleErrors(fresh().draft,new Set(),true).map(e=>e.field)).toEqual(expect.arrayContaining(['customerName','identification','phone','plate','make','model','year','mileage','items']));
});
it('invalid OrderItem produces only work section errors',()=>{
 const errors=visibleErrors({...complete,items:[{description:'Frenos',price:-1}]},new Set());
 expect(errors).toHaveLength(1);expect(errors[0]!.section).toBe('Trabajos realizados');expect(errors[0]!.field).toBe('item-0-price');
});
it('added untouched blank item remains quiet until blur',()=>{
 expect(visibleErrors({...complete,items:[{description:'',price:0}]},new Set())).toEqual([]);
 expect(visibleErrors({...complete,items:[{description:'',price:0}]},new Set(['item-0-price']))[0]!.field).toBe('item-0-price');
});
it('formats CRC with thousands and preserves cents without changing values',()=>{
 expect(formatCRC(125000)).toBe('₡ 125'+new Intl.NumberFormat('es-CR').format(1000).slice(1,2)+'000');
 expect(formatCRC(125000.25)).toBe('₡ '+new Intl.NumberFormat('es-CR',{minimumFractionDigits:2,maximumFractionDigits:2}).format(125000.25));
 expect(formatCRC(0)).toBe('₡ 0');expect(complete.items[0]!.price).toBe(125000);
});

