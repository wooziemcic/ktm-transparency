export type Project = {
  id: string;
  ocid?: string;
  title: string;
  sector?: string;
  district?: string;
  planned_budget_amount?: number | null;
  planned_budget_currency?: string;
  ProjectsOverview: { district: string };
  award_start?: string | null;
  award_end?: string | null;
  tender_date?: string | null;
  agency?: { id: number; name: string };
};
