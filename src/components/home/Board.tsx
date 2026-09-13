import { useMemo } from 'react';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy } from '@dnd-kit/sortable';
import { Tile } from './Tile';
import type { BoardLayout, TileSize } from '@/features/home/layout';
import type { ModuleId, Snapshot } from '@/features/home/types';

export function Board({
  snapshots,
  layout,
  onLayoutChange,
}: {
  snapshots: Snapshot[];
  layout: BoardLayout;
  onLayoutChange: (layout: BoardLayout) => void;
}) {
  const byModule = useMemo(() => new Map(snapshots.map((s) => [s.module, s] as const)), [snapshots]);
  const visibleOrder = layout.order.filter((m) => byModule.has(m));

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = visibleOrder.indexOf(active.id as ModuleId);
    const newIndex = visibleOrder.indexOf(over.id as ModuleId);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(visibleOrder, oldIndex, newIndex);
    const hidden = layout.order.filter((m) => !byModule.has(m));
    onLayoutChange({ ...layout, order: [...reordered, ...hidden] });
  }

  function setSize(module: ModuleId, size: TileSize) {
    onLayoutChange({ ...layout, sizes: { ...layout.sizes, [module]: size } });
  }

  if (visibleOrder.length === 0) {
    return <div className="home-rail-empty">No widgets on your board yet — add one above.</div>;
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={visibleOrder} strategy={rectSortingStrategy}>
        <div className="home-board">
          {visibleOrder.map((m) => {
            const snap = byModule.get(m);
            if (!snap) return null;
            return (
              <Tile
                key={m}
                snapshot={snap}
                size={layout.sizes[m] ?? 'sm'}
                onSizeChange={(size) => setSize(m, size)}
              />
            );
          })}
        </div>
      </SortableContext>
    </DndContext>
  );
}
