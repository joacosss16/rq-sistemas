-- ============================================================
-- SEED FAMILIAS v2 — 82 familias de 'Materiales Final 31.07.xlsx'
-- (antes 58). PASO 1 de la carga del catalogo: correr ESTO primero,
-- verificar, y recien despues seed_catalogo.sql (los materiales).
--
-- BORRA el catalogo anterior entero (decision del dueño, 1 sep
-- 2026): materiales primero (apuntan a familias) y familias
-- despues. La 13 cambio de GRANITO a ASFALTO: conservar las
-- viejas mezclaria dos codificaciones. Repetible; solo corre con
-- el movimiento en cero (si hay, la clave ajena lo impide).
-- ============================================================

delete from public.materiales;
delete from public.familias;

insert into public.familias (iu, nombre) values
  ('01', 'ACEITE Y LUBRICANTE'),
  ('02', 'ACERO DE CONSTRUCCION LISO'),
  ('03', 'ACERO DE CONSTRUCCION CORRUGADO'),
  ('04', 'AGREGADO FINO'),
  ('05', 'AGREGADO GRUESO'),
  ('06', 'ALAMBRE Y CABLE DE COBRE DESNUDO'),
  ('07', 'ALAMBRE Y CABLE TIPO TW, THW, LSOH'),
  ('08', 'ALAMBRE Y CABLE TIPO WP, CPI'),
  ('09', 'ALCANTARILLA METALICA Y GUARDAVIAS'),
  ('10', 'APARATO SANITARIO CON GRIFERIA'),
  ('11', 'ARTEFACTO DE ALUMBRADO EXTERIOR'),
  ('12', 'ARTEFACTO DE ALUMBRADO INTERIOR'),
  ('13', 'ASFALTO'),
  ('14', 'BALDOSA ACÚSTICA'),
  ('15', 'BALDOSA ASFALTICA'),
  ('16', 'BALDOSA VINILICA Y PVC'),
  ('17', 'BLOCKER Y LADRILLO'),
  ('18', 'CABLE TELEFONICO Y DE RED'),
  ('19', 'CABLE NYY, N2XY, NPT, N2XOH, N2XSY'),
  ('21', 'CEMENTO PORTLAND'),
  ('24', 'CERAMICA Y PORCELANATO'),
  ('26', 'CERRAJERIA'),
  ('27', 'DETONANTE'),
  ('28', 'DINAMITA'),
  ('30', 'DÓLAR MAS INFLACION MERCADO USA'),
  ('31', 'PREFABRICADO DE CONCRETO'),
  ('32', 'FLETE TERRESTRE'),
  ('33', 'FLETE AEREO'),
  ('34', 'GASOHOL Y GASOLINA'),
  ('37', 'HERRAMIENTA MANUAL'),
  ('38', 'HORMIGON Y AFIRMADO'),
  ('39', 'INDICE DE PRECIOS AL CONSUMIDOR'),
  ('40', 'LOSETA Y TERRAZO'),
  ('41', 'MADERA EN TIRAS PARA PISO'),
  ('42', 'MADERA IMPORTADA PARA ENCOFRADO Y CARPINTERIA'),
  ('43', 'MADERA NACIONAL PARA ENCOFRADO Y CARPINTERIA'),
  ('44', 'MADERA TERCIADA NACIONAL'),
  ('45', 'MADERA TERCIADA PARA ENCOFRADO'),
  ('46', 'MALLA DE ACERO'),
  ('47', 'MANO DE OBRA'),
  ('48', 'MAQUINARIA Y EQUIPO DE CONSTRUCCION LIVIANO'),
  ('49', 'MAQUINARIA Y EQUIPO DE CONSTRUCCION PESADO'),
  ('50', 'MARCO Y TAPA DE FIERRO'),
  ('51', 'PERFIL DE ACERO AL CARBONO'),
  ('52', 'PERFIL DE ALUMINIO'),
  ('53', 'PETROLEO DIESEL'),
  ('54', 'PINTURA LATEX'),
  ('55', 'PINTURA TEMPLE'),
  ('56', 'PLANCHA ACERO LAC'),
  ('57', 'PLANCHA ACERO LAF'),
  ('58', 'PLANCHA DE ACERO MEDIANO LAC'),
  ('59', 'PLANCHA DE FIBROCEMENTO Y YESO'),
  ('60', 'PLANCHA DE POLIURETANO, POLIESTIRENO Y TERMOAISLANTE'),
  ('61', 'PLANCHA GALVANIZADA'),
  ('62', 'POSTE DE CONCRETO'),
  ('65', 'TUBERIA DE ACERO NEGRO Y/O GALVANIZADO'),
  ('66', 'TUBERIA DE PVC PARA LA RED DE AGUA POTABLE Y ALCANTARILLADO'),
  ('68', 'TUBERIA DE COBRE'),
  ('69', 'TUBERIA DE CONCRETO SIMPLE'),
  ('70', 'TUBERIA DE CONCRETO REFORZADO'),
  ('71', 'TUBERIA DE DE HIERRO FUNDIDO Y DUCTIL'),
  ('72', 'TUBERIA DE DE PVC PARA REDES INTERIORES'),
  ('73', 'DUCTO TELEFONICO DE PVC'),
  ('77', 'VALVULA DE BRONCE Y LATON'),
  ('78', 'VALVULA DE HIERRO Y ACERO'),
  ('79', 'VIDRIO'),
  ('80', 'CONCRETO PREMEZCLADO'),
  ('81', 'ADITIVO DE CONCRETO Y SIMILAR'),
  ('83', 'IMPLEMENTO Y ACCESORIO DE SEGURIDAD'),
  ('84', 'MADERA TERCIADA IMPORTADA'),
  ('85', 'PERFIL DE ACERO GALVANIZADO'),
  ('86', 'PINTURA ESMALTE Y EPOXICA'),
  ('87', 'PLANCHA CON CUBIERTA ALUZINC'),
  ('88', 'PLANCHA Y COBERTURA PLASTICA'),
  ('90', 'TUBERIA DE POLIETILENO'),
  ('91', 'GEOMEMBRANA Y GEOTEXTIL'),
  ('93', 'BIENES Y SERVICIOS AUXILIARES'),
  ('94', 'ENCOFRADO Y ANDAMIO PREFABRICADO'),
  ('95', 'EQUIPAMIENTO PERMANENTE DE OBRA'),
  ('97', 'ACTIVOS FIJO'),
  ('98', 'SISTEMA CENTRALIZADOS'),
  ('99', 'SISTEMA DE PUESTA A TIERRA');

-- Verificacion: 82 filas, para LEERLAS — la maquina cuenta,
-- el ojo reconoce un nombre mal pegado.
select count(*) as familias_debe_dar_82 from public.familias;
select iu, nombre from public.familias order by iu;
