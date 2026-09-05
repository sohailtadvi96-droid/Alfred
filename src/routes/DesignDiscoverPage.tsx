import { Link } from 'react-router-dom';
import { TopBar } from '@/components/TopBar';
import { DesignTabs } from '@/features/design/DesignTabs';
import { DiscoverView } from '@/features/design/DiscoverView';

export function DesignDiscoverPage() {
  return (
    <>
      <TopBar
        title="Design"
        crumb="04 / DISCOVER"
        showWallet={false}
        action={
          <Link className="btn sec" to="/design">
            ‹ Boards
          </Link>
        }
      />
      <div className="wrap design-wrap">
        <DesignTabs />
        <DiscoverView />
      </div>
    </>
  );
}
