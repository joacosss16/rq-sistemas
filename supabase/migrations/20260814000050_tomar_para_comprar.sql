-- ============================================================
-- MIGRACIÓN 50 · "YO ME ENCARGO DE ESTO"
--
-- EL PROBLEMA, planteado por el dueño: Lucía y Frank ven exactamente
-- la misma lista de lo que hay por comprar. Nada impide que los dos
-- compren el mismo material el mismo día — el ítem solo desaparece de
-- la lista cuando alguien lo marca Comprado, o sea DESPUÉS de haber
-- pagado. Entre que uno decide comprarlo y lo compra, el otro lo ve
-- disponible.
--
-- Con cinco obras y dos personas comprando en paralelo, eso es
-- material duplicado y plata gastada de más.
--
-- LA SOLUCIÓN: que se pueda tomar un ítem — "yo me encargo de esto" —
-- y que el otro lo vea tomado y por quién.
--
-- DECISIONES DE DISEÑO:
--
--  · NO es un bloqueo duro. El otro puede comprarlo igual con un
--    clic, avisado de quién lo tenía. Un candado que solo abre quien
--    lo puso acaba trabando el trabajo el día que esa persona se
--    olvida de soltarlo o no viene.
--
--  · La marca CADUCA sola al día siguiente. Tomar algo no lo reserva
--    para siempre: si no se compró hoy, mañana vuelve a estar libre.
--    Así nadie tiene que acordarse de soltar nada.
--
--  · Quién lo tomó lo pone la base, como todas las firmas.
--
-- Se corre en el editor SQL de Supabase. Se puede repetir sin daño.
-- ============================================================

begin;

alter table public.rq_items
  add column if not exists tomado_por uuid references public.usuarios (id),
  add column if not exists tomado_en  timestamptz;

comment on column public.rq_items.tomado_por is
  'Quién dijo "yo me encargo de comprar esto". Lo estampa el trigger, nunca el cliente. Caduca al día siguiente: la app solo considera vigente lo tomado hoy.';

-- ------------------------------------------------------------
-- El comprador ya podía marcar Comprado. Ahora también puede tomar
-- y soltar un ítem — y nada más, como antes.
-- ------------------------------------------------------------
drop policy if exists rq_items_update_comprador on public.rq_items;
create policy rq_items_update_comprador on public.rq_items
  for update to authenticated
  using      (coalesce(public.mi_rol(), '') = 'comprador'
              and decision = 'Aprobado' and estado = '—')
  with check (coalesce(public.mi_rol(), '') = 'comprador'
              and estado in ('—', 'Comprado'));

create or replace function public.trg_comprador_solo_estado()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  campos_comprador text[] := array['estado', 'comprado_por', 'fecha_compra',
                                   'tomado_por', 'tomado_en', 'actualizado_en'];
begin
  -- La firma de quién tomó el ítem la pone la base, para cualquier rol.
  if new.tomado_en is distinct from old.tomado_en then
    if new.tomado_en is null then
      new.tomado_por := null;                       -- soltarlo
    else
      new.tomado_por := auth.uid();                 -- tomarlo
      new.tomado_en  := now();
    end if;
  else
    new.tomado_por := old.tomado_por;
  end if;

  if coalesce(public.mi_rol(), '') <> 'comprador' then
    return new;
  end if;

  -- El comprador solo toca su parte: marcar comprado, o tomar y soltar.
  if (to_jsonb(new) - campos_comprador) is distinct from (to_jsonb(old) - campos_comprador) then
    raise exception 'El comprador marca un ítem como comprado, o lo toma para comprarlo. Aprobar, cambiar cantidades o facturar es de Compras.';
  end if;

  if new.estado is distinct from old.estado
     and not (old.estado = '—' and new.estado = 'Comprado') then
    raise exception 'El comprador solo puede marcar "Comprado" un ítem por comprar.';
  end if;

  return new;
end;
$$;

commit;

notify pgrst, 'reload schema';

-- ============================================================
-- CÓMO COMPROBAR
--
-- 1. Con la cuenta del comprador, tomar un ítem: debe quedar con su
--    nombre y la hora, puestos por la base.
-- 2. Con la cuenta de Compras, ver ese mismo ítem: debe decir quién
--    lo tiene, y permitir comprarlo igual con un clic.
-- 3. Soltarlo: debe volver a quedar libre.
-- 4. Con la cuenta del comprador, intentar cambiar la cantidad de un
--    ítem: debe seguir rechazándolo.
-- ============================================================
