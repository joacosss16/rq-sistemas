-- ============================================================
-- VERIFICADOR DE ESQUEMA — Sistema RQ
--
-- Responde una pregunta que hoy nadie puede responder:
-- ¿la base de PRODUCCIÓN tiene de verdad todo lo que dicen
-- las 30 migraciones del repositorio?
--
-- Hace falta porque las migraciones se aplican a mano en el
-- editor web, y una ya falló a medias sin avisar (la 27).
--
-- CÓMO SE USA: pégalo entero en el SQL Editor y ejecútalo.
-- Devuelve una fila por cosa que debería existir.
--   · Todo en OK  -> la base coincide con el repositorio.
--   · Algún FALTA -> esa migración no se aplicó (o se aplicó a medias).
--
-- No modifica nada. Se puede correr las veces que haga falta.
-- ============================================================

with esperado (migracion, tipo, objeto, detalle) as (values
  -- ── columnas que agregó cada migración
  ('04 piso',              'columna', 'rqs.piso',                        null::text),
  ('05 precios',           'columna', 'factura_items.precio_unitario',   null),
  ('05 unidades',          'columna', 'materiales.und_base',             null),
  ('06 pagos',             'columna', 'facturas.estado_pago',            null),
  ('06 pagos',             'columna', 'facturas.pagado_por',             null),
  ('07 perecedero',        'columna', 'materiales.perecedero',           null),
  ('07 caducidad',         'columna', 'rq_items.fecha_caducidad',        null),
  ('10 caja chica',        'columna', 'facturas.medio_pago',             null),
  ('10 caja chica',        'columna', 'facturas.rendicion_id',           null),
  -- Migración 32: el banco salió de `proyectos` (que leen los 7 roles) a su
  -- propia tabla cerrada. Comprobar la columna nueva verifica de paso que la
  -- tabla exista. La vieja NO se comprueba: se borra en la migración 33.
  ('32 banco aparte',      'columna', 'proyectos_banco.banco',           null),
  ('32 banco aparte',      'columna', 'proyectos_banco.nro_cuenta',      null),
  ('12 auditoria',         'columna', 'facturas.conciliada',             null),
  ('14 compromiso',        'columna', 'facturas.tipo_doc',               null),
  ('16 comprado por',      'columna', 'rq_items.comprado_por',           null),
  ('17 reingreso',         'columna', 'salidas.cant_reingresada',        null),
  ('18 aprobacion salida', 'columna', 'salidas.aprobacion',              null),
  ('18 aprobacion prest.', 'columna', 'prestamos.aprob_origen',          null),
  ('20 cotizacion',        'columna', 'rqs.cotizacion_ref',              null),
  ('22 anulacion gerencia','columna', 'rq_items.anulacion_solicitud',    null),
  ('22 anulacion gerencia','columna', 'rq_items.anulacion_rechazo',      null),
  ('23 cotizado',          'columna', 'rq_items.fecha_compra',           null),
  ('25 tiempo respuesta',  'columna', 'rq_items.decidido_en',            null),
  ('26 correccion rend.',  'columna', 'rendiciones.correccion',          null),
  ('27 diferencias caja',  'columna', 'rendiciones.efectivo_contado',    null),
  ('27 diferencias caja',  'columna', 'rendiciones.diferencia',          null),
  ('27 diferencias caja',  'columna', 'rendiciones.dif_motivo',          null),
  ('27 diferencias caja',  'columna', 'rendiciones.dif_resolucion',      null),
  ('27 diferencias caja',  'columna', 'cajas_chicas.tolerancia',         null),
  ('29 factura pendiente', 'columna', 'facturas.anulacion',              null),

  -- ── funciones
  ('01 esquema',           'funcion', 'calcular_canal',                  null),
  ('01 esquema',           'funcion', 'stock',                           null),
  ('02 rls',               'funcion', 'mi_rol',                          null),
  ('02 rls',               'funcion', 'mi_proyecto',                     null),
  ('09 material atomico',  'funcion', 'aprobar_material',                null),
  ('28/30 factura atomica','funcion', 'registrar_factura',               null),
  ('29 anular factura',    'funcion', 'anular_factura',                  null),

  -- ── triggers de defensa (si falta uno, esa regla NO se cumple)
  ('11 defensa',           'trigger', 'facturas_rendicion',              'facturas'),
  ('15 comprado',          'trigger', 'rq_items_comprador_guard',        'rq_items'),
  ('18 aprobacion salida', 'trigger', 'salidas_aprobacion_guard',        'salidas'),
  ('18 aprobacion prest.', 'trigger', 'prestamos_aprobacion_guard',      'prestamos'),
  ('22 anulacion gerencia','trigger', 'anulacion_solo_gerencia',         'rq_items'),
  ('23 fecha compra',      'trigger', 'sella_fecha_compra',              'rq_items'),
  ('24 no anular recibido','trigger', 'no_anular_recibido',              'rq_items'),
  ('25 tiempo respuesta',  'trigger', 'sella_decision',                  'rq_items'),
  ('29 no anular facturado','trigger','no_anular_facturado',             'rq_items'),

  -- ── valores permitidos que agregaron migraciones nuevas
  ('21 canal anticipado',  'valor',   'rqs_canal_check',                 'ANTICIPADO'),
  ('27 diferencias caja',  'valor',   'rendiciones_estado_check',        'Con diferencia'),
  ('29 factura pendiente', 'valor',   'facturas_tipo_doc_check',         'Pendiente')
)
, resultado as (
select
  e.migracion,
  e.tipo,
  e.objeto,
  case
    when e.tipo = 'columna' then
      case when exists (
        select 1 from information_schema.columns c
         where c.table_schema = 'public'
           and c.table_name  = split_part(e.objeto, '.', 1)
           and c.column_name = split_part(e.objeto, '.', 2)
      ) then 'OK' else '❌ FALTA' end

    when e.tipo = 'funcion' then
      case when exists (
        select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = e.objeto
      ) then 'OK' else '❌ FALTA' end

    when e.tipo = 'trigger' then
      case when exists (
        select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
         where not t.tgisinternal and t.tgname = e.objeto and c.relname = e.detalle
      ) then 'OK' else '❌ FALTA' end

    when e.tipo = 'valor' then
      case when exists (
        select 1 from pg_constraint k
         where k.conname = e.objeto
           and pg_get_constraintdef(k.oid) like '%' || e.detalle || '%'
      ) then 'OK' else '❌ FALTA' end
  end as estado
from esperado e
)
-- Los que FALTAN salen primero: si la primera fila dice OK, está todo bien.
select migracion, tipo, objeto, estado
  from resultado
 order by (estado = 'OK'), migracion, objeto;
