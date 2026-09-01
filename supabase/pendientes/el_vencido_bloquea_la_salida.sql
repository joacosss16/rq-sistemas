-- ############################################################
-- ##  PARADA. ESTO NO ES UNA MIGRACIÓN: NO SE CORRE.        ##
-- ############################################################
--
-- Vive fuera de `supabase/migrations/` A PROPÓSITO. Esa carpeta es "lo que hay
-- que correr, en orden", y dejar ahí un archivo que no se debe correr es una
-- trampa esperando a alguien con prisa.
--
-- POR QUÉ ESTÁ PARADA (ataque adversarial del 31 ago 2026, tres hallazgos):
--
-- 1. BLOQUEANTE — el FIFO de aquí abajo y el de `src/stock.js` NO son el mismo
--    algoritmo, aunque la cabecera diga que sí. Cuando falta `fecha_entrega`,
--    la pantalla ordena los lotes por `fecha_necesitada` (App.jsx mapea
--    `fecha: r.fecha_necesitada`) y este SQL por `fecha_rq`. Son fechas cuyo
--    orden se invierte con toda naturalidad: es lo que distingue un URGENTE de
--    un ANTICIPADO. Resultado comprobado con un caso real: la pantalla habilita
--    el botón y la base grita "VENCIDO", sin nada vencido a la vista.
--    Arreglo: alinear el SQL al JS -> `coalesce(i.fecha_entrega, i.fecha_necesitada)`.
--
-- 2. GRAVE — el desempate de lotes llegados el mismo día tampoco coincide: el
--    SQL ordena `llego, cad, cant` y el JS solo por `llego` (con sort estable,
--    o sea por orden de carga). Y dos recepciones el mismo día son lo normal,
--    no lo raro: `fecha_entrega` es DATE, sin hora.
--    Arreglo: añadir `, cad, cant` al orden del JS — el desempate del SQL es el
--    bueno, porque consume primero lo que caduca antes y así no bloquea de más.
--
-- 3. LO QUE DE VERDAD LA PARA — el cálculo de lotes se rompe cuando hay
--    existencias SIN caducidad, y eso vale también para el JS que YA ESTÁ
--    CORRIENDO en pantalla:
--
--        consumido = Σ(lotes con caducidad) − stock_físico
--
--    pero `stock_fisico()` cuenta TODO: stock inicial, recepciones sin
--    caducidad y préstamos recibidos, y nada de eso genera lote. Con 100
--    unidades de inventario inicial y un lote de 10 vencido, `consumido` sale 0
--    y el lote vencido "sobrevive" para siempre, bloqueando las 100 sanas.
--
--    Y el fondo del problema no es aritmético sino de diseño: **la regla es
--    binaria y el stock real es mixto**. Bloquear 100 unidades buenas porque
--    hay 10 vencidas entre ellas, sin ninguna forma de dar de baja esas 10, es
--    peor que el problema que resuelve.
--
-- QUÉ HACE FALTA ANTES DE RESUCITARLA:
--   a) DAR DE BAJA material vencido. Hoy no existe, y la pantalla lleva desde
--      julio diciendo "dar de baja o corregir con Gerencia".
--   b) Decidir qué se hace con el stock mixto: ¿se bloquea todo? ¿solo la
--      parte vencida? ¿se avisa sin bloquear? Es decisión del dueño.
--   c) Alinear los dos FIFO (hallazgos 1 y 2) y arreglar el cálculo del
--      consumido en `src/stock.js` CON PRUEBAS — ese fallo está vivo hoy en
--      pantalla y morderá en cuanto se cargue el inventario inicial real, que
--      es justo antes de arrancar el piloto.
--   d) Y entonces sí, atacarla otra vez antes de correrla.
--
-- Lo de abajo se conserva porque el trabajo sirve —sobre todo `caducidad_viva`,
-- que es el FIFO ya escrito en SQL— pero NADA de esto está validado.
--
-- ############################################################

-- ============================================================
-- MIGRACIÓN 81 · El vencido bloquea la salida DE VERDAD
-- ============================================================
--
-- UNA PROMESA SIN CUMPLIR DESDE JULIO. La migración 7 dejó escrito en su
-- cabecera "vencido bloquea la salida", y esa regla nunca se escribió: vive
-- solo en `Almacen.jsx`, en la condición que apaga el botón. Un POST directo a
-- `salidas` saca material vencido y el stock lo descuenta sin una palabra.
--
-- Es el caso de manual de la regla de la casa: el navegador corre en la máquina
-- del usuario y se puede esquivar. La migración 75 tuvo que bajar por lo mismo
-- la validación de cantidades enteras — "una regla que solo vive en la pantalla
-- se salta, y de hecho se saltaba: se registraron 2.5 tornillos".
--
-- POR QUÉ NO SE PUDO HACER ANTES, y por qué sí ahora. Hasta esta mañana el
-- cálculo de la caducidad estaba MAL en la función que mira el almacenero:
-- tomaba el mínimo de todas las recepciones sin comprobar si ese lote seguía en
-- el estante, así que un lote vencido y consumido hace meses marcaba el
-- material como vencido PARA SIEMPRE. Bajar esta regla a la base con ese
-- cálculo habría bloqueado en el servidor las salidas de material sano — y
-- desde la base no hay quien lo esquive. Primero se arregló el cálculo (con
-- pruebas, en `stock.js`), y recién entonces se puede exigir.
--
-- ── AVISO IMPORTANTE, Y NO LO RESUELVE ESTA MIGRACIÓN ────────
--
-- Hoy NO EXISTE ninguna forma de dar de baja material vencido en el sistema.
-- La pantalla dice "dar de baja o corregir con Gerencia" y no hay ni un botón
-- para lo primero. Así que el material vencido se queda en el stock, contando
-- como existencias, para siempre.
--
-- Esta migración NO crea ese callejón —ya existía, la pantalla ya bloqueaba—:
-- lo sella, que es distinto. Pero conviene decirlo claro para no repetir el
-- error de los mensajes que mandan a "Transferir al costo", una puerta que la
-- migración 74 tapió y que los errores de la base siguen recomendando.
--
-- Por eso el mensaje de aquí abajo NO promete un botón que no existe: dice la
-- verdad — que hay que avisar a gerencia — y explica por qué se bloquea.
-- **La baja de material vencido queda apuntada en ESTADO.md como lo siguiente
-- que necesita este módulo.**

-- ------------------------------------------------------------
-- 1) LA CADUCIDAD DE LO QUE QUEDA, EN LA BASE
-- ------------------------------------------------------------
-- Mismo algoritmo que `caducidadViva()` en `src/stock.js`, que esta mañana se
-- extrajo justamente para que hubiera UNA sola definición y las dos pantallas
-- coincidieran. Ahora la base es la tercera que la usa, y tiene que dar el
-- mismo número: si la pantalla deja pulsar y el servidor rechaza, el almacenero
-- concluye que el sistema está roto — y tendrá razón.
--
-- Sin control de lotes, la única suposición razonable es que se consume por
-- orden de llegada. Se descuenta lo ya consumido de los lotes más antiguos y la
-- caducidad sale del más próximo de los que siguen en pie.
--
-- Se mide contra el stock FÍSICO, no el disponible: lo reservado sigue en el
-- estante y sus lotes siguen contando. Usar el disponible haría "desaparecer"
-- lotes que están ahí y apagaría el aviso antes de tiempo.
create or replace function public.caducidad_viva(p_proyecto text, p_codigo text)
returns date
language sql
stable
security definer
set search_path = public
as $$
  with lotes as (
    select i.fecha_caducidad as cad,
           i.cant_recibida   as cant,
           -- Cuándo llegó ese lote. La fecha de entrega es la buena; si falta
           -- (datos viejos), se usa la del RQ para no perder el orden.
           coalesce(i.fecha_entrega, r.fecha_rq) as llego
      from public.rq_items i
      join public.rqs r on r.id = i.rq_id
     where r.proyecto = p_proyecto
       and i.codigo   = p_codigo
       and i.decision = 'Aprobado'
       and coalesce(i.cant_recibida, 0) > 0
       and i.fecha_caducidad is not null
  ),
  consumido as (
    select greatest(0, coalesce((select sum(cant) from lotes), 0)
                     - greatest(0, public.stock_fisico(p_proyecto, p_codigo))) as n
  ),
  acumulado as (
    -- `hasta` = cuánto material se lleva contado incluyendo ESTE lote. Si
    -- supera lo consumido, este lote sobrevive al menos en parte.
    select cad,
           sum(cant) over (order by llego, cad, cant
                           rows between unbounded preceding and current row) as hasta
      from lotes
  )
  select min(a.cad) from acumulado a, consumido c where a.hasta > c.n
$$;

comment on function public.caducidad_viva(text, text) is
  'Fecha de caducidad más próxima de los lotes que TODAVÍA están en el almacén, consumiendo por orden de llegada. Devuelve null si el material no tiene caducidad o si ya no queda nada. Es la misma lógica que caducidadViva() en src/stock.js: si una cambia, hay que cambiar la otra.';

revoke all on function public.caducidad_viva(text, text) from public, anon;
grant execute on function public.caducidad_viva(text, text) to authenticated;

-- ------------------------------------------------------------
-- 2) Y LA SALIDA LA MIRA
-- ------------------------------------------------------------
-- Se reescribe `trg_salidas_bi` ENTERA a partir de su ÚNICA definición viva,
-- la del esquema inicial —esta función no se ha tocado desde julio—, con un
-- solo añadido. El advisory lock y la comprobación de stock quedan palabra por
-- palabra: son la guarda que impide que dos salidas simultáneas del mismo
-- material pasen las dos.
create or replace function public.trg_salidas_bi()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_cad date;
begin
  perform pg_advisory_xact_lock(hashtext(new.proyecto || '/' || new.codigo));
  if new.cant > stock(new.proyecto, new.codigo) then
    raise exception 'Stock insuficiente de % en %: disponible %, solicitado %',
      new.codigo, new.proyecto, stock(new.proyecto, new.codigo), new.cant;
  end if;

  -- ── AÑADIDO (81): no sale material vencido ──────────────────
  -- Solo para quien entra por la aplicación. Las cargas de datos y el
  -- mantenimiento desde el editor SQL no se tocan: si hay que mover material
  -- vencido a mano para corregir un inventario, tiene que poder hacerse.
  if auth.uid() is not null then
    v_cad := public.caducidad_viva(new.proyecto, new.codigo);
    if v_cad is not null and v_cad < current_date then
      raise exception
        'El material % de % está VENCIDO (caducó el %) y no puede salir del almacén. No lo uses en obra. Hoy el sistema no tiene forma de darlo de baja: avisa a gerencia para que decida qué hacer con él.',
        new.codigo, new.proyecto, to_char(v_cad, 'DD/MM/YYYY');
    end if;
  end if;

  return new;
end;
$$;

notify pgrst, 'reload schema';

-- ── Comprobación tras correrla ────────────────────────────────
--
-- 1) La función existe y el trigger sigue en pie:
--
--   select proname from pg_proc where proname = 'caducidad_viva';
--   select tgname from pg_trigger
--    where tgrelid = 'public.salidas'::regclass and not tgisinternal
--    order by tgname;                    -- salidas_bi debe seguir ahí
--
-- 2) QUE LA BASE Y LA PANTALLA DIGAN LO MISMO. Es la comprobación que importa:
--    si no coinciden, el almacenero verá el botón activo y el servidor le dirá
--    que no, y concluirá —con razón— que el sistema está roto.
--
--   select r.proyecto, i.codigo,
--          public.stock_fisico(r.proyecto, i.codigo) as fisico,
--          public.caducidad_viva(r.proyecto, i.codigo) as caduca,
--          public.caducidad_viva(r.proyecto, i.codigo) < current_date as bloqueado
--     from public.rq_items i join public.rqs r on r.id = i.rq_id
--    where i.fecha_caducidad is not null and i.decision = 'Aprobado'
--    group by r.proyecto, i.codigo
--    order by 4 desc nulls last, 1, 2;
--
--   Compara esa lista contra la columna "Caducidad" de la pestaña Stock del
--   almacén, obra por obra. Los VENCIDO tienen que ser los mismos materiales.
--
-- 3) ¿CUÁNTO MATERIAL SE QUEDA ATRAPADO? Esto es lo que hay que mirar ANTES de
--    dar la migración por buena, porque cada fila es material que a partir de
--    ahora no puede salir y que no hay forma de dar de baja:
--
--   select r.proyecto, i.codigo,
--          public.stock_fisico(r.proyecto, i.codigo) as atrapado,
--          public.caducidad_viva(r.proyecto, i.codigo) as caduco_el
--     from public.rq_items i join public.rqs r on r.id = i.rq_id
--    where i.fecha_caducidad is not null and i.decision = 'Aprobado'
--    group by r.proyecto, i.codigo
--   having public.caducidad_viva(r.proyecto, i.codigo) < current_date
--      and public.stock_fisico(r.proyecto, i.codigo) > 0
--    order by 1, 2;
--
--   Con los datos de prueba de hoy da igual. Con el inventario REAL cargado,
--   esta consulta hay que correrla ANTES de arrancar el piloto: si sale
--   material de verdad, hay que decidir qué hacer con él antes de que un
--   almacenero se encuentre con que no puede sacarlo y nadie sepa por qué.
--
-- 4) QUE MUERDE, con la sesión de un almacenero, sobre un material vencido
--    con stock (de la consulta 3):
--
--   begin;
--     select set_config('request.jwt.claims', json_build_object('sub',
--       (select id from public.usuarios where rol = 'almacen' and activo limit 1)
--     )::text, true);
--     set local role authenticated;
--     insert into public.salidas (proyecto, codigo, cant, hoja_trabajo, zona, registrado_por)
--     values ('<obra>', '<codigo vencido>', 1, 'HT-PRUEBA', 'prueba',
--             (select id from public.usuarios where rol = 'almacen' and activo limit 1));
--   rollback;
--
--   ESPERADO: error "El material ... está VENCIDO (caducó el ...)".
--
-- 5) Y QUE NO MUERDA DE MÁS — el caso que esta mañana se arregló en la
--    pantalla y que aquí no puede reaparecer: un material cuyo lote vencido YA
--    SE CONSUMIÓ debe poder salir con normalidad. Repite el insert anterior
--    sobre un material con caducidad pero NO vencido según la consulta 2.
--    ESPERADO: pasa sin error.
--
-- ── LO QUE ESTA MIGRACIÓN DEJA PENDIENTE, a propósito ────────
--   · DAR DE BAJA material vencido: no existe, y ahora hace más falta. Es lo
--     siguiente que necesita Almacén.
--   · PRESTAR material vencido sigue permitido. Prestar a otra obra lo que no
--     se puede usar aquí es endosarle el problema, así que probablemente
--     debería bloquearse también — pero eso es una decisión del dueño y no se
--     mete de tapadillo en una migración que trata de las salidas.
-- ============================================================
