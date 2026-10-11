import { useState } from 'react';
import { TopBar } from '@/components/TopBar';
import { Icon } from '@/components/Icon';
import { SecretGateProvider } from '@/features/secrets/SecretGate';
import { SecretsView } from '@/features/secrets/SecretsView';

export function SecretsPage() {
  const [addOpen, setAddOpen] = useState(false);

  return (
    <SecretGateProvider>
      <TopBar
        title="Secrets"
        crumb="02 / MODULE"
        phoneAction={
          <button type="button" className="hbtn primary" onClick={() => setAddOpen(true)} aria-label="Add to vault">
            <Icon name="plus" size={18} />
          </button>
        }
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
