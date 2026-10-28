import { useId, useMemo, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';

interface AirlinePickerProps {
  value: string;
  options: string[];
  loading?: boolean;
  error?: boolean;
  onChange: (value: string) => void;
}

export default function AirlinePicker({
  value,
  options,
  loading = false,
  error = false,
  onChange,
}: AirlinePickerProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const listboxId = useId();

  const filteredAirlines = useMemo(() => {
    const query = value.trim().toLocaleLowerCase();
    if (!query) return options;

    const startsWith: string[] = [];
    const contains: string[] = [];
    options.forEach((name) => {
      const normalized = name.toLocaleLowerCase();
      if (normalized.startsWith(query)) startsWith.push(name);
      else if (normalized.includes(query)) contains.push(name);
    });
    return [...startsWith, ...contains];
  }, [options, value]);

  const optionId = (index: number) => `${listboxId}-airline-${index}`;
  const selectAirline = (name: string) => {
    onChange(name);
    setOpen(false);
    setActiveIndex(-1);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
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
    <div
      className="airline-entry"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false);
      }}
    >
      <div className={`airline-picker-control ${open ? 'is-open' : ''}`}>
        <Search className="airline-picker-search-icon" size={15} aria-hidden="true" />
        <input
          id="airline-input"
          className="text-input"
          data-testid="input-airline"
          role="combobox"
          aria-label="Airline"
          aria-autocomplete="list"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-activedescendant={open && activeIndex >= 0 ? optionId(activeIndex) : undefined}
          autoComplete="off"
          value={value}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            onChange(event.target.value);
            setActiveIndex(-1);
            setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder={loading ? 'Loading airline names…' : 'Search or type an airline'}
        />
        <button
          className="airline-picker-trigger"
          type="button"
          aria-label={open ? 'Hide airline suggestions' : 'Show airline suggestions'}
          aria-expanded={open}
          aria-controls={listboxId}
          onClick={() => {
            setOpen((current) => !current);
            setActiveIndex(-1);
          }}
        >
          <ChevronDown
            className={`airline-picker-chevron ${open ? 'is-open' : ''}`}
            size={15}
            aria-hidden="true"
          />
        </button>
      </div>

      {open && (
        <div className="airline-picker-listbox" id={listboxId} role="listbox" aria-label="Airlines in the workbook">
          <div className="airline-picker-list-meta">
            <span>Airlines in workbook</span>
            <span>{error ? 'Unavailable' : `${filteredAirlines.length} matches`}</span>
          </div>
          {loading ? (
            <div className="airline-picker-empty" role="status">Loading airline names from the workbook…</div>
          ) : error ? (
            <div className="airline-picker-empty" role="status">
              The workbook airline list could not be loaded. You can still type an airline name.
            </div>
          ) : filteredAirlines.length ? (
            filteredAirlines.map((name, index) => {
              const isSelected = value.trim().toLocaleLowerCase() === name.toLocaleLowerCase();
              return (
                <button
                  key={name}
                  id={optionId(index)}
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
            })
          ) : (
            <div className="airline-picker-empty" role="status">
              No workbook match. You can still type this airline name and check its coverage.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
