// Lo poco del admin del banco que va en lo que la app carga al abrir (B11). Los títulos de las pantallas
// 35 a 37, que también nombran sus entradas del menú. Sus descripciones y todo lo demás viven en
// bankAdmin.ts, que solo cargan esas pantallas, perezosas, para no pasar del presupuesto del JavaScript
// inicial. Por eso aquí la descripción va vacía.
export const bankAdminNavText = {
  screens: {
    bankAdmin: { title: 'Banco y Sheet', description: '' },
    physicianReviews: { title: 'Revisiones de médicos', description: '' },
    deckCatalogAdmin: { title: 'Catálogo de mazos', description: '' },
  },
};
