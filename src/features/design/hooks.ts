import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from './api';
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
