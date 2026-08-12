-- ============================================================
-- MIGRACIÓN 32 · ETAPA 1.1 — CERRAR LA EXPOSICIÓN DE DATOS
--
-- QUÉ HACE, EN UNA FRASE:
-- deja de repartir a todo el mundo tres cosas que casi nadie usa:
-- el banco y el número de cuenta de cada obra, el maestro de 255
-- proveedores con sus RUC, y una tabla vieja que quedó vacía.
--
-- QUÉ **NO** HACE: no cambia ninguna regla de negocio. Las mismas
-- personas siguen viendo y haciendo exactamente lo mismo en pantalla.
--
-- CÓMO SE CORRE: se pega completo en el editor SQL de Supabase y se
-- ejecuta UNA vez. Si se ejecuta dos veces no pasa nada malo: está
-- escrita para poder repetirse sin romper ni duplicar.
--
-- ORDEN: esta migración va ANTES de subir el código nuevo. Está
-- hecha para que la app que está corriendo AHORA MISMO siga
-- funcionando igual mientras tanto (no borra ninguna columna).
-- ============================================================

begin;

-- ------------------------------------------------------------
-- BLOQUE 1 · EL BANCO Y EL NÚMERO DE CUENTA DE CADA OBRA
--
-- El problema: el banco y el número de cuenta viven en la tabla
-- `proyectos`, la misma que guarda el nombre de la obra. El nombre
-- de la obra lo necesitan los 7 roles, así que la tabla está abierta
-- para todos... y con ella se van también los datos bancarios.
--
-- La seguridad de Postgres sabe esconder FILAS, no COLUMNAS: no
-- existe forma de decir "que vean el nombre de la obra pero no la
-- cuenta". La única salida es MUDAR esos dos datos a una tabla
-- aparte, que sí se puede cerrar entera.
--
-- Quién los necesita de verdad:
--   · pagos  → los dos (hace la transferencia desde la cuenta de la obra)
--   · gerente→ el banco, para la alerta "pagaron desde otra cuenta",
--              y la cuenta solo dentro del CSV de conciliación semanal
--   · nadie más (residente, almacén, compras, comprador y
--     administración lo descargaban y no lo mostraban en ningún lado)
-- ------------------------------------------------------------

-- 1.1 · La tabla nueva. Una fila por obra. `if not exists` = si ya
--       la creamos antes, no la vuelve a crear ni da error.
create table if not exists public.proyectos_banco (
  codigo      text primary key references public.proyectos (codigo) on delete cascade,
  banco       text,
  nro_cuenta  text
);

comment on table public.proyectos_banco is
  'Datos bancarios por obra. Vive separada de `proyectos` porque el nombre de la obra lo necesitan los 7 roles y la cuenta no. Solo la leen gerente y pagos.';

-- 1.2 · COPIAR los datos que hoy están en `proyectos`.
--       Ojo: se COPIAN, no se mueven. Las columnas viejas se quedan
--       donde están para que la app actual no se caiga. Se borran en
--       la migración siguiente, ya con el código nuevo arriba.
--       `do nothing` y no `do update`: esta copia es de UNA sola vez y
--       en UNA sola dirección. Si mañana se cargan los bancos REALES en
--       la tabla nueva y alguien vuelve a correr esta migración, un
--       `do update` los machacaría con los valores viejos de prueba.
--       Con `do nothing`, repetirla no puede hacer daño.
insert into public.proyectos_banco (codigo, banco, nro_cuenta)
select codigo, banco, nro_cuenta
  from public.proyectos
 where banco is not null or nro_cuenta is not null
on conflict (codigo) do nothing;

-- 1.3 · Cerrar la tabla nueva.
--       `enable row level security` = "esta tabla no se lee salvo que
--       una regla lo permita". Sin esto, una tabla nueva en Supabase
--       queda visible para cualquiera.
alter table public.proyectos_banco enable row level security;

-- 1.4 · Permisos de tabla, que son una capa DISTINTA de las políticas.
--       Postgres exige las dos: primero el permiso sobre la tabla,
--       después la política decide qué filas. Si falta el permiso, ni
--       siquiera gerencia puede leerla ("permission denied for table").
--       Supabase suele conceder estos permisos solo a las tablas
--       nuevas, pero lo dejamos explícito para no depender de eso.
--       A `anon` (la clave pública que viaja en el navegador de
--       cualquiera, sin iniciar sesión) se le quita todo.
revoke all on public.proyectos_banco from anon, public;
grant select, insert, update, delete on public.proyectos_banco to authenticated;

-- 1.5 · Quién puede LEERLA: solo gerencia y el área de pagos.
--       `coalesce(public.mi_rol(), '')` es obligatorio: cuando no hay
--       sesión, `mi_rol()` no devuelve 'nada', devuelve NULL, y en SQL
--       comparar contra NULL no da ni verdadero ni falso — deja pasar.
--       Ese error exacto fue el agujero que arregló la migración 31.
drop policy if exists proyectos_banco_select on public.proyectos_banco;
create policy proyectos_banco_select on public.proyectos_banco
  for select to authenticated
  using (coalesce(public.mi_rol(), '') in ('gerente', 'pagos'));

-- 1.6 · Quién puede MODIFICARLA: solo gerencia, igual que `proyectos`.
--       Hoy la app no tiene ninguna pantalla para editar bancos; los
--       cambios se hacen desde el editor de Supabase. La regla queda
--       puesta por si mañana se agrega esa pantalla.
drop policy if exists proyectos_banco_write on public.proyectos_banco;
create policy proyectos_banco_write on public.proyectos_banco
  for all to authenticated
  using      (coalesce(public.mi_rol(), '') = 'gerente')
  with check (coalesce(public.mi_rol(), '') = 'gerente');

-- 1.7 · Dejar avisadas las columnas viejas, para que nadie las
--       actualice por costumbre desde el editor de Supabase y después
--       Pagos no vea el cambio. Son solo notas visibles en el editor.
comment on column public.proyectos.banco is
  'OBSOLETA desde la migración 32: el dato vivo está en proyectos_banco.banco. Esta columna se borra en la migración 33. NO editarla aquí.';
comment on column public.proyectos.nro_cuenta is
  'OBSOLETA desde la migración 32: el dato vivo está en proyectos_banco.nro_cuenta. Esta columna se borra en la migración 33. NO editarla aquí.';

-- ------------------------------------------------------------
-- BLOQUE 2 · EL MAESTRO DE PROVEEDORES (255 empresas con su RUC)
--
-- El problema: la regla decía "lo lee cualquiera que haya iniciado
-- sesión". Eso incluye al residente y al almacenero, que se bajan las
-- 255 filas en cada carga y NO las muestran en ninguna de sus
-- pantallas (revisado línea por línea: cero apariciones).
--
-- Comprobado además que no pueden mostrarlas ni por accidente: el
-- nombre del proveedor solo aparece resolviendo el RUC de una factura,
-- y `facturas_select` (migración 13) nunca incluyó a residente ni a
-- almacén. Sus tablas de facturas llegan vacías.
--
-- Quién lo necesita:
--   · compras y comprador → la lista completa, para el autocompletado
--                           al digitar la factura
--   · gerente, pagos, administración → para poder mostrar el NOMBRE
--     del proveedor en lugar de un RUC pelado en sus tablas
--   · residente y almacén → nada
--
-- Efecto en pantalla: NINGUNO. Nadie pierde una sola vista.
-- ------------------------------------------------------------
drop policy if exists proveedores_select on public.proveedores;
create policy proveedores_select on public.proveedores
  for select to authenticated
  using (coalesce(public.mi_rol(), '') in
         ('gerente', 'compras', 'pagos', 'administracion', 'comprador'));

-- ------------------------------------------------------------
-- BLOQUE 3 · BORRAR LA TABLA `cotizaciones`, QUE NACIÓ MUERTA
--
-- Se creó en la migración 23 y la app nunca la usó: no aparece ni una
-- vez en el código. Estaba abierta a los 7 roles, así que si algún día
-- alguien le metía precios de proveedores, los veía todo el mundo.
--
-- Importante: NO se toca la otra mitad de la migración 23 (la fecha en
-- que un ítem se marca Comprado), que sí está viva y alimenta la
-- alerta de "comprado hace más de 48 h y sigue sin factura".
--
-- Por seguridad, el bloque revisa primero que la tabla esté vacía.
-- Si tuviera datos, ABORTA la migración entera con un error visible.
-- Antes esto era un simple aviso, y los avisos del editor de Supabase
-- pasan desapercibidos: la migración habría dicho "listo" dejando la
-- tabla con datos y la fuga abierta. Un error obliga a mirarlo.
-- ------------------------------------------------------------
do $$
begin
  if to_regclass('public.cotizaciones') is null then
    raise notice 'cotizaciones: ya no existe, no hay nada que hacer.';
  elsif exists (select 1 from public.cotizaciones limit 1) then
    raise exception 'cotizaciones TIENE datos: alguien empezó a usarla. No se borra nada y la migración se cancela entera. Hay que revisarlo antes de continuar.';
  else
    execute 'drop table public.cotizaciones cascade';
    raise notice 'cotizaciones: estaba vacía y sin uso. Borrada.';
  end if;
end $$;

-- ------------------------------------------------------------
-- BLOQUE 4 · UNA NOTA ESCRITA SOBRE LA TABLA `usuarios`
--
-- `usuarios` sigue abierta a todos los que inician sesión, y está
-- bien así: solo guarda nombre, cargo, obra y si la persona sigue
-- activa. Es el organigrama, y los ~10 del piloto se lo saben de
-- memoria. Cerrarla dejaría en blanco los nombres de "quién aprobó",
-- "quién pagó", el PDF de la RQ y el KPI de % de urgentes por
-- residente, sin proteger nada a cambio.
--
-- El riesgo real es futuro: como la seguridad filtra filas y no
-- columnas, el día que alguien agregue un teléfono o una cuenta a
-- esta tabla, el dato queda visible para todos sin que nadie cambie
-- una regla. Esta nota deja escrito adónde debe ir ese dato.
-- ------------------------------------------------------------
comment on table public.usuarios is
  'ORGANIGRAMA. Es público dentro de la organización a propósito: nombre, rol, obra y activo. NO agregar aquí ningún dato personal (teléfono, DNI, sueldo, cuenta bancaria, correo alterno): eso va a una tabla nueva `usuarios_privados` con la regla `using (id = auth.uid() or coalesce(public.mi_rol(), '''') = ''gerente'')`. La seguridad filtra filas, no columnas: una columna nueva aquí queda visible para los 7 roles sin que nadie cambie nada.';

commit;

-- ------------------------------------------------------------
-- AVISAR A SUPABASE QUE HAY UNA TABLA NUEVA
-- Sin esta línea, la app puede tardar en "ver" proyectos_banco y
-- Pagos mostraría el banco en blanco hasta que Supabase se recargue.
-- ------------------------------------------------------------
notify pgrst, 'reload schema';

-- ============================================================
-- COMPROBACIÓN (correr aparte). Debe salir una fila por cada obra
-- con banco, y las columnas "nuevo" deben coincidir con las "viejo".
-- Si sale vacío o con nulos donde antes había datos: NO subir el
-- código, porque Pagos se quedaría sin poder registrar pagos.
-- ============================================================
-- select p.codigo, p.nombre,
--        b.banco      as banco_nuevo,  p.banco      as banco_viejo,
--        b.nro_cuenta as cuenta_nueva, p.nro_cuenta as cuenta_vieja
--   from public.proyectos p
--   left join public.proyectos_banco b on b.codigo = p.codigo
--  order by p.codigo;

-- ============================================================
-- ⚠ NO CORRER TODAVÍA — MIGRACIÓN 33 (la de después)
-- Recién cuando el código nuevo esté arriba y Pagos haya registrado
-- un pago sin problemas, se corre esto para borrar las columnas
-- viejas y que el dato quede en un solo lugar:
--
--   begin;
--   alter table public.proyectos drop column banco;
--   alter table public.proyectos drop column nro_cuenta;
--   commit;
--   notify pgrst, 'reload schema';
--
-- Mientras no se corra, no pasa nada: las columnas viejas quedan ahí
-- sin que nadie las lea. Es la red de seguridad para poder volver
-- atrás si el código nuevo diera problemas.
-- ============================================================
