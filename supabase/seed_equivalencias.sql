-- ============================================================
-- SEED EQUIVALENCIAS v2 — 1 sep 2026, tras auditar los ~24,000
-- movimientos crudos de los dos Excel: NO todos los saldos estan
-- en la misma unidad, asi que cada grupo se trata distinto.
-- (La v1 relabelaba todo el stock a unidad base: habria convertido
--  "1 rollo" de malla en "1 metro". No se llego a correr.)
--
-- GRUPO 1 · IDENTIDAD (factor 1, "se entrega entero"): solo factor.
-- GRUPO 2 · BASE (los movimientos YA estaban en unidad suelta:
--   clavijas, tornillos, cable en MTS, fulminantes, tiza):
--   factor + und_base, y el stock solo cambia de ETIQUETA.
-- GRUPO 3 · ENVASE (se contaron rollos/cajas ENTEROS: malla, cintas,
--   papel, barbijos, guantes de caja, bolsas 75/140LT):
--   factor + und_base, y el stock se MULTIPLICA por el factor
--   (1 rollo de malla -> 45.72 MTS) ademas de reetiquetarse.
-- GRUPO 4 · RECONTEO FISICO — NO SE CARGA NADA: clavos y alcayatas
--   (mov. de -1 a +1330 rotulados CAJA: ni cajas ni gramos limpios)
--   mas esponjas, cuchillas, bolsas 35LT y vasos (ambiguos). Ver
--   datos/reconteo_fisico_pendiente.csv: el almacenero cuenta/pesa
--   lo que hay en el estante y RECIEN entonces se carga su
--   equivalencia y se corrige su stock. Convertir un numero ambiguo
--   es fabricar un descuadre con decimales.
-- Repetible: cada update deja el estado final, no acumula.
-- ============================================================

-- GRUPO 1 · identidad confirmada (factor 1, la unidad visible no cambia)
update public.materiales set factor_caja = 1 where codigo in (
  '020191', '020192', '020193', '030101', '030102', '030103', '030104', '030106', '030107', '030108', '040351', '260111', '260178', '810141', '810142', '830233', '830235', '830239', '830242', '830243', '950313', '990101');

-- GRUPO 2 · movimientos ya en unidad base: factor + etiqueta del stock
update public.materiales set factor_caja = 100, und_base = 'UND' where codigo = '020492';  -- CLAVIJA DE IMPACTO PARA DRYWALL 1" Cja x 100
update public.materiales set factor_caja = 100, und_base = 'UND' where codigo = '020493';  -- CLAVIJA DE IMPACTO PARA DRYWALL 1-1/4" Cja x
update public.materiales set factor_caja = 100, und_base = 'UND' where codigo = '020494';  -- CLAVIJA DE IMPACTO PARA DRYWALL 1-1/2" Cja x
update public.materiales set factor_caja = 100, und_base = 'UND' where codigo = '020561';  -- TORNILLO AUTOAVELLANANTE PUNTA FINA 6X1-1/4 
update public.materiales set factor_caja = 305, und_base = 'MTS' where codigo = '180121';  -- CABLE UTP CAT 6 x 305 m
update public.materiales set factor_caja = 100, und_base = 'UND' where codigo = '270111';  -- FULMINANTE MARRÓN CAL. 22 x 100 und
update public.materiales set factor_caja = 50, und_base = 'UND' where codigo = '390152';  -- CAJA TIZA COLORES X 50 UND
update public.stock_inicial e set und = m.und_base
  from public.materiales m
 where m.codigo = e.codigo and m.codigo in ('020492', '020493', '020494', '020561', '180121', '270111', '390152')
   and e.und is distinct from m.und_base;

-- GRUPO 3 · se contaron envases enteros: factor + CONVERTIR el stock
update public.materiales set factor_caja = 100, und_base = 'UND' where codigo = '390123';  -- BOLSA DE BASURA DE 75LT
update public.materiales set factor_caja = 100, und_base = 'UND' where codigo = '390124';  -- BOLSA DE BASURA DE 140 LT
update public.materiales set factor_caja = 100, und_base = 'PAR' where codigo = '830133';  -- PAQUETE DE GUANTES QUIRURGICOS
update public.materiales set factor_caja = 100, und_base = 'UND' where codigo = '830255';  -- BARBIJO QUIRURGICO (MASCARILLA)
update public.materiales set factor_caja = 100, und_base = 'MTS' where codigo = '830313';  -- CINTA DE SEGURIDAD COLOR AMARILLO
update public.materiales set factor_caja = 45.72, und_base = 'MTS' where codigo = '830321';  -- MALLA FAENA EN ROLLO NARANJA 50 YD.
update public.materiales set factor_caja = 100, und_base = 'MTS' where codigo = '930261';  -- PAPEL TOALLA RENDIPEL PRO DOBLE HOJA 100 M
update public.stock_inicial e
   set cant = round(e.cant * m.factor_caja, 2), und = m.und_base
  from public.materiales m
 where m.codigo = e.codigo and m.codigo in ('390123', '390124', '830133', '830255', '830313', '830321', '930261')
   and e.und is distinct from m.und_base;  -- la condicion evita re-multiplicar al repetir

-- Verificacion:
select 'materiales con factor (=36)' t, count(*)::text v from public.materiales where factor_caja is not null
union all
select 'stock convertido grupo 3', string_agg(e.codigo || '=' || e.cant || ' ' || e.und, ', ')
  from public.stock_inicial e where e.codigo in ('390123', '390124', '830133', '830255', '830313', '830321', '930261');