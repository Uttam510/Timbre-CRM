// Turn YouTube's 2-letter country code (snippet.country) into something
// human-friendly for the UI: a flag emoji + country name.

const NAMES = {
  US: "United States", GB: "United Kingdom", CA: "Canada", AU: "Australia",
  IN: "India", DE: "Germany", FR: "France", ES: "Spain", IT: "Italy",
  NL: "Netherlands", BR: "Brazil", MX: "Mexico", JP: "Japan", KR: "South Korea",
  PH: "Philippines", ID: "Indonesia", PK: "Pakistan", NG: "Nigeria",
  ZA: "South Africa", SE: "Sweden", NO: "Norway", DK: "Denmark", FI: "Finland",
  PL: "Poland", IE: "Ireland", NZ: "New Zealand", SG: "Singapore", AE: "UAE",
  PT: "Portugal", BE: "Belgium", CH: "Switzerland", AT: "Austria", TR: "Turkey",
  RU: "Russia", UA: "Ukraine", AR: "Argentina", CO: "Colombia", CL: "Chile",
};

function flag(code) {
  if (!code || code.length !== 2) return "";
  return code
    .toUpperCase()
    .replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
}

// Returns "🇺🇸 United States", or "" when no country is set.
export function locationLabel(code) {
  if (!code) return "";
  const c = code.toUpperCase();
  return `${flag(c)} ${NAMES[c] || c}`.trim();
}
