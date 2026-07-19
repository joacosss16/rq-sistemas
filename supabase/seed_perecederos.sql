-- ============================================================
-- MARCADO DE PERECEDEROS — 205 de 1740 materiales
-- Clasificacion por vida util tipica de cada categoria, con
-- verificacion externa de casos dudosos (electrodos: si vencen;
-- cintas 3M: 5 anios de vida util, NO marcadas).
-- Compras puede ajustar cualquier material desde la vista
-- Catalogo (checkbox Perecedero).
-- ============================================================

-- combustibles y lubricantes: 5
update public.materiales set perecedero = true where codigo in ('010111', '340111', '390194', '530101', '950421');

-- cementicios (cemento, yeso, fragua, masilla: 1-6 meses): 62
update public.materiales set perecedero = true where codigo in ('040331', '040332', '040333', '040341', '040351', '210112', '300222', '300223', '300224', '540421', '540431', '590121', '590122', '590123', '590124', '590125', '810411', '810641', '810643', '810750', '810751', '810752', '810753', '810754', '810755', '810756', '810757', '810758', '810811', '810812', '810813', '810814', '810815', '810816', '810817', '810818', '810819', '810820', '810821', '810822', '810823', '810824', '810825', '810826', '810827', '810828', '810829', '810830', '810831', '810832', '810851', '810852', '810853', '810854', '810855', '810856', '810857', '810858', '810859', '810860', '860114', '930411');

-- electrodos de soldadura (sensibles a humedad): 2
update public.materiales set perecedero = true where codigo in ('060311', '060321');

-- resinas y catalizadores (6-12 meses): 4
update public.materiales set perecedero = true where codigo in ('130101', '130102', '130103', '130104');

-- explosivos (fulminantes): 1
update public.materiales set perecedero = true where codigo in ('270111');

-- solventes y quimicos: 17
update public.materiales set perecedero = true where codigo in ('390114', '390115', '390179', '830117', '860415', '860421', '860422', '860431', '860441', '860442', '930111', '930121', '930151', '930152', '930153', '930155', '930171');

-- pilas y baterias: 2
update public.materiales set perecedero = true where codigo in ('390166', '390167');

-- botiquin y limpieza (vencimiento impreso): 10
update public.materiales set perecedero = true where codigo in ('390176', '830113', '830115', '830129', '830137', '830139', '830144', '830145', '830147', '830151');

-- pinturas y recubrimientos (2-3 años): 44
update public.materiales set perecedero = true where codigo in ('540111', '540211', '540212', '540213', '540221', '540223', '540224', '540310', '540311', '540312', '540313', '540314', '540315', '540316', '540350', '540511', '860111', '860112', '860113', '860211', '860212', '860213', '860214', '860215', '860241', '860242', '860251', '860252', '860261', '860262', '860263', '860271', '860272', '860273', '860274', '860275', '860276', '860277', '860278', '860279', '860280', '860311', '860321', '860331');

-- adhesivos y selladores (1-2 años): 41
update public.materiales set perecedero = true where codigo in ('540410', '540411', '540412', '540413', '590126', '600310', '600311', '600312', '600313', '600314', '600315', '600316', '600317', '600318', '600319', '600320', '600321', '600323', '810211', '810212', '810213', '810231', '810232', '810233', '810234', '810511', '810512', '810513', '810514', '810515', '810516', '810552', '810711', '810712', '860351', '860451', '860452', '860453', '860454', '860455', '930421');

-- aditivos de concreto: 11
update public.materiales set perecedero = true where codigo in ('600220', '600221', '810111', '810121', '810122', '810131', '810132', '810141', '810142', '810413', '810642');

-- extintores (recarga anual): 1
update public.materiales set perecedero = true where codigo in ('830229');

-- sprays y aerosoles: 5
update public.materiales set perecedero = true where codigo in ('830333', '830334', '830335', '830336', '830337');

-- verificacion
select count(*) filter (where perecedero) as perecederos, count(*) as total from public.materiales;