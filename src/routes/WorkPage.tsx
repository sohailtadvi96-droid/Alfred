import { TopBar } from '@/components/TopBar';

export function WorkPage() {
  return (
    <>
      <TopBar title="Work" crumb="03 / MODULE" showWallet={false} />
      <div className="wrap">
        <div className="placeholder">
          <div className="pk">Phase 4</div>
          <h2>Work — Freelance</h2>
          <p>
            Projects, deliverables, assets, time log, earnings summary and invoice generation with
            tracked IDs land here. Schema is already migrated.
          </p>
        </div>
      </div>
    </>
  );
}
