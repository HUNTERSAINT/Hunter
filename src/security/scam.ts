export type Risk = "none" | "low" | "medium" | "high";
export type Finding = { rule: string; label: string; evidence: string };
export type ScamAssessment = {
  risk: Risk;
  confidence: "low" | "medium" | "high";
  findings: Finding[];
  summary: string;
};

type Rule = { id: string; weight: number; label: string; pattern: RegExp };

const RULES: Rule[] = [
  {
    id: "upfront-fee",
    weight: 3,
    label: "Asks for an upfront fee or deposit",
    pattern:
      /\b(?:registration|application|training|onboarding|processing|activation|verification|equipment|starter[- ]kit)\s+fee\b|\brefundable\s+deposit\b|\bpay\s+(?:a\s+)?(?:small\s+)?(?:fee|deposit)\s+(?:to|before|first)\b/i,
  },
  {
    id: "seed-phrase",
    weight: 5,
    label: "Mentions a seed phrase or private key",
    pattern: /\b(?:seed\s*phrase|recovery\s*phrase|secret\s*recovery\s*phrase|private\s*key|mnemonic)\b/i,
  },
  {
    id: "wallet-connect-to-apply",
    weight: 2,
    label: "Requires connecting a wallet to apply or get paid",
    pattern:
      /\bconnect\s+(?:your\s+)?wallet\s+(?:to|in\s+order\s+to|so\s+we\s+can)\s+(?:apply|verify|claim|receive|get\s+paid|screen)\b/i,
  },
  {
    id: "send-crypto-first",
    weight: 4,
    label: "Asks you to send crypto first",
    pattern:
      /\b(?:send|transfer|deposit)\s+(?:\d+(?:\.\d+)?\s*)?(?:eth|btc|usdt|usdc|sol|bnb|crypto)\b[^.\n]{0,40}\b(?:receive|get|unlock|claim|activate|double)\b/i,
  },
  {
    id: "unrealistic-earnings",
    weight: 3,
    label: "Promises guaranteed or unrealistic earnings",
    pattern:
      /\b(?:guaranteed|assured)\s+(?:income|profits?|returns?|earnings?|payouts?)\b|\bearn\s+\$?\d[\d,]*\+?\s*(?:usd|usdt|\$)?\s*(?:per|a|\/)\s*(?:day|daily|hour)\b|\bno\s+experience\b[^.\n]{0,60}\$\s?\d{3,}/i,
  },
  {
    id: "chat-app-only",
    weight: 1,
    label: "Application only through a private chat app",
    pattern:
      /\bapply\s+(?:only\s+)?(?:via|through|on)\s+(?:telegram|whatsapp)\b|\bonly\s+(?:via|on|through)\s+(?:telegram|whatsapp)\b/i,
  },
  {
    id: "pressure",
    weight: 1,
    label: "Uses urgency or pressure",
    pattern:
      /\b(?:act\s+now|limited\s+slots?|only\s+\d+\s+(?:spots?|slots?)\s+left|expires?\s+in\s+\d+\s+(?:hours?|minutes?))\b/i,
  },
  {
    id: "gift-card-payment",
    weight: 2,
    label: "Mentions gift cards or wire transfers as payment",
    pattern: /\bpay\s+(?:in|with)\s+(?:gift\s*cards?|itunes|steam\s*cards?)\b|\bwestern\s+union\b|\bmoneygram\b/i,
  },
  {
    id: "claim-and-connect",
    weight: 2,
    label: "Asks you to connect a wallet to claim a reward",
    pattern: /\bclaim\s+(?:your\s+)?(?:free\s+)?(?:airdrop|reward|tokens?)\b[^.\n]{0,50}\bconnect\b/i,
  },
];

const SHORTENERS = new Set([
  "bit.ly",
  "tinyurl.com",
  "cutt.ly",
  "rb.gy",
  "is.gd",
  "tiny.cc",
  "shorturl.at",
  "ow.ly",
  "buff.ly",
]);

/** Official domains of well-known projects, used to spot lookalike links. */
const KNOWN_DOMAINS = [
  "uniswap.org",
  "opensea.io",
  "binance.com",
  "coinbase.com",
  "metamask.io",
  "ledger.com",
  "trezor.io",
  "polygon.technology",
  "arbitrum.io",
  "optimism.io",
  "solana.com",
  "ethereum.org",
  "chainlink.com",
  "aave.com",
  "lido.fi",
  "phantom.app",
  "base.org",
  "layerzero.network",
  "discord.com",
  "walletconnect.com",
];

/** Hosting and careers platforms that legitimately carry other companies' names in their URLs. */
const COMMON_PLATFORMS = new Set([
  "notion.site",
  "greenhouse.io",
  "lever.co",
  "ashbyhq.com",
  "workable.com",
  "github.io",
  "github.com",
  "medium.com",
  "substack.com",
  "gitbook.io",
  "google.com",
  "typeform.com",
  "airtable.com",
  "linkedin.com",
  "twitter.com",
  "x.com",
  "t.me",
  "discord.gg",
  "notion.so",
]);

function isNegated(text: string, index: number): boolean {
  const before = text.slice(Math.max(0, index - 60), index);
  return /\b(?:never|do\s+not|don'?t|will\s+not|won'?t|not\s+ever)\b[^.\n]{0,40}$/i.test(before);
}

function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = temp;
    }
  }
  return prev[b.length];
}

function registrable(host: string): string {
  return host.replace(/^www\./, "").split(".").slice(-2).join(".");
}

function snippet(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > 80 ? `${clean.slice(0, 79)}…` : clean;
}

function analyzeUrl(raw: string): { weight: number; finding: Finding }[] {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return [];
  }
  const host = url.hostname.toLowerCase();
  const base = registrable(host);
  const out: { weight: number; finding: Finding }[] = [];
  const add = (rule: string, weight: number, label: string) =>
    out.push({ weight, finding: { rule: `${rule}:${host}`, label, evidence: host } });

  if (SHORTENERS.has(host)) add("shortened-link", 1, "Uses a shortened link that hides the real destination");
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) add("ip-link", 2, "Link points to a bare IP address");
  if (host.includes("xn--")) add("punycode-link", 3, "Link uses look-alike (punycode) characters");
  if (/(?:airdrop|claim-|-claim|verify-wallet|wallet-verify|connect-wallet)/.test(host)) {
    add("suspicious-domain", 2, "Domain name contains claim, airdrop or wallet-verification wording");
  }

  if (!KNOWN_DOMAINS.includes(base) && !COMMON_PLATFORMS.has(base)) {
    for (const known of KNOWN_DOMAINS) {
      if (base.length >= 6 && levenshtein(base, known) <= 2) {
        add("lookalike-domain", 4, `Domain looks very similar to ${known} but is not it`);
        return out;
      }
      const brand = known.split(".")[0];
      if (brand.length >= 5 && host.includes(brand)) {
        add("brand-in-other-domain", 2, `Domain contains "${brand}" but is not ${known}`);
        return out;
      }
    }
  }
  return out;
}

const URL_PATTERN = /https?:\/\/[^\s<>")\]]+/gi;

export function riskAtLeast(risk: Risk, minimum: Risk): boolean {
  const order: Risk[] = ["none", "low", "medium", "high"];
  return order.indexOf(risk) >= order.indexOf(minimum);
}

/**
 * Looks for known scam patterns in text and links. It reports indicators with evidence and a
 * confidence level. It never treats missing information as a warning sign, and a clean result
 * is not proof that something is legitimate.
 */
export function analyzeText(text: string, extraUrls: string[] = []): ScamAssessment {
  const findings: Finding[] = [];
  let score = 0;

  for (const rule of RULES) {
    const pattern = new RegExp(rule.pattern.source, "gi");
    for (const match of text.matchAll(pattern)) {
      if (match.index !== undefined && isNegated(text, match.index)) continue;
      findings.push({ rule: rule.id, label: rule.label, evidence: snippet(match[0]) });
      score += rule.weight;
      break;
    }
  }

  const urls = new Set([...(text.match(URL_PATTERN) ?? []), ...extraUrls]);
  const seen = new Set<string>();
  for (const url of urls) {
    for (const { weight, finding } of analyzeUrl(url)) {
      if (seen.has(finding.rule)) continue;
      seen.add(finding.rule);
      findings.push(finding);
      score += weight;
    }
  }

  const risk: Risk = score === 0 ? "none" : score === 1 ? "low" : score <= 3 ? "medium" : "high";
  const confidence = score >= 5 ? "high" : score >= 3 ? "medium" : "low";

  const summary =
    findings.length === 0
      ? "No known scam patterns were detected. That is not proof it is legitimate, so always confirm through the project's official website and channels."
      : `Found ${findings.length} warning sign${findings.length === 1 ? "" : "s"}. These are indicators, not proof. Check the project's official website and channels before sharing anything or paying anyone.`;

  return { risk, confidence, findings, summary };
}

export function analyzeOpportunity(o: {
  title: string;
  description?: string | null;
  compensation?: string | null;
  applicationProcess?: string | null;
  eligibility?: string | null;
  applyUrl?: string | null;
  sourceUrl?: string | null;
}): ScamAssessment {
  const text = [o.title, o.description, o.compensation, o.applicationProcess, o.eligibility]
    .filter(Boolean)
    .join("\n");
  const urls = [o.applyUrl, o.sourceUrl].filter((u): u is string => Boolean(u));
  return analyzeText(text, urls);
}
