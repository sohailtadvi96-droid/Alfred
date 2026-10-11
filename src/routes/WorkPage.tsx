import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { TopBar } from '@/components/TopBar';
import { Icon } from '@/components/Icon';
import { ProjectList } from '@/features/work/ProjectList';
import { ProjectFormDialog } from '@/features/work/ProjectFormDialog';
import { useProjects } from '@/features/work/hooks';
import { OfficeView } from '@/features/office/OfficeView';
import { TaskDialog } from '@/features/office/TaskDialog';

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
  const [taskOpen, setTaskOpen] = useState(false);
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
        phoneAction={
          category === 'freelance' ? (
            <button type="button" className="hbtn primary" onClick={() => setAddOpen(true)} aria-label="New project">
              <Icon name="plus" size={18} />
            </button>
          ) : (
            <button type="button" className="hbtn primary" onClick={() => setTaskOpen(true)} aria-label="New task">
              <Icon name="plus" size={18} />
            </button>
          )
        }
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
          <>
            {/* phones: the header's Invoices button is desktop-only, so the
                prototype's link row takes its place */}
            <div className="links phone-only">
              <Link className="linkrow" to="/work/invoices">
                <span className="grow">Invoices</span>
                <Icon name="chevron" size={14} className="chev-ic" />
              </Link>
            </div>
            <ProjectList projects={projects} isLoading={isLoading} error={error} />
          </>
        ) : (
          <OfficeView />
        )}
      </div>

      <ProjectFormDialog open={addOpen} onOpenChange={setAddOpen} />
      <TaskDialog open={taskOpen} onOpenChange={setTaskOpen} />
    </>
  );
}
