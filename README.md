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
