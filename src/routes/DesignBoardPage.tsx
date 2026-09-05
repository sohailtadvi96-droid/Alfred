import { Link, useParams } from 'react-router-dom';
import { TopBar } from '@/components/TopBar';
import { BoardDetail } from '@/features/design/BoardDetail';

export function DesignBoardPage() {
  const { boardId = '' } = useParams();

  return (
    <>
      <TopBar
        title="Design"
        crumb="04 / BOARD"
        showWallet={false}
        action={
          <Link className="btn sec" to="/design">
            ‹ All boards
          </Link>
        }
      />
      <div className="wrap design-wrap">
        <BoardDetail boardId={boardId} />
      </div>
    </>
  );
}
