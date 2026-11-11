import type { AssistantDatasets, AssistantPlan } from './assistant-data';

type Message = { role: 'user' | 'assistant'; content: string };

// Exact catalog phrases only: no fuzzy matches, subsidiary or parent inference.
function mentionedAirlines(text: string, names: string[]) {
  const words = text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const found = names.filter((name) => {
    const phrase = name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    return ` ${words} `.includes(` ${phrase} `);
  });
  return found.filter((name) => !found.some((longer) =>
    longer.length > name.length && longer.toLowerCase().includes(name.toLowerCase()),
  ));
}

export function groundAssistantFilters(
  plan: AssistantPlan,
  message: string,
  history: Message[],
  datasets: AssistantDatasets,
): AssistantPlan {
  const names = [...new Set(datasets.financials.map((row) => row.airline))];
  const explicit = mentionedAirlines(message, names);
  const years = [...new Set(message.match(/\b(?:fy\s*)?((?:19|20)\d{2})\b/gi)?.map((value) => value.replace(/^fy\s*/i, '')) ?? [])];
  const periods = [...new Set(message.toUpperCase().match(/\b(?:Q\d+|H\d+|\d{1,2}M|YR)\b/g) ?? [])];
  if (/\b(?:full[- ]year|annual)\b/i.test(message)) periods.push('YR');
  // Catalog matches repair omitted/wrong known entities, but must not erase
  // explicitly requested unknown entities that the router kept for validation.
  const unmatched = plan.airlines.filter((candidate) => !names.some((name) =>
    name.toLowerCase().replace(/[^a-z0-9]+/g, '') === candidate.toLowerCase().replace(/[^a-z0-9]+/g, ''),
  ));
  let airlines = explicit.length ? [...new Set([...explicit, ...unmatched])] : plan.airlines;
  // Follow-ups may reference only user-provided entities, never a name in an
  // assistant answer. A newly supplied unknown name is left for validation.
  if (!explicit.length && /\b(that|same|it|instead)\b/i.test(message)
    && plan.airlines.every((name) => names.includes(name))) {
    for (const previous of [...history].reverse().filter((entry) => entry.role === 'user')) {
      const matches = mentionedAirlines(previous.content, names);
      if (matches.length) { airlines = matches; break; }
    }
  }
  return {
    ...plan,
    airlines,
    financialYear: years.length ? years.join(', ') : plan.financialYear,
    reportingPeriod: periods.length ? [...new Set(periods)].join(', ') : plan.reportingPeriod,
  };
}
