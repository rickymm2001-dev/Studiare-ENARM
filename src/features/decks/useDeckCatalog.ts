// Catálogo de mazos precargados, cargado bajo demanda para no pesar en el JavaScript inicial.
import { useEffect, useState } from 'react';
import type { DemoDeckFile } from '@/data/schemas/content';

let cache: Promise<DemoDeckFile[]> | null = null;

export function loadCatalog(): Promise<DemoDeckFile[]> {
  cache ??= import('@/demo/content/decks').then((module) => module.loadDemoDecks());
  return cache;
}

export function useDeckCatalog(): DemoDeckFile[] | undefined {
  const [catalog, setCatalog] = useState<DemoDeckFile[]>();
  useEffect(() => {
    let alive = true;
    void loadCatalog().then((decks) => {
      if (alive) setCatalog(decks);
    });
    return () => {
      alive = false;
    };
  }, []);
  return catalog;
}
