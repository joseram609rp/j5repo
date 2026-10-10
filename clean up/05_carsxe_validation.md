 > Nota histórica: esta validación inicial fue superada por el catálogo integrado de 57 marcas/986 modelos. Ver data/vehicle-catalog/README.md para el estado vigente y fuentes; este documento conserva evidencia inicial.

# Validación CarsXE — 2026-10-09
Solo 2 requests reales, sin reintentos ni importación SQL. No se guardaron respuestas completas ni key.
GET https://api.carsxe.com/v1/ymm-options con dimension=models y make=Toyota/Suzuki, sin year/model/variants.
La key se leyó desde .env solo en memoria. No se implementó un seed ni tablas VehicleMakes/VehicleModels.

| Marca | HTTP | Modelos devueltos | Encontrados | Ausentes |
|---|---|---:|---|---|
| Toyota | 200 | 60 | Corolla, RAV4, Yaris | Hilux, Fortuner |
| Suzuki | 200 | 16 | Vitara, Grand Vitara, Swift | Jimny |

Ambas respuestas indicaron success=true. Costo estimado: 2 unidades según documentación (1 por request de models).
No hubo datos de usage/costo utilizables en las respuestas; saldo restante y costo monetario no verificados.
No hacer más requests para adivinar otros filtros con este sandbox de 100 llamadas lifetime.
No basta CarsXE solo: hay faltantes concretos para Costa Rica; complementar con importadores y validar aliases.

## Licencia/retención: pendiente antes del seed
[Documentación](https://docs.carsxe.com/api-reference/year-make-model/year-make-model-options) permite pedir modelos de una marca sin año.
[Términos públicos](https://carsxe.com/terms-and-conditions) revisados: restricciones generales sobre contenido y reportes; no se encontró permiso claro específico para persistencia permanente comercial del catálogo YMM.
Esto NO confirma que la API prohíba cachear; requiere contrato/licencia del plan o confirmación escrita del proveedor antes de guardar el catálogo en SQL y entregarlo al cliente.
La síntesis anterior es evidencia de calidad, no una copia del catálogo.

## Propuesta de 38 marcas para siguiente fase
Propuesta editorial para taller, no ranking ni reproducción de estadísticas. Las marcas históricas también importan aunque se vendan pocos vehículos nuevos.
Toyota, Nissan, Suzuki, Mitsubishi, Hyundai, Kia, Honda, Mazda, Chevrolet, Isuzu, Ford, Volkswagen, Subaru, Daihatsu,
Renault, Peugeot, Citroën, SsangYong/KGM, Jeep, Dodge, Fiat, RAM, BMW, Audi, Mercedes-Benz, Lexus, Volvo,
Geely, BYD, Changan, JAC, Chery, MG, Great Wall, Haval, BAIC, Foton, Dongfeng.
SsangYong/KGM es una sola familia propuesta; revisar equivalencias CarsXE. Great Wall/GWM y MG/M.G. requieren normalización; Haval conserva marca propia.
Vehicles.make/model deben seguir aceptando texto libre. No year, trims ni variants en el futuro autocomplete.

Fuentes:
- [AIVEMA estadísticas](https://aivemacr.com/estadisticas/), informe diciembre 2025 consultado para presencia local; no se copiaron cifras ni ranking.
- [Purdy Center](https://purdycenter.cr/): marcas tradicionales y Daihatsu.
- [Veinsa](https://veinsamotors.com/blog/conoce-las-13-marcas-de-vehiculos-que-veinsa-motors-lleva-a-la-expomovil-2026-2): Mitsubishi, Geely, Peugeot, Citroën, KGM.
- [AutoStar](https://www.autostar.cr/empresa): Mercedes-Benz, Dodge, Fiat, Jeep, RAM.
- [JAC términos locales](https://www.jac.cr/terminos-y-condiciones): Suzuki, JAC, Changan.
- [Ambacar](https://ambacar.cr/modelos-disponibles/): Great Wall/Haval.
- [Kia CR](https://www.kia.com/cr/main.html), [Mazda CR](https://mazda.co.cr/), [BMW CR](https://www.bmw.co.cr/), [Nissan CR](https://www.nissancr.com/), [Renault CR](https://renaultcr.com/), [Cori Car](https://coricomercial.com/nosotros/).

Bloqueadores de seed: licencia de retención, cobertura Hilux/Fortuner/Jimny y equivalencias de nombres; aprobar lista antes de consumir cuota adicional.
