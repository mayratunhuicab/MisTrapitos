'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Query,
  DocumentData,
  FirestoreError,
  limit,
  onSnapshot,
  query,
} from 'firebase/firestore';
import { useUser } from '@/firebase/provider';

export interface UsePaginatedCollectionResult<T> {
  data: (T & { id: string })[];
  isLoading: boolean;      // Primera carga
  isLoadingMore: boolean;  // Cargando el siguiente lote ("Cargar más")
  hasMore: boolean;
  loadMore: () => void;
  error: FirestoreError | null;
}

/**
 * Carga una consulta por lotes ("Cargar más") y la mantiene en TIEMPO REAL:
 * lo que se agrega, edita o borra aparece sin recargar la página.
 *
 * Escucha `baseQuery` limitada a `pageSize * páginas`; "Cargar más" amplía el límite.
 * Si cambia la consulta base (p. ej. otro día o filtro), vuelve a la primera página.
 *
 * IMPORTANTE: `baseQuery` debe venir memoizada (useMemoFirebase), igual que en useCollection.
 */
export function usePaginatedCollection<T = DocumentData>(
  baseQuery: Query<DocumentData> | null | undefined,
  pageSize: number
): UsePaginatedCollectionResult<T> {
  const { user } = useUser();
  // Las páginas cargadas se recuerdan junto con la consulta a la que pertenecen:
  // si cambia la consulta base (otro día, otro filtro), se vuelve al primer lote.
  const [pageState, setPageState] = useState({ query: baseQuery, pages: 1 });
  const pages = pageState.query === baseQuery ? pageState.pages : 1;

  const [data, setData] = useState<(T & { id: string })[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<FirestoreError | null>(null);

  useEffect(() => {
    if (!baseQuery || !user) {
      setData([]);
      setHasMore(false);
      setIsLoading(false);
      setIsLoadingMore(false);
      return;
    }

    if (pages === 1) {
      // Consulta nueva: no mostrar datos de la consulta anterior mientras carga.
      setData([]);
      setIsLoading(true);
    }

    const currentLimit = pageSize * pages;
    const unsubscribe = onSnapshot(
      query(baseQuery, limit(currentLimit)),
      (snapshot) => {
        setData(snapshot.docs.map(d => ({ ...(d.data() as T), id: d.id })));
        setHasMore(snapshot.size >= currentLimit);
        setError(null);
        setIsLoading(false);
        setIsLoadingMore(false);
      },
      (err) => {
        console.error('[usePaginatedCollection] Firestore error:', err.code, err.message, err);
        setError(err);
        setHasMore(false);
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    );

    return () => unsubscribe();
  }, [baseQuery, user, pageSize, pages]);

  const loadMore = useCallback(() => {
    setIsLoadingMore(true);
    setPageState(s => ({ query: baseQuery, pages: (s.query === baseQuery ? s.pages : 1) + 1 }));
  }, [baseQuery]);

  return { data, isLoading, isLoadingMore, hasMore, loadMore, error };
}
