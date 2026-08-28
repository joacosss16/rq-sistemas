-- ============================================================
-- MIGRACIÓN 61 · La compra parcial cierra lo que YA se consiguió
-- ============================================================
--
-- EL FALLO, encontrado probando el sistema con la mano el 27 ago 2026:
-- Frank consigue 8 de 10 kilos de clavos y lo registra. El ítem se parte
-- correctamente en 8 + 2... y las DOS líneas quedan "por comprar", con sus
-- botones de comprar intactos. Los 8 que ya están pagados y en la camioneta
-- siguen figurando como pendientes.
--
-- La prueba dura: el consolidado de Compras seguía pidiendo los 10 kilos
-- completos —8 del original más 2 del saldo—, así que Lucía manda comprar
-- otra vez lo que ya está comprado. Con dinero real, eso es comprar dos veces.
--
-- Tres arreglos, todos dentro de la misma función:
--
--   A) El ítem original pasa a 'Comprado'. Es lo que de verdad ocurrió: esa
--      cantidad ya se consiguió y lo único que le falta es la factura. Solo
--      el saldo vuelve a la cola.
--
--   B) El saldo hereda la UNIDAD CONGELADA del original (`und`). Antes no la
--      copiaba, así que el saldo la deducía otra vez del catálogo — que es
--      justo lo que la migración 59 salió a impedir: el día que se carguen las
--      equivalencias de caja, un saldo de '2 CAJA' se convertiría en '2 UND'
--      sin tocar el número y sin que nadie lo notara.
--
--      OJO: copiar `und` en el insert NO BASTA, y la primera versión de esta
--      migración lo daba por hecho. `aa_congelar_unidad` (migración 59) pisa
--      `new.und` en TODA inserción, sin mirar de dónde viene, así que borraba
--      la unidad heredada y volvía a deducirla del catálogo. Por eso abajo se
--      le añade la misma exención que ya usan sus dos triggers hermanos.
--
--   C) La fila se bloquea antes de partirla. Dos clics seguidos en "Registrar"
--      podían entrar a la vez, leer los dos el mismo ítem entero y crear DOS
--      saldos. La guarda de `compra_parcial is not null` no alcanzaba: ninguna
--      de las dos transacciones veía todavía lo que escribía la otra.
--
-- Lo demás de la función se conserva palabra por palabra: los roles, el
-- motivo obligatorio, las guardas de recibido y facturado, el rango de la
-- cantidad, el aviso `rq.compra_parcial` a los otros triggers y el cierre de
-- saldo de Compras. Se reescribe entera porque en PL/pgSQL no hay forma de
-- parchear un trozo.
-- ── A.0) La unidad heredada tiene que sobrevivir al trigger ──────
--
-- `trg_congelar_unidad` estampa la unidad desde el catálogo en cada inserción,
-- ignorando lo que mande el cliente. Esa regla es correcta y se conserva: si
-- se dejara elegir, se podría registrar "3 CAJA" de algo que se vende suelto.
--
-- Pero el saldo de una compra parcial no lo manda un cliente: lo manda esta
-- función, copiando la unidad que el ítem original ya tenía congelada. Sin
-- esta exención, un saldo de "2 CAJA" nacía como "2 UND": Frank compraba dos
-- unidades sueltas donde faltaban dos cajas de cien, y el día que llegara la
-- caja de verdad el almacenero no podría ni recibirla, porque la recepción
-- compara contra un pedido que dice 2.
--
-- La condición `new.und is not null` mantiene la regla en pie: solo se respeta
-- una unidad que venga puesta, y del cliente nunca viene puesta.
create or replace function public.trg_congelar_unidad()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if coalesce(current_setting('rq.compra_parcial', true), '') = '1'
     and new.und is not null then
    return new;
  end if;
  select coalesce(m.und_base, m.und) into new.und
    from public.materiales m where m.codigo = new.codigo;
  return new;
end;
$$;

create or replace function public.compra_parcial(
  p_item uuid, p_cant numeric, p_motivo text, p_cerrar_saldo boolean default false
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  it      record;
  v_resto numeric;
  v_rol   text := coalesce(public.mi_rol(), '');
  v_nombre text;
begin
  if v_rol not in ('compras', 'comprador') then
    raise exception 'Una compra parcial la registra Compras o el comprador.';
  end if;
  if coalesce(p_cerrar_saldo, false) and v_rol <> 'compras' then
    raise exception 'Dar por cerrado lo que falta es decisión de Compras. Registra la compra parcial y deja el saldo pendiente; Lucía decide si se sigue buscando.';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Una compra parcial exige explicar por qué no se consiguió todo.';
  end if;

  -- (C) Bloqueo de la fila: el segundo clic espera aquí y, cuando entra, ya ve
  -- el ítem partido — así choca contra la guarda de abajo en vez de duplicar.
  select * into it from public.rq_items where id = p_item for update;
  if not found then raise exception 'Ítem no encontrado.'; end if;
  if it.decision <> 'Aprobado' then
    raise exception 'Solo se parte un ítem aprobado (este está %).', it.decision;
  end if;
  if coalesce(it.cant_recibida, 0) > 0 then
    raise exception 'Ese ítem ya tiene material recibido en almacén: la cantidad no se puede partir. Corrige primero la recepción.';
  end if;
  if exists (select 1 from public.factura_items where rq_item_id = p_item) then
    raise exception 'Ese ítem ya está facturado: no se puede partir. Si la factura está mal, gerencia la anula y se registra de nuevo.';
  end if;
  if it.compra_parcial is not null then
    raise exception 'Ese ítem ya se partió una vez. El saldo quedó como un ítem aparte: trabaja sobre ese.';
  end if;
  if not (p_cant > 0 and p_cant < it.cant) then
    raise exception 'Lo conseguido tiene que estar entre 1 y % (que es lo pedido). Si conseguiste todo, marca el ítem como comprado normalmente.', it.cant;
  end if;

  v_resto := it.cant - p_cant;
  select nombre into v_nombre from public.usuarios where id = auth.uid();

  -- Aviso a la guarda del comprador: este cambio viene de aquí.
  perform set_config('rq.compra_parcial', '1', true);

  update public.rq_items
     set cant = p_cant,
         -- (A) Lo conseguido queda COMPRADO: ya se pagó y está en la camioneta.
         -- Solo se marca si el ítem no traía ya un estado logístico propio.
         estado = case when coalesce(it.estado, '—') = '—' then 'Comprado' else it.estado end,
         compra_parcial = jsonb_build_object(
           'pedido',        it.cant,
           'conseguido',    p_cant,
           'saldo',         v_resto,
           'motivo',        trim(p_motivo),
           'por',           coalesce(v_nombre, 'desconocido'),
           'fecha',         current_date::text,
           'saldo_cerrado', coalesce(p_cerrar_saldo, false))
   where id = p_item;

  insert into public.rq_items (
    rq_id, codigo, cant, und, fecha_necesitada, destino, color, obs,
    decision, motivo_rechazo, fecha_caducidad, decidido_en, decidido_por)
  values (
    -- (B) `und` viaja del original al saldo: la unidad no se vuelve a deducir.
    it.rq_id, it.codigo, v_resto, it.und, it.fecha_necesitada, it.destino, it.color,
    trim(coalesce(it.obs || ' · ', '') || 'Saldo de compra parcial: ' || trim(p_motivo)),
    case when coalesce(p_cerrar_saldo, false) then 'Rechazado' else 'Aprobado' end,
    case when coalesce(p_cerrar_saldo, false) then trim(p_motivo) else null end,
    it.fecha_caducidad, it.decidido_en, it.decidido_por);

  -- Se apaga la marca. Muere sola con la transacción, pero dejarla encendida
  -- eximiría de sus guardas a cualquier inserción posterior que ocurriera
  -- dentro de la misma transacción.
  perform set_config('rq.compra_parcial', '', true);
end;
$$;

revoke all on function public.compra_parcial(uuid, numeric, text, boolean) from public, anon;
grant execute on function public.compra_parcial(uuid, numeric, text, boolean) to authenticated;

-- ── Arrastre de lo ya partido antes de esta migración ─────────
--
-- Las compras parciales registradas hasta hoy dejaron su original en '—'.
-- Si no se corrigen, el consolidado las sigue pidiendo enteras. Se marcan
-- como compradas: por definición, esa cantidad ya se consiguió.
--
-- VA EN DOS PASOS, y el motivo importa. Al pasar de '—' a 'Comprado', dos
-- triggers estampan la firma y la fecha de la compra: `comprado_por` con
-- `auth.uid()` y `fecha_compra` con el día de hoy. Corriendo esto desde el
-- editor SQL no hay sesión, así que `auth.uid()` es NULO — y un ítem comprado
-- por Frank con la firma vacía DESAPARECE de sus dos pantallas: sale de
-- "Compras del día" (que lista lo que aún no se compró) y nunca entra a su
-- pestaña de facturar (que filtra por lo que compró él). Habría pagado con el
-- efectivo de la caja chica y se quedaría sin dónde registrar la factura, con
-- la rendición de ese día sin cerrar y sin ningún aviso de por qué.
--
-- El segundo paso lo repone desde el rastro que la propia compra parcial ya
-- guardó: quién la registró y qué día. Y funciona sin desactivar nada, porque
-- los dos triggers solo actúan en la transición '—' → 'Comprado': en el
-- segundo UPDATE el ítem ya está 'Comprado', así que conservan lo que haya.
update public.rq_items
   set estado = 'Comprado'
 where compra_parcial is not null
   and coalesce(estado, '—') = '—'
   and decision = 'Aprobado';

update public.rq_items i
   set comprado_por = coalesce(
         i.comprado_por,
         (select u.id from public.usuarios u
           where u.nombre = i.compra_parcial->>'por' limit 1)),
       fecha_compra = coalesce(
         (i.compra_parcial->>'fecha')::date,
         i.fecha_compra)
 where i.compra_parcial is not null
   and i.estado = 'Comprado'
   and (i.comprado_por is null or i.fecha_compra is distinct from (i.compra_parcial->>'fecha')::date);

-- ── Comprobación tras correrla ────────────────────────────────
-- 1) Ningún ítem partido se quedó sin estado (debe dar 0):
--
--   select count(*) from public.rq_items
--    where compra_parcial is not null and coalesce(estado,'—') = '—'
--      and decision = 'Aprobado';
--
-- 1b) Y NINGUNO se quedó sin la firma de quién compró (debe dar 0). Si alguno
--     sale, es que el nombre guardado en el rastro no coincide con ningún
--     usuario: hay que asignarlo a mano antes de que Frank lo eche en falta.
--
--   select id, codigo, compra_parcial->>'por' as decia_quien
--     from public.rq_items
--    where compra_parcial is not null and estado = 'Comprado'
--      and comprado_por is null;
--
-- 2) Los saldos creados desde ahora llevan unidad propia. Los de antes NO
--    (nacieron sin ella); se ven así, y su unidad se sigue deduciendo:
--
--   select id, codigo, cant, und, obs from public.rq_items
--    where obs like 'Saldo de compra parcial%' order by creado_en desc;
