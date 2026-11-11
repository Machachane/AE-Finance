import { type ReactNode } from 'react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import AirlineResearchPage from '@/pages/Home';
import FinancialStatementsPage from '@/pages/Statements';
import FinancialRatiosPage from '@/pages/FinancialRatios';
import AirlineAnalyticsPage from '@/pages/AirlineAnalytics';
import AviationFinancePage from '@/pages/AviationFinance';
import AssistantChat from '@/components/AssistantChat';
import FeedbackDialog from '@/components/FeedbackDialog';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import {
  Route,
  Switch,
  useLocation,
  useSearch,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });

function Router() {
  const search = useSearch();
  return (
    // Keep a shared shell (sidebar, navbar) outside the boundary so it
    // survives a page crash.
    <RoutedErrorBoundary>
      {/* Pages initialise validated filters after their dataset loads. A new
          navigation must reapply them, including on the current tab. */}
      <Switch key={search}>
        <Route path="/" component={AirlineResearchPage} />
        <Route path="/statements" component={FinancialStatementsPage} />
        <Route path="/ratios" component={FinancialRatiosPage} />
        <Route path="/analytics" component={AirlineAnalyticsPage} />
        <Route path="/aviation-finance" component={AviationFinancePage} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        <Router />
        <AssistantChat />
        <FeedbackDialog />
      </WouterRouter>
      <Toaster />
    </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
