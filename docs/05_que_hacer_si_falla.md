# Qué hacer si el sistema falla

Una página. Para leer el día que pasa, no antes.

**Responsable del sistema:** Joaquín. Si él no está localizable, quien esté a
cargo de la obra activa el respaldo por su cuenta con esta hoja.

---

## 1. Primero: ¿está caído de verdad?

Antes de declarar una caída, comprobar en este orden:

1. **¿Le pasa a más de una persona?** Si solo una no puede entrar, es su cuenta
   o su señal, no el sistema. Que pruebe con datos móviles en vez de wifi.
2. **Abrir https://rq-sistemas.vercel.app desde otro teléfono.**
   - Carga bien → el sistema está en pie.
   - Pantalla en blanco o error → seguir al punto 2.

**Solo Joaquín declara la caída.** Si cada uno decide por su cuenta, la mitad
del equipo se pasa al WhatsApp sin necesidad.

---

## 2. Mientras esté caído: se trabaja por WhatsApp

La obra **no se para**. Se sigue pidiendo y comprando, pero por el canal viejo.

### El residente manda al grupo un mensaje con TODO esto

Sin estos datos, después no se puede cargar al sistema y se pierde el rastro:

```
RQ MANUAL - <OBRA>
Partida:
Nivel:
Fecha necesitada:
Material / cantidad / dónde se usará:   (una línea por material)
Si es urgente, por qué no se previó:
```

### Compras

Compra normalmente. **Guarda todas las facturas físicas**: van a haber que
registrarse una por una cuando vuelva el sistema.

### Almacén

Recibe normalmente y **anota en papel o toma foto de la guía**: material,
cantidad recibida, fecha, y si llegó incompleto.

### La regla sigue en pie

"RQ que no entra por el sistema, no se compra" **no se suspende**: se aplaza.
Todo lo que se pida por WhatsApp durante la caída **tiene que entrar al sistema
después**. Lo que no se cargue, no existió.

---

## 3. Cuando vuelva: cargar lo atrasado

**Esta es la parte que decide si el sistema sobrevive.** Un respaldo sin
regreso se convierte en el método permanente.

- **Plazo: el mismo día que vuelve el sistema.** No "cuando haya tiempo".
- **Quién:** cada uno carga lo suyo — el residente sus RQs, Compras sus
  facturas, el almacén sus recepciones.
- **Joaquín verifica** que la cantidad de mensajes del grupo coincida con lo
  cargado. Si faltan, se persiguen ese mismo día.

Mientras haya cosas sin cargar, **el sistema está mintiendo**: el stock, los
indicadores y la deuda están incompletos, y las decisiones que se tomen con
esos números van a estar mal.

---

## 4. Otros casos

**Alguien no puede entrar**
Su contraseña o su cuenta. Joaquín la restablece desde Supabase →
Authentication → Users. Nunca se presta la cuenta de otra persona: todo lo que
haga quedará firmado con el nombre equivocado.

**Un dato salió mal**
No se corrige por fuera de la app ni se borra nada de la base. Cada cosa tiene
su camino: los ítems se anulan con motivo (lo confirma gerencia), las facturas
se anulan y se registran de nuevo, las rendiciones se observan y se corrigen.
Si algo no tiene camino, se anota y se resuelve después — nunca a mano en la
base de datos.

**Supabase o Vercel están caídos**
No hay nada que hacer del lado nuestro: son servicios de terceros. Se comprueba
en status.supabase.com y vercel-status.com, se avisa al grupo y se trabaja con
el respaldo del punto 2.

**Se perdieron o corrompieron datos**
Supabase → Database → Backups. Restaurar **pierde todo lo hecho desde el
respaldo**, así que la decisión es de Joaquín, no automática. Antes de
restaurar: anotar qué se hizo desde entonces para volver a cargarlo.

---

## 5. Lo que nunca se hace

- Editar datos directamente en la base "para arreglar rápido". Rompe el rastro
  y no queda registro de quién lo hizo.
- Compartir una cuenta. Cada acción queda firmada: si dos personas usan la
  misma, la firma no vale nada.
- Dejar para mañana la carga de lo que se hizo por WhatsApp.
