import { useState } from 'react';
import { Link } from 'react-router-dom';
import { TopBar } from '@/components/TopBar';
import { ProjectList } from '@/features/work/ProjectList';
import { ProjectFormDialog } from '@/features/work/ProjectFormDialog';
import { useProjects } from '@/features/work/hooks';

type Category = 'freelance' | 'office';

export function WorkPage() {
  const [category, setCategory] = useState<Category>('freelance');
  const [addOpen, setAddOpen] = useState(false);
  const { data: projects, isLoading, error } = useProjects();

  return (
    <>
      <TopBar
        title="Work"
        crumb="03 / MODULE"
        showWallet={false}
        action={
          category === 'freelance' ? (
            <>
              <Link className="btn sec" to="/work/invoices">
                Invoices
              </Link>
              <button className="btn primary" onClick={() => setAddOpen(true)}>
                New project
              </button>
            </>
          ) : undefined
        }
      />
      <div className="wrap work">
        <div className="work-cat" role="tablist" aria-label="Work category">
          <button
            type="button"
            role="tab"
            aria-selected={category === 'freelance'}
            className={category === 'freelance' ? 'on' : ''}
            onClick={() => setCategory('freelance')}
          >
            Freelance
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={category === 'office'}
            className={category === 'office' ? 'on' : ''}
            onClick={() => setCategory('office')}
          >
            Office work
          </button>
        </div>

        {category === 'freelance' ? (
          <ProjectList projects={projects} isLoading={isLoading} error={error} />
        ) : (
          <div className="placeholder">
            <div className="pk">Phase 2</div>
            <h2>Office work</h2>
            <p>
              Meetings, tasks and the day plan land here once Google Calendar is wired in. Freelance
              is the MVP tab.
            </p>
          </div>
        )}
      </div>

      <ProjectFormDialog open={addOpen} onOpenChange={setAddOpen} />
    </>
  );
}
