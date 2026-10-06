import { useState } from 'react';
import { api } from './api';
import type { Draft } from './autosave';

type Customer = {
  id: string;
  fullName: string;
  identification: string;
  phone: string;
  email: string | null;
};
type Vehicle = {
  id: string;
  ownerId: string;
  plate: string;
  make: string;
  model: string | null;
  year: number;
  owner?: Customer;
};
const customerFields = (c: Customer) => ({
  customerId: c.id,
  customerName: c.fullName,
  identification: c.identification,
  phone: c.phone,
  email: c.email ?? '',
});
export function EntitySearch({
  draft,
  onSelect,
}: {
  draft: Draft;
  onSelect: (draft: Draft) => void;
}) {
  const [keepVehicle, setKeepVehicle] = useState(false);
  const [query, setQuery] = useState(''),
    [customers, setCustomers] = useState<Customer[]>([]),
    [vehicles, setVehicles] = useState<Vehicle[]>([]),
    [loading, setLoading] = useState(false),
    [message, setMessage] = useState('');
  async function search() {
    setLoading(true);
    setMessage('');
    setCustomers([]);
    setVehicles([]);
    try {
      const q = query.trim();
      if (q.length < 2) {
        setMessage('Escribe al menos dos caracteres.');
        return;
      }
      const [c, v] = await Promise.all([
        api<{ customers: Customer[] }>(`/customers?q=${encodeURIComponent(q)}`),
        q.length >= 3 && q.length <= 20
          ? api<{ vehicles: Vehicle[] }>(`/vehicles?q=${encodeURIComponent(q)}`)
          : Promise.resolve({ vehicles: [] }),
      ]);
      setCustomers(c.customers);
      setVehicles(v.vehicles);
      if (!c.customers.length && !v.vehicles.length)
        setMessage('Sin coincidencias. Completa los datos de la nueva orden.');
    } catch {
      setMessage('No se pudo buscar. Reintenta cuando haya conexión.');
    } finally {
      setLoading(false);
    }
  }
  async function selectCustomer(c: Customer) {
    onSelect({
      ...draft,
      ...customerFields(c),
      ...(keepVehicle
        ? {}
        : { vehicleId: undefined, plate: '', make: '', model: '', year: null }),
    });
    setCustomers([]);
    setVehicles([]);
    setLoading(true);
    try {
      setVehicles(
        (await api<{ vehicles: Vehicle[] }>(`/vehicles?customerId=${c.id}`))
          .vehicles,
      );
      setMessage(
        keepVehicle
          ? 'Cliente seleccionado para esta orden. El dueño actual del vehículo solo cambia mediante la acción ADMIN confirmada.'
          : 'Cliente seleccionado. Elige uno de sus vehículos o completa uno nuevo.',
      );
    } catch {
      setMessage('Cliente seleccionado; no se pudieron cargar sus vehículos.');
    } finally {
      setLoading(false);
    }
  }
  function selectVehicle(v: Vehicle) {
    setKeepVehicle(false);
    onSelect({
      ...draft,
      ...(v.owner ? customerFields(v.owner) : {}),
      vehicleId: v.id,
      plate: v.plate,
      make: v.make,
      model: v.model ?? '',
      year: v.year,
    });
    setVehicles([]);
    setCustomers([]);
    setMessage('Vehículo y dueño actual seleccionados.');
  }
  return (
    <section className="lookup">
      <h3>Buscar cliente o vehículo existente</h3>
      <div className="search">
        <label>
          Placa, cédula o nombre
          <input
            value={query}
            maxLength={200}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void search();
              }
            }}
          />
        </label>
        <button type="button" disabled={loading} onClick={() => void search()}>
          {loading ? 'Buscando…' : 'Buscar'}
        </button>
      </div>
      <p role="status">{message}</p>
      <div className="search-results">
        {customers.map((c) => (
          <button
            type="button"
            className="quiet"
            key={c.id}
            onClick={() => void selectCustomer(c)}
          >
            {c.fullName} · {c.identification}
          </button>
        ))}
        {vehicles.map((v) => (
          <button
            type="button"
            className="quiet"
            key={v.id}
            onClick={() => selectVehicle(v)}
          >
            {v.plate} · {v.make} {v.model} · {v.owner?.fullName}
          </button>
        ))}
      </div>
      {draft.vehicleId && (
        <button
          type="button"
          className="quiet"
          onClick={() => {
            onSelect({
              ...draft,
              vehicleId: undefined,
              plate: '',
              make: '',
              model: '',
              year: null,
            });
            setMessage('Completa los datos del nuevo vehículo.');
          }}
        >
          Usar otro vehículo
        </button>
      )}
      {draft.customerId && (
        <button
          type="button"
          className="quiet"
          onClick={() => {
            setKeepVehicle(!!draft.vehicleId);
            onSelect({
              ...draft,
              customerId: undefined,
              customerName: '',
              identification: '',
              phone: '',
              email: '',
            });
            setMessage(
              'Busca o completa el nuevo cliente. El dueño actual del vehículo no cambia automáticamente.',
            );
          }}
        >
          {draft.vehicleId
            ? 'Cambiar cliente manteniendo este vehículo'
            : 'Usar otro cliente'}
        </button>
      )}
    </section>
  );
}
