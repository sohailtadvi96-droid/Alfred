import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import * as api from './api';
import { searchInspiration, type SourceId } from './discover';
import { ALL_BOARD, type DesignItem, type NewBoard, type NewItem } from './types';

const keys = {
  boards: ['design', 'boards'] as const,
  items: (boardId: string) => ['design', 'items', boardId] as const,
};

/** single-user app — after any write just refresh the whole Design subtree */
function refresh(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['design'] });
}

const POLL_MS = 3000;

export function useBoards() {
  return useQuery({ queryKey: keys.boards, queryFn: api.listBoards });
}

/** Items for one board, or every item when boardId is the ALL_BOARD id.
 *  Polls while anything is still pending/running so a card resolves on its
 *  own — Step 5's acceptance bar is no manual refresh needed. */
export function useItems(boardId: string) {
  return useQuery({
    queryKey: keys.items(boardId),
    queryFn: () => (boardId === ALL_BOARD ? api.listAllItems() : api.listItems(boardId)),
    enabled: !!boardId,
    refetchInterval: (query) => {
      const items = query.state.data as DesignItem[] | undefined;
      const stillWorking = (items ?? []).some(
        (it) => it.enrich_status === 'pending' || it.enrich_status === 'running',
      );
      return stillWorking ? POLL_MS : false;
    },
  });
}

/** Batched, transformed thumbnail URLs for a set of items — re-fetches only
 *  when the actual set of cached paths changes, not on every poll tick. */
export function useThumbUrls(items: DesignItem[] | undefined, gridWidthPx: number) {
  const withThumb = (items ?? []).filter((it) => it.thumb_path);
  const pathKey = withThumb
    .map((it) => `${it.media_type === 'gif' ? 'g' : 'i'}:${it.thumb_path}`)
    .sort()
    .join(',');

  return useQuery({
    queryKey: ['design', 'thumb-urls', pathKey, gridWidthPx],
    queryFn: () => api.getThumbUrls(withThumb, gridWidthPx),
    enabled: withThumb.length > 0,
    staleTime: 55 * 60_000, // just under the signed URLs' own 1h TTL
  });
}

export function useRetryIngest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) => api.retryIngest(itemId),
    // Settled, not just success — design-retry sets enrich_status='running'
    // itself before this resolves (not waiting on design-ingest's own
    // eventual done/failed write), so even a reported error means there's a
    // fresh state worth showing, and the refresh here is what makes that
    // running state — and useItems' poll-while-pending — kick in right away.
    onSettled: () => refresh(qc),
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
