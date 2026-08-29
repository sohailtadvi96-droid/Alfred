import { TopBar } from '@/components/TopBar';
import { GroundPicker } from '@/components/GroundPicker';
import { replayIntro } from '@/components/IntroChoreography';
import { useAuth } from '@/auth/AuthProvider';

export function SettingsPage() {
  const { user, signOut } = useAuth();

  return (
    <>
      <TopBar title="Settings" crumb="ALFRED" showWallet={false} />
      <div className="wrap" style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
        <section>
          <div className="tlabel" style={{ marginBottom: 12 }}>
            Background — the whole app re-derives from this
          </div>
          <GroundPicker />
          <p style={{ color: 'var(--text-faint)', fontSize: 12, marginTop: 12 }}>
            Hover a tile for its hex values. Your choice is saved to this device and your profile.
          </p>
        </section>

        <section>
          <div className="tlabel" style={{ marginBottom: 12 }}>
            Intro
          </div>
          <button className="btn sec sm" onClick={replayIntro}>
            Replay the intro
          </button>
        </section>

        <section>
          <div className="tlabel" style={{ marginBottom: 12 }}>
            Account
          </div>
          <p style={{ color: 'var(--text-dim)', fontSize: 13, margin: '0 0 12px' }}>
            Signed in as <span className="mono">{user?.email}</span>
          </p>
          <button className="btn neg sm" onClick={() => void signOut()}>
            Sign out
          </button>
        </section>
      </div>
    </>
  );
}
