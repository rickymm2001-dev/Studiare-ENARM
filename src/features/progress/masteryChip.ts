/** Color del dominio estimado. Verde desde 75%, ámbar de 60% a 74% y rojo abajo de 60% */
export const masteryChip = (mastery: number) =>
  mastery >= 0.75
    ? 'bg-success-soft text-success'
    : mastery >= 0.6
      ? 'bg-warning-soft text-warning'
      : 'bg-danger-soft text-danger';
