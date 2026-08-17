-- ============================================================
-- Migración 59 · La unidad viaja dentro de la línea, no se deduce
--
-- EL PROBLEMA
-- Ninguna de las cuatro tablas de movimiento guarda en qué unidad se
-- registró la cantidad: rq_items, salidas, prestamos y stock_inicial
-- guardan un número pelado, y la unidad se deduce del catálogo CADA VEZ
-- que se dibuja la pantalla (undDe = und_base || und, en App.jsx).
--
-- Consecuencia: cambiar el catálogo reescribe el pasado. El día que
-- Lucía cargue las equivalencias de los ~29 materiales que se compran en
-- CAJA (1 caja = 100 unidades), la columna und_base pasa a existir y
-- TODO lo ya registrado de esos materiales cambia de unidad solo:
--
--     el "3 CAJA de guantes" de Edwin pasa a decir "3 UND"
--
-- El número no se toca; cambia lo que significa. Se compra la centésima
-- parte, la obra se queda sin material, y cuando llegue una caja de
-- verdad el almacenero NO la puede recibir: el control de sobre-recepción
-- compara 100 contra un pedido que ahora dice 3. El PDF ya firmado por
-- cuatro personas deja de coincidir con la pantalla si se regenera.
--
-- Nadie relacionaría las dos cosas: el cambio se hace otro día, en otra
-- pantalla, y se contagia hacia atrás.
--
-- LA REGLA
-- Una cantidad sin su unidad no significa nada. La unidad se congela en
-- la línea en el momento de crearla, igual que el precio se congela en la
-- factura. Lo que se registró en cajas queda dicho en cajas para siempre,
-- aunque el catálogo cambie de opinión después.
--
-- La estampa el servidor, no el cliente: así no se puede registrar un
-- pedido diciendo que son cajas cuando el catálogo dice unidades.
--
-- ORDEN OPERATIVO, que es la mitad del arreglo:
-- Esta migración protege lo que se registre DE AQUÍ EN ADELANTE. Lo ya
-- registrado se rellena abajo con la unidad que el catálogo dice HOY,
-- que es la que la gente tenía delante cuando lo escribió. Por eso hay
-- que correrla ANTES de que Lucía cargue las equivalencias — si se carga
-- primero, se congela el dato ya equivocado.
-- ============================================================

begin;

alter table public.rq_items      add column if not exists und text;
alter table public.salidas       add column if not exists und text;
alter table public.prestamos     add column if not exists und text;
alter table public.stock_inicial add column if not exists und text;

-- Relleno de lo ya registrado con la unidad vigente HOY. Es exactamente
-- la misma expresión que usa la pantalla (und_base || und), así que
-- nadie ve ningún cambio: solo deja de ser deducida.
update public.rq_items      i set und = coalesce(m.und_base, m.und)
  from public.materiales m where m.codigo = i.codigo and i.und is null;
update public.salidas       s set und = coalesce(m.und_base, m.und)
  from public.materiales m where m.codigo = s.codigo and s.und is null;
update public.prestamos     p set und = coalesce(m.und_base, m.und)
  from public.materiales m where m.codigo = p.codigo and p.und is null;
update public.stock_inicial e set und = coalesce(m.und_base, m.und)
  from public.materiales m where m.codigo = e.codigo and e.und is null;

-- De aquí en adelante la pone el servidor al crear la fila. Se estampa
-- SIEMPRE, ignorando lo que mande el cliente: si se dejara elegir, se
-- podría registrar "3 CAJA" de algo que el catálogo vende por unidad.
create or replace function public.trg_congelar_unidad()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  select coalesce(m.und_base, m.und) into new.und
    from public.materiales m where m.codigo = new.codigo;
  return new;
end;
$$;

drop trigger if exists aa_congelar_unidad on public.rq_items;
create trigger aa_congelar_unidad before insert on public.rq_items
  for each row execute function public.trg_congelar_unidad();

drop trigger if exists aa_congelar_unidad on public.salidas;
create trigger aa_congelar_unidad before insert on public.salidas
  for each row execute function public.trg_congelar_unidad();

drop trigger if exists aa_congelar_unidad on public.prestamos;
create trigger aa_congelar_unidad before insert on public.prestamos
  for each row execute function public.trg_congelar_unidad();

drop trigger if exists aa_congelar_unidad on public.stock_inicial;
create trigger aa_congelar_unidad before insert on public.stock_inicial
  for each row execute function public.trg_congelar_unidad();

commit;

notify pgrst, 'reload schema';

-- ============================================================
-- COMPROBAR DESPUÉS
--
--   select count(*) filter (where und is null) as sin_unidad,
--          count(*) as total
--     from public.rq_items;
--
-- sin_unidad debe ser 0. Igual para salidas, prestamos y stock_inicial.
--
-- Y la prueba de que el pasado ya no se puede reescribir: elegir un
-- material que hoy se compra en CAJA, anotar cómo se ve un pedido suyo,
-- cargarle la equivalencia en el catálogo, y comprobar que ese pedido
-- SIGUE diciendo CAJA mientras los nuevos ya dicen la unidad base.
-- ============================================================
