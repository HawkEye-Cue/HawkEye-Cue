import OpportunitiesPage from './OpportunitiesPage';

/**
 * Pipeline tab = Leads (HawkSight). The old Leads/Deals toggle was removed — the
 * revenue/deals side now lives on its own Sales tab, so this page is leads only.
 */
export default function PipelinePage() {
  return (
    <div className="space-y-3">
      <OpportunitiesPage />
    </div>
  );
}
