import { useEffect, useRef, useState } from 'react';
import { TopBar } from '@/components/TopBar';
import { AddWidgetTray } from '@/components/home/AddWidgetTray';
import { Board } from '@/components/home/Board';
import { Rail } from '@/components/home/Rail';
import { useHomeBoard, useHomeRail } from '@/features/home/hooks';
import {
  readBoardLayout,
  readRailWidth,
  writeBoardLayout,
  writeRailWidth,
  type BoardLayout,
  type RailWidth,
} from '@/features/home/layout';
import type { ModuleId } from '@/features/home/types';

export function HomePage() {
  const rail = useHomeRail();
  const board = useHomeBoard();
  const [railWidth, setRailWidth] = useState<RailWidth>(readRailWidth);
  const [boardLayout, setBoardLayout] = useState<BoardLayout>(readBoardLayout);
  const [addOpen, setAddOpen] = useState(false);
  const cmdkRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mac = navigator.platform.toLowerCase().includes('mac');
      if ((mac ? e.metaKey : e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setRailWidth((w) => {
          if (w === 'expanded') return w;
          writeRailWidth('expanded');
          return 'expanded';
        });
        // the command bar only exists in the DOM when expanded — wait a tick
        // for the width change (and its 200ms transition) to render it.
        setTimeout(() => cmdkRef.current?.focus(), 50);
        return;
      }

      const target = e.target as HTMLElement | null;
      const typing =
        !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (typing) return;

      if (e.key === '[') {
        setRailWidth((w) => {
          const next: RailWidth = w === 'expanded' ? 'slim' : w === 'slim' ? 'hidden' : 'expanded';
          writeRailWidth(next);
          return next;
        });
        return;
      }

      if (/^[1-9]$/.test(e.key)) {
        const idx = Number(e.key) - 1;
        const tiles = document.querySelectorAll<HTMLElement>('.home-tile');
        tiles[idx]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function handleWidthChange(next: RailWidth) {
    setRailWidth(next);
    writeRailWidth(next);
  }

  function handleLayoutChange(next: BoardLayout) {
    setBoardLayout(next);
    writeBoardLayout(next);
  }

  function toggleModule(id: ModuleId) {
    const on = boardLayout.order.includes(id);
    const order = on ? boardLayout.order.filter((m) => m !== id) : [...boardLayout.order, id];
    handleLayoutChange({ ...boardLayout, order });
  }

  return (
    <>
      <TopBar
        title="Home"
        crumb="00 / TODAY"
        showWallet={false}
        action={
          <button type="button" className="btn sec" onClick={() => setAddOpen(true)}>
            Add widget
          </button>
        }
      />
      <div className="home" data-rail={railWidth}>
        <Rail ref={cmdkRef} rows={rail} width={railWidth} onWidthChange={handleWidthChange} />
        <Board snapshots={board} layout={boardLayout} onLayoutChange={handleLayoutChange} />
      </div>
      <AddWidgetTray open={addOpen} onOpenChange={setAddOpen} layout={boardLayout} onToggle={toggleModule} />
    </>
  );
}
