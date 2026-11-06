# Encuesta realmente anónima — propuesta (pendiente de decisión)

## El problema de fondo
Un sociograma necesita saber **quién eligió a quién**. Si la encuesta es de verdad anónima, esa relación se pierde y
solo se pueden contar cuántas elecciones recibió cada estudiante. Hoy RedNexo es **confidencial** (el equipo ve quién
respondió; los compañeros no), no anónima.

## Qué se puede y qué no con modo anónimo
| Función | Confidencial (hoy) | Anónima (propuesta) |
|---|---|---|
| Elecciones recibidas por estudiante (popular, aislado, rechazado) | Sí | Sí |
| Ranking y reportes por grupo | Sí | Sí |
| Mapa de nodos y conexiones | Sí | **No** (no hay aristas) |
| Reciprocidad (se eligen mutuamente) | Sí | **No** |
| Matriz quién→quién | Sí | **No** |
| Reporte individual: "a quién eligió" | Sí | **No** (solo "quién lo eligió" tampoco) |
| Saber quién falta por responder | Sí | Sí (marca aparte, sin vínculo con la respuesta) |

## Diseño técnico propuesto
1. Campo `modo` en la encuesta: `confidencial` (por defecto) o `anonima`; se fija al crearla y no se cambia después.
2. Al enviar: la respuesta se guarda con **id aleatorio**, sin `respondentId` ni `respondentName`, y **sin `submittedAt`
   exacto** (se guarda solo el día) para que no se pueda emparejar con la marca por la hora.
3. La marca `responseMarks/{encuesta_estudiante}` se mantiene (evita responder dos veces y muestra el avance), pero ya no
   enlaza con ninguna respuesta.
4. Reglas: un tipo de respuesta nuevo con formato estricto para encuestas anónimas; las confidenciales no cambian.
5. Pantallas: Dashboard/Ranking/Reportes solo con conteos; Matriz, nodos y reporte individual muestran un aviso
   «Esta encuesta es anónima; no tiene relaciones».
6. Excel: solo tabla de elecciones recibidas, sin hojas de relaciones.
7. Texto al estudiante: «Tus respuestas son anónimas: ni el colegio sabe quién eligió a quién».

## Riesgos
- Con grupos pequeños el anonimato es débil (con 12 estudiantes y pocas elecciones se puede deducir quién fue).
- El equipo pierde la función más útil (el mapa) y el seguimiento individual.
- Hay que comunicarlo bien: «anónima» es una promesa fuerte; si falla, el colegio pierde la confianza.

## Decisión que necesito
¿Quieres este modo como **opción** al crear la encuesta (recomendado, con la confidencial como predeterminada) o prefieres
no ofrecerlo? Estimo ~1 jornada de desarrollo y pruebas.
