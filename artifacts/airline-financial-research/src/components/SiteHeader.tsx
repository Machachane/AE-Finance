import { Link } from 'wouter';
import { CircleHelp } from 'lucide-react';

type SiteHeaderProps = {
  activePage: 'research' | 'statements';
  status?: string;
};

export default function SiteHeader({ activePage, status = 'Uploaded workbook · source-linked' }: SiteHeaderProps) {
  return (
    <header className="topbar">
      <a className="brand" href={`${import.meta.env.BASE_URL}`} aria-label="Airline Financials home">
        <span className="brand-mark">
          <img src={`${import.meta.env.BASE_URL}images/airline-economics-logo.png`} alt="Airline Economics" />
        </span>
        <span>
          <span className="brand-name">Airline Financials</span>
          <span className="brand-sub">Evidence workspace</span>
        </span>
      </a>
      <nav className="main-menu" aria-label="Main menu">
        <Link href="/" className={`main-menu-link ${activePage === 'research' ? 'active' : ''}`} aria-current={activePage === 'research' ? 'page' : undefined}>
          Airline Financials
        </Link>
        <Link href="/statements" className={`main-menu-link ${activePage === 'statements' ? 'active' : ''}`} aria-current={activePage === 'statements' ? 'page' : undefined}>
          Financial statements
        </Link>
      </nav>
      <div className="top-right">
        <div className="source-indicator"><span className="source-dot" /><span>{status}</span></div>
        <CircleHelp size={16} aria-label="Help" />
      </div>
    </header>
  );
}
