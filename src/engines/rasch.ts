/**
 * Calibración de Rasch por lotes (7.7, D-025).
 *
 * Qué hace. Reestima la dificultad de cada pregunta y la habilidad de cada alumno con todas las
 * respuestas a la vez. Corre en un Web Worker (src/workers/rasch.worker.ts) para no trabar la
 * interfaz.
 * Entradas. Respuestas como tripletas de alumno, pregunta y acierto. Puede haber datos faltantes,
 * porque no todos los alumnos responden todas las preguntas.
 * Salidas. Dificultad y error estándar por pregunta, habilidad por alumno, iteraciones, si
 * convergió, qué alumnos o preguntas se excluyeron por puntaje extremo y a qué grupo conectado
 * pertenece cada pregunta (component, 0 el más grande).
 * Método. Máxima verosimilitud conjunta (JML) con pasos de Newton alternados para alumnos y
 * preguntas, dificultades centradas en 0 en cada vuelta y corrección de sesgo de Wright
 * (multiplicar las dificultades por (K − 1) / K, con K el promedio de respuestas por alumno que
 * quedó después de excluir extremos. Con todos contestando todo K es el número de preguntas. En
 * producción cada alumno ve una parte chica del banco y el sesgo de JML crece con las respuestas
 * por alumno y no con el tamaño del banco, así que con L la corrección valdría casi 1). Los alumnos o
 * preguntas con todo correcto o todo incorrecto no tienen estimación finita y se excluyen de forma
 * iterativa, como es estándar en JML. Se eligió JML porque no supone una distribución de
 * habilidades, es simple y converge rápido con 300 alumnos (D-025).
 * Diseño desconectado. Si los alumnos y las preguntas forman grupos sin alumnos ni preguntas en común,
 * la posición de un grupo respecto de otro no se puede identificar y JML la deja donde caiga, aunque
 * "converja". Por eso las dificultades se centran en 0 dentro de cada grupo conectado y no en todo el
 * banco, y cada pregunta dice a qué grupo pertenece. Quien use el resultado decide cómo enlazar cada
 * grupo a una escala y no debe comparar la posición de un grupo con la de otro (revisión de B14,
 * hallazgo 4).
 * Umbrales. Convergencia cuando ningún parámetro cambia más de 1e-4, con máximo 200 iteraciones.
 */

export interface RaschResponse {
  person: string;
  item: string;
  correct: boolean;
}

export interface RaschResult {
  items: Record<
    string,
    {
      difficulty: number;
      standardError: number;
      responses: number;
      /** Grupo conectado de alumnos y preguntas al que pertenece. 0 es el que tiene más preguntas */
      component: number;
    }
  >;
  persons: Record<string, { ability: number; responses: number }>;
  /** Cuántos grupos conectados quedaron. 1 si todas las preguntas comparten alumnos entre sí */
  components: number;
  iterations: number;
  converged: boolean;
  excludedItems: string[];
  excludedPersons: string[];
}

export interface RaschOptions {
  maxIterations?: number;
  tolerance?: number;
  /** Corrección de sesgo de Wright. Activa por defecto */
  wrightCorrection?: boolean;
}

const clampStep = (value: number) => Math.max(-1, Math.min(1, value));

/**
 * Los grupos conectados del grafo de alumnos y preguntas. Dos preguntas están en el mismo grupo si algún
 * alumno contestó las dos, o si una cadena de alumnos y preguntas las une. Los grupos se numeran por su
 * número de preguntas, el mayor primero y a igualdad el de la pregunta de id más chico, así el número no
 * depende del orden de entrada
 */
function connectedGroups(
  personCount: number,
  itemIds: readonly string[],
  pairs: readonly { person: number; item: number }[],
): { itemComponent: Int32Array; personComponent: Int32Array; count: number } {
  const parent = Int32Array.from({ length: personCount + itemIds.length }, (_, index) => index);
  const find = (start: number): number => {
    let node = start;
    while (parent[node] !== node) {
      parent[node] = parent[parent[node] as number] as number;
      node = parent[node] as number;
    }
    return node;
  };
  for (const pair of pairs) {
    const a = find(pair.person);
    const b = find(personCount + pair.item);
    if (a !== b) parent[a] = b;
  }
  const groups = new Map<number, { items: number; firstId: string }>();
  itemIds.forEach((id, index) => {
    const root = find(personCount + index);
    const group = groups.get(root);
    if (group === undefined) groups.set(root, { items: 1, firstId: id });
    else {
      group.items += 1;
      if (id < group.firstId) group.firstId = id;
    }
  });
  const order = new Map(
    [...groups]
      .sort(([, a], [, b]) => b.items - a.items || (a.firstId < b.firstId ? -1 : 1))
      .map(([root], position) => [root, position]),
  );
  const itemComponent = Int32Array.from(
    itemIds,
    (_, index) => order.get(find(personCount + index)) as number,
  );
  const personComponent = Int32Array.from(
    { length: personCount },
    (_, index) => order.get(find(index)) as number,
  );
  return { itemComponent, personComponent, count: order.size };
}

export function estimateRasch(
  responses: readonly RaschResponse[],
  options: RaschOptions = {},
): RaschResult {
  const maxIterations = options.maxIterations ?? 200;
  const tolerance = options.tolerance ?? 1e-4;

  // Excluye de forma iterativa a quien tenga puntaje extremo
  let active = [...responses];
  const excludedItems = new Set<string>();
  const excludedPersons = new Set<string>();
  for (let pass = 0; pass < 50; pass += 1) {
    const personScore = new Map<string, [number, number]>();
    const itemScore = new Map<string, [number, number]>();
    for (const response of active) {
      const p = personScore.get(response.person) ?? [0, 0];
      p[0] += response.correct ? 1 : 0;
      p[1] += 1;
      personScore.set(response.person, p);
      const i = itemScore.get(response.item) ?? [0, 0];
      i[0] += response.correct ? 1 : 0;
      i[1] += 1;
      itemScore.set(response.item, i);
    }
    const extremePersons = [...personScore]
      .filter(([, [score, n]]) => score === 0 || score === n)
      .map(([id]) => id);
    const extremeItems = [...itemScore]
      .filter(([, [score, n]]) => score === 0 || score === n)
      .map(([id]) => id);
    if (extremePersons.length === 0 && extremeItems.length === 0) break;
    extremePersons.forEach((id) => excludedPersons.add(id));
    extremeItems.forEach((id) => excludedItems.add(id));
    active = active.filter(
      (response) => !excludedPersons.has(response.person) && !excludedItems.has(response.item),
    );
  }

  const personIds = [...new Set(active.map((response) => response.person))];
  const itemIds = [...new Set(active.map((response) => response.item))];
  const personIndex = new Map(personIds.map((id, index) => [id, index]));
  const itemIndex = new Map(itemIds.map((id, index) => [id, index]));
  const pairs = active.map((response) => ({
    person: personIndex.get(response.person) as number,
    item: itemIndex.get(response.item) as number,
    x: response.correct ? 1 : 0,
  }));
  const ability = new Float64Array(personIds.length);
  const difficulty = new Float64Array(itemIds.length);
  const {
    itemComponent,
    personComponent,
    count: componentCount,
  } = connectedGroups(personIds.length, itemIds, pairs);

  let iterations = 0;
  let converged = false;
  for (; iterations < maxIterations && pairs.length > 0; iterations += 1) {
    // Paso de Newton para cada alumno
    const personObserved = new Float64Array(personIds.length);
    const personExpected = new Float64Array(personIds.length);
    const personInformation = new Float64Array(personIds.length);
    for (const pair of pairs) {
      const p =
        1 / (1 + Math.exp(-((ability[pair.person] as number) - (difficulty[pair.item] as number))));
      personObserved[pair.person] = (personObserved[pair.person] as number) + pair.x;
      personExpected[pair.person] = (personExpected[pair.person] as number) + p;
      personInformation[pair.person] = (personInformation[pair.person] as number) + p * (1 - p);
    }
    let maxChange = 0;
    for (let index = 0; index < ability.length; index += 1) {
      const step = clampStep(
        ((personObserved[index] as number) - (personExpected[index] as number)) /
          (personInformation[index] as number),
      );
      ability[index] = (ability[index] as number) + step;
      maxChange = Math.max(maxChange, Math.abs(step));
    }

    // Paso de Newton para cada pregunta
    const itemObserved = new Float64Array(itemIds.length);
    const itemExpected = new Float64Array(itemIds.length);
    const itemInformation = new Float64Array(itemIds.length);
    for (const pair of pairs) {
      const p =
        1 / (1 + Math.exp(-((ability[pair.person] as number) - (difficulty[pair.item] as number))));
      itemObserved[pair.item] = (itemObserved[pair.item] as number) + pair.x;
      itemExpected[pair.item] = (itemExpected[pair.item] as number) + p;
      itemInformation[pair.item] = (itemInformation[pair.item] as number) + p * (1 - p);
    }
    for (let index = 0; index < difficulty.length; index += 1) {
      const step = clampStep(
        ((itemExpected[index] as number) - (itemObserved[index] as number)) /
          (itemInformation[index] as number),
      );
      difficulty[index] = (difficulty[index] as number) + step;
      maxChange = Math.max(maxChange, Math.abs(step));
    }

    // Identificación. Dificultades centradas en 0 dentro de cada grupo conectado, y las habilidades con
    // el mismo desplazamiento que las de su grupo
    const sums = new Float64Array(componentCount);
    const sizes = new Float64Array(componentCount);
    for (let index = 0; index < difficulty.length; index += 1) {
      const group = itemComponent[index] as number;
      sums[group] = (sums[group] as number) + (difficulty[index] as number);
      sizes[group] = (sizes[group] as number) + 1;
    }
    for (let index = 0; index < difficulty.length; index += 1) {
      const group = itemComponent[index] as number;
      difficulty[index] =
        (difficulty[index] as number) - (sums[group] as number) / (sizes[group] as number);
    }
    for (let index = 0; index < ability.length; index += 1) {
      const group = personComponent[index] as number;
      ability[index] =
        (ability[index] as number) - (sums[group] as number) / (sizes[group] as number);
    }

    if (maxChange < tolerance) {
      converged = true;
      iterations += 1;
      break;
    }
  }

  // Información final para el error estándar
  const information = new Float64Array(itemIds.length);
  const itemResponses = new Float64Array(itemIds.length);
  const personResponses = new Float64Array(personIds.length);
  for (const pair of pairs) {
    const p =
      1 / (1 + Math.exp(-((ability[pair.person] as number) - (difficulty[pair.item] as number))));
    information[pair.item] = (information[pair.item] as number) + p * (1 - p);
    itemResponses[pair.item] = (itemResponses[pair.item] as number) + 1;
    personResponses[pair.person] = (personResponses[pair.person] as number) + 1;
  }
  // K, las respuestas por alumno que quedaron. Con menos de 2 no hay corrección que valga (y un alumno con
  // una sola respuesta es extremo y ya se excluyó)
  const perPerson = personIds.length === 0 ? 0 : pairs.length / personIds.length;
  const correction =
    options.wrightCorrection === false || perPerson < 2 ? 1 : (perPerson - 1) / perPerson;

  const items: RaschResult['items'] = {};
  itemIds.forEach((id, index) => {
    items[id] = {
      difficulty: (difficulty[index] as number) * correction,
      standardError: 1 / Math.sqrt(information[index] as number),
      responses: itemResponses[index] as number,
      component: itemComponent[index] as number,
    };
  });
  const persons: RaschResult['persons'] = {};
  personIds.forEach((id, index) => {
    persons[id] = {
      ability: ability[index] as number,
      responses: personResponses[index] as number,
    };
  });
  return {
    items,
    persons,
    components: componentCount,
    iterations,
    converged,
    excludedItems: [...excludedItems].sort(),
    excludedPersons: [...excludedPersons].sort(),
  };
}
