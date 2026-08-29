import { useState } from 'react';
import { TopBar } from '@/components/TopBar';
import { SecretGateProvider } from '@/features/secrets/SecretGate';
import { SecretsView } from '@/features/secrets/SecretsView';

export function SecretsPage() {
  const [addOpen, setAddOpen] = useState(false);

  return (
    <SecretGateProvider>
      <TopBar
        title="Secrets"
        crumb="02 / MODULE"
        showWallet={false}
        action={
          <button className="btn primary" onClick={() => setAddOpen(true)}>
            Add to vault
          </button>
        }
      />
      <SecretsView addOpen={addOpen} onAddOpenChange={setAddOpen} />
    </SecretGateProvider>
  );
}
