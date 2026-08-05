-- ============================================================
-- Migración 27: arqueo de caja chica con tolerancia y escalamiento.
--
-- Al cerrar el día, administración cuenta el efectivo real. El
-- sistema calcula la diferencia contra el sobrante teórico
-- (fondo − rendido). Nadie la digita: se calcula.
--   · |diferencia| <= tolerancia  -> se aprueba normal, pero queda registrada
--   · |diferencia| >  tolerancia  -> estado "Con diferencia": Pagos NO repone
--                                    hasta que GERENCIA la resuelva.
--
-- La goterita diaria es lo que importa: aunque ningún día pase el
-- umbral, el acumulado mensual por obra/responsable lo delata.
-- ============================================================

-- Tolerancia por obra (S/ 20 por defecto = 1% del fondo de S/ 2,000)
alter table public.cajas_chicas
  add column if not exists tolerancia numeric(12,2) not null default 20
    check (tolerancia >= 0);

-- Arqueo y diferencia en la rendición
alter table public.rendiciones
  add column if not exists efectivo_contado numeric(12,2),
  add column if not exists diferencia       numeric(12,2),   -- (+) sobra · (−) falta
  add column if not exists dif_motivo       text,
  add column if not exists dif_resolucion   jsonb;           -- {decision, nota, por, fecha}

alter table public.rendiciones
  drop constraint if exists chk_dif_resolucion;
alter table public.rendiciones
  add constraint chk_dif_resolucion check (
    dif_resolucion is null
    or dif_resolucion ?& array['decision','por','fecha']
  );

-- Nuevo estado: "Con diferencia" (esperando a gerencia)
alter table public.rendiciones drop constraint if exists rendiciones_estado_check;
alter table public.rendiciones
  add constraint rendiciones_estado_check
    check (estado in ('Abierta','Aprobada','Observada','Con diferencia'));

-- Gerencia debe poder resolver la diferencia
drop policy if exists rendiciones_update on public.rendiciones;
create policy rendiciones_update on public.rendiciones
  for update to authenticated
  using (public.mi_rol() in ('administracion','pagos','gerente'))
  with check (public.mi_rol() in ('administracion','pagos','gerente'));

notify pgrst, 'reload schema';
