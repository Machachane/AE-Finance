import { useState } from 'react';

export type AirlineResearchInput = {
  airlines: string[];
  metrics: string[];
  years: (2025 | 2026)[];
};

export type AirlineFinancialRow = {
  metric: string;
  airline: string;
  financialYear: number | string | null;
  reportingPeriod: string | null;
  fiscalYearEnd: string | null;
  currency: string | null;
  status: string | null;
  amount: number | null;
  date: string | null;
  reportingScope: string | null;
  ifrs16Asc842Adoption: string | null;
  inAdministration: string | null;
  sourceUrl: string | null;
  sourceTitle: string | null;
  verificationStatus: 'verified' | 'unavailable' | 'needs_review';
  note: string | null;
};

type ResearchResult = {
  rows: AirlineFinancialRow[];
  generatedAt: string;
  coverageNotes: string[];
};

export function useResearchAirlines() {
  const [data, setData] = useState<ResearchResult | undefined>();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutate = ({ data: input }: { data: AirlineResearchInput }) => {
    setIsPending(true);
    setError(null);
    window.setTimeout(() => {
      const selectedMetrics = input.metrics.slice(0, 3);
      const rows: AirlineFinancialRow[] = input.airlines.flatMap((airline) =>
        selectedMetrics.flatMap((metric) => input.years.slice(0, 1).map((year) => ({
          metric,
          airline,
          financialYear: year,
          reportingPeriod: `FY ${year}`,
          fiscalYearEnd: '—',
          currency: null,
          status: 'Not reported',
          amount: null,
          date: null,
          reportingScope: 'Unavailable',
          ifrs16Asc842Adoption: null,
          inAdministration: 'No',
          sourceUrl: null,
          sourceTitle: null,
          verificationStatus: 'unavailable' as const,
          note: 'Preview stub: no live filing value supplied.',
        }))),
      );
      setData({
        rows,
        generatedAt: new Date().toISOString(),
        coverageNotes: [
          'SEC EDGAR is the only source boundary. This preview uses a local no-op data stub; it does not retrieve filings.',
          'Values without a verified filing reference remain unavailable. No estimates have been inferred.',
        ],
      });
      setIsPending(false);
    }, 420);
  };

  return { data, isPending, isError: Boolean(error), error, mutate };
}
