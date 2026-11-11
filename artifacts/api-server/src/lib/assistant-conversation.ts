import type { AssistantConversationContext } from '@workspace/api-zod';
import {
  answerAssistantPlan, getAssistantCatalog, normalizeAssistantPlan,
  type AssistantDatasets, type AssistantPlan,
} from './assistant-data';
import { groundAssistantFilters, mentionedAirlines, unresolvedNavigationText } from './assistant-filters';

export type { AssistantConversationContext };
export type ChatMessage = { role: 'user' | 'assistant'; content: string };

export function validateConversationContext(
  value: AssistantConversationContext | undefined,
  datasets: AssistantDatasets,
): AssistantConversationContext {
  const catalog = getAssistantCatalog(datasets);
  const selection = value?.selection;
  const airlines = selection?.airlines.filter((name) => catalog.airlines.includes(name)) ?? [];
  const rows = datasets.financials.filter((row) => airlines.includes(row.airline));
  const financialYear = selection?.financialYear && rows.some((row) => row.financialYear === selection.financialYear)
    ? selection.financialYear : null;
  const reportingPeriod = selection?.reportingPeriod && rows.some((row) =>
    (!financialYear || row.financialYear === financialYear) && row.reportingPeriod === selection.reportingPeriod)
    ? selection.reportingPeriod : null;
  return {
    selection: { airlines, financialYear, reportingPeriod },
    ...(value?.request ? { request: normalizeAssistantPlan(value.request) } : {}),
  };
}

function requestedPage(message: string): AssistantPlan['navigateTo'] {
  if (/\b(?:ratios?|kpis?)\b/i.test(message)) return 'ratios';
  if (/\b(?:balance sheets?|profit\s*(?:&|and)\s*loss|financial statements?|statements)\b/i.test(message)) return 'statements';
  if (/\b(?:airline\s+financial\s+analytics|analytics)\b/i.test(message)) return 'analytics';
  if (/\baviation finance\b/i.test(message)) return 'aviationFinance';
  if (/\bairline financials\b/i.test(message)) return 'financials';
  return null;
}

// Common page changes and clarification replies do not require a model call.
export function deterministicConversationPlan(
  message: string,
  context: AssistantConversationContext,
  datasets: AssistantDatasets,
): AssistantPlan | null {
  const page = requestedPage(message);
  if (page && !/\b(?:what|why|how|calculate|explain|margin|coverage|roe|roa|debt|ebitda)\b/i.test(message)) {
    return normalizeAssistantPlan({ intent: 'navigation', navigateTo: page });
  }
  const names = mentionedAirlines(message, getAssistantCatalog(datasets).airlines);
  const hasSlots = names.length > 0 || /\b(?:fy\s*)?(?:19|20)\d{2}\b|\b(?:Q\d+|H\d+|\d{1,2}M|YR)\b/i.test(message);
  if (context.request && hasSlots && !page && !unresolvedNavigationText(message, datasets)) {
    return normalizeAssistantPlan({ ...context.request, airlines: [] });
  }
  return null;
}

export function resolveConversationPlan(
  modelPlan: AssistantPlan,
  message: string,
  context: AssistantConversationContext,
  datasets: AssistantDatasets,
): AssistantPlan {
  const explicitNames = mentionedAirlines(message, getAssistantCatalog(datasets).airlines);
  const plan = groundAssistantFilters(modelPlan, message, [], datasets);
  if (plan.intent === 'help' || plan.intent === 'unsupported') return plan;
  const selection = context.selection;
  const previous = context.request;
  const knownNames = getAssistantCatalog(datasets).airlines;
  const unresolvedModelNames = plan.airlines.some((name) => !knownNames.includes(name));
  const hasYear = /\b(?:fy\s*)?(?:19|20)\d{2}\b/i.test(message);
  const hasPeriod = /\b(?:Q\d+|H\d+|\d{1,2}M|YR|annual|full[- ]year)\b/i.test(message);
  const changedAirline = explicitNames.length > 0
    && JSON.stringify(explicitNames) !== JSON.stringify(selection.airlines);
  const airlines = explicitNames.length || unresolvedModelNames
    ? plan.airlines
    : previous?.airlines.some((name) => !knownNames.includes(name))
      ? previous.airlines : selection.airlines.length ? selection.airlines : plan.airlines;
  const candidates = datasets.financials.filter((row) => airlines.includes(row.airline));
  const inheritedYear = selection.financialYear ?? previous?.financialYear ?? null;
  const year = hasYear ? plan.financialYear
    : changedAirline && !candidates.some((row) => row.financialYear === inheritedYear) ? null
      : inheritedYear ?? plan.financialYear;
  const inheritedPeriod = selection.reportingPeriod ?? previous?.reportingPeriod ?? null;
  const period = hasPeriod ? plan.reportingPeriod
    : (changedAirline || hasYear) && !candidates.some((row) =>
      (!year || row.financialYear === year) && row.reportingPeriod === inheritedPeriod) ? null
      : inheritedPeriod ?? plan.reportingPeriod;
  return { ...plan, airlines, financialYear: year, reportingPeriod: period };
}

export function conversationContextAfterPlan(
  plan: AssistantPlan,
  previous: AssistantConversationContext,
  datasets: AssistantDatasets,
): AssistantConversationContext {
  plan = normalizeAssistantPlan(plan);
  if (plan.intent === 'help' || plan.intent === 'unsupported') return previous;
  if (plan.navigateTo === 'aviationFinance' || plan.intent.startsWith('aviation_')) {
    return { ...previous, request: plan };
  }
  // Store the request even when it awaits clarification. Selection contains
  // only catalog-validated values; unresolved request values still block links.
  const checked = validateConversationContext({
    selection: { airlines: plan.airlines, financialYear: plan.financialYear, reportingPeriod: plan.reportingPeriod },
    request: plan,
  }, datasets);
  if (plan.airlines.some((name) => !getAssistantCatalog(datasets).airlines.includes(name))) {
    checked.selection = { airlines: [], financialYear: null, reportingPeriod: null };
  }
  // A uniquely inferred statement period is also safe to retain.
  const answer = answerAssistantPlan(plan, datasets);
  if (answer.navigation && plan.intent === 'navigation') {
    const params = new URL(answer.navigation.href, 'https://platform.invalid').searchParams;
    if (params.get('year')) checked.selection.financialYear = params.get('year');
    if (params.get('period')) checked.selection.reportingPeriod = params.get('period');
  }
  return checked;
}
