# Fuentes y metodología — catálogo de Costa Rica

Consulta: **2026-10-09**, America/Guatemala. Timestamp UTC individual en API/observaciones.

CarsXE se usa como seed, no como catálogo exhaustivo de CR. Se cruzan tres clases: AIVEMA para presencia; CRAutos para usados/históricos; Encuentra24 como segundo mercado usado. Los sitios locales de marcas/importadores sirven de desempate. No hay ranking fiable por modelo en esta investigación: se habla de comercialización documentada o presencia en anuncios.

CRAutos: **82 páginas por marca**, **33 etiquetas de marca**, **1004 etiquetas de anuncios** capturadas (pueden repetirse entre consultas, no son ventas). Se siguió el formulario público con brand, modelstr, p y filtro solo usados; cada consulta conserva filtros y enlaces en market_observations.json. Se recorrieron todas las páginas disponibles hasta seis en marcas chinas/prioridades con seed vacío. Toyota/Nissan/Suzuki/Mitsubishi/Hyundai/Kia/Land Rover: muestra de dos páginas históricas y contraste con portada/importadores, no censo de todo su inventario.

Encuentra24: categorías por marca y páginas específicas Hilux/Fortuner/Jimny. Las coincidencias se registran por source_id, sin copiar descripciones de anuncios. Los intentos BAIC/GAC y paginación adicional Geely/BYD devolvieron errores o no se pudieron verificar; no se utilizan para probar ausencia de mercado. Foton abrió categoría pero no entregó evidencia útil de modelos. Las páginas del lector pueden ser indexadas/caché; presencia publicada no garantiza stock ni disponibilidad actual.

AIVEMA: informe diciembre 2025 utilizado para comprobar presencia por marca y orientar cobertura; no se reproduce su tabla/cifras/ranking. El propio informe no identifica modelos. Las marcas tradicionales/históricas como Daihatsu también se justifican por usados. Se consultaron catálogos locales completos de las chinas prioritarias y se distinguieron sub-marcas vendidas por el mismo distribuidor.

RAW no se normaliza. Manual y final se reducen a modelos base mediante aliases explícitos, sin años, motores ni trims. Modelos CarsXE raros permanecen; la política de utilitarios manuales evita maquinaria, camiones medianos/pesados y buses. Evidencia dudosa no produce nuevas sugerencias; ver REVIEW.md.

## Registro de fuentes

### carsxe-docs

[api_documentation](https://docs.carsxe.com/api-reference/year-make-model/year-make-model-options) — consultado 2026-10-09. dimension=models, una unidad por request; sin consulta de años, trims ni variantes.

### aivema

[market_presence](https://aivemacr.com/wp-content/uploads/2026/07/Bancos-Informe-de-mercado-automotriz-costarricense-Diciembre-2025.pdf) — consultado 2026-10-09. Informe por marca utilizado solo para validar cobertura; sin reproducir cifras, tablas ni ranking. No establece ventas por modelo.

### toyota-cr

[local_distributor](https://www.toyotacr.com/) — consultado 2026-10-09. Modelos publicados en catálogo local; no es ranking de ventas.

### suzuki-cr

[local_distributor](https://www.suzuki.cr/) — consultado 2026-10-09. Modelos publicados en catálogo local; no es ranking de ventas.

### nissan-cr

[local_distributor](https://www.nissancr.com/) — consultado 2026-10-09. Modelos publicados en catálogo local; no es ranking de ventas.

### mitsubishi-cr

[local_distributor](https://veinsamotors.com/wp-content/uploads/2025/01/Reglamento-Mitsubishi-Desafia-el-Terreno-2025-1.pdf) — consultado 2026-10-09. Promoción histórica local 2025, evidencia de comercialización; no confirma disponibilidad actual.

### isuzu-cr

[local_distributor](https://isuzucr.com/calculadora) — consultado 2026-10-09. Modelos publicados en catálogo local; no es ranking de ventas.

### kia-cr

[local_distributor](https://www.kia.com/cr/main.html) — consultado 2026-10-09. Modelos publicados en catálogo local; no es ranking de ventas.

### vw-cr

[local_distributor](https://www.volkswagen.cr/es/modelos.html) — consultado 2026-10-09. Modelos publicados en catálogo local; no es ranking de ventas.

### renault-cr

[local_distributor](https://renaultcr.com/) — consultado 2026-10-09. Se excluyen anuncios de Niagara/Boreal sin confirmar comercialización.

### peugeot-cr

[local_distributor](https://www.peugeot.co.cr/) — consultado 2026-10-09. Solo menú local; se ignoran ofertas genéricas europeas en euros del mismo sitio.

### citroen-cr

[local_distributor](https://www.citroencr.com/index.html) — consultado 2026-10-09. Modelos publicados en catálogo local; no es ranking de ventas.

### kgm-cr

[local_distributor](https://veinsamotors.com/wp-content/uploads/2025/09/Reglamento-Reglamento-Promocion-paga-hasta-2026.pdf) — consultado 2026-10-09. Documento local histórico 2025; Torres EVX se agrupa bajo Torres por política sin motorizaciones.

### kgm-actyon

[local_distributor](https://veinsamotors.com/blog/veinsa-motors-reconocido-lider-en-el-sector-automotriz-de-costa-rica) — consultado 2026-10-09. Modelos publicados en catálogo local; no es ranking de ventas.

### byd-cr

[local_distributor](https://bydautocr.com/precios-nuevos/) — consultado 2026-10-09. Modelos publicados en catálogo local; no es ranking de ventas.

### geely-cr

[local_distributor](https://www.geely.cr/?s=2) — consultado 2026-10-09. Listado local indexado; el lector web entrega cuerpo dinámico vacío, contrastado con CRAutos/Encuentra24.

### changan-cr

[local_distributor](https://www.changan.cr/) — consultado 2026-10-09. NEW/PLUS/MAX/REEV se registran como nombres observados y se agrupan al modelo base; Deepal/Avatr separadas.

### deepal-cr

[local_distributor](https://www.changan.cr/) — consultado 2026-10-09. Comercializados en portal Changan, se conserva marca Deepal separada.

### avatr-cr

[local_distributor](https://www.changan.cr/) — consultado 2026-10-09. Comercializados en portal Changan, se conserva marca Avatr separada.

### dongfeng-cr

[local_distributor](https://dongfengcr.com/) — consultado 2026-10-09. Denominación local DFM/Dongfeng; EV/e-DRIVE/Pro/Tiger tratados como versiones, no modelos adicionales; Voyah no se fusiona.

### chery-cr

[local_distributor](https://www.cherycr.com/) — consultado 2026-10-09. Pro/Pro Max se agrupan por familia numérica; se conservan nombres observados en aliases. iCAUR no se fusiona con Chery.

### jac-cr

[local_distributor](https://www.jac.cr/) — consultado 2026-10-09. Portal de comerciales: solo utilitarios livianos/van; no se añaden camiones medianos/pesados.

### mg-combustion

[local_distributor](https://www.mg.cr/combustion) — consultado 2026-10-09. Modelos publicados en catálogo local; no es ranking de ventas.

### mg-electric

[local_distributor](https://www.mg.cr/electricos) — consultado 2026-10-09. Modelos publicados en catálogo local; no es ranking de ventas.

### greatwall-cr

[local_distributor](https://ambacar.cr/modelos-disponibles/) — consultado 2026-10-09. Great Wall/GWM equivalencia operativa; Haval permanece marca separada.

### haval-cr

[local_distributor](https://ambacar.cr/modelos-disponibles/) — consultado 2026-10-09. Jolion Pro/FL agrupados bajo Jolion; no confundir familia corporativa con marca.

### dfsk-cr

[local_distributor](https://ambacar.cr/categoria/autos/dfsk/) — consultado 2026-10-09. Catálogo local distingue DFSK de Seres; no fusionar con Dongfeng.

### seres-cr

[local_distributor](https://ambacar.cr/modelos-disponibles/) — consultado 2026-10-09. Modelos publicados en catálogo local; no es ranking de ventas.

### swm-cr

[local_distributor](https://ambacar.cr/modelos-disponibles/) — consultado 2026-10-09. Modelos publicados en catálogo local; no es ranking de ventas.

### baic-cr

[local_distributor](https://baicmotor.cr/) — consultado 2026-10-09. BJ41e/BJ60e agrupados por modelo base sin motorización; X35 Turbo se reduce a X35.

### foton-g7

[local_distributor](https://fotoncr.com/foton-presenta-su-nuevo-pickup-tunland-g7-4x4-moderno-y-potente-para-cualquier-camino-desde-33-99/) — consultado 2026-10-09. Lanzamiento local histórico con Cori Motors; no inferir distribución actual de toda la gama.

### foton-v9

[local_distributor](https://www.fotoncr.com/wp-content/uploads/2024/10/FICHA-TUNLAND-V9.pdf) — consultado 2026-10-09. Modelos publicados en catálogo local; no es ranking de ventas.

### foton-v7

[local_distributor](https://dev.fotoncr.com/tunland-v7/) — consultado 2026-10-09. Página en subdominio dev: evidencia provisional, revisar disponibilidad; se conserva fuente claramente identificada.

### jetour-cr

[local_distributor](https://jetour-cr.net/) — consultado 2026-10-09. Página local de Quality Motors, sin asumir continuidad de antiguos distribuidores.

### gac-cr

[local_distributor](https://gac.cr/) — consultado 2026-10-09. GS4 MAX/M6 PRO se agrupan por base; Aion Y Plus se guarda bajo Aion.

### aion-y

[local_distributor](https://gac.cr/aion/) — consultado 2026-10-09. Modelos publicados en catálogo local; no es ranking de ventas.

### aion-v

[local_distributor](https://aioncostarica.com/v/) — consultado 2026-10-09. Modelos publicados en catálogo local; no es ranking de ventas.

### maxus-cr

[local_distributor](https://maxus.cr/) — consultado 2026-10-09. Modelos publicados en catálogo local; no es ranking de ventas.

### maxus-history

[local_distributor](https://maxus.cr/quienes-somos) — consultado 2026-10-09. Historia local de comercialización, no garantía de inventario nuevo actual.

### maxus-ev

[local_distributor](https://maxus.cr/electromovilidad) — consultado 2026-10-09. Nombre comercial propio, conservar; relación con V90/Deliver 9 requiere revisar antes de fusionar.

### jmc-cr

[local_distributor](https://jmc.cr/) — consultado 2026-10-09. Grand Avenue Pro se agrupa bajo Grand Avenue; se excluyen camiones y buses de esta revisión de livianos.

### omoda-cr

[local_distributor](https://www.omodajaecoo.cr/vehiculos) — consultado 2026-10-09. Modelos publicados en catálogo local; no es ranking de ventas.

### jaecoo-cr

[local_distributor](https://www.omodajaecoo.cr/vehiculos) — consultado 2026-10-09. EJ5 eléctrico se agrupa con J5 por política de base; no fusionar Omoda con Jaecoo.

### kaiyi-cr

[local_distributor](https://kaiyicostarica.com/) — consultado 2026-10-09. Denominaciones locales; no se equipara X3 de usados con KYX3 sin confirmar generaciones.

### neta-cr

[local_distributor](https://www.netaauto.co.cr/) — consultado 2026-10-09. Modelos publicados en catálogo local; no es ranking de ventas.

### zeekr-cr

[local_distributor](https://www.zeekrlife.com/es-cr/) — consultado 2026-10-09. Modelos publicados en catálogo local; no es ranking de ventas.

### riddara-cr

[local_distributor](https://veinsamotors.com/blog/riddara-abre-sus-puertas-en-costa-rica) — consultado 2026-10-09. Evidencia histórica local; se conserva marca separada de Geely.

### xpeng-history

[local_press](https://www.larepublica.net/noticia/grupo-purdy-primer-distribuidor-oficial-de-xpeng-en-america-con-modelos-electricos-desde-39900-y-74900) — consultado 2026-10-09. Noticia local histórica; G3i/G9 lanzados, P7 anunciado para portafolio, revisar disponibilidad.

### xpeng-g6

[local_distributor](https://xpengcr.nyc3.cdn.digitaloceanspaces.com/documents/xpeng_G6.pdf) — consultado 2026-10-09. Ficha local XPENG/Grupo Purdy.

### crautos-aion

[used_market](https://www.crautos.com/autosusados/) — consultado 2026-10-09. Consulta POST por marca; 1 páginas revisadas, 1 anuncios observados. Filtros, URLs individuales y etiquetas en market_observations.json. No es ranking.

### crautos-baic

[used_market](https://www.crautos.com/autosusados/) — consultado 2026-10-09. Consulta POST por marca; 1 páginas revisadas, 14 anuncios observados. Filtros, URLs individuales y etiquetas en market_observations.json. No es ranking.

### crautos-byd

[used_market](https://www.crautos.com/autosusados/) — consultado 2026-10-09. Consulta POST por marca; 4 páginas revisadas, 49 anuncios observados. Filtros, URLs individuales y etiquetas en market_observations.json. No es ranking.

### crautos-changan

[used_market](https://www.crautos.com/autosusados/) — consultado 2026-10-09. Consulta POST por marca; 5 páginas revisadas, 62 anuncios observados. Filtros, URLs individuales y etiquetas en market_observations.json. No es ranking.

### crautos-chery

[used_market](https://www.crautos.com/autosusados/) — consultado 2026-10-09. Consulta POST por marca; 4 páginas revisadas, 51 anuncios observados. Filtros, URLs individuales y etiquetas en market_observations.json. No es ranking.

### crautos-citron

[used_market](https://www.crautos.com/autosusados/) — consultado 2026-10-09. Consulta POST por marca; 4 páginas revisadas, 52 anuncios observados. Filtros, URLs individuales y etiquetas en market_observations.json. No es ranking.

### crautos-daihatsu

[used_market](https://www.crautos.com/autosusados/) — consultado 2026-10-09. Consulta POST por marca; 6 páginas revisadas, 83 anuncios observados. Filtros, URLs individuales y etiquetas en market_observations.json. No es ranking.

### crautos-dongfeng

[used_market](https://www.crautos.com/autosusados/) — consultado 2026-10-09. Consulta POST por marca; 3 páginas revisadas, 33 anuncios observados. Filtros, URLs individuales y etiquetas en market_observations.json. No es ranking.

### crautos-foton

[used_market](https://www.crautos.com/autosusados/) — consultado 2026-10-09. Consulta POST por marca; 1 páginas revisadas, 2 anuncios observados. Filtros, URLs individuales y etiquetas en market_observations.json. No es ranking.

### crautos-geely

[used_market](https://www.crautos.com/autosusados/) — consultado 2026-10-09. Consulta POST por marca; 6 páginas revisadas, 85 anuncios observados. Filtros, URLs individuales y etiquetas en market_observations.json. No es ranking.

### crautos-greatwall

[used_market](https://www.crautos.com/autosusados/) — consultado 2026-10-09. Consulta POST por marca; 2 páginas revisadas, 20 anuncios observados. Filtros, URLs individuales y etiquetas en market_observations.json. No es ranking.

### crautos-haval

[used_market](https://www.crautos.com/autosusados/) — consultado 2026-10-09. Consulta POST por marca; 2 páginas revisadas, 16 anuncios observados. Filtros, URLs individuales y etiquetas en market_observations.json. No es ranking.

### crautos-hyundai

[used_market](https://www.crautos.com/autosusados/) — consultado 2026-10-09. Consulta POST por marca; 2 páginas revisadas, 1666 anuncios observados. Filtros, URLs individuales y etiquetas en market_observations.json. No es ranking.

### crautos-jac

[used_market](https://www.crautos.com/autosusados/) — consultado 2026-10-09. Consulta POST por marca; 3 páginas revisadas, 41 anuncios observados. Filtros, URLs individuales y etiquetas en market_observations.json. No es ranking.

### crautos-jaecoo

[used_market](https://www.crautos.com/autosusados/) — consultado 2026-10-09. Consulta POST por marca; 1 páginas revisadas, 4 anuncios observados. Filtros, URLs individuales y etiquetas en market_observations.json. No es ranking.

### crautos-jetour

[used_market](https://www.crautos.com/autosusados/) — consultado 2026-10-09. Consulta POST por marca; 1 páginas revisadas, 11 anuncios observados. Filtros, URLs individuales y etiquetas en market_observations.json. No es ranking.

### crautos-jmc

[used_market](https://www.crautos.com/autosusados/) — consultado 2026-10-09. Consulta POST por marca; 1 páginas revisadas, 9 anuncios observados. Filtros, URLs individuales y etiquetas en market_observations.json. No es ranking.

### crautos-kaiyi

[used_market](https://www.crautos.com/autosusados/) — consultado 2026-10-09. Consulta POST por marca; 1 páginas revisadas, 6 anuncios observados. Filtros, URLs individuales y etiquetas en market_observations.json. No es ranking.

### crautos-kia

[used_market](https://www.crautos.com/autosusados/) — consultado 2026-10-09. Consulta POST por marca; 2 páginas revisadas, 626 anuncios observados. Filtros, URLs individuales y etiquetas en market_observations.json. No es ranking.

### crautos-landrover

[used_market](https://www.crautos.com/autosusados/) — consultado 2026-10-09. Consulta POST por marca; 2 páginas revisadas, 276 anuncios observados. Filtros, URLs individuales y etiquetas en market_observations.json. No es ranking.

### crautos-maxus

[used_market](https://www.crautos.com/autosusados/) — consultado 2026-10-09. Consulta POST por marca; 2 páginas revisadas, 27 anuncios observados. Filtros, URLs individuales y etiquetas en market_observations.json. No es ranking.

### crautos-mg

[used_market](https://www.crautos.com/autosusados/) — consultado 2026-10-09. Consulta POST por marca; 4 páginas revisadas, 48 anuncios observados. Filtros, URLs individuales y etiquetas en market_observations.json. No es ranking.

### crautos-mitsubishi

[used_market](https://www.crautos.com/autosusados/) — consultado 2026-10-09. Consulta POST por marca; 2 páginas revisadas, 542 anuncios observados. Filtros, URLs individuales y etiquetas en market_observations.json. No es ranking.

### crautos-neta

[used_market](https://www.crautos.com/autosusados/) — consultado 2026-10-09. Consulta POST por marca; 1 páginas revisadas, 5 anuncios observados. Filtros, URLs individuales y etiquetas en market_observations.json. No es ranking.

### crautos-nissan

[used_market](https://www.crautos.com/autosusados/) — consultado 2026-10-09. Consulta POST por marca; 2 páginas revisadas, 1144 anuncios observados. Filtros, URLs individuales y etiquetas en market_observations.json. No es ranking.

### crautos-omoda

[used_market](https://www.crautos.com/autosusados/) — consultado 2026-10-09. Consulta POST por marca; 1 páginas revisadas, 5 anuncios observados. Filtros, URLs individuales y etiquetas en market_observations.json. No es ranking.

### crautos-peugeot

[used_market](https://www.crautos.com/autosusados/) — consultado 2026-10-09. Consulta POST por marca; 4 páginas revisadas, 47 anuncios observados. Filtros, URLs individuales y etiquetas en market_observations.json. No es ranking.

### crautos-renault

[used_market](https://www.crautos.com/autosusados/) — consultado 2026-10-09. Consulta POST por marca; 5 páginas revisadas, 71 anuncios observados. Filtros, URLs individuales y etiquetas en market_observations.json. No es ranking.

### crautos-kgm

[used_market](https://www.crautos.com/autosusados/) — consultado 2026-10-09. Consulta POST por marca; 3 páginas revisadas, 43 anuncios observados. Filtros, URLs individuales y etiquetas en market_observations.json. No es ranking.

### crautos-suzuki

[used_market](https://www.crautos.com/autosusados/) — consultado 2026-10-09. Consulta POST por marca; 2 páginas revisadas, 856 anuncios observados. Filtros, URLs individuales y etiquetas en market_observations.json. No es ranking.

### crautos-toyota

[used_market](https://www.crautos.com/autosusados/) — consultado 2026-10-09. Consulta POST por marca; 2 páginas revisadas, 1977 anuncios observados. Filtros, URLs individuales y etiquetas en market_observations.json. No es ranking.

### crautos-vgv

[used_market](https://www.crautos.com/autosusados/) — consultado 2026-10-09. Consulta POST por marca; 1 páginas revisadas, 7 anuncios observados. Filtros, URLs individuales y etiquetas en market_observations.json. No es ranking.

### crautos-zeekr

[used_market](https://www.crautos.com/autosusados/) — consultado 2026-10-09. Consulta POST por marca; 1 páginas revisadas, 2 anuncios observados. Filtros, URLs individuales y etiquetas en market_observations.json. No es ranking.

### e24-toyota

[used_market](https://www.encuentra24.com/costa-rica-es/autos-usados/toyota/fortuner) — consultado 2026-10-09. Anuncios locales contrastados; nombres reducidos a modelo base. No se usan etiquetas del portal como ranking de ventas.

### e24-suzuki

[used_market](https://www.encuentra24.com/costa-rica-es/autos-usados/suzuki/jimny) — consultado 2026-10-09. Anuncios locales contrastados; nombres reducidos a modelo base. No se usan etiquetas del portal como ranking de ventas.

### e24-byd

[used_market](https://www.encuentra24.com/costa-rica-es/autos-usados/byd) — consultado 2026-10-09. Anuncios locales contrastados; nombres reducidos a modelo base. No se usan etiquetas del portal como ranking de ventas.

### e24-geely

[used_market](https://www.encuentra24.com/costa-rica-es/autos-usados/geely) — consultado 2026-10-09. Anuncios locales contrastados; nombres reducidos a modelo base. No se usan etiquetas del portal como ranking de ventas.

### e24-changan

[used_market](https://www.encuentra24.com/costa-rica-es/autos-usados/changan) — consultado 2026-10-09. Anuncios locales contrastados; nombres reducidos a modelo base. No se usan etiquetas del portal como ranking de ventas.

### e24-dongfeng

[used_market](https://www.encuentra24.com/costa-rica-es/autos-usados/dongfeng) — consultado 2026-10-09. Anuncios locales contrastados; nombres reducidos a modelo base. No se usan etiquetas del portal como ranking de ventas.

### e24-chery

[used_market](https://www.encuentra24.com/costa-rica-es/autos-usados/chery) — consultado 2026-10-09. Anuncios locales contrastados; nombres reducidos a modelo base. No se usan etiquetas del portal como ranking de ventas.

### e24-jac

[used_market](https://www.encuentra24.com/costa-rica-es/autos-usados/jac) — consultado 2026-10-09. Anuncios locales contrastados; nombres reducidos a modelo base. No se usan etiquetas del portal como ranking de ventas.

### e24-mg

[used_market](https://www.encuentra24.com/costa-rica-es/autos-usados/mg) — consultado 2026-10-09. Anuncios locales contrastados; nombres reducidos a modelo base. No se usan etiquetas del portal como ranking de ventas.

### e24-greatwall

[used_market](https://www.encuentra24.com/costa-rica-es/autos-usados/great-wall) — consultado 2026-10-09. Anuncios locales contrastados; nombres reducidos a modelo base. No se usan etiquetas del portal como ranking de ventas.

### e24-haval

[used_market](https://www.encuentra24.com/costa-rica-es/autos-usados/haval) — consultado 2026-10-09. Anuncios locales contrastados; nombres reducidos a modelo base. No se usan etiquetas del portal como ranking de ventas.

### e24-jetour

[used_market](https://www.encuentra24.com/costa-rica-es/autos-usados/jetour) — consultado 2026-10-09. Anuncios locales contrastados; nombres reducidos a modelo base. No se usan etiquetas del portal como ranking de ventas.

### e24-dfsk

[used_market](https://www.encuentra24.com/costa-rica-es/autos-usados/dfsk) — consultado 2026-10-09. Anuncios locales contrastados; nombres reducidos a modelo base. No se usan etiquetas del portal como ranking de ventas.

### e24-seres

[used_market](https://www.encuentra24.com/costa-rica-es/autos-usados/dfsk) — consultado 2026-10-09. Anuncios locales contrastados; nombres reducidos a modelo base. No se usan etiquetas del portal como ranking de ventas.

### e24-jmc

[used_market](https://www.encuentra24.com/costa-rica-es/autos-usados/jmc) — consultado 2026-10-09. Anuncios locales contrastados; nombres reducidos a modelo base. No se usan etiquetas del portal como ranking de ventas.

### e24-maxus

[used_market](https://www.encuentra24.com/costa-rica-es/autos-usados/maxus) — consultado 2026-10-09. Anuncios locales contrastados; nombres reducidos a modelo base. No se usan etiquetas del portal como ranking de ventas.

### e24-citron

[used_market](https://www.encuentra24.com/costa-rica-es/autos-usados/citroen) — consultado 2026-10-09. Anuncios locales contrastados; nombres reducidos a modelo base. No se usan etiquetas del portal como ranking de ventas.

### e24-hilux

[used_market](https://www.encuentra24.com/costa-rica-es/autos-usados/toyota/hilux) — consultado 2026-10-09. Anuncios de mercado local.

### crautos-featured

[used_market](https://www.crautos.com/autosusados/) — consultado 2026-10-09. Anuncios en portada: Hilux/Fortuner; respaldo adicional a búsquedas por marca.

### crautos-jimny

[used_market](https://www.crautos.com/autosusados/) — consultado 2026-10-09. Anuncio en portada: Jimny; contrastado con distribuidor y Encuentra24.

### crautos-isuzu

[used_market](https://www.crautos.com/autosusados/) — consultado 2026-10-09. Portada muestra DMAX/MUX; forma oficial D-Max/MU-X.

### crautos-creta

[used_market](https://www.crautos.com/autosusados/) — consultado 2026-10-09. Portada: Creta Elegant reducido a Creta.

### hyundai-stargazer

[local_distributor](https://www.grupoq.com/cr/historias/hyundai-grupoq-stargazer-costarica) — consultado 2026-10-09. Lanzamiento local de Grupo Q.

## Evidencia de cada marca con adiciones

Los enlaces individuales de usados están en manual_additions.json. Los source_ids siguientes remiten al registro anterior.

### Aion

| Modelo base ausente del seed normalizado | Fuentes | Motivo |
|---|---|---|
| V | aion-v | missing_from_carsxe |
| Y Plus | aion-y | missing_from_carsxe |

### Avatr

| Modelo base ausente del seed normalizado | Fuentes | Motivo |
|---|---|---|
| 07 | avatr-cr | missing_from_carsxe |
| 11 | avatr-cr | missing_from_carsxe |

### BAIC

| Modelo base ausente del seed normalizado | Fuentes | Motivo |
|---|---|---|
| BJ30 | baic-cr | missing_from_carsxe |
| BJ40 | baic-cr | missing_from_carsxe |
| BJ41 | baic-cr | missing_from_carsxe |
| BJ60 | baic-cr | missing_from_carsxe |
| X35 | baic-cr | missing_from_carsxe |
| X55 | baic-cr | missing_from_carsxe |

### BYD

| Modelo base ausente del seed normalizado | Fuentes | Motivo |
|---|---|---|
| Dolphin | byd-cr, crautos-byd, e24-byd | missing_from_carsxe |
| F0 | crautos-byd, e24-byd | missing_from_carsxe |
| F3 | crautos-byd | missing_from_carsxe |
| Han | crautos-byd | missing_from_carsxe |
| S1 | crautos-byd | missing_from_carsxe |
| S1 Pro | byd-cr, crautos-byd, e24-byd | missing_from_carsxe |
| S6 | crautos-byd, e24-byd | missing_from_carsxe |
| Seagull | byd-cr, crautos-byd | missing_from_carsxe |
| Seal | crautos-byd, e24-byd | missing_from_carsxe |
| Sealion 7 | byd-cr, crautos-byd | missing_from_carsxe |
| Shark | byd-cr | missing_from_carsxe |
| Song | crautos-byd | missing_from_carsxe |
| Song Plus | byd-cr, crautos-byd, e24-byd | missing_from_carsxe |
| Tang | crautos-byd, e24-byd | missing_from_carsxe |
| Yuan Plus | byd-cr, crautos-byd | missing_from_carsxe |
| Yuan Pro | crautos-byd | missing_from_carsxe |

### Changan

| Modelo base ausente del seed normalizado | Fuentes | Motivo |
|---|---|---|
| Alsvin | changan-cr | missing_from_carsxe |
| Benni | crautos-changan | missing_from_carsxe |
| CS15 | changan-cr, crautos-changan, e24-changan | missing_from_carsxe |
| CS35 | changan-cr, crautos-changan | missing_from_carsxe |
| CS55 | changan-cr, crautos-changan, e24-changan | missing_from_carsxe |
| CS75 | changan-cr, crautos-changan, e24-changan | missing_from_carsxe |
| Honor S | changan-cr | missing_from_carsxe |
| Hunter | changan-cr, crautos-changan | missing_from_carsxe |
| Lumin | changan-cr | missing_from_carsxe |
| Q20 | crautos-changan | missing_from_carsxe |
| Star 3 | crautos-changan | missing_from_carsxe |
| Star 9 | crautos-changan, e24-changan | missing_from_carsxe |
| UNI-K | crautos-changan | missing_from_carsxe |
| UNI-T | changan-cr, crautos-changan, e24-changan | missing_from_carsxe |
| X7 | crautos-changan | missing_from_carsxe |

### Chery

| Modelo base ausente del seed normalizado | Fuentes | Motivo |
|---|---|---|
| eQ7 | crautos-chery, e24-chery | missing_from_carsxe |
| Himla | chery-cr | missing_from_carsxe |
| Q | chery-cr | missing_from_carsxe |
| Tiggo 2 | chery-cr, crautos-chery, e24-chery | missing_from_carsxe |
| Tiggo 4 | chery-cr, crautos-chery, e24-chery | missing_from_carsxe |
| Tiggo 7 | chery-cr, crautos-chery | missing_from_carsxe |
| Tiggo 8 | chery-cr, crautos-chery | missing_from_carsxe |
| Tiggo 9 | chery-cr | missing_from_carsxe |

### Citroën

| Modelo base ausente del seed normalizado | Fuentes | Motivo |
|---|---|---|
| Basalt | citroen-cr | missing_from_carsxe |
| Berlingo | citroen-cr, crautos-citron | missing_from_carsxe |
| C-Élysée | crautos-citron, e24-citron | missing_from_carsxe |
| C1 | crautos-citron | missing_from_carsxe |
| C2 | crautos-citron | missing_from_carsxe |
| C3 | citroen-cr, crautos-citron, e24-citron | missing_from_carsxe |
| C3 Aircross | citroen-cr, crautos-citron, e24-citron | missing_from_carsxe |
| C4 | crautos-citron | missing_from_carsxe |
| C4 Cactus | citroen-cr, crautos-citron | missing_from_carsxe |
| C5 | e24-citron | missing_from_carsxe |
| C5 Aircross | citroen-cr, crautos-citron, e24-citron | missing_from_carsxe |
| DS4 | crautos-citron, e24-citron | missing_from_carsxe |
| Jumper | citroen-cr, crautos-citron | missing_from_carsxe |
| Jumpy | citroen-cr, crautos-citron | missing_from_carsxe |
| Nemo | crautos-citron | missing_from_carsxe |
| Xsara | crautos-citron | missing_from_carsxe |

### Daihatsu

| Modelo base ausente del seed normalizado | Fuentes | Motivo |
|---|---|---|
| Charade | crautos-daihatsu | missing_from_carsxe |
| Cuore | crautos-daihatsu | missing_from_carsxe |
| Delta | crautos-daihatsu | missing_from_carsxe |
| Rocky | crautos-daihatsu | missing_from_carsxe |
| Sirion | crautos-daihatsu | missing_from_carsxe |
| Terios | crautos-daihatsu | missing_from_carsxe |

### Deepal

| Modelo base ausente del seed normalizado | Fuentes | Motivo |
|---|---|---|
| S05 | deepal-cr | missing_from_carsxe |
| S07 | deepal-cr | missing_from_carsxe |

### DFSK

| Modelo base ausente del seed normalizado | Fuentes | Motivo |
|---|---|---|
| C31 | dfsk-cr, e24-dfsk | missing_from_carsxe |
| C32 | dfsk-cr | missing_from_carsxe |
| C35 | dfsk-cr | missing_from_carsxe |
| C37 | dfsk-cr | missing_from_carsxe |
| E5 | dfsk-cr | missing_from_carsxe |
| Glory 500 | dfsk-cr | missing_from_carsxe |
| Glory 560 | dfsk-cr | missing_from_carsxe |
| Glory 580 | dfsk-cr, e24-dfsk | missing_from_carsxe |

### Dongfeng

| Modelo base ausente del seed normalizado | Fuentes | Motivo |
|---|---|---|
| EX1 | crautos-dongfeng | missing_from_carsxe |
| Friday | dongfeng-cr, crautos-dongfeng | missing_from_carsxe |
| Joyear SX6 | crautos-dongfeng | missing_from_carsxe |
| Mage | dongfeng-cr | missing_from_carsxe |
| Nammi 01 | dongfeng-cr, crautos-dongfeng | missing_from_carsxe |
| Nammi 06 | dongfeng-cr | missing_from_carsxe |
| Nano Box | crautos-dongfeng | missing_from_carsxe |
| Rich | crautos-dongfeng | missing_from_carsxe |
| Rich 6 | dongfeng-cr, crautos-dongfeng, e24-dongfeng | missing_from_carsxe |
| Rich 7 | dongfeng-cr | missing_from_carsxe |
| SX5 | crautos-dongfeng | missing_from_carsxe |
| T5 EVO | crautos-dongfeng | missing_from_carsxe |
| T5L | crautos-dongfeng | missing_from_carsxe |
| Z9 | dongfeng-cr | missing_from_carsxe |

### Foton

| Modelo base ausente del seed normalizado | Fuentes | Motivo |
|---|---|---|
| Tunland G7 | foton-g7 | missing_from_carsxe |
| Tunland V7 | foton-v7 | missing_from_carsxe |
| Tunland V9 | foton-v9, crautos-foton | missing_from_carsxe |
| View CS2 | crautos-foton | missing_from_carsxe |

### GAC

| Modelo base ausente del seed normalizado | Fuentes | Motivo |
|---|---|---|
| Emkoo | gac-cr | missing_from_carsxe |
| Emzoom | gac-cr | missing_from_carsxe |
| GS3 | gac-cr | missing_from_carsxe |
| GS4 | gac-cr | missing_from_carsxe |
| GS8 | gac-cr | missing_from_carsxe |
| M6 | gac-cr | missing_from_carsxe |

### Geely

| Modelo base ausente del seed normalizado | Fuentes | Motivo |
|---|---|---|
| Azkarra | crautos-geely, e24-geely | missing_from_carsxe |
| Coolray | geely-cr, crautos-geely, e24-geely | missing_from_carsxe |
| Coolray Neo | geely-cr | missing_from_carsxe |
| Emgrand EX7 | e24-geely | missing_from_carsxe |
| EX5 | geely-cr, crautos-geely | missing_from_carsxe |
| GC5 | crautos-geely | missing_from_carsxe |
| GC6 | crautos-geely, e24-geely | missing_from_carsxe |
| Geome | crautos-geely | missing_from_carsxe |
| Geometry C | crautos-geely | missing_from_carsxe |
| Geometry E | crautos-geely, e24-geely | missing_from_carsxe |
| GX2 | crautos-geely | missing_from_carsxe |
| GX3 | crautos-geely, e24-geely | missing_from_carsxe |
| Okavango | geely-cr, crautos-geely, e24-geely | missing_from_carsxe |
| Starray | geely-cr, crautos-geely | missing_from_carsxe |

### Great Wall

| Modelo base ausente del seed normalizado | Fuentes | Motivo |
|---|---|---|
| C20R | e24-greatwall | missing_from_carsxe |
| C30 | crautos-greatwall | missing_from_carsxe |
| Hover | crautos-greatwall | missing_from_carsxe |
| M2 | crautos-greatwall | missing_from_carsxe |
| M4 | crautos-greatwall | missing_from_carsxe |
| Poer | greatwall-cr, crautos-greatwall, e24-greatwall | missing_from_carsxe |
| Wingle 5 | crautos-greatwall | missing_from_carsxe |
| Wingle 7 | greatwall-cr, crautos-greatwall | missing_from_carsxe |

### Haval

| Modelo base ausente del seed normalizado | Fuentes | Motivo |
|---|---|---|
| H6 | haval-cr, crautos-haval, e24-haval | missing_from_carsxe |
| H7 | haval-cr | missing_from_carsxe |
| H9 | haval-cr, crautos-haval, e24-haval | missing_from_carsxe |
| Jolion | haval-cr, crautos-haval, e24-haval | missing_from_carsxe |

### Hyundai

| Modelo base ausente del seed normalizado | Fuentes | Motivo |
|---|---|---|
| Creta | crautos-creta | missing_from_carsxe |
| Galloper | crautos-hyundai | missing_from_carsxe |
| Starex | crautos-hyundai | missing_from_carsxe |
| Stargazer | hyundai-stargazer | missing_from_carsxe |
| Verna | crautos-hyundai | missing_from_carsxe |

### Isuzu

| Modelo base ausente del seed normalizado | Fuentes | Motivo |
|---|---|---|
| D-Max | isuzu-cr, crautos-isuzu | missing_from_carsxe |
| MU-X | isuzu-cr, crautos-isuzu | missing_from_carsxe |

### JAC

| Modelo base ausente del seed normalizado | Fuentes | Motivo |
|---|---|---|
| J2 | crautos-jac | missing_from_carsxe |
| J3 | crautos-jac | missing_from_carsxe |
| JS1 | crautos-jac, e24-jac | missing_from_carsxe |
| JS2 | crautos-jac | missing_from_carsxe |
| JS3 | crautos-jac | missing_from_carsxe |
| JS4 | crautos-jac, e24-jac | missing_from_carsxe |
| JS5 | crautos-jac | missing_from_carsxe |
| JS8 | crautos-jac | missing_from_carsxe |
| M3 | jac-cr, crautos-jac | missing_from_carsxe |
| Refine | crautos-jac, e24-jac | missing_from_carsxe |
| S2 | crautos-jac | missing_from_carsxe |
| T6 | crautos-jac | missing_from_carsxe |
| T8 | e24-jac | missing_from_carsxe |
| T9 | crautos-jac | missing_from_carsxe |
| X200 | jac-cr | missing_from_carsxe |

### Jaecoo

| Modelo base ausente del seed normalizado | Fuentes | Motivo |
|---|---|---|
| J5 | jaecoo-cr | missing_from_carsxe |
| J7 | jaecoo-cr | missing_from_carsxe |
| J8 | jaecoo-cr | missing_from_carsxe |

### Jetour

| Modelo base ausente del seed normalizado | Fuentes | Motivo |
|---|---|---|
| Dashing | jetour-cr, crautos-jetour, e24-jetour | missing_from_carsxe |
| T1 | jetour-cr, crautos-jetour, e24-jetour | missing_from_carsxe |
| T2 | jetour-cr | missing_from_carsxe |
| X50 | jetour-cr, crautos-jetour | missing_from_carsxe |
| X70 | jetour-cr, crautos-jetour, e24-jetour | missing_from_carsxe |

### JMC

| Modelo base ausente del seed normalizado | Fuentes | Motivo |
|---|---|---|
| Grand Avenue | jmc-cr, e24-jmc | missing_from_carsxe |
| Touring Van | jmc-cr | missing_from_carsxe |
| Vigus | jmc-cr, e24-jmc | missing_from_carsxe |

### Kaiyi

| Modelo base ausente del seed normalizado | Fuentes | Motivo |
|---|---|---|
| e-qute 04 | kaiyi-cr | missing_from_carsxe |
| KYX3 | kaiyi-cr | missing_from_carsxe |
| KYX7 | kaiyi-cr | missing_from_carsxe |
| X3 | crautos-kaiyi | missing_from_carsxe |

### KGM

| Modelo base ausente del seed normalizado | Fuentes | Motivo |
|---|---|---|
| Actyon | kgm-actyon | missing_from_carsxe |
| Actyon Sports | crautos-kgm | missing_from_carsxe |
| Korando | crautos-kgm | missing_from_carsxe |
| Rexton | kgm-cr, crautos-kgm | missing_from_carsxe |
| Rexton Sports | crautos-kgm | missing_from_carsxe |
| Tivoli | kgm-cr, crautos-kgm | missing_from_carsxe |
| Torres | kgm-cr, crautos-kgm | missing_from_carsxe |

### Kia

| Modelo base ausente del seed normalizado | Fuentes | Motivo |
|---|---|---|
| Bongo | crautos-kia | missing_from_carsxe |
| Carens | crautos-kia | missing_from_carsxe |
| Cerato | crautos-kia | missing_from_carsxe |
| EV3 | kia-cr | missing_from_carsxe |
| EV5 | kia-cr | missing_from_carsxe |
| Joice | crautos-kia | missing_from_carsxe |
| K2500 | kia-cr | missing_from_carsxe |
| K2700 | crautos-kia | missing_from_carsxe |
| K3 | kia-cr | missing_from_carsxe |
| Opirus | crautos-kia | missing_from_carsxe |
| Picanto | kia-cr, crautos-kia | missing_from_carsxe |
| Soluto | kia-cr | missing_from_carsxe |
| Sonet | kia-cr | missing_from_carsxe |
| Tasman | kia-cr | missing_from_carsxe |

### Maxus

| Modelo base ausente del seed normalizado | Fuentes | Motivo |
|---|---|---|
| D60 | maxus-history, crautos-maxus, e24-maxus | missing_from_carsxe |
| D90 | maxus-cr, crautos-maxus | missing_from_carsxe |
| eDeliver 9 | maxus-ev | missing_from_carsxe |
| EG50 | maxus-history | missing_from_carsxe |
| Euniq 6 | maxus-history, crautos-maxus, e24-maxus | missing_from_carsxe |
| EV30 | maxus-history | missing_from_carsxe |
| T60 | maxus-history, crautos-maxus, e24-maxus | missing_from_carsxe |
| T90 | maxus-history, crautos-maxus | missing_from_carsxe |
| V80 | maxus-history | missing_from_carsxe |
| V90 | maxus-cr, crautos-maxus | missing_from_carsxe |

### MG

| Modelo base ausente del seed normalizado | Fuentes | Motivo |
|---|---|---|
| GS | crautos-mg, e24-mg | missing_from_carsxe |
| GT | crautos-mg | missing_from_carsxe |
| HS | mg-combustion, crautos-mg | missing_from_carsxe |
| Marvel R | mg-electric, crautos-mg, e24-mg | missing_from_carsxe |
| MG 3 | crautos-mg | missing_from_carsxe |
| MG 4 | mg-electric, crautos-mg | missing_from_carsxe |
| MG 5 | crautos-mg | missing_from_carsxe |
| ONE | mg-combustion, crautos-mg | missing_from_carsxe |
| RX5 | mg-combustion, crautos-mg, e24-mg | missing_from_carsxe |
| RX8 | mg-combustion, crautos-mg, e24-mg | missing_from_carsxe |
| RX9 | mg-combustion | missing_from_carsxe |
| ZS | mg-combustion, crautos-mg, e24-mg | missing_from_carsxe |

### Mitsubishi

| Modelo base ausente del seed normalizado | Fuentes | Motivo |
|---|---|---|
| ASX | mitsubishi-cr | missing_from_carsxe |
| L200 | mitsubishi-cr | missing_from_carsxe |
| Xpander Cross | mitsubishi-cr | missing_from_carsxe |

### Neta

| Modelo base ausente del seed normalizado | Fuentes | Motivo |
|---|---|---|
| U | crautos-neta | missing_from_carsxe |
| V | crautos-neta | missing_from_carsxe |
| X | neta-cr | missing_from_carsxe |

### Nissan

| Modelo base ausente del seed normalizado | Fuentes | Motivo |
|---|---|---|
| Civilian | crautos-nissan | missing_from_carsxe |
| D21 | crautos-nissan | missing_from_carsxe |
| Kait | nissan-cr | missing_from_carsxe |
| Kicks Play | nissan-cr | missing_from_carsxe |
| Magnite | nissan-cr | missing_from_carsxe |
| Qashqai | nissan-cr | missing_from_carsxe |
| Urvan | nissan-cr | missing_from_carsxe |
| Vanette | crautos-nissan | missing_from_carsxe |
| X-Trail | nissan-cr | missing_from_carsxe |

### Omoda

| Modelo base ausente del seed normalizado | Fuentes | Motivo |
|---|---|---|
| C5 | omoda-cr | missing_from_carsxe |
| C7 | omoda-cr | missing_from_carsxe |
| E5 | omoda-cr | missing_from_carsxe |

### Peugeot

| Modelo base ausente del seed normalizado | Fuentes | Motivo |
|---|---|---|
| 2008 | peugeot-cr, crautos-peugeot | missing_from_carsxe |
| 206 | crautos-peugeot | missing_from_carsxe |
| 208 | crautos-peugeot | missing_from_carsxe |
| 3008 | peugeot-cr, crautos-peugeot | missing_from_carsxe |
| 301 | crautos-peugeot | missing_from_carsxe |
| 307 | crautos-peugeot | missing_from_carsxe |
| 308 | crautos-peugeot | missing_from_carsxe |
| 5008 | peugeot-cr, crautos-peugeot | missing_from_carsxe |
| Landtrek | peugeot-cr, crautos-peugeot | missing_from_carsxe |
| Partner | crautos-peugeot | missing_from_carsxe |
| Rifter | peugeot-cr, crautos-peugeot | missing_from_carsxe |

### Renault

| Modelo base ausente del seed normalizado | Fuentes | Motivo |
|---|---|---|
| Alaskan | crautos-renault | missing_from_carsxe |
| Arkana | renault-cr | missing_from_carsxe |
| Captur | crautos-renault | missing_from_carsxe |
| Dokker | crautos-renault | missing_from_carsxe |
| Duster | renault-cr, crautos-renault | missing_from_carsxe |
| Express | renault-cr, crautos-renault | missing_from_carsxe |
| Fluence | crautos-renault | missing_from_carsxe |
| Kardian | renault-cr | missing_from_carsxe |
| Koleos | renault-cr, crautos-renault | missing_from_carsxe |
| Kwid | renault-cr, crautos-renault | missing_from_carsxe |
| Master | renault-cr | missing_from_carsxe |
| Megane | crautos-renault | missing_from_carsxe |
| Oroch | renault-cr, crautos-renault | missing_from_carsxe |
| Sandero | crautos-renault | missing_from_carsxe |
| Scenic | crautos-renault | missing_from_carsxe |
| Stepway | renault-cr, crautos-renault | missing_from_carsxe |

### Riddara

| Modelo base ausente del seed normalizado | Fuentes | Motivo |
|---|---|---|
| RD6 | riddara-cr | missing_from_carsxe |

### Seres

| Modelo base ausente del seed normalizado | Fuentes | Motivo |
|---|---|---|
| 3 | e24-seres | missing_from_carsxe |
| 5 | seres-cr | missing_from_carsxe |

### Suzuki

| Modelo base ausente del seed normalizado | Fuentes | Motivo |
|---|---|---|
| Across | suzuki-cr | missing_from_carsxe |
| Alto | suzuki-cr | missing_from_carsxe |
| APV | suzuki-cr | missing_from_carsxe |
| Baleno | suzuki-cr | missing_from_carsxe |
| Celerio | suzuki-cr | missing_from_carsxe |
| Dzire | suzuki-cr | missing_from_carsxe |
| e Vitara | suzuki-cr | missing_from_carsxe |
| Eeco | suzuki-cr | missing_from_carsxe |
| Fronx | suzuki-cr | missing_from_carsxe |
| Jimny | suzuki-cr, e24-suzuki, crautos-jimny | missing_from_carsxe |
| S-Cross | suzuki-cr | missing_from_carsxe |
| S-Presso | suzuki-cr | missing_from_carsxe |

### SWM

| Modelo base ausente del seed normalizado | Fuentes | Motivo |
|---|---|---|
| G01 | swm-cr | missing_from_carsxe |

### Toyota

| Modelo base ausente del seed normalizado | Fuentes | Motivo |
|---|---|---|
| 1000 | crautos-toyota | missing_from_carsxe |
| Agya | toyota-cr | missing_from_carsxe |
| Avanza | toyota-cr | missing_from_carsxe |
| Fortuner | toyota-cr, e24-toyota, crautos-featured | missing_from_carsxe |
| Hiace | toyota-cr | missing_from_carsxe |
| Hilux | toyota-cr, e24-hilux, crautos-featured | missing_from_carsxe |
| Land Cruiser Prado | toyota-cr | missing_from_carsxe |
| Majesty | toyota-cr | missing_from_carsxe |
| Model F | crautos-toyota | missing_from_carsxe |
| Raize | toyota-cr | missing_from_carsxe |
| Rush | toyota-cr | missing_from_carsxe |
| Starlet | crautos-toyota | missing_from_carsxe |

### VGV

| Modelo base ausente del seed normalizado | Fuentes | Motivo |
|---|---|---|
| Bolden S6 | crautos-vgv | missing_from_carsxe |
| Bolden S7 | crautos-vgv | missing_from_carsxe |
| U70 | crautos-vgv | missing_from_carsxe |
| U70B | crautos-vgv | missing_from_carsxe |
| VX7 | crautos-vgv | missing_from_carsxe |

### Volkswagen

| Modelo base ausente del seed normalizado | Fuentes | Motivo |
|---|---|---|
| Amarok | vw-cr | missing_from_carsxe |
| Nivus | vw-cr | missing_from_carsxe |
| Saveiro | vw-cr | missing_from_carsxe |
| T-Cross | vw-cr | missing_from_carsxe |
| Tera | vw-cr | missing_from_carsxe |

### XPeng

| Modelo base ausente del seed normalizado | Fuentes | Motivo |
|---|---|---|
| G3i | xpeng-history | missing_from_carsxe |
| G6 | xpeng-g6 | missing_from_carsxe |
| G9 | xpeng-history | missing_from_carsxe |

### Zeekr

| Modelo base ausente del seed normalizado | Fuentes | Motivo |
|---|---|---|
| 001 | zeekr-cr | missing_from_carsxe |
| 007 | crautos-zeekr | missing_from_carsxe |
| 009 | zeekr-cr | missing_from_carsxe |
| 7X | zeekr-cr | missing_from_carsxe |
| X | zeekr-cr, crautos-zeekr | missing_from_carsxe |

## Comparación y casos de control

Toyota Hilux/Fortuner y Suzuki Jimny: CarsXE los omitió; confirmados por distribuidores, CRAutos y Encuentra24. Isuzu D-Max/MU-X y Nissan X-Trail/Qashqai muestran que el sesgo del seed también afecta marcas con respuestas no vacías. Las 34 marcas con seed vacío se completaron con evidencia local, no con nombres inventados.

La categoría “Donfeng (ZNA)” mezcla marcas: no se importa tal cual. Los menús genéricos extranjeros del sitio Peugeot, anuncios incompletos (“Berlina”, “Luxury”, “All New”), JAC GS8 y BYD Leopard/Tai 3 no se utilizan como modelos nuevos. Las fuentes históricas se identifican expresamente; Citroën es una marca francesa y se incluye por solicitud y presencia local.
