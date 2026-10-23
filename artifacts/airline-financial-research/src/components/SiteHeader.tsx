import { Link } from 'wouter';
import { CircleHelp } from 'lucide-react';

type SiteHeaderProps = {
  activePage: 'research' | 'statements' | 'ratios' | 'analytics' | 'aviation-finance';
  status?: string;
};

export default function SiteHeader({ activePage, status = 'Uploaded workbook · source-linked' }: SiteHeaderProps) {
  return (
    <header className="topbar">
      <a className="brand" href={`${import.meta.env.BASE_URL}`} aria-label="Airline Financials home">
        <span className="brand-mark">
          <img src={`${import.meta.env.BASE_URL}images/airline-economics-logo.png`} alt="Airline Economics" />
        </span>
        <span className="brand-context">Finance</span>
      </a>
      <nav className="main-menu" aria-label="Main menu">
        <Link href="/" className={`main-menu-link ${activePage === 'research' ? 'active' : ''}`} aria-current={activePage === 'research' ? 'page' : undefined}>
          Airline Financials
        </Link>
        <Link href="/statements" className={`main-menu-link ${activePage === 'statements' ? 'active' : ''}`} aria-current={activePage === 'statements' ? 'page' : undefined}>
          Financial statements
        </Link>
        <Link href="/ratios" className={`main-menu-link ${activePage === 'ratios' ? 'active' : ''}`} aria-current={activePage === 'ratios' ? 'page' : undefined}>
          Financial Ratios &amp; KPIs
        </Link>
        <Link href="/analytics" className={`main-menu-link ${activePage === 'analytics' ? 'active' : ''}`} aria-current={activePage === 'analytics' ? 'page' : undefined} data-testid="link-airline-analytics">
          Airline Financial Analytics
        </Link>
        <Link href="/aviation-finance" className={`main-menu-link ${activePage === 'aviation-finance' ? 'active' : ''}`} aria-current={activePage === 'aviation-finance' ? 'page' : undefined} data-testid="link-aviation-finance">
          Aviation Finance
        </Link>
      </nav>
      <div className="top-right">
        <div className="source-indicator"><span className="source-dot" /><span>{status}</span></div>
        <CircleHelp size={16} aria-label="Help" />
      </div>
    </header>
  );
}
