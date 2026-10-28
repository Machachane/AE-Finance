import { useMemo, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import './_group.css';

const workbookAirlines = [
  'Air Busan',
  'Air Canada',
  'Air China Group',
  'Air Europa',
  'Air France',
  'Air France-KLM',
  'Air Greenland',
  'Air India',
  'Air Mauritius',
  'Air New Zealand',
  'Air Nostrum',
  'Air Serbia',
  'Air T',
  'AirAsia X',
  'AirBaltic',
  'Akasa Air',
];

export function Searchable() {
  const [airline, setAirline] = useState('Air');
  const [open, setOpen] = useState(true);
  const [activeIndex, setActiveIndex] = useState(1);
  const filteredAirlines = useMemo(() => {
    const query = airline.trim().toLocaleLowerCase();
    return query
      ? workbookAirlines.filter((name) => name.toLocaleLowerCase().includes(query))
      : workbookAirlines;
  }, [airline]);

  const selectAirline = (name: string) => {
    setAirline(name);
    setOpen(false);
    setActiveIndex(-1);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        setActiveIndex(0);
      } else {
        setActiveIndex((current) => Math.min(filteredAirlines.length - 1, Math.max(0, current + 1)));
      }
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        setActiveIndex(filteredAirlines.length - 1);
      } else {
        setActiveIndex((current) => Math.max(0, current - 1));
      }
    } else if (event.key === 'Enter' && open && activeIndex >= 0 && filteredAirlines[activeIndex]) {
      event.preventDefault();
      selectAirline(filteredAirlines[activeIndex]);
    } else if (event.key === 'Escape') {
      setOpen(false);
      setActiveIndex(-1);
    }
  };

  return (
    <main className="picker-preview">
      <section className="picker-card">
        <div className="picker-card-kicker">AIRLINE FINANCIALS · INPUT</div>
        <h2 className="picker-card-title">Financial data selection</h2>
        <label className="field-label" htmlFor="airline-input">Airline</label>

        <div
          className="airline-picker"
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false);
          }}
        >
          <div className={`airline-picker-control ${open ? 'is-open' : ''}`}>
            <Search size={15} className="airline-picker-search-icon" aria-hidden="true" />
            <input
              id="airline-input"
              className="text-input"
              data-testid="input-airline"
              role="combobox"
              aria-label="Airline"
              aria-autocomplete="list"
              aria-haspopup="listbox"
              aria-expanded={open}
              aria-controls="workbook-airline-options"
              aria-activedescendant={open && activeIndex >= 0 ? `airline-option-${activeIndex}` : undefined}
              autoComplete="off"
              value={airline}
              onFocus={() => setOpen(true)}
              onChange={(event) => {
                setAirline(event.target.value);
                setActiveIndex(-1);
                setOpen(true);
              }}
              onKeyDown={handleKeyDown}
              placeholder="Search or type an airline"
            />
            <button
              className="airline-picker-trigger"
              type="button"
              aria-label={open ? 'Hide airline options' : 'Show airline options'}
              aria-expanded={open}
              aria-controls="workbook-airline-options"
              onClick={() => {
                setOpen((current) => !current);
                setActiveIndex(-1);
              }}
            >
              <ChevronDown size={15} className={`airline-picker-chevron ${open ? 'is-open' : ''}`} aria-hidden="true" />
            </button>
          </div>

          {open && (
            <div className="airline-picker-listbox" id="workbook-airline-options" role="listbox" aria-label="Airlines in the workbook">
              <div className="airline-picker-list-meta">
                <span>Airlines in workbook</span>
                <span>{filteredAirlines.length} matches</span>
              </div>
              {filteredAirlines.length ? filteredAirlines.map((name, index) => {
                const isSelected = airline.toLocaleLowerCase() === name.toLocaleLowerCase();
                return (
                  <button
                    key={name}
                    id={`airline-option-${index}`}
                    className={`airline-picker-option ${index === activeIndex ? 'is-active' : ''} ${isSelected ? 'is-selected' : ''}`}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    tabIndex={-1}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => selectAirline(name)}
                  >
                    <span>{name}</span>
                    {isSelected && <Check size={14} aria-hidden="true" />}
                  </button>
                );
              }) : (
                <div className="airline-picker-empty">No workbook match. You can still use the typed airline name.</div>
              )}
            </div>
          )}
        </div>

        <p className="picker-help">Search the workbook list or type a name to check for matching financials.</p>
        <div className="picker-preview-caption">SEARCHABLE · Visible dropdown, live filtering, keyboard selection</div>
      </section>
    </main>
  );
}
