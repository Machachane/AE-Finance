import type { AssistantDatasets, AssistantPlan } from './assistant-data';

type Message = { role: 'user' | 'assistant'; content: string };

// Exact catalog phrases only: no fuzzy matches, subsidiary or parent inference.
export function mentionedAirlines(text: string, names: string[]) {
  const words = text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const found = names.filter((name) => {
    const phrase = name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    return ` ${words} `.includes(` ${phrase} `);
  });
  return found.filter((name) => !found.some((longer) =>
    longer.length > name.length && longer.toLowerCase().includes(name.toLowerCase()),
  ));
}

function removePhrase(text: string, phrase: string, replacement = ' ') {
  const escaped = phrase.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (` ${text} `).replace(new RegExp(` ${escaped} `, 'g'), replacement).trim();
}

function unresolvedEntityGroup(message: string, names: string[]) {
  let marked = message.toLowerCase().replace(/[,&]/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
  for (const name of [...names].sort((a, b) => b.length - a.length)) {
    marked = removePhrase(marked, name, ' knownairline ');
  }
  // Names following "for", or joined to a known name, are entity positions:
  // ordinary filler words here must not erase an unknown airline called "Go".
  const candidates = [
    ...[...marked.matchAll(/\bfor\s+(.+?)(?=\bfor\b|$)/g)].map((match) => match[1]!),
    ...[...marked.matchAll(/\bknownairline\s+and\s+(.+?)(?=$)/g)].map((match) => match[1]!),
    ...[...marked.matchAll(/\b(?:show|compare|open|view)\s+(?:me\s+)?(.+?)\s+and\s+knownairline\b/g)].map((match) => match[1]!),
  ];
  for (const raw of candidates) {
    const candidate = raw.split(/\b(?:balance|profit|financial|fiscal|years?|ratios?|kpis?|analytics|statements?|ebitda|ebit|margins?|debt|liquidity|leverage|profitability|revenue|roe|roa|fy\s*\d{4}|(?:19|20)\d{2}|reporting|q\d+|h\d+|yr|please|now|instead)\b/)[0]!
      .trim()
      .replace(/\s+(?:in|during|at|on|over|from|as of)(?:\s+the)?$/, '')
      .replace(/^(?:the\s+)?(?:airline\s+)?/, '').trim();
    if (!candidate || /^(?:the )?(?:same|that|this) (?:airline|year|period)$|^it$|^(?:full year|annual)$/.test(candidate)) continue;
    const unknown = candidate.split(/\s+(?:and|with|versus|vs|against)\s+/)
      .filter((part) => part.trim() && part.trim() !== 'knownairline');
    if (unknown.length) return unknown.join(', ').slice(0, 160);
  }
  return '';
}

// Fail closed on unaccounted-for names in page requests. This intentionally
// asks about unusual wording instead of trusting a classifier's partial list.
export function unresolvedNavigationText(message: string, datasets: AssistantDatasets) {
  const entityGroup = unresolvedEntityGroup(message, [...new Set(datasets.financials.map((row) => row.airline))]);
  if (entityGroup) return entityGroup;
  let remaining = message.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const phrases = [
    ...new Set(datasets.financials.map((row) => row.airline)),
    ...new Set(datasets.financials.map((row) => row.metric)),
    'financial ratios', 'financial statements', 'profit and loss', 'profit loss', 'balance sheets', 'balance sheet',
    'airline financial analytics', 'airline analytics', 'airline financials', 'aviation finance',
  ].sort((a, b) => b.length - a.length);
  for (const phrase of phrases) remaining = removePhrase(remaining, phrase);
  return remaining
    .replace(/\b(?:fy\s*)?(?:19|20)\d{2}\b/g, ' ')
    .replace(/\b(?:q\d+|h\d+|\d{1,2}m|yr)\b/g, ' ')
    .replace(/\b(?:please|show|me|my|us|the|a|an|to|in|on|of|for|during|at|over|from|as|and|or|with|versus|vs|compare|comparison|against|both|all|three|two|airline|airlines|open|go|take|view|see|display|generate|get|give|want|need|i|can|could|would|you|now|then|next|back|again|instead|same|that|this|it|its|their|s|page|tab|tables?|financial|fiscal|ratios?|kpis?|statements?|analytics|history|historical|year|years|reporting|period|full|annual|end)\b/g, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, 160);
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
  const unresolved = plan.intent === 'navigation'
    ? unresolvedNavigationText(message, datasets)
    : ['metric_lookup', 'ratio_lookup'].includes(plan.intent) ? unresolvedEntityGroup(message, names) : '';
  if (unresolved && !unmatched.some((name) => name.toLowerCase() === unresolved)) unmatched.push(unresolved);
  let airlines = [...new Set([...(explicit.length ? explicit : plan.airlines), ...unmatched])];
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
