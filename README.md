# RedNexo

Inteligencia sociométrica para psicólogos escolares.

| Pieza | Dónde |
|---|---|
| Código | Este repo (rama `main`) |
| Publicación | Firebase Hosting, proyecto `rednexo-fd35c` |
| Login y datos | Firebase Authentication y Firestore |

## Ejecutar

```bash
npm install
npm run dev
npm run build
```

## Publicar

Un `git push` a `main` publica solo, con GitHub Actions (`.github/workflows/firebase-hosting-merge.yml`):
instala, compila y despliega a `rednexo-fd35c`. No se publica a mano.

Cada pull request genera además una URL de vista previa (`firebase-hosting-pull-request.yml`), sin tocar el sitio en línea.
Ambos flujos requieren el secreto `FIREBASE_SERVICE_ACCOUNT_REDNEXO_FD35C` en Settings → Secrets and variables → Actions.

## Varios colegios

Los datos de cada colegio viven aislados en `colegios/{id}/...` (estudiantes, grupos, encuestas, respuestas, actividad, ajustes y miembros).
Los roles son por colegio: `admin`, `psychologist` y `readonly`. El superadmin de la plataforma (definido en `firestore.rules`) crea colegios y accede a todos.
Las encuestas públicas usan `?c=COLEGIO&survey=ID`; un enlace antiguo `?survey=ID` apunta al colegio `inicial`.

### Pasar de las colecciones globales a colegios (una sola vez, con datos reales)
1. Desplegar primero las reglas y el índice (son aditivos: la app anterior sigue funcionando):
   `firebase deploy --only firestore --project rednexo-fd35c`
2. Publicar la web (merge a `main`).
3. Entrar como superadmin → «Importar datos existentes». Copia todo al colegio `inicial` sin borrar nada y se puede repetir.
4. Revisar el colegio `inicial` (estudiantes, encuestas, usuarios). Subir el logo en Config.
5. Cuando todo esté verificado, las colecciones globales antiguas pueden quedar congeladas o borrarse a mano.

## Operación de la plataforma (dueño / Iskonex)
- **Superadmin raíz**: definido en `firestore.rules` (`isRoot()`); es la salida de emergencia y la aplicación no puede quitarle el acceso. Para cambiarlo, edita ese archivo y despliega.
- **Superadmins adicionales**: la raíz los agrega o desactiva desde el selector de colegios (colección `superadmins`). Usa correos corporativos con verificación en dos pasos en Google. Para pasar la raíz a un correo corporativo: agrégalo como superadmin, edita `isRoot()` y despliega las reglas.
- **Suspender / reactivar un colegio**: bloquea a sus usuarios y a su encuesta pública sin borrar datos (campo `estado` del colegio). El superadmin sigue pudiendo entrar.
- **Exportar**: descarga un JSON con todo el colegio (el superadmin desde el selector; el administrador del colegio desde Config).
- **Eliminar**: irreversible; exige marcar que se descargó la exportación y escribir el identificador del colegio.
- **Bitácora** (`auditoria`, solo lectura para superadmins, no editable): crear, suspender, reactivar, exportar, eliminar, altas/bajas de superadmins y accesos de soporte a colegios ajenos.

## Pruebas
- `npm test` — lógica pura (conexiones, densidad, importación masiva, migración, exportación).
- `npm run test:rules` — reglas de Firestore y aislamiento entre colegios (emulador; requiere Java).
- `npm run test:e2e` — encuesta pública y flujos con sesión contra los emuladores (requiere Playwright instalado).
