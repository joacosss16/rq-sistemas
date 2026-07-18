import { useState, useMemo, useEffect } from 'react';

const CAT = [["010111","ACEITE MULTIUSO WD-40","UND","ACEITE Y LUBRICANTE"],["020109","ABRAZADERA 01 OREJA LIVIANA 5/8\"","UND","ACERO DE CONSTRUCCION LISO"],["020110","ABRAZADERA 01 OREJA LIVIANA 3/8\"","UND","ACERO DE CONSTRUCCION LISO"],["020111","ABRAZADERA 01 OREJA LIVIANA 1/2\"","UND","ACERO DE CONSTRUCCION LISO"],["030101","ACERO CORRUGADO G° 60 DE 1\" x 9M AA","VARILLA","ACERO DE CONSTRUCCION CORRUGADO"],["030102","ACERO CORRUGADO G° 60 DE 3/4\" x 9M AA","VARILLA","ACERO DE CONSTRUCCION CORRUGADO"],["030103","ACERO CORRUGADO G° 60 DE 5/8\" x 9M AA","VARILLA","ACERO DE CONSTRUCCION CORRUGADO"],["040111","ARENA FINA DE CUNYAC","M³","AGREGADO FINO"],["040121","ARENA GRUESA DE CANTERA HUAMBUTIO","M³","AGREGADO FINO"],["040122","ARENA GRUESA ROJA","M³","AGREGADO FINO"],["050111","CONFITILLO","M³","AGREGADO GRUESO"],["050112","HORMIGON","M³","AGREGADO GRUESO"],["050211","PIEDRA CHANCADA DE 1/2\"","M³","AGREGADO GRUESO"],["060111","CABLE DE COBRE DESNUDO 16Mm2","MTS","ALAMBRE Y CABLE DE COBRE DESNUDO"],["060112","CABLE DE COBRE DESNUDO 25Mm2","MTS","ALAMBRE Y CABLE DE COBRE DESNUDO"],["060113","BORNE DE TIERRA 25Mm2","UND","ALAMBRE Y CABLE DE COBRE DESNUDO"],["070111","CABLE NH-90 1.5 Mm2 COLOR AMARILLO TIERRA","MTS","ALAMBRE Y CABLE TIPO TW, THW, LSOH"],["070112","CABLE NH-90 1.5 Mm2 COLOR AZUL","MTS","ALAMBRE Y CABLE TIPO TW, THW, LSOH"],["070113","CABLE NH-90 1.5 Mm2 COLOR BLANCO","MTS","ALAMBRE Y CABLE TIPO TW, THW, LSOH"],["100110","INODORO FRIDA TREBOL","UND","APARATO SANITARIO CON GRIFERIA"],["100111","INODORO STELLA DE VAINSA","UND","APARATO SANITARIO CON GRIFERIA"],["100112","INODORO UNIVERSAL TREBOL","UND","APARATO SANITARIO CON GRIFERIA"],["110111","APLIQUE DE BRACKET EN PARED PARA EXTERIOR (TERRAZA)","UND","ARTEFACTO DE ALUMBRADO EXTERIOR"],["110121","APLIQUE DE PARED BRACKET EN FACHADA","UND","ARTEFACTO DE ALUMBRADO EXTERIOR"],["110131","APLIQUE DE PARED BRACKET EN LAVANDERIA DE PATIOS","UND","ARTEFACTO DE ALUMBRADO EXTERIOR"],["120111","APLIQUE DE PARED BRACKET CARSON BLANCO","UND","ARTEFACTO DE ALUMBRADO INTERIOR"],["120112","APLIQUE DE PARED BRACKET CARSON NEGRO","UND","ARTEFACTO DE ALUMBRADO INTERIOR"],["120113","APLIQUE DE PARED BRACKET LUXOR BLANCO","UND","ARTEFACTO DE ALUMBRADO INTERIOR"],["130101","RESINA","GL","GRANITO"],["130102","AEROSIL (ESPESANTE PARA RESINA)","UND","GRANITO"],["130103","COBALTO","ML","GRANITO"],["170111","LADRILLO BLOCKER 10 X 20 X 30 CM","UND","BLOCKER Y LADRILLO"],["170121","LADRILLO BLOCKER 12 X 20 X 30 CM","UND","BLOCKER Y LADRILLO"],["170211","LADRILLO DE TECHO 30X30X15","UND","BLOCKER Y LADRILLO"],["180111","CABLE HDMI","UND","CABLE TELEFONICO Y DE RED"],["180121","CABLE UTP CAT 6 x 305 m","MTS","CABLE TELEFONICO Y DE RED"],["180131","CONECTOR RJ-45 CAT-06","UND","CABLE TELEFONICO Y DE RED"],["190111","CABLE N2XOH TRIPLE 3-1X50Mm2, 1KV PVC/PVC, CLASE 2 (NYY)","MTS","CABLE NYY, N2XY, NPT, N2XOH, N2XSY"],["210112","CEMENTO PORTLAND TIPO IP (42.5kg) YURA®","UND","CEMENTO PORTLAND"],["240111","PORCELANATO PARA PISO DE BAÑOS","M²","CERAMICA Y PORCELANATO"],["240112","PORCELANATO PARA PARED DE BAÑOS","M²","CERAMICA Y PORCELANATO"],["240113","PORCELANATO PARA PARED DE LAVANDERIAS","M²","CERAMICA Y PORCELANATO"],["260111","BISAGRA PESADA 4X3\" PUERTA PRINCIPAL UYUSTOOLS NIQUELADO","PAR","CERRAJERIA"],["260121","BISAGRA CAPUCHINA BRONCEADA PESADA X-TREMA 3\"X3\"","PAR","CERRAJERIA"],["260131","BISAGRA OMEGA 3”X 3” INOX (VENEZIA)","PAR","CERRAJERIA"],["270111","FULMINANTE MARRÓN CAL. 22 x 100 und","UND","DETONANTE"],["300111","CABLE ACERADO 1/2\" CON ALMA DE ACERO","MTS","DOLAR MAS INFLACION MERCADO USA"],["300113","CABLE ACERADO 3/8\" CON ALMA DE ACERO","MTS","DOLAR MAS INFLACION MERCADO USA"],["300115","CABLE ACERADO 1/4\" CON ALMA DE ACERO","MTS","DOLAR MAS INFLACION MERCADO USA"],["310111","DADO DE CONCRETO DE 2.5 CM","UND","PREFABRICADO DE CONCRETO"],["310112","DADO DE CONCRETO DE 4 CM","UND","PREFABRICADO DE CONCRETO"],["310113","DADO DE CONCRETO DE 7 CM","UND","PREFABRICADO DE CONCRETO"],["340111","GASOLINA REGULAR 90 OCTANOS","GLN","GASOHOL Y GASOLINA"],["370110","BROCA ACERO (HSS) 1/2\"","UND","HERRAMIENTA MANUAL"],["370111","BROCA ACERO (HSS) 1/4\"","UND","HERRAMIENTA MANUAL"],["370112","BROCA ACERO (HSS) 1/8\"","UND","HERRAMIENTA MANUAL"],["390110","BANCA DE PLASTICO COLOR BLANCO CON ESPALDAR","UND","INDICE DE PRECIOS AL CONSUMIDOR"],["390111","AGENDA AÑO ACTUAL","UND","INDICE DE PRECIOS AL CONSUMIDOR"],["390112","CARTEL INFORMATIVO DE OBRA Y PUBLICITARIO","UND","INDICE DE PRECIOS AL CONSUMIDOR"],["420111","HOJA DE PUERTA INTERIOR ANCHO 0.65_ ALTURA 2.07_ ESPESOR 0.04","UND","MADERA IMPORTADA PARA ENCOFRADO Y CARPINTERIA"],["420112","HOJA DE PUERTA INTERIOR ANCHO 0.70_ ALTURA 2.07_ ESPESOR 0.04","UND","MADERA IMPORTADA PARA ENCOFRADO Y CARPINTERIA"],["420113","HOJA DE PUERTA INTERIOR ANCHO 0.75_ ALTURA 2.07_ ESPESOR 0.04","UND","MADERA IMPORTADA PARA ENCOFRADO Y CARPINTERIA"],["430111","CUARTON DE 2  X 10 PULG X 10 PIES (PARA JAMBA)","UND","MADERA NACIONAL PARA ENCOFRADO Y CARPINTERIA"],["430112","ACCESORIOS DE SERIE CORTAFUEGO (BISAGRAS 3MM, TORNILLOS SINCADOS, JUNTA INTUMESCENTE DE GRAFITO, CERRADURA DE DOBLE NUECA EMBUTIDA, MANIJA CON ALMA DE ACERO FORRADA POR FUSION)","UND","MADERA NACIONAL PARA ENCOFRADO Y CARPINTERIA"],["430113","BARRA ANTIPÁNICO PARA PUERTA CORTAFUEGO TIPO PUSH","UND","MADERA NACIONAL PARA ENCOFRADO Y CARPINTERIA"],["440111","TRIPLAY TIPO CORRIENTE 1.22 X 2.44 M.","UND","MADERA TERCIADA NACIONAL/ TERCIADA PARA ENCOFRADO"],["460111","MALLA GALLINERO","UND","MALLA DE ACERO"],["460211","MALLA OLIMPICA","M²","MALLA DE ACERO"],["480111","APLICADOR SALCHICHA","UND","MAQUINARIA Y EQUIPO DE CONSTRUCCION LIVIANA"],["480112","APLICADOR PARA SIKA ANCHORFIX 3001","UND","MAQUINARIA Y EQUIPO DE CONSTRUCCION LIVIANA"],["480121","PISTOLA DE CALOR GRADUAL MARCA BOSH","UND","MAQUINARIA Y EQUIPO DE CONSTRUCCION LIVIANA"],["510111","ANGULO DE ACERO 1-1/2\" X 1-1/2\" X 1/8\" X 6M","UND","PERFIL DE ACERO AL CARBONO"],["510112","ANGULO DE ACERO 1\"  X 1\" X 1/8 X 6M","UND","PERFIL DE ACERO AL CARBONO"],["510113","ANGULO DE ACERO 2\" X 2\" X 1/8 X 6M","UND","PERFIL DE ACERO AL CARBONO"],["520111","ANGULO DE ALUMINIO 1-1/2 X 1-1/2 X 5.95M INTERMEDIO color Negro","VARILLA","PERFIL DE ALUMINIO"],["520112","ANGULO DE ALUMINIO 5/8 X 5.95M/ CON PORTAFELPA color Negro","UND","PERFIL DE ALUMINIO"],["520113","ANGULO DE ALUMINIO ESPIGUERO 1 X 1-1/2 X 1.3 MM","VARILLA","PERFIL DE ALUMINIO"],["530101","PETROLEO","GLN","PETROLEO DIESEL"],["540111","IMPRIMANTE CPP X 4GL","UND","PINTURA LATEX"],["540211","DURALATEX CPP AMARILLO OCRE X 1GL","UND","PINTURA LATEX"],["540212","DURALATEX CPP ALABASTRO X 4GL","UND","PINTURA LATEX"],["590111","CINTA DE PAPEL PARA DRYWALL 2\" / 250 X 75 M","UND","PLANCHA DE FIBROCEMENTO Y YESO"],["590112","CINTA MALLA","UND","PLANCHA DE FIBROCEMENTO Y YESO"],["590113","CINTA MICROPERFORADA PARA POLICARBONATO","UND","PLANCHA DE FIBROCEMENTO Y YESO"],["600111","CASETON POLIESTIRENO 15X30X3.00M D-12kg/M3","UND","PLANCHA DE POLIURETANO, POLIESTIRENO y TERMOAISLANTE"],["600112","CASETON POLIESTIRENO 20X30X3.00M D-12kg/M3","UND","PLANCHA DE POLIURETANO, POLIESTIRENO y TERMOAISLANTE"],["600113","CASETON POLIESTIRENO 30X30X3.00M D-12kg/M3","UND","PLANCHA DE POLIURETANO, POLIESTIRENO y TERMOAISLANTE"],["610111","CALAMINA GALVANIZADA DE 0.30 mm x 0.83 m x 3.6 m","UND","PLANCHA GALVANIZADA"],["610121","PLANCHA 1/32 PULG PLEGADA PARA CANALETAS DE TECHO","MTS","PLANCHA GALVANIZADA"],["610131","PLANCHA PLEGADA GALVANIZADA ( 1/16\" ) 1.5X1200X2400MM","UND","PLANCHA GALVANIZADA"],["620210","CAJA DE PASO METALICA 10 X 10 CM","UND",""],["620211","CAJA DE PASO METALICA 15 X 15 CM","UND",""],["620212","CAJA DE PASO METALICA 20 X 20 CM","UND",""],["650131","TUBO DE ACERO REDONDO 1 1/4''X1.8MM","UND","TUBERIA DE ACERO NEGRO Y/O GALVANIZADO"],["650132","TUBO DE ACERO REDONDO 1/2\" X1.8MM","UND","TUBERIA DE ACERO NEGRO Y/O GALVANIZADO"],["650133","TUBO DE ACERO REDONDO 1\" X1.8MM","UND","TUBERIA DE ACERO NEGRO Y/O GALVANIZADO"],["710112","ACOPLE RIGIDO RANURADO 4\"-114.3mm LUYUAN® XGQT2","UND","TUBERIA DE DE HIERRO FUNDIDO Y DUCTIL"],["720111","ADAPTADOR DE 4\" PVC DESAGUE PESADO TUBO NARANJA A GRIS","UND","TUBERIA DE DE PVC PARA REDES INTERIORES"],["720112","ADAPTADOR DE 6\" PVC DESAGUE PESADO TUBO NARANJA A GRIS","UND","TUBERIA DE DE PVC PARA REDES INTERIORES"],["720121","CODO 2\"X45º PVC SAL","UND","TUBERIA DE DE PVC PARA REDES INTERIORES"],["770111","VALVULA CHECK SWING RANURADA FLOWCOM DE 4” UL/FM","UND","VALVULA DE BRONCE Y LATON"],["770121","VALVULA ANGULAR/ TOMA DE BOMBEROS DE BRONCE H/M A-56 C/R NTP UL/FM de 2 ½” SOON POOL.","UND","VALVULA DE BRONCE Y LATON"],["770131","VALVULA SIAMESA CROMADO TIPO POSTES O PARED + CLAPER UL/FM. Incluye tapas y cadena","UND","VALVULA DE BRONCE Y LATON"],["790111","VIDRIO LAMINADO PAVONADO DE 6MM","UND","VIDRIO"],["790112","VIDRIO LAMINADO INCOLORO 6MM","UND","VIDRIO"],["790113","VIDRIO LAMINADO INCOLORO 8MM","UND","VIDRIO"],["810111","ADITIVO IMPERMEABILIZANTE DE CONCRETO SIKA-1 EN POLVO 1KG","UND","ADITIVO DE CONCRETO Y SIMILAR"],["810121","ADITIVO ACELERANTE DE CONCRETO SIKA-2 LIQUIDO","UND","ADITIVO DE CONCRETO Y SIMILAR"],["810122","SIKACEM® ACELERANTE PE O SIKA®-3 + ENVACE DOSIFICADOR X m","UND","ADITIVO DE CONCRETO Y SIMILAR"],["830112","CAMILLA RIGIDA - INMOVILIZADOR - CORREA SPIDER - COLLARIN CERVICAL","UND","IMPLEMENTO Y ACCESORIO DE SEGURIDAD"],["830113","FRASCO DE AGUA OXIGENADA MEDIANO 120 ML.","UND","IMPLEMENTO Y ACCESORIO DE SEGURIDAD"],["830115","FRASCO DE SOLUCION DE CLORURO DE SODIO AL 0.9% X 1L.","UND","IMPLEMENTO Y ACCESORIO DE SEGURIDAD"],["840101","TRIPLAY FENOLICO DE 18MM","UND","MADERA TERCIADA IMPORTADA"],["840211","PISO SPC COLOR HX-001","M²","MADERA TERCIADA IMPORTADA"],["840212","PISO SPC COLOR HX-003","M²","MADERA TERCIADA IMPORTADA"],["850110","RIEL 39MM","UND","PERFIL DE ACERO GALVANIZADO"],["850111","RIEL 65MM","UND","PERFIL DE ACERO GALVANIZADO"],["850112","PARANTE 38MM","UND","PERFIL DE ACERO GALVANIZADO"],["860111","BASE ZINCROMATO MAESTRO - PINTURA BASE PARA METAL","GLN","PINTURA ESMALTE Y EPOXICA"],["860112","ETCHING PRIMER (LÍNEA AUTOMOTRIZ, PRIMER, SHERWIN WILLIAMS)","UND","PINTURA ESMALTE Y EPOXICA"],["860113","ACTIVADOR ETCHING PRIMER SHERWIN WILLIAMS","UND","PINTURA ESMALTE Y EPOXICA"],["870111","ALUZINC TR5 0.40 mm (Calibrado)","M²","PLANCHA CON CUBIERTA ALUZINC"],["870112","ALUZINC DE 1.95M","UND","PLANCHA CON CUBIERTA ALUZINC"],["870113","ALUZINC DE 3.20M","UND","PLANCHA CON CUBIERTA ALUZINC"],["880111","CAJA DE REGISTRO PVC POLIPROPILENO","UND","PLANCHA Y COBERTURA PLASTICA"],["880112","CAPUCHONES PARA TEJA ANDINA","UND","PLANCHA Y COBERTURA PLASTICA"],["900111","TUBO THC BETA  DE 20MM CLASE 12.5  PP-RCT (5.80 m)","UND","TUBERIA DE POLIETILENO"],["900112","TUBO THC BETA  DE 20MM CLASE 16  PP-RCT (5.80 m)","UND","TUBERIA DE POLIETILENO"],["900113","TUBO THC BETA  DE 25MM CLASE 12.5  PP-RCT (5.80 m)","UND","TUBERIA DE POLIETILENO"],["930111","ACIDO DISOLVENTE PARA ZONDEO DE TUBO DE CABLEADO","UND","BIENES Y SERVICIOS AUXILIARES"],["930121","ACIDO MURIATICO","UND","BIENES Y SERVICIOS AUXILIARES"],["930151","ALCOHOL ISOPROPILICO 90% x 1litro","UND","BIENES Y SERVICIOS AUXILIARES"],["940111","PUNTAL METALICO DE ACERO EXTENDIBLE 3.2M","UND","ENCOFRADO Y ANDAMIO PREFABRICADO"],["950111","CAMPANA EXTRACTORA EXTRAIBLE EASYFLOW 60CM FDV","UND","EQUIPAMIENTO PERMANENTE DE OBRA"],["950112","CAMPANA EXTRACTORA NEW CRYSTAL 90CM FDV","UND","EQUIPAMIENTO PERMANENTE DE OBRA"],["950113","CAMPANA EXTRACTORA DECORATIVA NEW CRISTAL 60CM FDV","UND","EQUIPAMIENTO PERMANENTE DE OBRA"],["960547","CONCRETO PREMEZCLADO f`c=280kg/cm2","M³","CONCRETO"],["960548","CONCRETO PREMEZCLADO f`c=140kg/cm2","M³","CONCRETO"],["960549","CONCRETO PREMEZCLADO f`c=210kg/cm2","M³","CONCRETO"],["970610","REFLECTOR 100W","UND","ACTIVOS FIJO"],["970611","REFLECTOR 150W","UND","ACTIVOS FIJO"],["970612","REFLECTOR 200W","UND","ACTIVOS FIJO"],["980101","SISTEMA DE RIEGO POR GOTEO SEGÚN COTIZACION","GBL","SISTEMA CENTRALIZADOS"],["980102","SISTEMA DE DETECTOR DE HUMO CENTRALIZADO SEGÚN COTIZACION","GBL","SISTEMA CENTRALIZADOS"],["990101","SAL INDUSTRIAL PARA POZO A TIERRA","BLS","SISTEMA DE PUESTA A TIERRA"]];

const PROV_BASE = [["20564332365","GP TRANSPORTES E.I.R.L."],["20114689425","COMPAÑIA ELECTRICA INGENIEROS SOCIEDAD COMERCIAL DE RESPONSABILIDAD LIMITADA"],["20278641717","VALCOSA INGS. SOCIEDAD COMERCIAL DE RESPONSABILIDAD LIMITADA - VALCOSA INGS. S.R.L."],["20358035052","VIDRIERIA UNIVERSO EIRL"],["20103365628","DISTRIBUCIONES OLANO S.A.C."],["10238508903","SALAS ESCOBAR RUTH ASUNCION"],["20604054771","ACEROS INVERSIONES SUR S.R.L."],["20564341607","DISTRIBUCIONES TRIMAQ E.I.R.L"],["10239427397","HOLGUIN CHAPARRO WILDE"],["20601638321","FERRETERIA RECORD CUSCO E.I.R.L."],["20138651917","SANICENTER S.A.C."],["20604004986","INVERSIONES MELIN SOCIEDAD COMERCIAL DE RESPONSABILIDAD LIMITADA"],["20454838514","LUCIO BUSTAMANTE E HIJOS S.A.C."],["20466776336","CENTRO CERAMICO LAS FLORES SAC."],["20613127764","INGENIERIA Y SERVICIOS ELECTROCENTER SOCIEDAD ANONIMA CERRADA"],["20607032875","COFERMA CUSCO EMPRESA INDIVIDUAL DE RESPONSABILIDAD LIMITADA"],["10475861383","VEGA TACAR YAJAIRA MILUSKA"],["20609641755","MASTERTAB ELECTRIC COMPANY SOCIEDAD ANONIMA CERRADA"],["20527938741","OL&VER TEAM EMPRESA INDIVIDUAL DE RESPONSABILIDAD LIMITADA"],["10441068668","OLIVERA UGARTE ADISON ANDRES"],["10465458696","RIVERA ORTIZ ROSA ANGELICA"],["20490831577","PERNO LOCO SOCIEDAD COMERCIAL DE RESPONSABILIDAD LIMITADA - PERNO LOCO S.R.L."],["20607703257","INVERSIONES MODUGLASS SOCIEDAD ANONIMA CERRADA"],["20536557858","HOMECENTERS PERUANOS S.A."],["20603801971","CASA TUBO CUSCO EMPRESA INDIVIDUAL DE RESPONSABILIDAD LIMITADA - CASA TUBO CUSCO E.I.R.L."],["20613340093","EOSS TECHNOLOGY SOCIEDAD ANONIMA CERRADA"],["20112273922","TIENDAS DEL MEJORAMIENTO DEL HOGAR S.A."],["10413889168","CABALLERO NINANCURO ROXANA"],["20614322587","GRUPO KIM XI PERU SAC"],["20609585081","INVERSIONES PLACARED E.I.R.L."],["20609482193","SOLUCIONES Y NEGOCIOS BJP E.I.R.L."],["20527319766","MANUFACTURAS ELECTRICAS Y SANITARIAS EMPRESA INDIVIDUAL DE RESPONSABLIDAD LIMITADA"],["20605054774","CONSTRUCTORA E INMOBILIARIA MAJSER SOCIEDAD ANONIMA CERRADA - MAJSER S.A.C."],["20191731434","PROMOTORA DEL ACERO SOCIEDAD DE RESP LTD"],["20608344587","MARO GROUP BUSINESS SOCIEDAD ANONIMA CERRADA"],["20537196786","IMPORTACION Y EXPORTACION COKALMAYO SOCIEDAD ANONIMA CERRADA - IMPORTACION Y EXPORTACION COKALMAYO"],["20613296345","GRUPO PERNO LOCO EMPRESA INDIVIDUAL DE RESPONSABILIDAD LIMITADA"],["20490186906","CORPORACION ANITA EMPRESA INDIVIDUAL DE RESPONSABILIDAD LIMITADA - CORPORACION ANITA EIRL"],["20603636946","INVERSIONES ILLIMANI E.I.R.L."],["20523341449","INTI REPRESENTACIONES S.A.C."],["20545889685","CORRALES & CIA S.A.C"],["20600504071","MATIZADOS Y SERVICIOS CALLAO S.R.L."],["20557942271","CORPORACION DAYLUM S.A.C."],["20490817078","INVERSIONES MULTIGLASS CUSCO E.I.R.L"],["20604808252","INVERSIONES Y REPRESENTACIONES PARDO EIRL"],["10238576411","LLANCAY SOTO IRMA"],["10060815238","CCONCHA CCONOCHUILLCA AUREA"],["20600848802","CORPORACION VILLAGAS S.A.C."],["44337112","FRANKLIN EDILSON GARCIA QUISPE"],["20613219120","FERRETERIA LA SOLUCION L&K EIRL"],["20400207489","LATINO SERVIS S.R.L."],["10239669978","MENDOZA CCANSAYA FLAVIO"],["20606109343","SOLANA COMERCIAL S.A.C."],["20609167948","GRUPO INVERSIONES CHACON E.I.R.L"],["10239609754","LENES TACURI WILFREDO"],["72735190","KARINA SACSI ALFARO"],["20605466754","GRUPO EDITORA AQUARELA S.A.C."],["20603735227","CORPORACION EL LOCO EIRL"],["10405917128","GRAJEDA CALLAPIÑA YANET"],["24705629","ERIC ENRIQUEZ CASTELO"],["20454073143","LA POSITIVA VIDA SEGUROS Y REASEGUROS"],["20612886955","EMPRESA DE SERVICIOS MULTIPLES CENTAURO S.R.L."],["71893344","LUCIA FERNANDA CHIHUANTITO PALOMINO"],["10238337904","MASCO ARRIOLA RITA MARGARITA"],["20467534026","AMERICA MOVIL PERU SAC  CLARO"],["20601978572","LA POSITIVA S.A."],["20611606223","INSERCOM LINK S.A.C."],["20450626784","VIDRIERIA 28 DE JULIO E.I.R.L"],["20159308881","MUNICIPALIDAD DISTRITAL DE WANCHAQ"],["15491126024","LEI YANPING"],["20609356261","CASACOLOR PERU S.A.C."],["10239352770","DUEÑAS HUILLCACASIANA"],["20609033976","INVERSIONES & SERVICIOS RAICES S.A.C."],["20512528458","SHALOM EMPRESARIAL S.A.C."],["23865089","MONICA DEL CASTILLO ZEGARRA"],["20602456537","FLUYEBOTTLE S.A.C."],["20400084387","INSA INGENIEROS EIRL"],["20610782494","M & S CLIMA S.A.C."],["20607496821","CORPORACION VIMAXFER S.A.C."],["20600098633","CRECER SEGUROS S.A. COMPAÑÍA DE SEGUROS"],["23922060","SONNIE ROXANA OCHOA JARA"],["20603099088","CORPORACION ACUARIO EXPRESS S.A.C."],["20610775161","PROCON PERU S.A.C."],["20474674208","CARGUEROS RAPIDOS Y SERVICIOS OPORTUNOS S.A.C."],["20608902229","BUILD LOGISTIC E.I.R.L."],["20490228919","FERRETERIA DON BOSCO S.C.R.L."],["10239463351","COLQUE LIZARASO JUAN DARIO"],["20564059090","MULTISERVICIOS JAQUELINE E.I.R.L."],["10459604371","CHILE LENES RUTH VERONICA"],["10436544753","VERGARA CONTO EDITH"],["20600628772","GRUPO TECNOLOGIA SAM S.A.C."],["10244950057","SUTTARAURA CONDORI GREGORIO"],["20564195864","CHIFA PEKIN XIAM E.I.R.L."],["20609667312","INVERSIONES SHULAN'S POLLOS Y PARRILLAS S.A.C"],["20491012791","POLLOS BRASS LAS DELICIAS S.R.L."],["20564488021","INVERSIONES CAJIGAS M & R S.R.L."],["10238068725","PACHECO MERCADO ORLANDO"],["10240054499","LUCILA ANTONIETA OCAMPO DELAHAZA"],["70606050","YULIANO YOSET MADERA GIBAJA"],["20608052497","BEEF AND BEER CUSCO S.A.C."],["20608268520","HOSTILINK S.A.C."],["10411561076","TORRES MONTES JOSE ANTONIO"],["20177217043","MUNICIPALIDAD PROVINCIAL DEL CUSCO"],["20604079803","FERRECENTRO LUIS EIRL"],["10471144369","HUAMAN SUÑA DINA"],["10730762815","HUAMAN HUAMAN ROSMERY"],["47887171","LUCIA ALEXANDRA ARANA RUIZ"],["75803530","YHEYSON CCOICCOSI BACA"],["20608981552","TECSER INVERSIONES  EIRL"],["20556230154","TEKA KUCHENTECHNIK PERU S.A."],["20392965191","CONCRETOS SUPERMIS S.A."],["20600921925","C.B.C. INVERSIONES DEL SUR S.A.C."],["20166958238","SUNARP - OFICINA REGISTRAL DE CUSCO"],["20136353315","SEDACUSCO S.A."],["20608762354","TAEEM SAC"],["20612733172","INVERSIONES FERRETERA BJP E.I.R.L"],["SOAT","LA POSITVIA SEGUROS Y REASEGUROS"],["20611940590","SAM MARTINA EIRL"],["20114701221","REPUESTOS LIMA S.R.L."],["20564430294","INVERSIONES DELISSE CUSCO S.A.C."],["20527002304","ARGENSA EXPRESS EIRL"],["10403687419","HOLGADO NOA LISBETH"],["77418950","BENSHY MONTALVO VALVERDE"],["20116544289","ELECTRO SUR ESTE"],["20609359197","GALPON METELE DIENTE E.I.R.L"],["10239586177","JANCCO CARAZAS MARUJA"],["10459570743","CATALAN FERRO MIRIAM MILADY"],["10239671166","CARRION SALINAS KARIN PILAR"],["10414359197","ORELLANA ALAVE EDWIN"],["20612087572","H&N MABEK SAC"],["10106580117","MANTILLA HUAYHUA EDITH JHONNY"],["45603274","FRIDA OCHOA NINA"],["72089624","ADRIANA GALLO TERRAZAS"],["20564347982","SUPERMERCADO LA CANASTA EIRL"],["20600813367","CORPORACION MADERERA DEL SUR SEÑOR DE HUANCA"],["10762693149","HUAMANI QUISPE ROCIO"],["20108813742","ASCENSORRES ANDINOS INGENIEROS S.A."],["10772221741","CHARA SALGADO YURI"],["10454014672","CABRERA FIGUEROA CESAR ARMANDO"],["10081366620","MARCO ANTONIO ZEGARRA ACEVEDO"],["20317082062","PLASTICOS 2000 SRL"],["20602586597","AROMAS DEL SUR SAC"],["20450752496","F&J LA CANASCA SCRL"],["20454520425","PROTEOUS SECURITY SAC"],["20606476338","BUK SAC"],["10105215504","YAVARINO VARA ZENOVIA"],["SUNARP","SUNARP"],["10240004645","ÑAUPA HUANA ADRIAN"],["20611310294","INVERSIONES AGUILARSA EIRL"],["10764546917","MEDINA SANCHEZ GIANELLA DEL CARMEN"],["10463402243","MAMANI CHOQUEHUANCA DENIA MEDELY"],["10710938704","DIANA GABRIELA OLAVE CUBA"],["20490773275","INDUSTRIA DE MAQUINARIAS ARIOS SCRL"],["20607243329","ARTE ACTIVA SAC"],["10479689348","JIMENEZ SALAZAR ENSO KRUGER"],["20547030312","A & D MANUFACTURAS ELECTRICAS SCRL"],["20127765279","COESTI S.A."],["43906383","DIANA MARGOT MOLINA CORRALES"],["20608430301","BOTICAS IP S.A.C."],["10461704846","ALFARO CURO JUDITH FABIOLA"],["10720019171","CRUZ PALOMINO ALEXANDRA ESTEFANI"],["20609945177","CENTRO DE INSPECCIONES TECNICO VEHICULARES SEÑOR DE HUANCA S.A.C."],["20600410882","PROSEMACO EIRL"],["20498189637","AREQUIPA EXPRESO MARVISUR EIRL"],["10441213137","CUBA CANDIA ROXANA"],["20527292469","LA CASA DEL PLOMERO SAC"],["20277577314","SERVICENTRO JAKELINE S.A.C."],["20608280333","COMPAÑÍA HARD DISCOUNT S.A.C."],["73486961","MARYORY CUSIHUALLPA HUAMAN"],["20517207331","PROTECTA S.A."],["20600178106","HIDRO SERVICE INGS E.I.R.L."],["20490604678","NEUMENN INVERSIONES E.I.R.L"],["10439758789","SOLORZANO BUENDIA RENE ANDRES"],["44517844","ROBERT APAZA VALENCIA"],["20147297638","COLEGIO DE ARQUITECTOS DEL PERU - CONSEJO REGIONAL CUSCO"],["20606923555","GEOSIL LABORATORIO DE MECANICA DE SUELOS S.A.C."],["20527327602","SERVICOPIAS JAQUELINE E.I.R.L."],["20564129489","INDUSTECFER E.I.R.L"],["20613621416","ERNABY S.A.C."],["20600280172","ORION SUPERMERCADOS PAPA DE AMERICA S.A."],["20602389970","BOTICA IRSA MEDICAL S.A.C."],["20610196030","POLIBATEX S.A.C."],["20564395014","LIBRERÍA MILAGRITOS S.R.L."],["15450561740","LE MINGYU"],["10770992651","CABALLERO CANAVALERYA"],["10708137133","PAZ SAAVEDRA KELLY YOSMAR"],["15527801106","YE NENGBO"],["20608034430","GRUPO GLOBAL ELECTRIC E.I.R.L"],["10600173192","MANCILLA VASQUEZ LUIS DONATO"],["20492092313","MAKRO SUPERMERCADO MAYORISTA S.A."],["20613259482","DISTRIBUIDORA MEGA BEN & VERAS H.P. E.I.R.L"],["10294215218","LLICA VASQUEZ PATRICIA ROSARIO"],["10238671995","QUISPE LEGUIA RICHARD"],["20490677713","PANADERIA SNACK POVEA G&F E.I.R.L."],["73977827","JAVIER ABEL MUÑIZ CANDIA"],["10751529240","ROY SMTH ARANIBAR JALANOCA"],["10239820676","TUMA HUAMAN FELIPE"],["20613180452","GRIFERIAS Y REPUESTOS FBF E.I.R.L."],["20612289442","LLIMPIY E.I.R.L."],["10487441363","MANDURTUPA CCOA JOSUE ELIAS"],["20603057873","DISESEPI EIRL"],["S/R","BANCO DE LA NACION"],["20515659324","TURISMO INTERNATIONAL PALOMINO SAC"],["20508565934","HIPERMERCADOS TOTTUS S.A."],["20516400472","KITCHEN CENTER SAC"],["10800004468","MENDOZA FLORES ALBERT"],["10765844610","QUISPE YANA NAGUELY LIZBETH"],["20601601614","C & M SPORTS BUSINESS EIRL"],["10428217824","ARIAS ROMERO KATIA LUZ"],["75945522","JOSE FERNANDO CHALLCO FARFAN"],["10207106530","QUISPE CARDENAS EDWIN"],["20490590600","EL OFERTON PAPELERIA Y SUMINISTROS EIRL"],["20502105613","SERVICIOS RIGAL SAC"],["10238594354","YAUTA JIMENEZ MARTHA"],["20556248444","CORPORACION EBENEZER PERU SAC"],["20498456856","EMPRESA DE TRANSPORTES Y SERVICIOS GENERALES TRANSMOTAR SAC"],["20600780108","CORPORACION PINTEKOLOR EIRL"],["20527343802","GRIFO SAN MARTIN SAC"],["20490929461","MUEBLERIA Y DECORACIONES GRECIA EIRL"],["10239908409","VASQUEZ CORRALES YONI"],["10436120805","VALDEZ FRISANCHO ERIKA"],["70181729","FERNANDO ROMERO QUISPEINGA"],["20526830688","OXICUSCO S.R.L"],["20490132997","EFERSA EXTINTORES SCRL"],["20527208000","PETROCENTRO URUBAMBA SAC"],["20527303410","PETROCENTRO GUEVARA EIRL"],["10728633285","OBLITAS RIMAYHUAMAN YORVHELY GUSTAVO"],["10462910857","VILLAFUERTE LOAIZA EVELIN NAYRUTH"],["10242855537","ZEVALLOS AMAT BALTAZAR"],["20606112271","HIDROECOTEC EIRL"],["10239624265","TACURI HALANOCCA BENIGNO GREGORIO"],["20614472571","DIST. E INV. VARGAS EIRL"],["20611240661","CORPORACION KEYAM SAC"],["20607629545","TRIPLE AAA COMPANY SRL"],["20611952296","HIDROZEL AGRICOLA SAC"],["73264789","FRANK HUALLPAYUNCA USCAPI"],["23857692","SUSAN BARREDA SAYHUA"],["10719144000","QUISPE RIMACHE MARY CIELO"],["71809188","NELIDA CONDORI HUAMAN"],["20613168568","GRUAS Y EQUIPOS POISON EIRL"],["20521872145","FORESTAL SANTA ROSA SAC"],["20542646820","JATSA SERVICIOS GENERALES EIRL"],["10471434782","SOLIS CABEZA YONATAN"],["20611199245","M y M PISOS Y PARQUET EIRL"],["10425565261","OSTUA VASQUEZ YOBANA ALICIA"],["20601787181","HJ JERICO EIRL"],["20608147412","MULTISERVICIOS Y FRENOCARD SOMAS EIRL"],["10420702006","CAPCHA TUPAYACHI ELVA PAOLA"],["10238716662","VERA CUSIYUPANQUI OLINDA ANTONIA"],["20600705289","INVERSIONES CECO SAC"],["10408464213","QUIÑONES ÑAUPA HUGO"],["73202152","JHOLY GABRIELA GUTIERREZ ENRIQUEZ"],["70900417","RENZO DANILO OLAVE SALAS"],["71559744","DAVID MARCELO CAMERO VALENCIA"],["20613622340","MAJO COMPANY S.A.C."]];

const HOY = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();
const HOY_ISO = `${HOY.getFullYear()}-${String(HOY.getMonth() + 1).padStart(2, '0')}-${String(HOY.getDate()).padStart(2, '0')}`;
const fmt = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: '2-digit' }) : '—';
const dias = (a, b) => Math.round((new Date(a + 'T00:00:00') - new Date(b + 'T00:00:00')) / 86400000);
const diasHoy = f => dias(f, HOY_ISO);

const PROYECTOS = [['2501', 'EMPERATRIZ'], ['2502', 'DANAUS'], ['2503', 'MAIA'], ['2504', 'LUZ'], ['2601', 'TORRE COPACABANA']];
const ALMACENEROS = { 'LUZ': 'Brayan Huamán', 'MAIA': 'Anton Taucca' };
const ESTADOS_LOGISTICA = ['—', 'En camino', 'Entregado', 'Incompleto'];
const ESTADOS_PAGO = ['—', 'Pagado', 'Crédito', 'Falta'];
const MOTIVOS_USO = ['No se completó el trabajo', 'Se encontró botado', 'Uso inadecuado', 'Otro'];
const FORMAS_PAGO = ['Contado', 'Transferencia', 'Crédito 15 días', 'Crédito 30 días'];

const USUARIOS = [
  { u: 'gerencia', p: '1234', rol: 'gerente', nombre: 'Gerencia de Operaciones' },
  { u: 'compras', p: '1234', rol: 'compras', nombre: 'Lucía Arana' },
  { u: 'residente.danaus', p: '1234', rol: 'residente', nombre: 'Andrés Chino', proyecto: 'DANAUS' },
  { u: 'residente.maia', p: '1234', rol: 'residente', nombre: 'Edwin Salas', proyecto: 'MAIA' },
  { u: 'almacen.luz', p: '1234', rol: 'almacen', nombre: 'Brayan Huamán', proyecto: 'LUZ' },
  { u: 'almacen.maia', p: '1234', rol: 'almacen', nombre: 'Anton Taucca', proyecto: 'MAIA' },
];
const TABS_POR_ROL = {
  gerente: [['res', 'Residente'], ['com', 'Compras'], ['alm', 'Almacén'], ['cat', 'Catálogo'], ['tab', 'Tablero']],
  compras: [['com', 'Compras'], ['cat', 'Catálogo'], ['tab', 'Tablero']],
  residente: [['res', 'Mis requerimientos']],
  almacen: [['alm', 'Mi almacén']],
};
const TAB_INICIAL = { gerente: 'tab', compras: 'com', residente: 'res', almacen: 'alm' };

const STORE_KEY = 'sistema_rq_copacabana_v1';
function cargarEstado() {
  try { return JSON.parse(window.localStorage.getItem(STORE_KEY)) || {}; } catch (e) { return {}; }
}
function guardarEstado(data) {
  try { window.localStorage.setItem(STORE_KEY, JSON.stringify(data)); } catch (e) { /* sin persistencia disponible */ }
}

function canalDe(items) {
  const fs = items.filter(i => i.fecha).map(i => diasHoy(i.fecha));
  if (!fs.length) return null;
  const m = Math.min(...fs);
  if (m < 2) return { k: 'URGENTE', cls: 'bg-red-950 text-red-400 border-red-800' };
  if (m <= 7) return { k: 'GENERAL', cls: 'bg-green-950 text-green-400 border-green-800' };
  return { k: 'ESPECIAL LIMA', cls: 'bg-yellow-950 text-yellow-400 border-yellow-800' };
}

const pillEstado = e =>
  e === 'Pendiente' ? 'bg-yellow-950 text-yellow-400'
  : e === 'Aprobado' ? 'bg-green-950 text-green-400'
  : e === 'En camino' ? 'bg-sky-950 text-sky-400'
  : e === 'Entregado' ? 'bg-blue-950 text-blue-400'
  : e === 'Incompleto' ? 'bg-orange-950 text-orange-400'
  : e === 'Rechazado' ? 'bg-red-950 text-red-400'
  : e === 'Anulado' ? 'bg-slate-800 text-red-300 line-through'
  : e === 'Prestado' ? 'bg-purple-950 text-purple-400'
  : e === 'Devuelto' ? 'bg-green-950 text-green-400'
  : e === 'Transferido' ? 'bg-sky-950 text-sky-400'
  : 'bg-slate-800 text-slate-500';

const inputCls = "bg-slate-950 border border-slate-700 text-slate-100 px-2 py-1.5 rounded text-xs outline-none focus:border-yellow-400";
const lblCls = "block text-[10px] font-bold tracking-widest text-slate-500 uppercase mb-1";
const thCls = "text-left text-[9px] font-bold tracking-widest text-slate-500 uppercase py-2 px-1.5 border-b border-slate-700 whitespace-nowrap";
const btnOk = ok => `px-3 py-1.5 rounded text-[9px] font-bold uppercase whitespace-nowrap ${ok ? 'bg-yellow-400 text-slate-950 hover:bg-yellow-300' : 'bg-slate-800 text-slate-600 cursor-not-allowed'}`;
const btnRojo = "px-2 py-1 rounded text-[9px] font-bold uppercase bg-red-950 text-red-400 border border-red-800 hover:bg-red-900";
const btnVerde = "px-2 py-1 rounded text-[9px] font-bold uppercase bg-green-950 text-green-400 border border-green-800 hover:bg-green-900";

function AnularBox({ label = 'Anular', onConfirm }) {
  const [open, setOpen] = useState(false);
  const [motivo, setMotivo] = useState('');
  if (!open) return <button onClick={() => setOpen(true)} className="text-[9px] text-slate-500 hover:text-red-400 underline underline-offset-2">{label}</button>;
  return (
    <div className="w-44 mt-1">
      <input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Motivo de anulación (obligatorio)" className={`w-full ${inputCls}`} />
      <div className="flex gap-1 mt-1">
        <button onClick={() => { if (motivo.trim()) { onConfirm(motivo.trim()); setOpen(false); setMotivo(''); } }}
          disabled={!motivo.trim()}
          className={`flex-1 px-2 py-1 rounded text-[9px] font-bold uppercase ${motivo.trim() ? 'bg-red-950 text-red-400 border border-red-800' : 'bg-slate-800 text-slate-600 cursor-not-allowed'}`}>Confirmar</button>
        <button onClick={() => setOpen(false)} className="px-2 py-1 rounded text-[9px] font-bold uppercase bg-slate-800 text-slate-400">✕</button>
      </div>
    </div>
  );
}

function descargarCSV(items, nombre) {
  const cab = ['Canal', 'RQ', 'Partida', 'Proyecto', 'Residente', 'Codigo', 'Descripcion', 'Destino', 'Und', 'Cant', 'F_Requerimiento', 'F_Necesitada', 'Decision', 'Estado', 'Motivo_Rechazo', 'Anulacion_Motivo', 'Anulado_Por', 'Pago', 'Factura', 'F_Entrega', 'Cant_Recibida', 'Obs_Almacen', 'Llego_dias', 'Holgura_dias', 'Saldo_dias'];
  const esc = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const filas = items.map(i => {
    const llego = i.fechaEntrega ? dias(i.fechaEntrega, i.fechaRQ) : '';
    const holg = i.fechaEntrega && i.fecha ? dias(i.fecha, i.fechaEntrega) : '';
    const saldo = i.fechaEntregaSaldo && i.fechaEntrega ? dias(i.fechaEntregaSaldo, i.fechaEntrega) : '';
    return [i.canal, 'RQ-' + String(i.rq).padStart(3, '0'), i.partida, i.proyecto, i.residente || '', i.cod, i.desc, i.destino, i.und, i.cant, i.fechaRQ, i.fecha, i.decision, i.estado, i.motivoRechazo || '', i.motivoAnulacion || '', i.anuladoPor || '', i.pago, i.factura || '', i.fechaEntrega || '', i.cantRecibida ?? '', i.obsAlmacen || '', llego, holg, saldo].map(esc).join(',');
  });
  const csv = '\ufeff' + cab.join(',') + '\n' + filas.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nombre + '.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

function imprimirRQ(r) {
  const ch = canalDe(r.items);
  const colorCanal = ch.k === 'URGENTE' ? '#b91c1c' : ch.k === 'GENERAL' ? '#15803d' : '#a16207';
  const filas = r.items.map((i, idx) => `
    <tr>
      <td class="c">${idx + 1}</td>
      <td class="c mono">${i.cod}</td>
      <td>${i.desc}</td>
      <td class="c">${i.und}</td>
      <td class="c">${i.cant}</td>
      <td class="c">${fmt(i.fecha)}</td>
      <td>${i.destino}</td>
      <td class="c">${i.color || '—'}</td>
      <td>${i.obs || '—'}</td>
    </tr>`).join('');
  const w = window.open('', '_blank');
  if (!w) { alert('El navegador bloqueó la ventana. Permite ventanas emergentes para descargar el PDF.'); return; }
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>RQ-${String(r.n).padStart(3, '0')} · ${r.proyecto}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #111; padding: 24px; }
    .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #111; padding-bottom: 8px; margin-bottom: 10px; }
    .logo { font-size: 16px; font-weight: 800; letter-spacing: 2px; }
    .logo small { display: block; font-size: 9px; font-weight: 400; letter-spacing: 1px; color: #555; }
    .nrq { text-align: right; }
    .nrq b { font-size: 15px; }
    h1 { font-size: 13px; text-align: center; margin: 8px 0; letter-spacing: 1px; }
    .meta { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
    .meta td { border: 1px solid #999; padding: 4px 6px; }
    .meta .l { background: #f0f0f0; font-weight: 700; width: 16%; font-size: 9px; text-transform: uppercase; }
    .canal { display: inline-block; padding: 2px 10px; border: 2px solid ${colorCanal}; color: ${colorCanal}; font-weight: 800; letter-spacing: 1px; }
    .just { border: 1px solid #999; background: #fffbe6; padding: 6px 8px; margin-bottom: 8px; }
    .just b { font-size: 9px; text-transform: uppercase; }
    table.items { width: 100%; border-collapse: collapse; margin-bottom: 40px; }
    table.items th { background: #111; color: #fff; padding: 5px 4px; font-size: 9px; text-transform: uppercase; }
    table.items td { border: 1px solid #999; padding: 4px; }
    .c { text-align: center; }
    .mono { font-family: 'Courier New', monospace; }
    .firmas { display: flex; gap: 16px; margin-top: 50px; }
    .firma { flex: 1; text-align: center; }
    .firma .linea { border-top: 1px solid #111; padding-top: 4px; font-size: 9px; font-weight: 700; text-transform: uppercase; }
    .firma .campos { font-size: 9px; color: #555; margin-top: 14px; text-align: left; }
    @media print { body { padding: 10mm; } }
  </style></head><body>
  <div class="head">
    <div class="logo">GRUPO COPACABANA<small>CONSTRUCCIÓN E INMOBILIARIA · CUSCO</small></div>
    <div class="nrq"><b>RQ-${String(r.n).padStart(3, '0')}</b><br>Fecha: ${fmt(r.fechaRQ)}<br><span class="canal">${r.canal}</span></div>
  </div>
  <h1>REQUERIMIENTO DE MATERIALES</h1>
  <table class="meta">
    <tr><td class="l">Proyecto</td><td>${r.proyecto}</td><td class="l">Partida</td><td>${r.partida}</td></tr>
    <tr><td class="l">Residente de obra</td><td>${r.residente}</td><td class="l">Adm. de almacén</td><td>${r.almacen}</td></tr>
  </table>
  ${r.just ? `<div class="just"><b>Justificación (¿por qué no se previó?):</b> ${r.just}</div>` : ''}
  <table class="items">
    <thead><tr><th>Ítem</th><th>Código</th><th>Descripción</th><th>Und</th><th>Cant</th><th>Fecha necesitada</th><th>Destino</th><th>Color</th><th>Obs</th></tr></thead>
    <tbody>${filas}</tbody>
  </table>
  <div class="firmas">
    ${['RESIDENTE DE OBRA', 'V°B° GERENTE DE OPERACIONES', 'RECEPCIÓN EN OBRA', 'ENTREGADO POR'].map(f => `
      <div class="firma"><div class="campos">FECHA:<br><br>NOMBRE:</div><br><br><div class="linea">${f}</div></div>`).join('')}
  </div>
  <script>window.onload = () => { window.print(); };<\/script>
  </body></html>`);
  w.document.close();
}

function FiltroProyecto({ value, onChange, todos, excluir }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} className={inputCls}>
      {todos && <option value="TODOS">Todos los proyectos</option>}
      {PROYECTOS.filter(([c, p]) => p !== excluir).map(([c, p]) => <option key={c} value={p}>{c} · {p}</option>)}
    </select>
  );
}

function FechaInput({ value, onChange, className, min }) {
  return (
    <input type="date" value={value} onChange={onChange} min={min}
      onClick={e => { try { e.target.showPicker(); } catch (_) {} }}
      className={`${className} cursor-pointer`} />
  );
}

function Buscador({ catalogo, onPick }) {
  const [q, setQ] = useState('');
  const res = useMemo(() => {
    if (q.length < 2) return [];
    const t = q.toUpperCase();
    return catalogo.filter(m => m[1].toUpperCase().includes(t) || m[0].includes(t)).slice(0, 8);
  }, [q, catalogo]);
  return (
    <div className="relative">
      <label className={lblCls}>Buscar material en catálogo · {catalogo.length} materiales</label>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Escribe descripción o código…"
        className={`w-full ${inputCls} py-2 text-sm`} />
      {res.length > 0 && (
        <div className="absolute top-full left-0 right-0 bg-slate-950 border border-yellow-400 border-t-0 rounded-b max-h-56 overflow-y-auto z-50">
          {res.map(m => (
            <div key={m[0]} onClick={() => { onPick(m); setQ(''); }}
              className="px-3 py-2 cursor-pointer border-b border-slate-800 hover:bg-slate-800">
              <div className="text-xs font-medium text-slate-100">{m[1]}</div>
              <div className="text-[10px] font-mono text-slate-500">{m[0]} · {m[2]} · {m[3]}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Login({ onLogin }) {
  const [u, setU] = useState(USUARIOS[0].u);
  const [p, setP] = useState('');
  const [err, setErr] = useState('');
  const entrar = () => {
    const user = USUARIOS.find(x => x.u === u);
    if (user && user.p === p) onLogin(user);
    else setErr('Contraseña incorrecta.');
  };
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-md p-6">
        <div className="text-center mb-5">
          <div className="font-extrabold text-lg tracking-widest text-yellow-400">COPACABANA <span className="text-slate-600 font-medium">/ RQ</span></div>
          <div className="text-slate-500 text-[11px] mt-1">Sistema de requerimientos de materiales</div>
        </div>
        <label className={lblCls}>Usuario</label>
        <select value={u} onChange={e => setU(e.target.value)} className={`w-full ${inputCls} mb-3`}>
          {USUARIOS.map(x => <option key={x.u} value={x.u}>{x.u} — {x.nombre}</option>)}
        </select>
        <label className={lblCls}>Contraseña</label>
        <input type="password" value={p} onChange={e => { setP(e.target.value); setErr(''); }}
          onKeyDown={e => e.key === 'Enter' && entrar()}
          placeholder="••••" className={`w-full ${inputCls} mb-3`} />
        {err && <div className="text-red-400 text-[11px] mb-2">{err}</div>}
        <button onClick={entrar} className="w-full px-4 py-2.5 rounded text-xs font-bold tracking-wider uppercase bg-yellow-400 text-slate-950 hover:bg-yellow-300">Ingresar</button>
        <div className="text-slate-600 text-[10px] mt-4 text-center">Demo: contraseña <span className="font-mono text-slate-400">1234</span> para todos los usuarios.</div>
      </div>
    </div>
  );
}

function Residente({ user, rqs, setRqs, catalogo, solicitudes, setSolicitudes }) {
  const esRes = user.rol === 'residente';
  const proyIni = esRes ? user.proyecto : 'DANAUS';
  const codIni = (PROYECTOS.find(p => p[1] === proyIni) || ['2502'])[0];
  const [cab, setCab] = useState({ proyecto: proyIni, partida: codIni + '.02.02', residente: esRes ? user.nombre : '', almacen: ALMACENEROS[proyIni] || '' });
  const [items, setItems] = useState([]);
  const [just, setJust] = useState('');
  const [solForm, setSolForm] = useState(null);
  const ch = canalDe(items);
  const urgente = ch && ch.k === 'URGENTE';
  const unds = useMemo(() => [...new Set(catalogo.map(m => m[2]))].sort(), [catalogo]);
  const fams = useMemo(() => [...new Set(catalogo.map(m => m[3]).filter(Boolean))].sort(), [catalogo]);

  const setC = (k, v) => {
    if (k === 'proyecto') {
      const cod = (PROYECTOS.find(p => p[1] === v) || [''])[0];
      setCab({ ...cab, proyecto: v, partida: cod ? cod + '.02.02' : cab.partida, almacen: ALMACENEROS[v] || cab.almacen });
    } else setCab({ ...cab, [k]: v });
  };
  const add = m => setItems(p => [...p, { id: Date.now() + Math.random(), cod: m[0], desc: m[1], und: m[2], cant: '', fecha: '', destino: '', color: '', obs: '', decision: 'Pendiente', estado: '—', motivoRechazo: '', pago: '—', factura: null, fechaEntrega: '', fechaRecojoSaldo: '', fechaEntregaSaldo: '', comunicoResidente: '—', destinoSaldo: '', cantRecibida: 0, obsAlmacen: '' }]);
  const upd = (id, k, v) => setItems(p => p.map(i => i.id === id ? { ...i, [k]: v } : i));
  const del = id => setItems(p => p.filter(i => i.id !== id));

  const cabOk = cab.residente.trim() && cab.almacen.trim();
  const itemsOk = items.length > 0 && items.every(i => Number(i.cant) > 0 && i.fecha && i.fecha >= HOY_ISO && i.destino.trim());
  const hayFechaPasada = items.some(i => i.fecha && i.fecha < HOY_ISO);
  const ok = cabOk && itemsOk && (!urgente || just.trim());

  const enviar = () => {
    const nuevo = { n: rqs.length + 1, ...cab, canal: ch.k, items, just, fechaRQ: HOY_ISO, creadoPor: user.nombre };
    setRqs([...rqs, nuevo]);
    setItems([]); setJust('');
    imprimirRQ(nuevo);
  };

  const enviarSolicitud = () => {
    if (!solForm.desc.trim() || !solForm.und) return;
    setSolicitudes([...solicitudes, { n: solicitudes.length + 1, fecha: HOY_ISO, desc: solForm.desc.trim().toUpperCase(), und: solForm.und, fam: solForm.fam.trim().toUpperCase(), solicitante: user.nombre, proyecto: cab.proyecto, estado: 'Pendiente', motivo: '' }]);
    setSolForm(null);
  };

  const misRqs = esRes ? rqs.filter(r => r.proyecto === user.proyecto) : rqs;
  const misSol = esRes ? solicitudes.filter(s => s.solicitante === user.nombre) : solicitudes;

  return (
    <div>
      <div className="bg-slate-900 border border-slate-800 rounded-md p-4 mb-3">
        <div className="text-[11px] font-bold tracking-widest text-slate-500 uppercase mb-3">Nuevo requerimiento</div>
        <div className="grid md:grid-cols-3 gap-3 mb-3">
          <div><label className={lblCls}>Proyecto{esRes ? ' (asignado a tu usuario)' : ''}</label>
            {esRes ? <div className={`${inputCls} bg-slate-800 text-slate-300`}>{codIni} · {user.proyecto}</div> :
            <select value={cab.proyecto} onChange={e => setC('proyecto', e.target.value)} className={`w-full ${inputCls}`}>
              {PROYECTOS.map(([c, p]) => <option key={c} value={p}>{c} · {p}</option>)}</select>}</div>
          <div><label className={lblCls}>Partida</label>
            <input value={cab.partida} onChange={e => setC('partida', e.target.value)} className={`w-full ${inputCls}`} /></div>
          <div><label className={lblCls}>Residente de obra *</label>
            {esRes ? <div className={`${inputCls} bg-slate-800 text-slate-300`}>{user.nombre}</div> :
            <input value={cab.residente} onChange={e => setC('residente', e.target.value)} placeholder="Nombre completo" className={`w-full ${inputCls}`} />}</div>
          <div><label className={lblCls}>Adm. de almacén *</label>
            <input value={cab.almacen} onChange={e => setC('almacen', e.target.value)} placeholder="Responsable" className={`w-full ${inputCls}`} /></div>
          <div><label className={lblCls}>Fecha del RQ</label>
            <div className={`${inputCls} bg-slate-800 text-slate-400`}>{fmt(HOY_ISO)} (automática)</div></div>
          <div><label className={lblCls}>Canal (automático)</label>
            <div className={`px-2 py-1.5 rounded text-[11px] font-bold tracking-widest uppercase text-center border ${ch ? ch.cls : 'bg-slate-800 text-slate-500 border-slate-700'}`}>
              {ch ? ch.k : 'sin ítems'}</div></div>
        </div>
        <Buscador catalogo={catalogo} onPick={add} />
        <div className="mt-2">
          {!solForm ? (
            <button onClick={() => setSolForm({ desc: '', und: unds[0] || 'UND', fam: '' })}
              className="text-[11px] text-yellow-400 hover:text-yellow-300 underline underline-offset-2">
              ¿No encuentras el material? Solicitar material nuevo</button>
          ) : (
            <div className="mt-2 bg-slate-950 border border-slate-700 rounded p-3">
              <div className={lblCls}>Solicitud de material nuevo (la aprueba el dueño del catálogo)</div>
              <div className="grid md:grid-cols-3 gap-2 mt-1">
                <input value={solForm.desc} onChange={e => setSolForm({ ...solForm, desc: e.target.value })} placeholder="Descripción exacta del material" className={inputCls} />
                <select value={solForm.und} onChange={e => setSolForm({ ...solForm, und: e.target.value })} className={inputCls}>
                  {unds.map(u => <option key={u}>{u}</option>)}</select>
                <div>
                  <input list="fams" value={solForm.fam} onChange={e => setSolForm({ ...solForm, fam: e.target.value })} placeholder="Familia sugerida" className={`w-full ${inputCls}`} />
                  <datalist id="fams">{fams.map(f => <option key={f} value={f} />)}</datalist>
                </div>
              </div>
              <div className="flex gap-2 mt-2">
                <button onClick={enviarSolicitud} disabled={!solForm.desc.trim()} className={btnOk(!!solForm.desc.trim())}>Enviar solicitud</button>
                <button onClick={() => setSolForm(null)} className="px-3 py-1.5 rounded text-[9px] font-bold uppercase bg-slate-800 text-slate-400 hover:text-slate-200">Cancelar</button>
              </div>
            </div>
          )}
        </div>
        {urgente && (
          <div className="mt-3">
            <div className="bg-yellow-950 border border-yellow-800 text-yellow-400 px-3 py-2 rounded text-xs">
              Canal urgente: la justificación es obligatoria. ¿Por qué no se previó?</div>
            <textarea rows={2} value={just} onChange={e => setJust(e.target.value)}
              placeholder="Ej: rotura imprevista de equipo en obra…"
              className={`w-full mt-2 ${inputCls} text-sm`} />
          </div>
        )}
      </div>

      {items.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-md p-4 mb-3">
          <div className="text-[11px] font-bold tracking-widest text-slate-500 uppercase mb-3">Ítems · {items.length}</div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr>
                {['Código', 'Descripción', 'Und', 'Cant', 'Fecha necesitada', 'Destino', 'Color', 'Obs (marca)', ''].map((h, i) => <th key={i} className={thCls}>{h}</th>)}
              </tr></thead>
              <tbody>
                {items.map(i => (
                  <tr key={i.id} className="border-b border-slate-800 align-top">
                    <td className="py-2 px-1.5 font-mono text-[11px] text-slate-500">{i.cod}</td>
                    <td className="py-2 px-1.5 text-slate-200">{i.desc}</td>
                    <td className="py-2 px-1.5 text-slate-500">{i.und}</td>
                    <td className="py-2 px-1.5"><input type="number" min="1" step="any" value={i.cant} onChange={e => { const v = e.target.value; if (v === '' || Number(v) > 0) upd(i.id, 'cant', v); }} className={`w-16 ${inputCls}`} /></td>
                    <td className="py-2 px-1.5"><FechaInput value={i.fecha} min={HOY_ISO} onChange={e => upd(i.id, 'fecha', e.target.value)} className={`w-32 ${inputCls}`} />
                      {i.fecha && i.fecha < HOY_ISO && <div className="text-[9px] text-red-400 mt-1">Fecha en el pasado</div>}</td>
                    <td className="py-2 px-1.5">
                      <textarea rows={2} value={i.destino} onChange={e => upd(i.id, 'destino', e.target.value)}
                        placeholder="¿Dónde será utilizado? Especificar con detalle: piso, dpto, ambiente, partida…"
                        className={`w-44 ${inputCls} resize-y`} /></td>
                    <td className="py-2 px-1.5">
                      <input value={i.color} onChange={e => upd(i.id, 'color', e.target.value)} placeholder="—" className={`w-24 ${inputCls}`} />
                      <div className="text-[9px] text-slate-500 mt-1 w-24 leading-tight">Colocar el color si es necesario; en caso contrario dejar vacío.</div></td>
                    <td className="py-2 px-1.5"><input value={i.obs} onChange={e => upd(i.id, 'obs', e.target.value)} placeholder="Marca" className={`w-24 ${inputCls}`} /></td>
                    <td className="py-2 px-1.5"><button onClick={() => del(i.id)} className="text-slate-500 hover:text-red-400 text-base leading-none">×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex gap-3 items-center flex-wrap">
            <button onClick={enviar} disabled={!ok}
              className={`px-5 py-2.5 rounded text-xs font-bold tracking-wider uppercase ${ok ? 'bg-yellow-400 text-slate-950 hover:bg-yellow-300' : 'bg-slate-800 text-slate-600 cursor-not-allowed'}`}>
              Enviar requerimiento</button>
            {!ok && <span className="text-slate-500 text-[11px]">
              {!cabOk ? 'Completa residente y adm. de almacén' : hayFechaPasada ? 'Hay fechas necesitadas en el pasado — corrígelas' : !itemsOk ? 'Completa cantidad, fecha y destino en cada ítem' : 'Falta la justificación del canal urgente'}</span>}
          </div>
        </div>
      )}

      {misSol.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-md p-4 mb-3">
          <div className="text-[11px] font-bold tracking-widest text-slate-500 uppercase mb-3">Mis solicitudes de material nuevo</div>
          <table className="w-full text-xs">
            <thead><tr>{['Material', 'Und', 'Familia', 'Estado', 'Motivo / Código asignado'].map((h, i) => <th key={i} className={thCls}>{h}</th>)}</tr></thead>
            <tbody>
              {misSol.map(s => (
                <tr key={s.n} className="border-b border-slate-800">
                  <td className="py-2 px-1.5 text-slate-200">{s.desc}</td>
                  <td className="py-2 px-1.5 text-slate-500">{s.und}</td>
                  <td className="py-2 px-1.5 text-slate-400">{s.fam || '—'}</td>
                  <td className="py-2 px-1.5"><span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${pillEstado(s.estado)}`}>{s.estado}</span></td>
                  <td className="py-2 px-1.5 text-slate-400 text-[10px]">{s.estado === 'Aprobado' ? <span className="font-mono text-green-400">{s.codigo}</span> : s.motivo || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="bg-slate-900 border border-slate-800 rounded-md p-4">
        <div className="text-[11px] font-bold tracking-widest text-slate-500 uppercase mb-3">Mis requerimientos · estado (solo lectura — lo gestiona Compras)</div>
        {misRqs.length === 0 ? (
          <div className="text-center py-6 text-slate-500 text-sm">Aún no has enviado requerimientos.</div>
        ) : misRqs.map(r => (
          <div key={r.n} className="mb-3 border border-slate-800 rounded p-3">
            <div className="flex items-center gap-2.5 mb-2 flex-wrap">
              <b className="font-mono text-sm text-slate-100">RQ-{String(r.n).padStart(3, '0')}</b>
              <span className={`px-2 py-1 rounded text-[9px] font-bold tracking-wider uppercase border ${canalDe(r.items).cls}`}>{r.canal}</span>
              <span className="text-slate-500 text-[11px]">{r.proyecto} · {r.partida} · {fmt(r.fechaRQ)}</span>
              <button onClick={() => imprimirRQ(r)}
                className="ml-auto px-2 py-1 rounded text-[9px] font-bold uppercase bg-slate-800 text-yellow-400 border border-slate-700 hover:border-yellow-400">
                ⤓ PDF</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr>{['Descripción', 'Cant', 'Necesitada', 'Decisión', 'Estado', 'Motivo de rechazo / anulación', 'Fecha entrega'].map((h, i) => <th key={i} className={thCls}>{h}</th>)}</tr></thead>
                <tbody>
                  {r.items.map(i => (
                    <tr key={i.id} className="border-b border-slate-800">
                      <td className="py-2 px-1.5 text-slate-200">{i.desc}</td>
                      <td className="py-2 px-1.5 font-mono text-slate-200">{i.cant}</td>
                      <td className="py-2 px-1.5 text-slate-200">{fmt(i.fecha)}</td>
                      <td className="py-2 px-1.5"><span className={`px-2 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase ${pillEstado(i.decision)}`}>{i.decision}</span></td>
                      <td className="py-2 px-1.5"><span className={`px-2 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase ${pillEstado(i.estado)}`}>{i.estado}</span></td>
                      <td className="py-2 px-1.5 text-red-400 text-[10px]">{i.motivoRechazo || (i.motivoAnulacion ? `Anulado: ${i.motivoAnulacion} (${i.anuladoPor})` : '—')}</td>
                      <td className="py-2 px-1.5 text-slate-400">{fmt(i.fechaEntrega)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Catalogo({ catalogo, setCatalogoExtra, catalogoExtra, solicitudes, setSolicitudes }) {
  const [edit, setEdit] = useState({});
  const [rech, setRech] = useState({});
  const [q, setQ] = useState('');
  const pend = solicitudes.filter(s => s.estado === 'Pendiente');

  const sugerirCodigo = s => {
    const delaFam = catalogo.filter(m => m[3] === s.fam);
    if (delaFam.length) {
      const max = Math.max(...delaFam.map(m => Number(m[0])));
      return String(max + 1).padStart(6, '0');
    }
    const maxIU = Math.max(...catalogo.map(m => Number(m[0].slice(0, 2))));
    return String(maxIU + 1).padStart(2, '0') + '0101';
  };

  const aprobar = s => {
    const cod = (edit[s.n] ?? sugerirCodigo(s)).trim();
    if (!/^\d{6}$/.test(cod)) { alert('El código debe tener exactamente 6 dígitos.'); return; }
    if (catalogo.some(m => m[0] === cod)) { alert('Ese código ya existe en el catálogo.'); return; }
    setCatalogoExtra([...catalogoExtra, [cod, s.desc, s.und, s.fam || 'SIN FAMILIA']]);
    setSolicitudes(solicitudes.map(x => x.n === s.n ? { ...x, estado: 'Aprobado', codigo: cod } : x));
    const e2 = { ...edit }; delete e2[s.n]; setEdit(e2);
  };

  const rechazar = s => {
    const motivo = (rech[s.n] || '').trim();
    if (!motivo) return;
    setSolicitudes(solicitudes.map(x => x.n === s.n ? { ...x, estado: 'Rechazado', motivo } : x));
    const r2 = { ...rech }; delete r2[s.n]; setRech(r2);
  };

  const res = useMemo(() => {
    if (q.length < 2) return [];
    const t = q.toUpperCase();
    return catalogo.filter(m => m[1].toUpperCase().includes(t) || m[0].includes(t)).slice(0, 15);
  }, [q, catalogo]);

  return (
    <div>
      <div className="bg-slate-900 border border-slate-800 rounded-md p-4 mb-3">
        <div className="text-[11px] font-bold tracking-widest text-slate-500 uppercase mb-3">Solicitudes de material nuevo · {pend.length} pendiente(s)</div>
        {pend.length === 0 ? (
          <div className="text-center py-6 text-slate-500 text-sm">Sin solicitudes pendientes. Los residentes las envían desde su vista.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr>{['#', 'Fecha', 'Solicitante', 'Material', 'Und', 'Familia', 'Código a asignar', 'Acción'].map((h, i) => <th key={i} className={thCls}>{h}</th>)}</tr></thead>
              <tbody>
                {pend.map(s => {
                  const enRech = rech[s.n] !== undefined;
                  return (
                    <tr key={s.n} className="border-b border-slate-800 align-top">
                      <td className="py-2 px-1.5 font-mono text-[11px] text-slate-500">{s.n}</td>
                      <td className="py-2 px-1.5 text-slate-400">{fmt(s.fecha)}</td>
                      <td className="py-2 px-1.5 text-slate-400">{s.solicitante} · {s.proyecto}</td>
                      <td className="py-2 px-1.5 text-slate-200">{s.desc}</td>
                      <td className="py-2 px-1.5 text-slate-500">{s.und}</td>
                      <td className="py-2 px-1.5 text-slate-400">{s.fam || '—'}</td>
                      <td className="py-2 px-1.5">
                        <input value={edit[s.n] ?? sugerirCodigo(s)} onChange={e => setEdit({ ...edit, [s.n]: e.target.value })}
                          className={`w-24 ${inputCls} font-mono`} maxLength={6} />
                        <div className="text-[9px] text-slate-500 mt-1">Sugerido por familia; editable.</div></td>
                      <td className="py-2 px-1.5">
                        {!enRech ? (
                          <div className="flex gap-1">
                            <button onClick={() => aprobar(s)} className={btnVerde}>Aprobar y codificar</button>
                            <button onClick={() => setRech({ ...rech, [s.n]: '' })} className={btnRojo}>Rechazar</button>
                          </div>
                        ) : (
                          <div className="w-44">
                            <input value={rech[s.n]} onChange={e => setRech({ ...rech, [s.n]: e.target.value })} placeholder="Motivo (ej: duplicado de 210112)" className={`w-full ${inputCls}`} />
                            <button onClick={() => rechazar(s)} disabled={!(rech[s.n] || '').trim()}
                              className={`mt-1 w-full px-2 py-1 rounded text-[9px] font-bold uppercase ${(rech[s.n] || '').trim() ? 'bg-red-950 text-red-400 border border-red-800' : 'bg-slate-800 text-slate-600 cursor-not-allowed'}`}>Confirmar rechazo</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-3 text-slate-500 text-[11px]">Solo el dueño del catálogo aprueba y codifica. Antes de aprobar, busca abajo si el material ya existe con otro nombre — evita duplicados.</div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-md p-4">
        <div className="text-[11px] font-bold tracking-widest text-slate-500 uppercase mb-3">Catálogo maestro · {catalogo.length} materiales</div>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar en el catálogo para verificar duplicados…" className={`w-full ${inputCls} py-2 text-sm mb-2`} />
        {res.length > 0 && (
          <table className="w-full text-xs">
            <thead><tr>{['Código', 'Descripción', 'Und', 'Familia'].map((h, i) => <th key={i} className={thCls}>{h}</th>)}</tr></thead>
            <tbody>
              {res.map(m => (
                <tr key={m[0]} className="border-b border-slate-800">
                  <td className="py-2 px-1.5 font-mono text-[11px] text-slate-500">{m[0]}</td>
                  <td className="py-2 px-1.5 text-slate-200">{m[1]}</td>
                  <td className="py-2 px-1.5 text-slate-500">{m[2]}</td>
                  <td className="py-2 px-1.5 text-slate-400">{m[3]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Compras({ user, rqs, setRqs, facturas, setFacturas, proveedores, setProvExtra, provExtra }) {
  const [rechazo, setRechazo] = useState({});
  const [aviso, setAviso] = useState('');
  const [proy, setProy] = useState('TODOS');
  const [fFact, setFFact] = useState({});
  const setItem = (n, id, patch) => setRqs(rqs.map(r => r.n !== n ? r : { ...r, items: r.items.map(i => i.id === id ? { ...i, ...patch } : i) }));

  const rqMap = Object.fromEntries(rqs.map(r => [r.n, r]));
  const flatBase = rqs.flatMap(r => r.items.map(i => ({ ...i, rq: r.n, fechaRQ: r.fechaRQ, canal: r.canal, residente: r.residente, just: r.just, proyecto: r.proyecto })));
  const flat = flatBase
    .filter(i => i.decision !== 'Rechazado' && i.decision !== 'Anulado')
    .filter(i => !(i.estado === 'Entregado' && i.pago === 'Pagado'))
    .filter(i => proy === 'TODOS' || i.proyecto === proy);

  const enviarRechazo = i => {
    const motivo = (rechazo[i.id] || '').trim();
    if (!motivo) return;
    setItem(i.rq, i.id, { decision: 'Rechazado', motivoRechazo: motivo });
    const r2 = { ...rechazo }; delete r2[i.id]; setRechazo(r2);
    setAviso(`Rechazo de "${i.desc}" (RQ-${String(i.rq).padStart(3, '0')}) comunicado al residente ${i.residente}. El ítem quedó cerrado; puedes verlo en el Tablero.`);
    setTimeout(() => setAviso(''), 5000);
  };

  const anularItem = (i, motivo) => {
    setItem(i.rq, i.id, { decision: 'Anulado', motivoAnulacion: motivo, anuladoPor: user.nombre, fechaAnulacion: HOY_ISO });
    setAviso(`Ítem "${i.desc}" anulado por ${user.nombre}. Queda registrado en el Tablero con motivo.`);
    setTimeout(() => setAviso(''), 5000);
  };

  const cambiarPago = (i, v) => {
    if (v === 'Pagado') {
      setFFact({ ...fFact, [i.id]: fFact[i.id] || { serie: '', prov: '', ruc: '', fecha: HOY_ISO, monto: '', forma: FORMAS_PAGO[0], extras: [] } });
    } else {
      const f2 = { ...fFact }; delete f2[i.id]; setFFact(f2);
      setItem(i.rq, i.id, { pago: v });
    }
  };

  const setFF = (id, k, v) => {
    const f = { ...fFact[id], [k]: v };
    if (k === 'prov') {
      const p = proveedores.find(x => x[1] === v);
      if (p) f.ruc = p[0];
    }
    setFFact({ ...fFact, [id]: f });
  };

  const toggleExtra = (id, itemId) => {
    const f = fFact[id];
    const extras = f.extras.includes(itemId) ? f.extras.filter(x => x !== itemId) : [...f.extras, itemId];
    setFFact({ ...fFact, [id]: { ...f, extras } });
  };

  const registrarFactura = i => {
    const f = fFact[i.id];
    const ok = f.serie.trim() && f.prov.trim() && /^\d{11}$/.test(f.ruc) && f.fecha && Number(f.monto) > 0;
    if (!ok) return;
    const serie = f.serie.trim().toUpperCase();
    if (facturas.some(x => x.serie === serie && x.ruc === f.ruc)) {
      setAviso(`La factura ${serie} de ese RUC ya está registrada. Verifica el número.`);
      setTimeout(() => setAviso(''), 6000);
      return;
    }
    const cubiertos = [i, ...flatBase.filter(x => f.extras.includes(x.id))];
    // proveedor nuevo → agregar al maestro
    if (!proveedores.some(p => p[0] === f.ruc)) {
      setProvExtra([...provExtra, [f.ruc, f.prov.trim().toUpperCase()]]);
    }
    setFacturas([...facturas, { n: facturas.length + 1, serie, prov: f.prov.trim(), ruc: f.ruc, fecha: f.fecha, monto: Number(f.monto), forma: f.forma, proyecto: i.proyecto, registradoPor: user.nombre, items: cubiertos.map(x => ({ rq: x.rq, desc: x.desc })) }]);
    cubiertos.forEach(x => setItem(x.rq, x.id, { pago: 'Pagado', factura: serie }));
    // setItem secuencial sobre el mismo estado: aplicar en bloque
    setRqs(prev => prev.map(r => ({ ...r, items: r.items.map(it => cubiertos.some(c => c.id === it.id) ? { ...it, pago: 'Pagado', factura: serie } : it) })));
    const f2 = { ...fFact }; delete f2[i.id]; setFFact(f2);
    setAviso(`Factura ${serie} registrada cubriendo ${cubiertos.length} ítem(s).`);
    setTimeout(() => setAviso(''), 4000);
  };

  const factProy = facturas.filter(f => proy === 'TODOS' || f.proyecto === proy);

  return (
    <div>
    <div className="bg-slate-900 border border-slate-800 rounded-md p-4 mb-3">
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <div className="text-[11px] font-bold tracking-widest text-slate-500 uppercase">Gestión de compras · aprobación, estado y seguimiento</div>
        <div className="ml-auto"><FiltroProyecto value={proy} onChange={setProy} todos /></div>
      </div>
      {aviso && <div className="bg-green-950 border border-green-800 text-green-400 px-3 py-2 rounded text-xs mb-3">✓ {aviso}</div>}
      {flat.length === 0 && <div className="text-center py-6 text-slate-500 text-sm">Sin requerimientos abiertos {proy !== 'TODOS' ? 'en ' + proy : ''}.</div>}
      {flat.length > 0 && (
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead><tr>{['RQ', 'Proyecto', 'Canal', 'Residente', 'Descripción', 'Cant', 'Necesitada', 'Decisión', 'Estado', 'Pago', 'Fecha entrega', 'Llegó en', 'Holgura', 'Recojo saldo', 'Entrega saldo', 'Saldo en', '¿Comunicó residente?', 'Destino saldo', ''].map((h, i) => <th key={i} className={thCls}>{h}</th>)}</tr></thead>
          <tbody>
            {flat.map(i => {
              const llego = i.fechaEntrega ? dias(i.fechaEntrega, i.fechaRQ) : null;
              const holg = i.fechaEntrega && i.fecha ? dias(i.fecha, i.fechaEntrega) : null;
              const saldoDias = i.fechaEntregaSaldo && i.fechaEntrega ? dias(i.fechaEntregaSaldo, i.fechaEntrega) : null;
              const inc = i.estado === 'Incompleto';
              const enRechazo = rechazo[i.id] !== undefined;
              const enFact = fFact[i.id] !== undefined;
              const post = i.decision === 'Aprobado';
              const ff = fFact[i.id];
              const factOk = ff && ff.serie.trim() && ff.prov.trim() && /^\d{11}$/.test(ff.ruc) && ff.fecha && Number(ff.monto) > 0;
              const candidatosExtra = enFact ? flatBase.filter(x => x.id !== i.id && x.proyecto === i.proyecto && x.decision === 'Aprobado' && x.pago !== 'Pagado') : [];
              return (
                <tr key={i.id} className="border-b border-slate-800 align-top">
                  <td className="py-2 px-1.5 whitespace-nowrap">
                    <button onClick={() => imprimirRQ(rqMap[i.rq])} title="Ver PDF del requerimiento"
                      className="font-mono text-[11px] text-slate-200 underline decoration-dotted underline-offset-2 hover:text-yellow-400">
                      RQ-{String(i.rq).padStart(3, '0')}</button>
                    <span className="text-yellow-400 text-[10px] ml-1">⤓</span></td>
                  <td className="py-2 px-1.5 text-slate-400 whitespace-nowrap">{i.proyecto}</td>
                  <td className="py-2 px-1.5"><span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-slate-800 ${i.canal === 'URGENTE' ? 'text-red-400' : i.canal === 'GENERAL' ? 'text-green-400' : 'text-yellow-400'}`}>{i.canal}</span></td>
                  <td className="py-2 px-1.5 text-slate-400 whitespace-nowrap">{i.residente}</td>
                  <td className="py-2 px-1.5 text-slate-200">{i.desc} <span className="text-slate-500">({i.und})</span>
                    {i.just && <div className="text-yellow-400 text-[10px] mt-1">Justif.: {i.just}</div>}</td>
                  <td className="py-2 px-1.5 font-mono text-slate-200">{i.cant}</td>
                  <td className="py-2 px-1.5 text-slate-200">{fmt(i.fecha)}</td>
                  <td className="py-2 px-1.5">
                    {i.decision === 'Pendiente' && !enRechazo && (
                      <div className="flex gap-1">
                        <button onClick={() => setItem(i.rq, i.id, { decision: 'Aprobado' })} className={btnVerde}>Aprobar</button>
                        <button onClick={() => setRechazo({ ...rechazo, [i.id]: '' })} className={btnRojo}>Rechazar</button>
                      </div>
                    )}
                    {enRechazo && (
                      <div className="w-48">
                        <textarea rows={2} value={rechazo[i.id]} onChange={e => setRechazo({ ...rechazo, [i.id]: e.target.value })}
                          placeholder="¿Por qué se rechazó? (obligatorio)" className={`w-full ${inputCls}`} />
                        <button onClick={() => enviarRechazo(i)} disabled={!(rechazo[i.id] || '').trim()}
                          className={`mt-1 w-full px-2 py-1.5 rounded text-[9px] font-bold uppercase ${(rechazo[i.id] || '').trim() ? 'bg-red-950 text-red-400 border border-red-800 hover:bg-red-900' : 'bg-slate-800 text-slate-600 cursor-not-allowed'}`}>
                          Enviar y comunicar al residente</button>
                      </div>
                    )}
                    {i.decision === 'Aprobado' && <span className={`px-2 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase ${pillEstado('Aprobado')}`}>Aprobado</span>}
                  </td>
                  <td className="py-2 px-1.5">
                    {post ? (
                      <select value={i.estado} onChange={e => setItem(i.rq, i.id, { estado: e.target.value })} className={inputCls}>
                        {ESTADOS_LOGISTICA.map(x => <option key={x}>{x}</option>)}</select>
                    ) : <span className="text-slate-600">—</span>}
                  </td>
                  <td className="py-2 px-1.5">{post ? (
                    <div>
                      <select value={enFact ? 'Pagado' : i.pago} onChange={e => cambiarPago(i, e.target.value)} className={inputCls}>
                        {ESTADOS_PAGO.map(x => <option key={x}>{x}</option>)}</select>
                      {enFact && (
                        <div className="mt-1.5 w-56 bg-slate-950 border border-yellow-400 rounded p-2">
                          <div className="text-[9px] font-bold text-yellow-400 uppercase mb-1.5">Datos de factura (obligatorios)</div>
                          <input value={ff.serie} onChange={e => setFF(i.id, 'serie', e.target.value)} placeholder="N° factura: F001-000123" className={`w-full mb-1 ${inputCls} font-mono`} />
                          <input list={`fprov-${i.id}`} value={ff.prov} onChange={e => setFF(i.id, 'prov', e.target.value)} placeholder="Proveedor (razón social)" className={`w-full mb-1 ${inputCls}`} />
                          <datalist id={`fprov-${i.id}`}>{proveedores.map(p => <option key={p[0]} value={p[1]} />)}</datalist>
                          <input value={ff.ruc} onChange={e => setFF(i.id, 'ruc', e.target.value)} placeholder="RUC (11 dígitos)" maxLength={11} className={`w-full mb-1 ${inputCls} font-mono`} />
                          {ff.ruc && !/^\d{11}$/.test(ff.ruc) && <div className="text-[9px] text-red-400 mb-1">RUC inválido</div>}
                          {ff.ruc && /^\d{11}$/.test(ff.ruc) && !proveedores.some(p => p[0] === ff.ruc) && <div className="text-[9px] text-sky-400 mb-1">Proveedor nuevo: se agregará al maestro.</div>}
                          <FechaInput value={ff.fecha} onChange={e => setFF(i.id, 'fecha', e.target.value)} className={`w-full mb-1 ${inputCls}`} />
                          <input type="number" min="0.01" step="any" value={ff.monto} onChange={e => setFF(i.id, 'monto', e.target.value)} placeholder="Monto TOTAL S/ (inc. IGV)" className={`w-full mb-1 ${inputCls} font-mono`} />
                          <select value={ff.forma} onChange={e => setFF(i.id, 'forma', e.target.value)} className={`w-full mb-1 ${inputCls}`}>
                            {FORMAS_PAGO.map(x => <option key={x}>{x}</option>)}</select>
                          {candidatosExtra.length > 0 && (
                            <div className="mb-1.5 border-t border-slate-700 pt-1.5">
                              <div className="text-[9px] font-bold text-slate-400 uppercase mb-1">¿Esta factura cubre otros ítems? ({i.proyecto})</div>
                              <div className="max-h-24 overflow-y-auto">
                                {candidatosExtra.map(x => (
                                  <label key={x.id} className="flex items-start gap-1.5 text-[10px] text-slate-300 mb-1 cursor-pointer">
                                    <input type="checkbox" checked={ff.extras.includes(x.id)} onChange={() => toggleExtra(i.id, x.id)} className="mt-0.5" />
                                    <span>RQ-{String(x.rq).padStart(3, '0')} · {x.desc}</span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          )}
                          <button onClick={() => registrarFactura(i)} disabled={!factOk} className={`w-full ${btnOk(!!factOk)}`}>Registrar factura ({1 + ff.extras.length} ítem{ff.extras.length ? 's' : ''}) y marcar pagado</button>
                        </div>
                      )}
                      {i.factura && !enFact && <div className="text-[9px] font-mono text-green-400 mt-1">{i.factura}</div>}
                    </div>
                  ) : <span className="text-slate-600">—</span>}</td>
                  <td className="py-2 px-1.5">{post ? <FechaInput value={i.fechaEntrega} onChange={e => setItem(i.rq, i.id, { fechaEntrega: e.target.value })} className={`w-32 ${inputCls}`} /> : <span className="text-slate-600">—</span>}</td>
                  <td className="py-2 px-1.5 font-mono text-slate-300">{llego !== null ? llego + 'd' : '—'}</td>
                  <td className={`py-2 px-1.5 font-mono ${holg === null ? 'text-slate-500' : holg < 0 ? 'text-red-400' : 'text-green-400'}`}>{holg !== null ? holg + 'd' : '—'}</td>
                  <td className="py-2 px-1.5">{inc ? <FechaInput value={i.fechaRecojoSaldo} onChange={e => setItem(i.rq, i.id, { fechaRecojoSaldo: e.target.value })} className={`w-32 ${inputCls}`} /> : <span className="text-slate-600">—</span>}</td>
                  <td className="py-2 px-1.5">{inc ? <FechaInput value={i.fechaEntregaSaldo} onChange={e => setItem(i.rq, i.id, { fechaEntregaSaldo: e.target.value })} className={`w-32 ${inputCls}`} /> : <span className="text-slate-600">—</span>}</td>
                  <td className="py-2 px-1.5 font-mono text-slate-300">{saldoDias !== null ? saldoDias + 'd' : '—'}</td>
                  <td className="py-2 px-1.5">{inc ? (
                    <select value={i.comunicoResidente} onChange={e => setItem(i.rq, i.id, { comunicoResidente: e.target.value })} className={inputCls}>
                      {['—', 'Sí', 'No'].map(x => <option key={x}>{x}</option>)}</select>) : <span className="text-slate-600">—</span>}</td>
                  <td className="py-2 px-1.5">{inc ? <input value={i.destinoSaldo} onChange={e => setItem(i.rq, i.id, { destinoSaldo: e.target.value })} placeholder="Almacén de obra…" className={`w-32 ${inputCls}`} /> : <span className="text-slate-600">—</span>}</td>
                  <td className="py-2 px-1.5"><AnularBox onConfirm={m => anularItem(i, m)} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      )}
      <div className="mt-3 text-slate-500 text-[11px]">Paso 1: Aprobar o Rechazar. Paso 2: estado logístico solo para aprobados. Pagado exige factura (una factura puede cubrir varios ítems). Anular exige motivo y queda con rastro en el Tablero. Un ítem Entregado y Pagado se cierra y pasa solo al Tablero.</div>
    </div>

    <div className="bg-slate-900 border border-slate-800 rounded-md p-4">
      <div className="text-[11px] font-bold tracking-widest text-slate-500 uppercase mb-3">Facturas registradas · {factProy.length}{factProy.length > 0 ? ` · S/ ${factProy.reduce((a, f) => a + f.monto, 0).toFixed(2)}` : ''}</div>
      {factProy.length === 0 ? (
        <div className="text-center py-6 text-slate-500 text-sm">Sin facturas. Se registran al marcar un ítem como Pagado.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr>{['N° Factura', 'Fecha', 'Proveedor', 'RUC', 'Proyecto', 'Ítems que cubre', 'Monto S/', 'Forma de pago', 'Registró'].map((h, i) => <th key={i} className={thCls}>{h}</th>)}</tr></thead>
            <tbody>
              {factProy.map(f => (
                <tr key={f.n} className="border-b border-slate-800 align-top">
                  <td className="py-2 px-1.5 font-mono text-slate-200">{f.serie}</td>
                  <td className="py-2 px-1.5 text-slate-400">{fmt(f.fecha)}</td>
                  <td className="py-2 px-1.5 text-slate-300">{f.prov}</td>
                  <td className="py-2 px-1.5 font-mono text-[11px] text-slate-500">{f.ruc}</td>
                  <td className="py-2 px-1.5 text-slate-400">{f.proyecto}</td>
                  <td className="py-2 px-1.5 text-slate-300 text-[10px]">{f.items.map(x => `RQ-${String(x.rq).padStart(3, '0')} ${x.desc}`).join(' · ')}</td>
                  <td className="py-2 px-1.5 font-mono text-slate-200 text-right">{f.monto.toFixed(2)}</td>
                  <td className="py-2 px-1.5 text-slate-400">{f.forma}</td>
                  <td className="py-2 px-1.5 text-slate-500 text-[10px]">{f.registradoPor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
    </div>
  );
}

function Almacen({ user, rqs, setRqs, salidas, setSalidas, prestamos, setPrestamos }) {
  const esAlm = user.rol === 'almacen';
  const [form, setForm] = useState({});
  const [aviso, setAviso] = useState('');
  const [proy, setProy] = useState(esAlm ? user.proyecto : 'LUZ');
  const [fSal, setFSal] = useState({});
  const [verif, setVerif] = useState({});
  const [fPres, setFPres] = useState({ cod: '', cant: '', destino: '', autoriza: '' });
  const setItem = (n, id, patch) => setRqs(rqs.map(r => r.n !== n ? r : { ...r, items: r.items.map(i => i.id === id ? { ...i, ...patch } : i) }));

  const porRecibir = rqs.flatMap(r => r.items
    .filter(i => i.decision === 'Aprobado' && i.estado !== 'Entregado')
    .map(i => ({ ...i, rq: r.n, fechaRQ: r.fechaRQ, canal: r.canal, residente: r.residente, proyecto: r.proyecto })))
    .filter(i => i.proyecto === proy);

  const getF = id => form[id] || { cant: '', obs: '' };
  const setF = (id, k, v) => setForm({ ...form, [id]: { ...getF(id), [k]: v } });

  const recibir = i => {
    const f = getF(i.id);
    const rec = Number(f.cant);
    if (!(rec > 0)) return;
    const yaRecibido = Number(i.cantRecibida || 0);
    const pedido = Number(i.cant);
    if (yaRecibido + rec > pedido) {
      setAviso(`No se puede recibir ${rec}: excede lo pedido (falta ${pedido - yaRecibido} de ${pedido}). Si el proveedor entregó de más, corrige el RQ con Compras.`);
      setTimeout(() => setAviso(''), 6000);
      return;
    }
    const total = yaRecibido + rec;
    const esSaldo = i.estado === 'Incompleto';
    const completo = total >= pedido;
    const patch = { cantRecibida: total, estado: completo ? 'Entregado' : 'Incompleto' };
    if (esSaldo) { patch.fechaEntregaSaldo = HOY_ISO; }
    else { patch.fechaEntrega = i.fechaEntrega || HOY_ISO; }
    if (f.obs.trim()) patch.obsAlmacen = i.obsAlmacen ? i.obsAlmacen + ' · ' + f.obs.trim() : f.obs.trim();
    setItem(i.rq, i.id, patch);
    const f2 = { ...form }; delete f2[i.id]; setForm(f2);
    setAviso(completo
      ? `Recepción completa de "${i.desc}" registrada (${total}/${pedido}).`
      : `Recepción parcial de "${i.desc}": ${total}/${pedido}. Marcado como Incompleto en Compras y Almacén. Saldo pendiente: ${pedido - total}.`);
    setTimeout(() => setAviso(''), 5000);
  };

  const salidasProy = salidas.filter(s => s.proyecto === proy);
  const stockMap = {};
  rqs.filter(r => r.proyecto === proy).forEach(r => r.items.forEach(i => {
    const rec = Number(i.cantRecibida || 0);
    if (rec > 0) {
      if (!stockMap[i.cod]) stockMap[i.cod] = { cod: i.cod, desc: i.desc, und: i.und, recibido: 0, salido: 0, prestNeto: 0 };
      stockMap[i.cod].recibido += rec;
    }
  }));
  salidasProy.filter(s => !s.anulada).forEach(s => { if (stockMap[s.cod]) stockMap[s.cod].salido += Number(s.cant); });
  prestamos.forEach(p => {
    if (p.estado === 'Devuelto' || p.estado === 'Anulado') return;
    if (p.origen === proy && stockMap[p.cod]) stockMap[p.cod].prestNeto -= Number(p.cant);
    if (p.destino === proy) {
      if (!stockMap[p.cod]) stockMap[p.cod] = { cod: p.cod, desc: p.desc, und: p.und, recibido: 0, salido: 0, prestNeto: 0 };
      stockMap[p.cod].prestNeto += Number(p.cant);
    }
  });
  const stock = Object.values(stockMap).map(s => ({ ...s, stock: s.recibido - s.salido + s.prestNeto }));

  const darSalida = (s, f) => {
    setSalidas([...salidas, { n: salidas.length + 1, fecha: HOY_ISO, proyecto: proy, cod: s.cod, desc: s.desc, und: s.und, cant: Number(f.cant), hoja: f.hoja.trim(), zona: f.zona.trim(), uso: 'Pendiente', motivoUso: '', registradoPor: user.nombre }]);
    const f2 = { ...fSal }; delete f2[s.cod]; setFSal(f2);
    setAviso(`Salida registrada: ${f.cant} ${s.und} de "${s.desc}" → ${f.zona} (${f.hoja}).`);
    setTimeout(() => setAviso(''), 4000);
  };

  const anularSalida = (n, motivo) => {
    setSalidas(salidas.map(s => s.n === n ? { ...s, anulada: true, motivoAnulacion: motivo, anuladoPor: user.nombre, fechaAnulacion: HOY_ISO } : s));
    setAviso(`Salida #${n} anulada — el stock se restauró. Motivo registrado.`);
    setTimeout(() => setAviso(''), 5000);
  };

  const marcarUso = (n, uso, motivo = '') => {
    setSalidas(salidas.map(s => s.n === n ? { ...s, uso, motivoUso: motivo } : s));
  };

  const confirmarIncorrecto = n => {
    const v = verif[n];
    const motivo = v.motivo === 'Otro' ? v.otro.trim() : v.motivo;
    if (!motivo) return;
    marcarUso(n, 'Incorrecto', motivo);
    const v2 = { ...verif }; delete v2[n]; setVerif(v2);
  };

  const matPres = stock.find(s => s.cod === fPres.cod);
  const presOk = matPres && Number(fPres.cant) > 0 && Number(fPres.cant) <= matPres.stock && fPres.destino && fPres.autoriza.trim();

  const prestar = () => {
    setPrestamos([...prestamos, { n: prestamos.length + 1, fecha: HOY_ISO, origen: proy, destino: fPres.destino, cod: matPres.cod, desc: matPres.desc, und: matPres.und, cant: Number(fPres.cant), autoriza: fPres.autoriza.trim(), estado: 'Prestado', registradoPor: user.nombre }]);
    setAviso(`Préstamo registrado: ${fPres.cant} ${matPres.und} de "${matPres.desc}" → almacén ${fPres.destino}. Queda como deuda hasta devolución o transferencia al costo.`);
    setFPres({ cod: '', cant: '', destino: '', autoriza: '' });
    setTimeout(() => setAviso(''), 5000);
  };

  const presProy = prestamos.filter(p => p.origen === proy || p.destino === proy);
  const stockDe = (proyecto, cod) => {
    let s = 0;
    rqs.filter(r => r.proyecto === proyecto).forEach(r => r.items.forEach(i => { if (i.cod === cod) s += Number(i.cantRecibida || 0); }));
    salidas.filter(x => x.proyecto === proyecto && x.cod === cod && !x.anulada).forEach(x => { s -= Number(x.cant); });
    prestamos.filter(p => p.estado !== 'Devuelto' && p.estado !== 'Anulado' && p.cod === cod).forEach(p => {
      if (p.origen === proyecto) s -= Number(p.cant);
      if (p.destino === proyecto) s += Number(p.cant);
    });
    return s;
  };
  const setPres = (n, estado) => {
    const p = prestamos.find(x => x.n === n);
    if (estado === 'Devuelto' && stockDe(p.destino, p.cod) < Number(p.cant)) {
      setAviso(`No se puede devolver: el almacén ${p.destino} ya consumió parte del material (stock actual: ${stockDe(p.destino, p.cod)} de ${p.cant} prestados). Usa "Transferir al costo".`);
      setTimeout(() => setAviso(''), 7000);
      return;
    }
    setPrestamos(prestamos.map(x => x.n === n ? { ...x, estado, fechaCierre: HOY_ISO } : x));
  };
  const anularPrestamo = (n, motivo) => {
    const p = prestamos.find(x => x.n === n);
    if (stockDe(p.destino, p.cod) < Number(p.cant)) {
      setAviso(`No se puede anular: el destino ya consumió el material. Usa "Transferir al costo".`);
      setTimeout(() => setAviso(''), 6000);
      return;
    }
    setPrestamos(prestamos.map(x => x.n === n ? { ...x, estado: 'Anulado', motivoAnulacion: motivo, anuladoPor: user.nombre, fechaCierre: HOY_ISO } : x));
    setAviso(`Préstamo #${n} anulado — stock restaurado en ambos almacenes.`);
    setTimeout(() => setAviso(''), 5000);
  };

  return (
    <div>
      <div className="bg-slate-900 border border-slate-800 rounded-md p-4 mb-3">
        <div className="flex items-center gap-3 mb-3 flex-wrap">
          <div className="text-[11px] font-bold tracking-widest text-slate-500 uppercase">Almacén de obra · recepción de materiales</div>
          <div className="ml-auto flex items-center gap-2">
            {esAlm ? <span className="text-slate-300 text-[11px] font-semibold">{(PROYECTOS.find(p => p[1] === proy) || [''])[0]} · {proy}</span>
              : <FiltroProyecto value={proy} onChange={setProy} />}
            {ALMACENEROS[proy] && <span className="text-slate-400 text-[11px]">Almacenero: {ALMACENEROS[proy]}</span>}
          </div>
        </div>
        {aviso && <div className="bg-green-950 border border-green-800 text-green-400 px-3 py-2 rounded text-xs mb-3">✓ {aviso}</div>}
        {porRecibir.length === 0 ? (
          <div className="text-center py-6 text-slate-500 text-sm">Nada por recibir en {proy}. Los ítems aparecen aquí cuando Compras los aprueba.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr>{['RQ', 'Descripción', 'Pedido', 'Recibido', 'Falta', 'Estado', 'Cant. que llega', 'Observaciones', ''].map((h, i) => <th key={i} className={thCls}>{h}</th>)}</tr></thead>
              <tbody>
                {porRecibir.map(i => {
                  const f = getF(i.id);
                  const rec = Number(i.cantRecibida || 0);
                  const falta = Number(i.cant) - rec;
                  const listo = Number(f.cant) > 0 && Number(f.cant) <= falta;
                  return (
                    <tr key={i.id} className="border-b border-slate-800 align-top">
                      <td className="py-2 px-1.5 font-mono text-[11px] text-slate-200">RQ-{String(i.rq).padStart(3, '0')}</td>
                      <td className="py-2 px-1.5 text-slate-200">{i.desc} <span className="text-slate-500">({i.und})</span></td>
                      <td className="py-2 px-1.5 font-mono text-slate-200">{i.cant}</td>
                      <td className="py-2 px-1.5 font-mono text-slate-300">{rec}</td>
                      <td className={`py-2 px-1.5 font-mono ${falta > 0 ? 'text-orange-400' : 'text-green-400'}`}>{falta}</td>
                      <td className="py-2 px-1.5"><span className={`px-2 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase ${pillEstado(i.estado)}`}>{i.estado}</span></td>
                      <td className="py-2 px-1.5"><input type="number" min="1" step="any" value={f.cant} onChange={e => { const v = e.target.value; if (v === '' || Number(v) > 0) setF(i.id, 'cant', v); }} className={`w-16 ${inputCls}`} />
                        {Number(f.cant) > falta && <div className="text-[9px] text-red-400 mt-1">Excede lo pedido</div>}</td>
                      <td className="py-2 px-1.5">
                        <textarea rows={2} value={f.obs} onChange={e => setF(i.id, 'obs', e.target.value)}
                          placeholder="Estado del material, faltantes, daños…" className={`w-48 ${inputCls} resize-y`} />
                        {i.obsAlmacen && <div className="text-[9px] text-slate-500 mt-1 w-48">Anterior: {i.obsAlmacen}</div>}</td>
                      <td className="py-2 px-1.5">
                        <button onClick={() => recibir(i)} disabled={!listo} className={btnOk(listo)}>Registrar recepción</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-3 text-slate-500 text-[11px]">Si la cantidad recibida es menor a la pedida, el ítem pasa a Incompleto automáticamente (visible en Compras y Almacén); al llegar el saldo se registra otra recepción y pasa a Entregado.</div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-md p-4 mb-3">
        <div className="text-[11px] font-bold tracking-widest text-slate-500 uppercase mb-3">Stock del almacén · {proy}</div>
        {stock.length === 0 ? (
          <div className="text-center py-6 text-slate-500 text-sm">Sin materiales en este almacén. El stock se forma con las recepciones registradas arriba.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr>{['Código', 'Material', 'Und', 'Recibido', 'Salidas', 'Préstamos ±', 'Stock', 'Cant. salida', 'N° hoja de trabajo', 'Zona de trabajo', ''].map((h, i) => <th key={i} className={thCls}>{h}</th>)}</tr></thead>
              <tbody>
                {stock.map(s => {
                  const f = fSal[s.cod] || { cant: '', hoja: '', zona: '' };
                  const setS = (k, v) => setFSal({ ...fSal, [s.cod]: { ...f, [k]: v } });
                  const listo = Number(f.cant) > 0 && Number(f.cant) <= s.stock && f.hoja.trim() && f.zona.trim();
                  return (
                    <tr key={s.cod} className="border-b border-slate-800 align-top">
                      <td className="py-2 px-1.5 font-mono text-[11px] text-slate-500">{s.cod}</td>
                      <td className="py-2 px-1.5 text-slate-200">{s.desc}</td>
                      <td className="py-2 px-1.5 text-slate-500">{s.und}</td>
                      <td className="py-2 px-1.5 font-mono text-slate-300">{s.recibido}</td>
                      <td className="py-2 px-1.5 font-mono text-slate-300">{s.salido}</td>
                      <td className={`py-2 px-1.5 font-mono ${s.prestNeto < 0 ? 'text-purple-400' : s.prestNeto > 0 ? 'text-green-400' : 'text-slate-500'}`}>{s.prestNeto > 0 ? '+' + s.prestNeto : s.prestNeto}</td>
                      <td className={`py-2 px-1.5 font-mono font-bold ${s.stock > 0 ? 'text-green-400' : 'text-slate-500'}`}>{s.stock}</td>
                      <td className="py-2 px-1.5"><input type="number" min="1" step="any" value={f.cant} onChange={e => { const v = e.target.value; if (v === '' || Number(v) > 0) setS('cant', v); }} className={`w-16 ${inputCls}`} />
                        {Number(f.cant) > s.stock && <div className="text-[9px] text-red-400 mt-1">Excede stock</div>}</td>
                      <td className="py-2 px-1.5"><input value={f.hoja} onChange={e => setS('hoja', e.target.value)} placeholder="HT-001" className={`w-20 ${inputCls} font-mono`} /></td>
                      <td className="py-2 px-1.5"><input value={f.zona} onChange={e => setS('zona', e.target.value)} placeholder="Piso 3 - Dpto 301" className={`w-32 ${inputCls}`} /></td>
                      <td className="py-2 px-1.5">
                        <button onClick={() => darSalida(s, f)} disabled={!listo} className={btnOk(listo)}>Registrar salida</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-3 text-slate-500 text-[11px]">Toda salida exige N° de hoja de trabajo y zona de trabajo. Stock = recibido − salidas ± préstamos.</div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-md p-4 mb-3">
        <div className="text-[11px] font-bold tracking-widest text-slate-500 uppercase mb-3">Préstamos entre almacenes</div>
        <div className="grid md:grid-cols-5 gap-2 mb-3">
          <div className="md:col-span-2"><label className={lblCls}>Material (con stock)</label>
            <select value={fPres.cod} onChange={e => setFPres({ ...fPres, cod: e.target.value })} className={`w-full ${inputCls}`}>
              <option value="">— Elegir —</option>
              {stock.filter(s => s.stock > 0).map(s => <option key={s.cod} value={s.cod}>{s.desc} (stock: {s.stock})</option>)}</select></div>
          <div><label className={lblCls}>Cantidad</label>
            <input type="number" min="1" step="any" value={fPres.cant} onChange={e => { const v = e.target.value; if (v === '' || Number(v) > 0) setFPres({ ...fPres, cant: v }); }} className={`w-full ${inputCls}`} />
            {matPres && Number(fPres.cant) > matPres.stock && <div className="text-[9px] text-red-400 mt-1">Excede stock</div>}</div>
          <div><label className={lblCls}>Almacén destino</label>
            <FiltroProyecto value={fPres.destino} onChange={v => setFPres({ ...fPres, destino: v })} excluir={proy} /></div>
          <div><label className={lblCls}>Quién autoriza *</label>
            <input value={fPres.autoriza} onChange={e => setFPres({ ...fPres, autoriza: e.target.value })} placeholder="Nombre" className={`w-full ${inputCls}`} /></div>
        </div>
        <button onClick={prestar} disabled={!presOk} className={btnOk(!!presOk)}>Registrar préstamo</button>

        {presProy.length > 0 && (
          <div className="overflow-x-auto mt-4">
            <table className="w-full text-xs">
              <thead><tr>{['#', 'Fecha', 'Material', 'Cant', 'Origen', 'Destino', 'Autoriza', 'Estado', 'Acción'].map((h, i) => <th key={i} className={thCls}>{h}</th>)}</tr></thead>
              <tbody>
                {presProy.map(p => (
                  <tr key={p.n} className="border-b border-slate-800 align-top">
                    <td className="py-2 px-1.5 font-mono text-[11px] text-slate-500">{p.n}</td>
                    <td className="py-2 px-1.5 text-slate-400">{fmt(p.fecha)}</td>
                    <td className="py-2 px-1.5 text-slate-200">{p.desc} <span className="text-slate-500">({p.cant} {p.und})</span>
                      {p.motivoAnulacion && <div className="text-red-400 text-[10px] mt-1">Anulado: {p.motivoAnulacion} ({p.anuladoPor})</div>}</td>
                    <td className="py-2 px-1.5 font-mono text-slate-200">{p.cant}</td>
                    <td className={`py-2 px-1.5 ${p.origen === proy ? 'text-purple-400 font-semibold' : 'text-slate-400'}`}>{p.origen}</td>
                    <td className={`py-2 px-1.5 ${p.destino === proy ? 'text-green-400 font-semibold' : 'text-slate-400'}`}>{p.destino}</td>
                    <td className="py-2 px-1.5 text-slate-400">{p.autoriza}</td>
                    <td className="py-2 px-1.5"><span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${pillEstado(p.estado)}`}>{p.estado}{p.estado === 'Transferido' ? ' al costo' : ''}</span></td>
                    <td className="py-2 px-1.5">
                      {p.estado === 'Prestado' && (
                        <div>
                          <div className="flex gap-1">
                            <button onClick={() => setPres(p.n, 'Devuelto')} className={btnVerde}>Devuelto</button>
                            <button onClick={() => setPres(p.n, 'Transferido')}
                              className="px-2 py-1 rounded text-[9px] font-bold uppercase bg-sky-950 text-sky-400 border border-sky-800 hover:bg-sky-900">Transferir al costo</button>
                          </div>
                          <AnularBox onConfirm={m => anularPrestamo(p.n, m)} />
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-3 text-slate-500 text-[11px]">Un préstamo resta stock al origen y suma al destino, y queda como deuda. "Devuelto" revierte el stock; "Transferir al costo" lo vuelve permanente y el gasto pasa al proyecto destino. Anular exige motivo y solo procede si el destino no consumió el material.</div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-md p-4">
        <div className="text-[11px] font-bold tracking-widest text-slate-500 uppercase mb-3">Salidas registradas · {proy} · verificación de uso</div>
        {salidasProy.length === 0 ? (
          <div className="text-center py-6 text-slate-500 text-sm">Sin salidas registradas en {proy}.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr>{['#', 'Fecha', 'Material', 'Cant', 'Hoja de trabajo', 'Zona', 'Uso', 'Acción', ''].map((h, i) => <th key={i} className={thCls}>{h}</th>)}</tr></thead>
              <tbody>
                {salidasProy.map(sa => {
                  const v = verif[sa.n];
                  return (
                    <tr key={sa.n} className={`border-b border-slate-800 align-top ${sa.anulada ? 'opacity-50' : ''}`}>
                      <td className="py-2 px-1.5 font-mono text-[11px] text-slate-500">{sa.n}</td>
                      <td className="py-2 px-1.5 text-slate-400">{fmt(sa.fecha)}</td>
                      <td className="py-2 px-1.5 text-slate-200">{sa.desc} <span className="text-slate-500">({sa.und})</span>
                        {sa.anulada && <div className="text-red-400 text-[10px] mt-1">ANULADA: {sa.motivoAnulacion} ({sa.anuladoPor}, {fmt(sa.fechaAnulacion)})</div>}</td>
                      <td className="py-2 px-1.5 font-mono text-slate-200">{sa.cant}</td>
                      <td className="py-2 px-1.5 font-mono text-slate-200">{sa.hoja}</td>
                      <td className="py-2 px-1.5 text-slate-400">{sa.zona}</td>
                      <td className="py-2 px-1.5">
                        {sa.anulada ? <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-slate-800 text-red-300 line-through">Anulada</span>
                        : sa.uso === 'Pendiente' ? <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-yellow-950 text-yellow-400">Pendiente</span>
                        : sa.uso === 'Correcto' ? <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-green-950 text-green-400">Correcto uso</span>
                        : <div><span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-red-950 text-red-400">Uso incorrecto</span>
                            <div className="text-red-400 text-[10px] mt-1">{sa.motivoUso}</div></div>}
                      </td>
                      <td className="py-2 px-1.5">
                        {!sa.anulada && sa.uso === 'Pendiente' && !v && (
                          <div className="flex gap-1">
                            <button onClick={() => marcarUso(sa.n, 'Correcto')} className={btnVerde}>Correcto uso</button>
                            <button onClick={() => setVerif({ ...verif, [sa.n]: { motivo: MOTIVOS_USO[0], otro: '' } })} className={btnRojo}>Uso incorrecto</button>
                          </div>
                        )}
                        {v && (
                          <div className="w-48">
                            <select value={v.motivo} onChange={e => setVerif({ ...verif, [sa.n]: { ...v, motivo: e.target.value } })} className={`w-full ${inputCls}`}>
                              {MOTIVOS_USO.map(x => <option key={x}>{x}</option>)}</select>
                            {v.motivo === 'Otro' && (
                              <input value={v.otro} onChange={e => setVerif({ ...verif, [sa.n]: { ...v, otro: e.target.value } })}
                                placeholder="Especificar…" className={`w-full mt-1 ${inputCls}`} />
                            )}
                            <button onClick={() => confirmarIncorrecto(sa.n)} disabled={v.motivo === 'Otro' && !v.otro.trim()}
                              className={`mt-1 w-full px-2 py-1.5 rounded text-[9px] font-bold uppercase ${(v.motivo !== 'Otro' || v.otro.trim()) ? 'bg-red-950 text-red-400 border border-red-800 hover:bg-red-900' : 'bg-slate-800 text-slate-600 cursor-not-allowed'}`}>
                              Confirmar uso incorrecto</button>
                          </div>
                        )}
                      </td>
                      <td className="py-2 px-1.5">{!sa.anulada && <AnularBox onConfirm={m => anularSalida(sa.n, m)} />}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Tablero({ rqs, facturas, prestamos, salidas }) {
  const [proy, setProy] = useState('TODOS');
  const [pagoF, setPagoF] = useState(null);
  const rqsF = rqs.filter(r => proy === 'TODOS' || r.proyecto === proy);
  const flatAll = rqs.flatMap(r => r.items.map(i => ({ ...i, rq: r.n, canal: r.canal, proyecto: r.proyecto, partida: r.partida, fechaRQ: r.fechaRQ, residente: r.residente })));
  const flat = flatAll.filter(i => proy === 'TODOS' || i.proyecto === proy);
  const urg = rqsF.filter(r => r.canal === 'URGENTE').length;
  const pctUrg = rqsF.length ? Math.round(urg / rqsF.length * 100) : 0;
  const entregados = flat.filter(i => i.estado === 'Entregado').length;
  const tarde = flat.filter(i => i.fechaEntrega && i.fecha && dias(i.fecha, i.fechaEntrega) < 0).length;
  const factF = facturas.filter(f => proy === 'TODOS' || f.proyecto === proy);
  const presActivos = prestamos.filter(p => p.estado === 'Prestado' && (proy === 'TODOS' || p.origen === proy || p.destino === proy)).length;

  const holguras = flat.filter(i => i.fechaEntrega && i.fecha).map(i => dias(i.fecha, i.fechaEntrega));
  const holgProm = holguras.length ? (holguras.reduce((a, b) => a + b, 0) / holguras.length).toFixed(1) : '—';
  const aTiempo = holguras.length ? Math.round(holguras.filter(h => h >= 0).length / holguras.length * 100) + '%' : '—';
  const salF = salidas.filter(s => !s.anulada && (proy === 'TODOS' || s.proyecto === proy));
  const verificadas = salF.filter(s => s.uso !== 'Pendiente');
  const pctIncorrecto = verificadas.length ? Math.round(verificadas.filter(s => s.uso === 'Incorrecto').length / verificadas.length * 100) + '%' : '—';
  const faltaAntig = flat.filter(i => i.pago === 'Falta').map(i => dias(HOY_ISO, i.fechaRQ));
  const faltaMax = faltaAntig.length ? Math.max(...faltaAntig) + 'd' : '—';

  const porResidente = Object.values(rqsF.reduce((acc, r) => {
    const k = r.residente || '—';
    if (!acc[k]) acc[k] = { residente: k, rqs: 0, urg: 0, items: 0, rech: 0 };
    acc[k].rqs++; if (r.canal === 'URGENTE') acc[k].urg++;
    acc[k].items += r.items.length;
    acc[k].rech += r.items.filter(i => i.decision === 'Rechazado').length;
    return acc;
  }, {}));

  const porProyecto = PROYECTOS.map(([c, p]) => {
    const rp = rqs.filter(r => r.proyecto === p);
    const ip = flatAll.filter(i => i.proyecto === p);
    const hs = ip.filter(i => i.fechaEntrega && i.fecha).map(i => dias(i.fecha, i.fechaEntrega));
    const sp = salidas.filter(s => !s.anulada && s.proyecto === p && s.uso !== 'Pendiente');
    return {
      p, rqs: rp.length,
      urg: rp.length ? Math.round(rp.filter(r => r.canal === 'URGENTE').length / rp.length * 100) + '%' : '—',
      fact: facturas.filter(f => f.proyecto === p).reduce((a, f) => a + f.monto, 0),
      holg: hs.length ? (hs.reduce((a, b) => a + b, 0) / hs.length).toFixed(1) : '—',
      incorr: sp.length ? Math.round(sp.filter(s => s.uso === 'Incorrecto').length / sp.length * 100) + '%' : '—',
      pres: prestamos.filter(x => x.estado === 'Prestado' && x.origen === p).length,
    };
  }).filter(x => x.rqs > 0 || x.fact > 0 || x.pres > 0);

  const kpis = [['RQs', rqsF.length], ['Ítems', flat.length], ['% Urgentes', pctUrg + '%'], ['Entregados', entregados], ['Llegaron tarde', tarde], ['Rechazados', flat.filter(i => i.decision === 'Rechazado').length], ['Anulados', flat.filter(i => i.decision === 'Anulado').length], ['Incompletos', flat.filter(i => i.estado === 'Incompleto').length], ['Facturado S/', factF.reduce((a, f) => a + f.monto, 0).toFixed(0)], ['Préstamos activos', presActivos], ['Holgura prom.', holgProm + (holgProm !== '—' ? 'd' : '')], ['Entrega a tiempo', aTiempo], ['Uso incorrecto', pctIncorrecto], ['Falta pago más antiguo', faltaMax]];
  const nCredito = flat.filter(i => i.pago === 'Crédito').length;
  const nFalta = flat.filter(i => i.pago === 'Falta').length;
  const flatShown = pagoF ? flat.filter(i => i.pago === pagoF) : flat;

  return (
    <div>
      <div className="flex items-center mb-3">
        <div className="ml-auto"><FiltroProyecto value={proy} onChange={setProy} todos /></div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2.5 mb-3">
        {kpis.map(([l, n], i) => (
          <div key={i} className="bg-slate-900 border border-slate-800 border-l-2 border-l-yellow-400 p-3">
            <div className="font-mono text-2xl text-slate-100">{n}</div>
            <div className="text-[9px] font-bold tracking-widest text-slate-500 uppercase mt-0.5">{l}</div>
          </div>
        ))}
        <button onClick={() => setPagoF(pagoF === 'Crédito' ? null : 'Crédito')}
          className={`text-left bg-slate-900 border p-3 border-l-2 border-l-sky-400 ${pagoF === 'Crédito' ? 'border-sky-400 ring-1 ring-sky-400' : 'border-slate-800 hover:border-slate-600'}`}>
          <div className="font-mono text-2xl text-sky-400">{nCredito}</div>
          <div className="text-[9px] font-bold tracking-widest text-slate-500 uppercase mt-0.5">Pago crédito {pagoF === 'Crédito' ? '· filtrando ✕' : '· ver'}</div>
        </button>
        <button onClick={() => setPagoF(pagoF === 'Falta' ? null : 'Falta')}
          className={`text-left bg-slate-900 border p-3 border-l-2 border-l-red-400 ${pagoF === 'Falta' ? 'border-red-400 ring-1 ring-red-400' : 'border-slate-800 hover:border-slate-600'}`}>
          <div className="font-mono text-2xl text-red-400">{nFalta}</div>
          <div className="text-[9px] font-bold tracking-widest text-slate-500 uppercase mt-0.5">Pago falta {pagoF === 'Falta' ? '· filtrando ✕' : '· ver'}</div>
        </button>
      </div>
      {(porResidente.length > 0 || porProyecto.length > 0) && (
      <div className="grid lg:grid-cols-2 gap-3 mb-3">
        <div className="bg-slate-900 border border-slate-800 rounded-md p-4">
          <div className="text-[11px] font-bold tracking-widest text-slate-500 uppercase mb-3">Planificación por residente · % urgentes = mala planificación</div>
          {porResidente.length === 0 ? <div className="text-slate-500 text-sm text-center py-4">Sin datos.</div> : (
          <table className="w-full text-xs">
            <thead><tr>{['Residente', 'RQs', '% Urgentes', 'Ítems', 'Rechazados'].map((h, i) => <th key={i} className={thCls}>{h}</th>)}</tr></thead>
            <tbody>
              {porResidente.map(r => {
                const pct = Math.round(r.urg / r.rqs * 100);
                return (
                  <tr key={r.residente} className="border-b border-slate-800">
                    <td className="py-2 px-1.5 text-slate-200">{r.residente}</td>
                    <td className="py-2 px-1.5 font-mono text-slate-200">{r.rqs}</td>
                    <td className={`py-2 px-1.5 font-mono font-bold ${pct >= 50 ? 'text-red-400' : pct >= 25 ? 'text-yellow-400' : 'text-green-400'}`}>{pct}%</td>
                    <td className="py-2 px-1.5 font-mono text-slate-300">{r.items}</td>
                    <td className="py-2 px-1.5 font-mono text-slate-300">{r.rech}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>)}
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-md p-4">
          <div className="text-[11px] font-bold tracking-widest text-slate-500 uppercase mb-3">Resumen por proyecto</div>
          {porProyecto.length === 0 ? <div className="text-slate-500 text-sm text-center py-4">Sin datos.</div> : (
          <table className="w-full text-xs">
            <thead><tr>{['Proyecto', 'RQs', '% Urg', 'Facturado S/', 'Holgura prom', '% Uso incorr.', 'Prést. activos'].map((h, i) => <th key={i} className={thCls}>{h}</th>)}</tr></thead>
            <tbody>
              {porProyecto.map(x => (
                <tr key={x.p} className="border-b border-slate-800">
                  <td className="py-2 px-1.5 text-slate-200">{x.p}</td>
                  <td className="py-2 px-1.5 font-mono text-slate-300">{x.rqs}</td>
                  <td className="py-2 px-1.5 font-mono text-slate-300">{x.urg}</td>
                  <td className="py-2 px-1.5 font-mono text-slate-200 text-right">{x.fact.toFixed(2)}</td>
                  <td className="py-2 px-1.5 font-mono text-slate-300">{x.holg}{x.holg !== '—' ? 'd' : ''}</td>
                  <td className="py-2 px-1.5 font-mono text-slate-300">{x.incorr}</td>
                  <td className="py-2 px-1.5 font-mono text-slate-300">{x.pres}</td>
                </tr>
              ))}
            </tbody>
          </table>)}
        </div>
      </div>
      )}
      <div className="bg-slate-900 border border-slate-800 rounded-md p-4">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <div className="text-[11px] font-bold tracking-widest text-slate-500 uppercase">Registro consolidado{pagoF ? ` · mostrando solo ítems con pago "${pagoF}"` : ''}</div>
          <div className="ml-auto flex items-center gap-1.5 flex-wrap">
            <button onClick={() => descargarCSV(flatAll, 'consolidado_global_' + HOY_ISO)} disabled={!flatAll.length}
              className={btnOk(flatAll.length > 0)}>⤓ CSV Global</button>
            {PROYECTOS.filter(([c, p]) => flatAll.some(i => i.proyecto === p)).map(([c, p]) => (
              <button key={c} onClick={() => descargarCSV(flatAll.filter(i => i.proyecto === p), 'consolidado_' + p.replace(/ /g, '_') + '_' + HOY_ISO)}
                className="px-2 py-1.5 rounded text-[9px] font-bold uppercase bg-slate-800 text-slate-300 border border-slate-700 hover:border-yellow-400 hover:text-yellow-400">⤓ {p}</button>
            ))}
          </div>
        </div>
        {flatShown.length === 0 ? (
          <div className="text-center py-10 text-slate-500 text-sm">{pagoF ? `No hay ítems con pago "${pagoF}".` : 'Sin registros todavía.'}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr>{['Canal', 'RQ', 'Partida', 'Proyecto', 'Código', 'Descripción', 'Destino', 'Und', 'Cant', 'F. Req', 'F. Nec', 'Decisión', 'Estado', 'M. rechazo / anulación', 'Pago', 'Factura', 'F. entrega', 'Recibido', 'Obs. almacén', 'Llegó', 'Holgura', 'Saldo'].map((h, i) => <th key={i} className={thCls}>{h}</th>)}</tr></thead>
              <tbody>
                {flatShown.map((i, k) => {
                  const llego = i.fechaEntrega ? dias(i.fechaEntrega, i.fechaRQ) : null;
                  const holg = i.fechaEntrega && i.fecha ? dias(i.fecha, i.fechaEntrega) : null;
                  const saldoDias = i.fechaEntregaSaldo && i.fechaEntrega ? dias(i.fechaEntregaSaldo, i.fechaEntrega) : null;
                  return (
                    <tr key={k} className="border-b border-slate-800">
                      <td className="py-2 px-1.5"><span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-slate-800 ${i.canal === 'URGENTE' ? 'text-red-400' : i.canal === 'GENERAL' ? 'text-green-400' : 'text-yellow-400'}`}>{i.canal}</span></td>
                      <td className="py-2 px-1.5 font-mono text-[11px] text-slate-200">{String(i.rq).padStart(3, '0')}</td>
                      <td className="py-2 px-1.5 font-mono text-[11px] text-slate-500">{i.partida}</td>
                      <td className="py-2 px-1.5 text-slate-400 whitespace-nowrap">{i.proyecto}</td>
                      <td className="py-2 px-1.5 font-mono text-[11px] text-slate-500">{i.cod}</td>
                      <td className="py-2 px-1.5 text-slate-200 whitespace-nowrap">{i.desc}</td>
                      <td className="py-2 px-1.5 text-slate-400">{i.destino}</td>
                      <td className="py-2 px-1.5 text-slate-500">{i.und}</td>
                      <td className="py-2 px-1.5 font-mono text-slate-200">{i.cant}</td>
                      <td className="py-2 px-1.5 text-slate-400">{fmt(i.fechaRQ)}</td>
                      <td className="py-2 px-1.5 text-slate-200">{fmt(i.fecha)}</td>
                      <td className="py-2 px-1.5"><span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${pillEstado(i.decision)}`}>{i.decision}</span></td>
                      <td className="py-2 px-1.5"><span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${pillEstado(i.estado)}`}>{i.estado}</span></td>
                      <td className="py-2 px-1.5 text-red-400 text-[10px]">{i.motivoRechazo || (i.motivoAnulacion ? `${i.motivoAnulacion} (${i.anuladoPor})` : '—')}</td>
                      <td className="py-2 px-1.5 text-slate-400">{i.pago}</td>
                      <td className="py-2 px-1.5 font-mono text-[11px] text-green-400">{i.factura || '—'}</td>
                      <td className="py-2 px-1.5 text-slate-200">{fmt(i.fechaEntrega)}</td>
                      <td className="py-2 px-1.5 font-mono text-slate-300">{i.cantRecibida != null ? `${i.cantRecibida}/${i.cant}` : '—'}</td>
                      <td className="py-2 px-1.5 text-slate-400 text-[10px]">{i.obsAlmacen || '—'}</td>
                      <td className="py-2 px-1.5 font-mono text-slate-300">{llego !== null ? llego + 'd' : '—'}</td>
                      <td className={`py-2 px-1.5 font-mono ${holg === null ? 'text-slate-600' : holg < 0 ? 'text-red-400' : 'text-green-400'}`}>{holg !== null ? holg + 'd' : '—'}</td>
                      <td className="py-2 px-1.5 font-mono text-slate-300">{saldoDias !== null ? saldoDias + 'd' : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const stored = useMemo(() => cargarEstado(), []);
  const [user, setUser] = useState(null);
  const [rol, setRol] = useState('res');
  const [rqs, setRqs] = useState(stored.rqs || []);
  const [salidas, setSalidas] = useState(stored.salidas || []);
  const [catalogoExtra, setCatalogoExtra] = useState(stored.catalogoExtra || []);
  const [solicitudes, setSolicitudes] = useState(stored.solicitudes || []);
  const [facturas, setFacturas] = useState(stored.facturas || []);
  const [prestamos, setPrestamos] = useState(stored.prestamos || []);
  const [provExtra, setProvExtra] = useState(stored.provExtra || []);

  const catalogo = useMemo(() => [...CAT, ...catalogoExtra], [catalogoExtra]);
  const proveedores = useMemo(() => [...PROV_BASE, ...provExtra], [provExtra]);

  useEffect(() => {
    guardarEstado({ rqs, salidas, catalogoExtra, solicitudes, facturas, prestamos, provExtra });
  }, [rqs, salidas, catalogoExtra, solicitudes, facturas, prestamos, provExtra]);

  if (!user) return (
    <div className="bg-slate-950 min-h-screen text-slate-100" style={{ fontFamily: 'system-ui, sans-serif' }}>
      <Login onLogin={u => { setUser(u); setRol(TAB_INICIAL[u.rol]); }} />
    </div>
  );

  const tabs = TABS_POR_ROL[user.rol];
  const reiniciar = () => {
    if (window.confirm('¿Borrar TODOS los datos del sistema (RQs, salidas, facturas, préstamos)? Esta acción no se puede deshacer.')) {
      try { window.localStorage.removeItem(STORE_KEY); } catch (e) {}
      window.location.reload();
    }
  };

  return (
    <div className="bg-slate-950 min-h-screen text-slate-100" style={{ fontFamily: 'system-ui, sans-serif' }}>
      <div className="bg-black border-b-2 border-yellow-400 px-4 py-3 flex items-center gap-3 flex-wrap">
        <div className="font-extrabold text-sm tracking-widest text-yellow-400">
          COPACABANA <span className="text-slate-600 font-medium">/ RQ</span></div>
        <div className="text-slate-400 text-[11px]">{user.nombre}{user.proyecto ? ' · ' + user.proyecto : ''} <span className="text-slate-600">({user.rol})</span></div>
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <div className="flex gap-0.5 bg-slate-800 p-1 rounded">
            {tabs.map(([k, l]) => (
              <button key={k} onClick={() => setRol(k)}
                className={`px-3 py-1.5 rounded text-[11px] font-semibold tracking-wide uppercase ${rol === k ? 'bg-yellow-400 text-slate-950' : 'text-slate-400 hover:text-slate-200'}`}>{l}</button>
            ))}
          </div>
          {user.rol === 'gerente' && <button onClick={reiniciar} className="text-[10px] text-slate-600 hover:text-red-400 underline underline-offset-2">Reiniciar datos</button>}
          <button onClick={() => setUser(null)} className="px-2.5 py-1.5 rounded text-[10px] font-bold uppercase bg-slate-800 text-slate-400 border border-slate-700 hover:text-slate-200">Salir</button>
        </div>
      </div>
      <div className="p-4">
        {rol === 'res' && <Residente user={user} rqs={rqs} setRqs={setRqs} catalogo={catalogo} solicitudes={solicitudes} setSolicitudes={setSolicitudes} />}
        {rol === 'com' && <Compras user={user} rqs={rqs} setRqs={setRqs} facturas={facturas} setFacturas={setFacturas} proveedores={proveedores} setProvExtra={setProvExtra} provExtra={provExtra} />}
        {rol === 'alm' && <Almacen user={user} rqs={rqs} setRqs={setRqs} salidas={salidas} setSalidas={setSalidas} prestamos={prestamos} setPrestamos={setPrestamos} />}
        {rol === 'cat' && <Catalogo catalogo={catalogo} setCatalogoExtra={setCatalogoExtra} catalogoExtra={catalogoExtra} solicitudes={solicitudes} setSolicitudes={setSolicitudes} />}
        {rol === 'tab' && <Tablero rqs={rqs} facturas={facturas} prestamos={prestamos} salidas={salidas} />}
      </div>
    </div>
  );
}
