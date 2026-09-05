import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import * as api from './api';
import { searchInspiration, type SourceId } from './discover';
import { ALL_BOARD, type NewBoard, type NewItem } from './types';

const keys = {
  boards: ['design', 'boards'] as const,
  items: (boardId: string) => ['design', 'items', boardId] as const,
};

/** single-user app — after any write just refresh the whole Design subtree */
function refresh(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['design'] });
}

export function useBoards() {
  return useQuery({ queryKey: keys.boards, queryFn: api.listBoards });
}

/** Items for one board, or every item when boardId is the ALL_BOARD id. */
export function useItems(boardId: string) {
  return useQuery({
    queryKey: keys.items(boardId),
    queryFn: () => (boardId === ALL_BOARD ? api.listAllItems() : api.listItems(boardId)),
    enabled: !!boardId,
  });
}

export function useSaveBoard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: NewBoard) => api.saveBoard(input),
    onSuccess: () => refresh(qc),
  });
}

export function useDeleteBoard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteBoard(id),
    onSuccess: () => refresh(qc),
  });
}

export function useSaveItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: NewItem) => api.saveItem(input),
    onSuccess: () => refresh(qc),
  });
}

export function useDeleteItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteItem(id),
    onSuccess: () => refresh(qc),
  });
}

// ---------- discover (external image search) ----------
const PAGE_CAP = 20; // matches the Edge Function's clamp

/** Paged search across the free image APIs. `q` empty → idle (no request). */
export function useInspirationSearch(q: string, sources: SourceId[]) {
  return useInfiniteQuery({
    queryKey: ['design', 'search', q, [...sources].sort().join(',')],
    queryFn: ({ pageParam }) => searchInspiration(q, sources, pageParam),
    enabled: q.trim().length > 0 && sources.length > 0,
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.results.length === 0 || last.page >= PAGE_CAP ? undefined : last.page + 1,
    staleTime: 5 * 60_000,
  });
}
