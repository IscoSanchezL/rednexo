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

## Vista previa

Cada pull request genera una URL de vista previa en Firebase Hosting
(`.github/workflows/firebase-hosting-pull-request.yml`), sin tocar el sitio en línea.
Requiere el secreto `FIREBASE_SERVICE_ACCOUNT_REDNEXO_FD35C` en Settings → Secrets and variables → Actions.
