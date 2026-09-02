-- ============================================================
-- EL GUARDIÁN · ¿Está el sistema listo para dinero real?
-- Correr DESPUÉS del último reset y DESPUÉS de cargar los datos reales.
-- ============================================================
--
-- PARA QUÉ. El paso 8 del plan de lanzamiento es "anunciar y lanzar", y hasta
-- hoy lo único que decía si el sistema estaba listo era la memoria de quien lo
-- montó. Esto lo comprueba: recorre todo lo que hace falta para que las dos
-- obras del piloto puedan trabajar, y **falla listando TODO lo que falta**, no
-- solo lo primero que encuentra. Se corre, se lee la lista, se arregla, se
-- vuelve a correr. Cuando pasa en silencio, se puede anunciar.
--
-- POR QUÉ VIVE EN SU PROPIO ARCHIVO Y NO DENTRO DE `reset_pruebas.sql`: el
-- editor SQL de Supabase deshace TODO el pegado cuando una sentencia falla. Un
-- guardián que aborta dentro del reset desharía el propio reset, y quien lo
-- corriera vería una pantalla roja creyendo que no borró nada — cuando
-- efectivamente no habría borrado nada. Aparte, y suelto.
--
-- NO TOCA NADA. Solo lee. Se puede correr las veces que haga falta.
--
-- AL ABRIR UNA OBRA NUEVA: agregar su código a `v_obras`.
-- ============================================================

do $$
declare
  -- Las obras que TIENEN que poder trabajar. Hoy, las dos del piloto.
  v_obras   text[] := array['2502', '2503'];   -- DANAUS, MAIA
  -- Las cinco cuentas inventadas de la migración 10. Si alguna sigue viva,
  -- Pagos la muestra como buena y la graba congelada dentro de cada factura.
  v_falsas  text[] := array['191-1111111-0-11', '0011-0222-0200333',
                            '200-3000444555', '000-5566777', '191-8888888-0-88'];
  v_faltan  text[] := '{}';
  v_avisos  text[] := '{}';
  v_x       text;
  v_n       int;
begin
  -- ── 1) LAS PERSONAS ──────────────────────────────────────
  -- Toda obra tiene SIEMPRE un residente y un almacenero (regla del negocio,
  -- 12 ago 2026). Sin residente no se aprueban salidas ni préstamos; sin
  -- almacenero la obra no recibe ni saca material. Es el bloqueante conocido
  -- de DANAUS y aquí sale por su nombre en vez de descubrirse el día uno.
  select string_agg(p.codigo || ' · ' || p.nombre, ', ' order by p.codigo)
    into v_x
    from public.proyectos p
   where p.codigo = any(v_obras)
     and not exists (select 1 from public.usuarios u
                      where u.proyecto_asignado = p.codigo
                        and u.rol = 'residente' and u.activo);
  if v_x is not null then v_faltan := v_faltan || ('RESIDENTE sin dar de alta en: ' || v_x); end if;

  select string_agg(p.codigo || ' · ' || p.nombre, ', ' order by p.codigo)
    into v_x
    from public.proyectos p
   where p.codigo = any(v_obras)
     and not exists (select 1 from public.usuarios u
                      where u.proyecto_asignado = p.codigo
                        and u.rol = 'almacen' and u.activo);
  if v_x is not null then v_faltan := v_faltan || ('ALMACENERO sin dar de alta en: ' || v_x); end if;

  -- Alguien que compre (Frank) y alguien que administre el dinero (Mónica).
  -- El rol `pagos` NO se comprueba: está dormido a propósito (migración 47).
  if not exists (select 1 from public.usuarios where rol = 'comprador' and activo) then
    v_faltan := v_faltan || 'No hay ningún usuario con rol COMPRADOR (Frank): nadie puede comprar en efectivo.';
  end if;
  if not exists (select 1 from public.usuarios where rol = 'administracion' and activo) then
    v_faltan := v_faltan || 'No hay ningún usuario con rol ADMINISTRACION (Mónica): nadie entrega efectivo, cierra el arqueo ni paga facturas.';
  end if;
  if not exists (select 1 from public.usuarios where rol = 'compras' and activo) then
    v_faltan := v_faltan || 'No hay ningún usuario con rol COMPRAS (Lucía): nadie aprueba requerimientos.';
  end if;

  -- Cuentas de prueba todavía activas.
  -- El correo NO vive en public.usuarios (no tiene esa columna): vive en
  -- auth.users, que el editor SQL sí puede leer.
  select count(*) into v_n
    from public.usuarios u join auth.users a on a.id = u.id
   where u.activo and coalesce(a.email, '') like '%@rq-test.com';
  if v_n > 0 then
    v_avisos := v_avisos || (v_n || ' cuenta(s) de prueba @rq-test.com siguen ACTIVAS. Desactivarlas antes de anunciar.');
  end if;

  -- ── 2) EL DINERO ─────────────────────────────────────────
  select string_agg(p.codigo || ' · ' || p.nombre, ', ' order by p.codigo)
    into v_x
    from public.proyectos p
    left join public.proyectos_banco b on b.codigo = p.codigo
   where p.codigo = any(v_obras)
     and (b.codigo is null
          or coalesce(trim(b.banco), '') = ''
          or coalesce(trim(b.nro_cuenta), '') = '');
  if v_x is not null then v_faltan := v_faltan || ('CUENTA BANCARIA sin cargar en: ' || v_x || '. Pagos no puede pagar esas obras.'); end if;

  select string_agg(codigo || ' (' || nro_cuenta || ')', ', ' order by codigo)
    into v_x from public.proyectos_banco where nro_cuenta = any(v_falsas);
  if v_x is not null then v_faltan := v_faltan || ('CUENTAS DE PRUEBA todavía cargadas: ' || v_x || '. Son inventadas y Pagos las da por buenas.'); end if;

  -- La tolerancia del arqueo: sin ella, cualquier descuadre escala a gerencia
  -- (o ninguno lo hace). `monto_fondo` NO se comprueba: quedó obsoleta con la
  -- migración 38 y no se usa para nada vivo.
  select string_agg(p.codigo, ', ' order by p.codigo) into v_x
    from public.proyectos p
    left join public.cajas_chicas c on c.proyecto = p.codigo
   where p.codigo = any(v_obras) and c.proyecto is null;
  if v_x is not null then v_faltan := v_faltan || ('CAJA CHICA sin crear para: ' || v_x || '. Sin esa fila el arqueo no tiene tolerancia contra la que comparar.'); end if;

  -- `tolerancia` es NOT NULL con default 20, así que nunca está "vacía": lo
  -- que hay que saber es si alguien la confirmó o sigue con el valor de
  -- fábrica. Aviso, no bloqueo — puede que 20 sea justo la cifra buena.
  select string_agg(proyecto, ', ' order by proyecto) into v_x
    from public.cajas_chicas where proyecto = any(v_obras) and tolerancia = 20;
  if v_x is not null then
    v_avisos := v_avisos || ('TOLERANCIA del arqueo todavía en el valor de fábrica (S/ 20) en: ' || v_x || '. Confirmar con el dueño si es la real.');
  end if;

  -- ── 3) EL CATÁLOGO Y LOS PROVEEDORES ─────────────────────
  select count(*) into v_n from public.materiales where activo;
  if v_n < 1000 then
    v_faltan := v_faltan || ('El CATÁLOGO tiene ' || v_n || ' materiales activos. Se esperaban ~1,740: parece que no se cargó o el reset se lo llevó.');
  end if;

  select count(*) into v_n from public.familias;
  if v_n < 50 then v_faltan := v_faltan || ('Solo hay ' || v_n || ' familias cargadas (se esperaban 58).'); end if;

  select count(*) into v_n from public.proveedores;
  if v_n < 50 then
    v_faltan := v_faltan || ('Solo hay ' || v_n || ' PROVEEDORES. Faltan los 309 de seed_proveedores.sql; sin ellos cada compra da de alta uno a mano y el maestro nace sucio.');
  end if;
  -- OJO (1 sep 2026): antes se buscaba el RUC 20138651917, que era el del
  -- harness de pruebas — pero ese RUC es de SANICENTER S.A.C., proveedor
  -- REAL de la lista de Lucia. Un RUC de verdad nunca identifica datos de
  -- prueba; el nombre inventado si.
  select string_agg(ruc || ' · ' || razon_social, ', ') into v_x
    from public.proveedores where razon_social ilike '%PRUEBA%';
  if v_x is not null then
    v_faltan := v_faltan || ('Proveedor(es) de PRUEBA todavia cargados: ' || v_x);
  end if;

  -- Equivalencias de caja: sin ellas el stock de esos materiales se cuenta en
  -- cajas y no en unidades sueltas, que es como vive el inventario.
  select count(*) into v_n from public.materiales
   where activo and upper(coalesce(und, '')) in ('CAJA','PQT','ROLLO','PAR')
     and factor_caja is null;
  if v_n > 0 then
    v_avisos := v_avisos || (v_n || ' material(es) se compran en CAJA/PQT/ROLLO/PAR y no tienen equivalencia a unidades cargada.');
  end if;

  -- ── 4) EL INVENTARIO ─────────────────────────────────────
  -- Sin stock inicial el almacenero no puede registrar NINGUNA salida: el
  -- sistema le dirá que no hay stock, y tendrá razón. Es aviso y no bloqueo
  -- porque el dueño decidió cargarlo el mismo día del arranque.
  select string_agg(p.codigo || ' · ' || p.nombre, ', ' order by p.codigo)
    into v_x
    from public.proyectos p
   where p.codigo = any(v_obras)
     and not exists (select 1 from public.stock_inicial s where s.proyecto = p.codigo);
  if v_x is not null then
    v_avisos := v_avisos || ('INVENTARIO INICIAL sin cargar en: ' || v_x || '. Hasta cargarlo el almacén arranca en CERO y no se puede registrar ninguna salida.');
  end if;

  -- ── 5) QUE NO QUEDE NADA DE PRUEBA ───────────────────────
  select string_agg(t || ': ' || c, ', ' order by t) into v_x from (
    select 'RQs' t, count(*) c from public.rqs
    union all select 'facturas',      count(*) from public.facturas
    union all select 'salidas',       count(*) from public.salidas
    union all select 'préstamos',     count(*) from public.prestamos
    union all select 'rendiciones',   count(*) from public.rendiciones
    union all select 'entregas',      count(*) from public.entregas_caja
  ) q where c > 0;
  if v_x is not null then
    v_avisos := v_avisos || ('Hay movimiento cargado (' || v_x || '). Si esto es ANTES de anunciar, sobra: correr reset_pruebas.sql.');
  end if;

  -- ── EL VEREDICTO ─────────────────────────────────────────
  if array_length(v_avisos, 1) is not null then
    raise notice E'\n--- AVISOS (no bloquean, pero conviene mirarlos) ---\n · %',
      array_to_string(v_avisos, E'\n · ');
  end if;

  if array_length(v_faltan, 1) is not null then
    raise exception E'\n\nEL SISTEMA NO ESTA LISTO PARA DINERO REAL. Falta:\n\n · %\n\nArreglar y volver a correr este archivo.',
      array_to_string(v_faltan, E'\n · ');
  end if;

  raise notice E'\n\nTODO LISTO. Las obras % tienen persona, cuenta, catálogo y proveedores.\nSiguiente y ULTIMO paso: VITE_ENTORNO = produccion en Vercel + Redeploy.\n',
    array_to_string(v_obras, ' y ');
end $$;

-- Y la mirada humana, que ninguna comprobación reemplaza: leer los números de
-- cuenta y reconocerlos. Ninguno debe parecerse a 191-1111111-0-11.
select p.codigo, p.nombre, b.banco, b.nro_cuenta,
       (select count(*) from public.usuarios u
         where u.proyecto_asignado = p.codigo and u.activo) as personas
  from public.proyectos p
  left join public.proyectos_banco b on b.codigo = p.codigo
 where p.activo
 order by p.codigo;
