import { TopBar } from '@/components/TopBar';

export function SecretsPage() {
  return (
    <>
      <TopBar title="Secrets" crumb="02 / MODULE" showWallet={false} />
      <div className="wrap">
        <div className="placeholder">
          <div className="pk">Phase 3</div>
          <h2>Secrets</h2>
          <p>
            The encrypted vault, biometric reveal gate and access log land here. Schema and the
            encrypt / decrypt RPCs are already migrated.
          </p>
        </div>
      </div>
    </>
  );
}
