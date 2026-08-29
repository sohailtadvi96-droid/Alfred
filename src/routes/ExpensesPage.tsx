import { TopBar } from '@/components/TopBar';

export function ExpensesPage() {
  return (
    <>
      <TopBar title="Expenses" crumb="01 / MODULE" />
      <div className="wrap">
        <div className="placeholder">
          <div className="pk">Phase 2</div>
          <h2>Expenses</h2>
          <p>
            Manual entry, the Gmail ingestion adapter, rule-based categorisation and the month
            dashboard land here. Schema is already migrated.
          </p>
        </div>
      </div>
    </>
  );
}
