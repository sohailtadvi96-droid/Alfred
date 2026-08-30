import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { errMessage } from '@/lib/errors';
import { fullDate } from '@/lib/format';
import { AssetsChecklist } from './AssetsChecklist';
import { BriefBox } from './BriefBox';
import { DeliverablesList } from './DeliverablesList';
import { EarningsSummary } from './EarningsSummary';
import { useInvoiceEditor } from './InvoiceEditor';
import { InvoiceFormDialog } from './InvoiceFormDialog';
import { InvoiceList } from './InvoiceList';
import { ProjectFormDialog } from './ProjectFormDialog';
import { TimeLog } from './TimeLog';
import { projectStatusMeta } from './status';
import { useDeleteProject, useProject, useProjectInvoices } from './hooks';

export function ProjectDetail({ projectId }: { projectId: string }) {
  const { data: project, isLoading, error } = useProject(projectId);
  const invoices = useProjectInvoices(projectId);
  const { editInvoice, editorNode } = useInvoiceEditor();
  const del = useDeleteProject();
  const navigate = useNavigate();
  const [editOpen, setEditOpen] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  if (error) {
    return <div className="ledger-empty">Couldn’t load this project.</div>;
  }
  if (isLoading || !project) {
    return <div className="ledger-empty">Loading…</div>;
  }

  const meta = projectStatusMeta(project.status);

  function onDelete() {
    if (!project) return;
    if (!confirm(`Delete “${project.name}”? Deliverables, assets and time entries go with it.`)) return;
    del.mutate(project.id, {
      onSuccess: () => navigate('/work'),
      onError: (err) => setBanner(errMessage(err, 'Could not delete the project.')),
    });
  }

  return (
    <div className="work-detail">
      {banner && <div className="secrets-banner">{banner}</div>}

      <div className="work-detail-head">
        <div className="work-detail-title">
          <span className="work-status" style={{ ['--st' as string]: meta.color }}>
            {meta.label}
          </span>
          <h2>{project.name}</h2>
          <div className="work-detail-meta">
            <span>{project.client?.name ?? 'No client'}</span>
            {project.started_on && <span>Started {fullDate(project.started_on)}</span>}
            {project.target_delivery_on && (
              <span>Target {fullDate(project.target_delivery_on)}</span>
            )}
          </div>
          {project.description && <p className="work-detail-desc">{project.description}</p>}
        </div>
        <div className="work-detail-actions">
          <button className="btn sec sm" onClick={() => setEditOpen(true)}>
            Edit
          </button>
          <button className="btn neg sm" onClick={onDelete} disabled={del.isPending}>
            Delete
          </button>
        </div>
      </div>

      <EarningsSummary project={project} />

      <BriefBox projectId={project.id} brief={project.brief} />

      <div className="work-sections">
        <DeliverablesList projectId={project.id} />
        <AssetsChecklist projectId={project.id} />
        <TimeLog projectId={project.id} />
      </div>

      <section className="work-section work-section-wide">
        <div className="work-section-head">
          <h3>Invoices</h3>
          <button className="btn sec sm" onClick={() => setInvoiceOpen(true)}>
            New invoice
          </button>
        </div>
        <InvoiceList
          invoices={invoices.data}
          isLoading={invoices.isLoading}
          error={invoices.error}
          showProject={false}
          emptyHint="Generate the first invoice for this project."
          onEdit={editInvoice}
        />
      </section>

      <ProjectFormDialog open={editOpen} onOpenChange={setEditOpen} edit={project} />
      <InvoiceFormDialog
        open={invoiceOpen}
        onOpenChange={setInvoiceOpen}
        project={project}
        onSaved={(id) => navigate(`/work/invoices/${id}`)}
      />
      {editorNode}
    </div>
  );
}
