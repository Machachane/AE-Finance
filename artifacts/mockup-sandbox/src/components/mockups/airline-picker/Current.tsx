import { useState } from 'react';
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

export function Current() {
  const [airline, setAirline] = useState('');

  return (
    <main className="picker-preview">
      <section className="picker-card">
        <div className="picker-card-kicker">AIRLINE FINANCIALS · INPUT</div>
        <h2 className="picker-card-title">Financial data selection</h2>
        <label className="field-label" htmlFor="airline-input">Airline</label>
        <div className="airline-entry">
          <input
            id="airline-input"
            className="text-input"
            data-testid="input-airline"
            list="workbook-airline-names"
            value={airline}
            onChange={(event) => setAirline(event.target.value)}
            placeholder="Search an airline from the workbook"
            aria-label="Airline"
          />
          <datalist id="workbook-airline-names">
            {workbookAirlines.map((name) => <option key={name} value={name} />)}
          </datalist>
        </div>
        <p className="picker-help">Type an airline name to search the supplied workbook.</p>
        <div className="picker-preview-caption">CURRENT · Native suggestions have no clear open-list control</div>
      </section>
    </main>
  );
}
