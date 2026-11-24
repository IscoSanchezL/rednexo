// Explicación de cada indicador, en lenguaje claro: la usan las ayudas «ⓘ» del Dashboard, los gráficos y los reportes.
// Las pautas de «cuándo vigilar» son orientativas: apoyan la lectura del psicólogo, no son un diagnóstico.

export const GLOSARIO = {
  densidad: {
    titulo: "Densidad",
    que: "Qué tan conectado está el grupo: conexiones reales ÷ conexiones posibles (n × (n − 1)).",
    como: "Compárala entre grupos del mismo colegio o entre aplicaciones del mismo grupo. Un número suelto dice poco: depende del máximo de elecciones y del número de preguntas.",
    vigilar: "Mucho más baja que la de grupos parecidos, o que baja de una aplicación a la siguiente. Con varios aislados suele indicar subgrupos cerrados o poca cohesión.",
  },
  aceptacion: {
    titulo: "Aceptación",
    que: "Compañeros que lo eligieron positivamente ÷ (estudiantes − 1).",
    como: "Compárala con el promedio del grupo. Alta: tiene apoyo y referencias. Baja: pocos vínculos que la sostengan.",
    vigilar: "Muy por debajo del promedio, sobre todo si va acompañada de rechazo alto.",
  },
  rechazo: {
    titulo: "Rechazo",
    que: "Compañeros que lo marcaron negativamente ÷ (estudiantes − 1).",
    como: "Es la señal que más pesa. Mira también las justificaciones: explican el motivo.",
    vigilar: "Rechazo varias veces por encima del promedio, rechazo alto con aceptación baja, y rechazos mutuos repetidos.",
  },
  expansion: {
    titulo: "Expansión",
    que: "A cuántos compañeros eligió o marcó la persona ÷ (estudiantes − 1). Mide lo que emite, no lo que recibe.",
    como: "Baja: reservada o con un círculo muy cerrado (o dejó preguntas en blanco). Alta: reparte elecciones o marcas entre muchos.",
    vigilar: "No es buena ni mala por sí sola: importa si va con aceptación baja o con muchas marcas negativas emitidas.",
  },
  conexiones: {
    titulo: "Conexiones",
    que: "Vínculos dirigidos entre dos personas (A elige o marca a B). Cada par dirigido cuenta una vez, aunque se repita en varias preguntas.",
    como: "Las mutuas positivas (se eligen entre sí) son lo más protector. Una mutua negativa es un conflicto de dos lados.",
    vigilar: "Estudiantes sin ninguna mutua positiva, y rechazos mutuos.",
  },
  mutuas: {
    titulo: "Relaciones mutuas",
    que: "Dos personas que se eligen entre sí (mutua positiva) o se rechazan entre sí (rechazo mutuo).",
    como: "Las mutuas positivas son amistades de ida y vuelta.",
    vigilar: "Rechazos mutuos: conviene explorar qué los enfrenta.",
  },
  lider: { titulo: "Líder", que: "Lo eligen al menos la mitad de sus compañeros y casi no lo rechazan.", como: "Tiene influencia sobre el grupo.", vigilar: "Observa qué tipo de liderazgo ejerce y cómo trata a los demás." },
  controvertido: { titulo: "Controvertido", que: "Recibe muchas elecciones y también muchos rechazos.", como: "Polariza: unos lo buscan y otros lo rechazan.", vigilar: "Entender qué lo causa: puede ser carácter fuerte, conflictos o un liderazgo discutido." },
  rechazado: { titulo: "Rechazado", que: "Lo rechazan al menos la mitad de sus compañeros y casi nadie lo elige.", como: "Necesita atención y seguimiento.", vigilar: "Siempre. Revisa las justificaciones y el contexto antes de actuar." },
  aislado: { titulo: "Aislado", que: "Nadie lo eligió positivamente (puede haber sido mencionado de otras formas).", como: "No significa que nadie lo haya nombrado, sino que no recibió elecciones positivas.", vigilar: "Indaga si es timidez, llegada reciente u otra causa." },
  integrado: { titulo: "Integrado", que: "Tiene al menos 2 relaciones de elección mutua positiva.", como: "Tiene vínculos recíprocos, que es lo esperable.", vigilar: "Si además tiene rechazo alto, mira el aviso «Para tener en cuenta» del informe." },
  regular: { titulo: "Regular", que: "No cumple ninguno de los patrones anteriores.", como: "El caso típico, sin señal fuerte. «Regular» no significa «sin problema».", vigilar: "Mira los avisos que comparan con el promedio del grupo." },
};

export const ayuda = (clave) => GLOSARIO[clave] || null;
