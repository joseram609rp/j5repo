import { expect, it } from 'vitest';
import { preserveItemOrder } from '../src/sql.js';
it('preserves persisted item ordering without losing duplicates or trusting stale draft values',()=>{
 const a={description:'Servicio',price:100.1,notes:'Observación'},b={description:'Ajuste',price:.2,notes:''};
 expect(preserveItemOrder([b,a,a],[a,a,b])).toEqual([a,a,b]);
 expect(preserveItemOrder([b,a],[{...a,price:999},b])).toEqual([b,a]);
 expect(preserveItemOrder([b,a],undefined)).toEqual([b,a]);
});
