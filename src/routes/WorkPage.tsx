import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { TopBar } from '@/components/TopBar';
import { ProjectList } from '@/features/work/ProjectList';
import { ProjectFormDialog } from '@/features/work/ProjectFormDialog';
import { useProjects } from '@/features/work/hooks';
import { OfficeView } from '@/features/office/OfficeView';

type Category = 'freelance' | 'office';
const CAT_KEY = 'alfred.work.category';

function readCategory(): Category {
  try {
    return localStorage.getItem(CAT_KEY) === 'office' ? 'office' : 'freelance';
  } catch {
    return 'freelance';
  }
}

export function WorkPage() {
  const [category, setCategory] = useState<Category>(readCategory);
  const [addOpen, setAddOpen] = useState(false);
  const { data: projects, isLoading, error } = useProjects();

  useEffect(() => {
    try {
      localStorage.setItem(CAT_KEY, category);
    } catch {
      /* storage disabled — selection just won't persist */
    }
  }, [category]);

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
          <OfficeView />
        )}
      </div>

      <ProjectFormDialog open={addOpen} onOpenChange={setAddOpen} />
    </>
  );
}
