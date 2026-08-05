-- ============================================================
-- Migración 24: no se puede ANULAR un ítem que el almacén YA RECIBIÓ.
-- El material está físicamente en la obra: anularlo hacía que el
-- stock dejara de contarlo (descuadre invisible de inventario).
-- Si hay que devolver material al proveedor, eso es una devolución,
-- no una anulación.
-- ============================================================

create or replace function public.trg_no_anular_recibido()
returns trigger
language plpgsql
as $$
begin
  if new.decision = 'Anulado' and coalesce(old.decision, '') <> 'Anulado'
     and coalesce(old.cant_recibida, 0) > 0 then
    raise exception 'No se puede anular: el almacén ya recibió % de este ítem. Corrige con una devolución al proveedor, no anulando.',
      old.cant_recibida;
  end if;
  return new;
end;
$$;

drop trigger if exists no_anular_recibido on public.rq_items;
create trigger no_anular_recibido
  before update on public.rq_items
  for each row execute function public.trg_no_anular_recibido();

notify pgrst, 'reload schema';
