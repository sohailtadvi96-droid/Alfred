import { Link, useParams } from 'react-router-dom';
import { TopBar } from '@/components/TopBar';
import { ProjectDetail } from '@/features/work/ProjectDetail';

export function ProjectDetailPage() {
  const { projectId = '' } = useParams();

  return (
    <>
      <TopBar
        title="Project"
        crumb="03 / WORK"
        showWallet={false}
        action={
          <Link className="btn sec" to="/work">
            ‹ All projects
          </Link>
        }
      />
      <div className="wrap work">
        <ProjectDetail projectId={projectId} />
      </div>
    </>
  );
}
