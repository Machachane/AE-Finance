type SecIssuer = {
  cik_str: number;
  ticker: string;
  title: string;
};

type SecFactValue = {
  accn?: string;
  end?: string;
  filed?: string;
  form?: string;
  fp?: string;
  fy?: number;
  frame?: string;
  start?: string;
  val?: number;
};

type SecFact = {
  label?: string;
  units?: Record<string, SecFactValue[]>;
};

type SecCompanyFacts = {
  entityName?: string;
  facts?: Record<string, Record<string, SecFact>>;
};

type SecRecentFilings = {
  accessionNumber?: string[];
  primaryDocument?: string[];
  form?: string[];
  filingDate?: string[];
};

type SecSubmissions = {
  fiscalYearEnd?: string;
  filings?: { recent?: SecRecentFilings };
};

type ResearchRow = {
  metric: string;
  airline: string;
  financialYear: string;
  reportingPeriod: string;
  fiscalYearEnd: string;
  currency: string;
  status: string;
  amount: number | null;
  date: string | null;
  reportingScope: string;
  ifrs16Asc842Adoption: string;
  inAdministration: string;
  sourceUrl: string | null;
  sourceTitle: string | null;
  verificationStatus: "verified" | "unavailable" | "needs_review";
  note: string;
};

const SEC_ROOT = "https://www.sec.gov";
const DATA_ROOT = "https://data.sec.gov";
const SEC_USER_AGENT =
  process.env.SEC_USER_AGENT ??
  "Airline Financial Research (https://www.sec.gov/edgar/sec-api-documentation)";
const ALLOWED_FORMS = new Set(["10-K", "10-Q", "20-F", "40-F"]);
const SEC_CACHE_TTL_MS = 15 * 60 * 1000;
const companyDataCache = new Map<
  string,
  { expiresAt: number; value: { facts: SecCompanyFacts; submissions: SecSubmissions } }
>();
const companyDataRequests = new Map<
  string,
  Promise<{ facts: SecCompanyFacts; submissions: SecSubmissions }>
>();
let secRequestQueue: Promise<void> = Promise.resolve();
let lastSecRequestAt = 0;

const metricRules: Record<
  string,
  { tags: string[]; aliases: string[]; note?: string; needsReview?: boolean }
> = {
  "Cargo Revenue": {
    tags: [],
    aliases: ["cargorevenue", "cargotransportationrevenue", "cargorevenues"],
  },
  "Cash & Liquid Investments": {
    tags: ["CashAndCashEquivalentsAtCarryingValue"],
    aliases: ["cashandcashequivalents"],
    note: "Cash and cash equivalents only; separately reported liquid investments are not added.",
    needsReview: true,
  },
  "Depreciation & Amortisation": {
    tags: [
      "DepreciationDepletionAndAmortization",
      "DepreciationAmortizationAndAccretionNet",
    ],
    aliases: ["depreciationandamortization", "depreciationdepletionandamortization"],
  },
  "Discontinued Operations & Extraordinary Items": {
    tags: ["IncomeLossFromDiscontinuedOperationsNetOfTax"],
    aliases: ["discontinuedoperationsnetoftax", "lossfromdiscontinuedoperations"],
    note: "Discontinued operations only; extraordinary items are included only if separately tagged.",
    needsReview: true,
  },
  EBIT: {
    tags: ["OperatingIncomeLoss"],
    aliases: ["operatingincome", "operatingprofit"],
  },
  "Forward Sales & Deferred Revenue": {
    tags: [
      "ContractWithCustomerLiabilityCurrent",
      "ContractWithCustomerLiability",
    ],
    aliases: ["deferredrevenue", "contractliability"],
    note: "Uses the reported matching deferred-revenue concept; current and non-current components are not combined.",
    needsReview: true,
  },
  "Fuel Costs": {
    tags: [],
    aliases: ["fuelcost", "fuelcosts", "aircraftfuel", "fuelandrelatedcost"],
  },
  "Long Term Debt & Lease Liabilities": {
    tags: [
      "LongTermDebtAndFinanceLeaseObligations",
      "LongTermDebtAndCapitalLeaseObligations",
      "LongTermDebtNoncurrent",
    ],
    aliases: [
      "longtermdebtandfinancelease",
      "longtermdebtandcapitallease",
      "longtermdebt",
    ],
    note: "A matching debt concept is reported; separate lease-liability concepts are not added.",
    needsReview: true,
  },
  "Net Interest": {
    tags: ["InterestExpenseNonOperatingNet"],
    aliases: ["interestexpense", "interestanddebt"],
    needsReview: true,
  },
  "Non-Operating Items": {
    tags: ["NonoperatingIncomeExpense"],
    aliases: ["nonoperatingincomeexpense", "nonoperatingitems"],
  },
  "Operating Profit/(Loss)": {
    tags: ["OperatingIncomeLoss"],
    aliases: ["operatingincome", "operatingprofit", "operatingloss"],
  },
  "Other / Unclassified Revenue": {
    tags: ["OtherRevenue"],
    aliases: ["otherrevenue", "unclassifiedrevenue"],
  },
  "Other Current Assets": {
    tags: ["OtherAssetsCurrent"],
    aliases: ["othercurrentassets"],
  },
  "Other Current Liabilities": {
    tags: ["OtherLiabilitiesCurrent"],
    aliases: ["othercurrentliabilities"],
  },
  "Other Finance items": {
    tags: ["OtherNonoperatingIncomeExpense"],
    aliases: ["otherfinance", "othernonoperatingincomeexpense"],
    needsReview: true,
  },
  "Other Non-Current Assets": {
    tags: ["OtherAssetsNoncurrent"],
    aliases: ["othernoncurrentassets", "othernoncurrentasset"],
  },
  "Other Operating Costs": {
    tags: ["OtherCostAndExpenseOperating"],
    aliases: ["otheroperatingcost", "otheroperatingexpense"],
  },
  "Other-Non Current Liabilities": {
    tags: ["OtherLiabilitiesNoncurrent"],
    aliases: ["othernoncurrentliabilities"],
  },
  "Passenger Revenue": {
    tags: [],
    aliases: ["passengerrevenue", "passengertransportationrevenue"],
  },
  "Profit / Loss After Tax": {
    tags: ["NetIncomeLoss"],
    aliases: ["netincome", "netloss"],
  },
  "Profit / Loss Before Tax": {
    tags: [
      "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest",
      "IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments",
    ],
    aliases: ["incomelossbeforetax", "incomebeforetaxes"],
  },
  "Property, Plant and Equipment": {
    tags: ["PropertyPlantAndEquipmentNet"],
    aliases: ["propertyplantandequipmentnet", "propertyplantequipment"],
  },
  "Retained Earnings & Reserves": {
    tags: ["RetainedEarningsAccumulatedDeficit"],
    aliases: ["retainedearnings", "accumulateddeficit"],
  },
  "Share Capital": {
    tags: ["CommonStockValue"],
    aliases: ["sharecapital", "commonstockvalue"],
  },
  "Short Term Debt": {
    tags: ["ShortTermBorrowings", "LongTermDebtCurrent"],
    aliases: ["shorttermborrowings", "shorttermdebt"],
  },
  "Staff Costs": {
    tags: [],
    aliases: [
      "staffcost",
      "staffexpense",
      "personnelcost",
      "personnelexpense",
      "salariesandbenefits",
    ],
  },
  Tax: {
    tags: ["IncomeTaxExpenseBenefit"],
    aliases: ["incometaxexpense", "incometaxbenefit"],
  },
  "Total Assets": {
    tags: ["Assets"],
    aliases: ["totalassets"],
  },
  "Total Current Assets": {
    tags: ["AssetsCurrent"],
    aliases: ["totalcurrentassets"],
  },
  "Total Current Liabilities": {
    tags: ["LiabilitiesCurrent"],
    aliases: ["totalcurrentliabilities"],
  },
  "Total Equity": {
    tags: ["StockholdersEquity"],
    aliases: ["stockholdersequity", "totalequity"],
  },
  "Total Liabilities": {
    tags: ["Liabilities"],
    aliases: ["totalliabilities"],
  },
  "Total Non-Current Assets": {
    tags: ["AssetsNoncurrent"],
    aliases: ["assetsnoncurrent", "totalnoncurrentassets"],
  },
  "Total Non-Current Liabilities": {
    tags: ["LiabilitiesNoncurrent"],
    aliases: ["liabilitiesnoncurrent", "totalnoncurrentliabilities"],
  },
  "Total Revenue": {
    tags: [
      "RevenueFromContractWithCustomerExcludingAssessedTax",
      "Revenues",
      "SalesRevenueNet",
    ],
    aliases: ["totalrevenue", "revenuefromcontractwithcustomer"],
  },
  "Trade Payables": {
    tags: ["AccountsPayableCurrent"],
    aliases: ["accountspayablecurrent", "tradepayables"],
  },
  "Trade Receivables": {
    tags: ["AccountsReceivableNetCurrent"],
    aliases: ["accountsreceivablenetcurrent", "tradereceivables"],
  },
};

let issuerDirectory: SecIssuer[] | undefined;
let issuerDirectoryPromise: Promise<SecIssuer[]> | undefined;

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(
      /\b(the|inc|incorporated|corp|corporation|company|co|plc|limited|ltd|group|holdings|holding|airlines|airline|airways|air|lines)\b/g,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

function issuerScore(requested: string, officialTitle: string): number {
  const left = normalize(requested);
  const right = normalize(officialTitle);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) return 0.88;
  const leftTokens = new Set(left.split(" "));
  const rightTokens = new Set(right.split(" "));
  const overlap = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return overlap / Math.max(leftTokens.size, rightTokens.size);
}

async function secJson<T>(url: string): Promise<T> {
  const previousRequest = secRequestQueue;
  let releaseRequest: () => void = () => {};
  secRequestQueue = new Promise<void>((resolve) => {
    releaseRequest = resolve;
  });
  await previousRequest;
  const waitMs = Math.max(0, 120 - (Date.now() - lastSecRequestAt));
  if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
  lastSecRequestAt = Date.now();
  releaseRequest();

  const response = await fetch(url, {
    headers: {
      "User-Agent": SEC_USER_AGENT,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error(`SEC request failed (${response.status})`);
  }
  return (await response.json()) as T;
}

async function getIssuerDirectory(): Promise<SecIssuer[]> {
  if (issuerDirectory) return issuerDirectory;
  if (!issuerDirectoryPromise) {
    issuerDirectoryPromise = secJson<Record<string, SecIssuer>>(
      `${SEC_ROOT}/files/company_tickers.json`,
    ).then((directory) => {
      issuerDirectory = Object.values(directory);
      return issuerDirectory;
    }).catch((error: unknown) => {
      issuerDirectoryPromise = undefined;
      throw error;
    });
  }
  return issuerDirectoryPromise;
}

function matchIssuer(
  requested: string,
  directory: SecIssuer[],
): { issuer?: SecIssuer; ambiguous: boolean } {
  const ranked = directory
    .map((issuer) => ({ issuer, score: issuerScore(requested, issuer.title) }))
    .filter((item) => item.score >= 0.8)
    .sort((a, b) => b.score - a.score);
  if (!ranked.length) return { ambiguous: false };
  if (ranked.length > 1 && ranked[0].score - ranked[1].score < 0.06) {
    return { ambiguous: true };
  }
  return { issuer: ranked[0].issuer, ambiguous: false };
}

function formatFiscalYearEnd(value?: string): string {
  if (!value || !/^\d{4}$/.test(value)) return "Not disclosed";
  const month = Number(value.slice(0, 2));
  const day = Number(value.slice(2));
  const monthName = [
    "",
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ][month];
  return monthName ? `Yr End ${day} ${monthName}` : "Not disclosed";
}

function normalizeUnit(unit: string): string | undefined {
  if (/^[A-Z]{3}$/.test(unit)) return unit;
  if (unit === "USD") return "USD";
  return undefined;
}

function quarterFromFiscalEnd(endDate: string, fiscalYearEnd: string): string {
  const end = new Date(`${endDate}T00:00:00Z`);
  const endMonth = Number(endDate.slice(5, 7));
  const fiscalMonth = Number(fiscalYearEnd.slice(0, 2)) || 12;
  const difference = (endMonth - fiscalMonth + 12) % 12;
  const quarter = Math.ceil((difference || 12) / 3);
  const day = end.getUTCDate();
  return `Q${Math.max(1, Math.min(4, quarter || (day <= 10 ? 4 : 1)))}`;
}

function reportingPeriod(
  fact: SecFactValue,
  fiscalYearEnd: string,
): string | undefined {
  if (!fact.end) return undefined;
  if (!fact.start) {
    const endMonth = Number(fact.end.slice(5, 7));
    const fiscalMonth = Number(fiscalYearEnd.slice(0, 2)) || 12;
    const monthDifference = (endMonth - fiscalMonth + 12) % 12;
    if (monthDifference === 0) return "YR";
    if ([3, 6, 9].includes(monthDifference)) {
      return `Q${monthDifference / 3}`;
    }
    return undefined;
  }
  const startTime = Date.parse(`${fact.start}T00:00:00Z`);
  const endTime = Date.parse(`${fact.end}T00:00:00Z`);
  const days = Math.round((endTime - startTime) / 86_400_000) + 1;
  if (days >= 55 && days <= 125) {
    if (fact.fp && /^Q[1-4]$/.test(fact.fp)) return fact.fp;
    return quarterFromFiscalEnd(fact.end, fiscalYearEnd);
  }
  if (days >= 160 && days <= 205) return "H1";
  if (days >= 235 && days <= 295) return "9M";
  if (days >= 285 && days <= 335 && fact.fp !== "FY") return "10M";
  if (days >= 300 && days <= 390) return "YR";
  if (days >= 420 && days <= 500) return "15M";
  return undefined;
}

function financialYearFor(fact: SecFactValue): number {
  return Number(fact.end?.slice(0, 4));
}

function isFinancialUnit(unit: string): boolean {
  return /^[A-Z]{3}$/.test(unit) && unit !== "EURX";
}

function sourceForFact(
  fact: SecFactValue,
  issuer: SecIssuer,
  submissions: SecSubmissions,
): { url: string | null; title: string | null } {
  const recent = submissions.filings?.recent;
  const index = recent?.accessionNumber?.indexOf(fact.accn ?? "") ?? -1;
  const form = index >= 0 ? recent?.form?.[index] : fact.form;
  const filed = index >= 0 ? recent?.filingDate?.[index] : fact.filed;
  const document = index >= 0 ? recent?.primaryDocument?.[index] : undefined;
  const accession = fact.accn?.replace(/-/g, "");
  const cik = String(issuer.cik_str);
  const url =
    accession && document
      ? `${SEC_ROOT}/Archives/edgar/data/${cik}/${accession}/${encodeURIComponent(document)}`
      : accession
        ? `${SEC_ROOT}/Archives/edgar/data/${cik}/${accession}/`
        : `https://www.sec.gov/edgar/browse/?CIK=${issuer.cik_str}`;
  return {
    url,
    title: `${form ?? "SEC filing"}${filed ? ` filed ${filed}` : ""}`,
  };
}

function tagMatches(tag: string, label: string, aliases: string[]): boolean {
  const normalizedTag = normalize(tag).replace(/\s/g, "");
  const normalizedLabel = normalize(label).replace(/\s/g, "");
  return aliases.some((alias) => {
    const normalizedAlias = normalize(alias).replace(/\s/g, "");
    return (
      normalizedTag.includes(normalizedAlias) ||
      normalizedLabel.includes(normalizedAlias)
    );
  });
}

function factsForMetric(
  facts: SecCompanyFacts,
  metric: string,
): Array<{ taxonomy: string; tag: string; fact: SecFact; unit: string; value: SecFactValue }> {
  const rule = metricRules[metric];
  if (!rule || !facts.facts) return [];

  const candidates: Array<{
    taxonomy: string;
    tag: string;
    fact: SecFact;
    unit: string;
    value: SecFactValue;
  }> = [];
  for (const [taxonomy, concepts] of Object.entries(facts.facts)) {
    for (const [tag, fact] of Object.entries(concepts)) {
      const exactTag = rule.tags.includes(tag);
      const customMatch =
        rule.aliases.length > 0 &&
        tagMatches(tag, fact.label ?? "", rule.aliases);
      if (!exactTag && !customMatch) continue;
      for (const [unit, values] of Object.entries(fact.units ?? {})) {
        if (!isFinancialUnit(unit)) continue;
        for (const value of values) {
          if (typeof value.val !== "number" || !value.end) continue;
          candidates.push({ taxonomy, tag, fact, unit, value });
        }
      }
    }
  }

  for (const preferredTag of rule.tags) {
    const exact = candidates.filter(({ tag }) => tag === preferredTag);
    if (exact.length) return exact;
  }
  return candidates.filter(({ taxonomy }) => taxonomy !== "us-gaap");
}

function factsToRows(
  airline: string,
  issuer: SecIssuer,
  facts: SecCompanyFacts,
  submissions: SecSubmissions,
  metrics: string[],
  years: number[],
  fiscalYearEnd: string,
): ResearchRow[] {
  const today = new Date().toISOString().slice(0, 10);
  const rows: ResearchRow[] = [];

  for (const metric of metrics) {
    const metricFacts = factsForMetric(facts, metric)
      .filter(({ value }) => {
        const year = financialYearFor(value);
        return (
          years.includes(year) &&
          (value.filed ?? "") <= today &&
          ALLOWED_FORMS.has(value.form ?? "")
        );
      })
      .map((candidate) => ({
        ...candidate,
        period: reportingPeriod(candidate.value, fiscalYearEnd),
      }))
      .filter(
        (
          candidate,
        ): candidate is typeof candidate & { period: string } =>
          Boolean(candidate.period),
      );

    const latestByPeriod = new Map<string, (typeof metricFacts)[number]>();
    for (const candidate of metricFacts) {
      const year = financialYearFor(candidate.value);
      const key = `${year}|${candidate.period}|${candidate.value.end}|${candidate.unit}`;
      const previous = latestByPeriod.get(key);
      const candidateIsOriginalPeriod =
        candidate.value.fy === year;
      const previousIsOriginalPeriod =
        previous?.value.fy === year;
      if (
        !previous ||
        (candidateIsOriginalPeriod && !previousIsOriginalPeriod) ||
        (candidateIsOriginalPeriod === previousIsOriginalPeriod &&
          (candidate.value.filed ?? "") > (previous.value.filed ?? ""))
      ) {
        latestByPeriod.set(key, candidate);
      }
    }

    const yearsWithFacts = new Set<number>();
    for (const candidate of latestByPeriod.values()) {
      const { value, unit, taxonomy, fact } = candidate;
      const year = financialYearFor(value);
      yearsWithFacts.add(year);
      const source = sourceForFact(value, issuer, submissions);
      const sourceForm = value.form ?? "";
      const standard = taxonomy === "us-gaap" || taxonomy === "ifrs-full";
      const ruleNote = metricRules[metric]?.note;
      const adoption =
        taxonomy === "ifrs-full"
          ? "IFRS 16 (IFRS reporter)"
          : taxonomy === "us-gaap"
            ? "ASC 842 (US GAAP reporter)"
            : "Not separately verified";
      rows.push({
        metric,
        airline,
        financialYear: String(year),
        reportingPeriod: candidate.period,
        fiscalYearEnd,
        currency: normalizeUnit(unit) ?? unit,
        status: "Actual",
        amount: value.val ?? null,
        date: value.end ?? null,
        reportingScope:
          sourceForm === "20-F" || sourceForm === "40-F"
            ? "Group Consolidated"
            : "Company Consolidated",
        ifrs16Asc842Adoption: adoption,
        inAdministration: "Not disclosed in this filing",
        sourceUrl: source.url,
        sourceTitle: source.title ?? fact.label ?? null,
        verificationStatus:
          standard && !metricRules[metric]?.needsReview
            ? "verified"
            : "needs_review",
        note: [
          `Reported XBRL line: ${fact.label ?? candidate.tag}.`,
          ruleNote,
          standard
            ? "Value is reproduced from an official SEC filing in its reported currency and units."
            : "Issuer-specific XBRL concept; confirm the line definition in the cited filing.",
        ]
          .filter(Boolean)
          .join(" "),
      });
    }

    for (const year of years) {
      if (yearsWithFacts.has(year)) continue;
      rows.push({
        metric,
        airline,
        financialYear: String(year),
        reportingPeriod: "N/A",
        fiscalYearEnd,
        currency: "N/A",
        status: "Unavailable",
        amount: null,
        date: null,
        reportingScope: "Not established",
        ifrs16Asc842Adoption: "Not established",
        inAdministration: "Not established",
        sourceUrl: null,
        sourceTitle: null,
        verificationStatus: "unavailable",
        note: "No matching official XBRL value was found for this metric and fiscal year; no estimate has been substituted.",
      });
    }
  }
  return rows;
}

function unavailableRows(
  airline: string,
  metrics: string[],
  years: number[],
  verificationStatus: "unavailable" | "needs_review",
  note: string,
): ResearchRow[] {
  return metrics.flatMap((metric) =>
    years.map((year) => ({
      metric,
      airline,
      financialYear: String(year),
      reportingPeriod: "N/A",
      fiscalYearEnd: "Not disclosed",
      currency: "N/A",
      status: "Unavailable",
      amount: null,
      date: null,
      reportingScope: "Not established",
      ifrs16Asc842Adoption: "Not established",
      inAdministration: "Not established",
      sourceUrl: null,
      sourceTitle: null,
      verificationStatus,
      note,
    })),
  );
}

async function fetchIssuerData(issuer: SecIssuer): Promise<{
  facts: SecCompanyFacts;
  submissions: SecSubmissions;
}> {
  const cacheKey = String(issuer.cik_str);
  const cached = companyDataCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const existingRequest = companyDataRequests.get(cacheKey);
  if (existingRequest) return existingRequest;

  const cik = String(issuer.cik_str).padStart(10, "0");
  const request = Promise.all([
    secJson<SecCompanyFacts>(`${DATA_ROOT}/api/xbrl/companyfacts/CIK${cik}.json`),
    secJson<SecSubmissions>(`${DATA_ROOT}/submissions/CIK${cik}.json`),
  ])
    .then(([facts, submissions]) => {
      const value = { facts, submissions };
      companyDataCache.set(cacheKey, {
        value,
        expiresAt: Date.now() + SEC_CACHE_TTL_MS,
      });
      return value;
    })
    .finally(() => {
      companyDataRequests.delete(cacheKey);
    });
  companyDataRequests.set(cacheKey, request);
  return request;
}

export async function researchSecFinancials(input: {
  airlines: string[];
  metrics: string[];
  years: number[];
}): Promise<{ rows: ResearchRow[]; coverageNotes: string[] }> {
  const directory = await getIssuerDirectory();
  const coverageNotes = [
    "This research uses SEC EDGAR data only. It does not search airline investor-relations websites, non-US registries, commercial databases, or private-company filings outside EDGAR.",
    "The SEC company directory lists current registrants. A private airline or subsidiary may not appear even when its parent reports consolidated results.",
    "A blank amount means an exact matching reported XBRL concept was not found; it is not zero. Custom issuer tags are marked for review.",
    "Amounts are shown in the source filing's reported currency and full units. Metrics with scope notes are not silently combined with related line items.",
  ];
  const rows: ResearchRow[] = [];

  for (const airline of input.airlines) {
    const match = matchIssuer(airline, directory);
    if (!match.issuer) {
      rows.push(
        ...unavailableRows(
          airline,
          input.metrics,
          input.years,
          match.ambiguous ? "needs_review" : "unavailable",
          match.ambiguous
            ? "More than one SEC registrant matched this name; no company was selected automatically."
            : "No confident current SEC registrant match was found for this airline. Private and subsidiary airlines may not file separately.",
        ),
      );
      coverageNotes.push(
        `${airline}: no confident SEC registrant match; values were not inferred from another company.`,
      );
      continue;
    }

    try {
      const { facts, submissions } = await fetchIssuerData(match.issuer);
      const fiscalYearEnd = formatFiscalYearEnd(submissions.fiscalYearEnd);
      const airlineRows = factsToRows(
        airline,
        match.issuer,
        facts,
        submissions,
        input.metrics,
        input.years,
        fiscalYearEnd,
      );
      rows.push(...airlineRows);
      coverageNotes.push(
        `${airline}: matched SEC registrant ${facts.entityName ?? match.issuer.title} (${match.issuer.ticker}); financials may be consolidated parent-company figures.`,
      );
    } catch (error) {
      rows.push(
        ...unavailableRows(
          airline,
          input.metrics,
          input.years,
          "unavailable",
          "The SEC company record was matched, but its filing data could not be retrieved. Retry later; values were not estimated.",
        ),
      );
      coverageNotes.push(
        `${airline}: SEC data retrieval failed${error instanceof Error ? ` (${error.message})` : ""}.`,
      );
    }
  }

  return { rows, coverageNotes };
}

export const supportedAirlineMetrics = Object.keys(metricRules);
