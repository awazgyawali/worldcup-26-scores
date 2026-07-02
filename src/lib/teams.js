// ----------------------------------------------------------------------------
// TEAM METADATA — FIFA trigram codes + iso2 for flagcdn.
// ----------------------------------------------------------------------------
export const TEAM_META = {
  Algeria: ["dz", "ALG"],
  Argentina: ["ar", "ARG"],
  Australia: ["au", "AUS"],
  Austria: ["at", "AUT"],
  Belgium: ["be", "BEL"],
  "Bosnia & Herzegovina": ["ba", "BIH"],
  Brazil: ["br", "BRA"],
  Canada: ["ca", "CAN"],
  "Cape Verde": ["cv", "CPV"],
  Colombia: ["co", "COL"],
  Croatia: ["hr", "CRO"],
  "Curaçao": ["cw", "CUW"],
  "Czech Republic": ["cz", "CZE"],
  "DR Congo": ["cd", "COD"],
  Ecuador: ["ec", "ECU"],
  Egypt: ["eg", "EGY"],
  England: ["gb-eng", "ENG"],
  France: ["fr", "FRA"],
  Germany: ["de", "GER"],
  Ghana: ["gh", "GHA"],
  Haiti: ["ht", "HAI"],
  Iran: ["ir", "IRN"],
  Iraq: ["iq", "IRQ"],
  Italy: ["it", "ITA"],
  "Ivory Coast": ["ci", "CIV"],
  Japan: ["jp", "JPN"],
  Jordan: ["jo", "JOR"],
  Mexico: ["mx", "MEX"],
  Morocco: ["ma", "MAR"],
  Netherlands: ["nl", "NED"],
  "New Zealand": ["nz", "NZL"],
  Norway: ["no", "NOR"],
  Panama: ["pa", "PAN"],
  Paraguay: ["py", "PAR"],
  Portugal: ["pt", "POR"],
  Qatar: ["qa", "QAT"],
  "Saudi Arabia": ["sa", "KSA"],
  Scotland: ["gb-sct", "SCO"],
  Senegal: ["sn", "SEN"],
  "South Africa": ["za", "RSA"],
  "South Korea": ["kr", "KOR"],
  Spain: ["es", "ESP"],
  Sweden: ["se", "SWE"],
  Switzerland: ["ch", "SUI"],
  Tunisia: ["tn", "TUN"],
  Turkey: ["tr", "TUR"],
  USA: ["us", "USA"],
  "United States": ["us", "USA"],
  Uruguay: ["uy", "URU"],
  Uzbekistan: ["uz", "UZB"],
};

export const TEAM_ALIASES = {
  usa: "united states",
  "u.s.a.": "united states",
  "united states of america": "united states",
  "korea republic": "south korea",
  "republic of korea": "south korea",
  "korea, republic of": "south korea",
  "côte d'ivoire": "ivory coast",
  "cote d'ivoire": "ivory coast",
  "bosnia and herzegovina": "bosnia & herzegovina",
};

export const isRef = (name) => !!name && /^[WL]\d+$/.test(name);

export const normTeam = (name) => {
  if (!name || isRef(name)) return "";
  const n = name.trim().toLowerCase();
  return TEAM_ALIASES[n] || n;
};

export const META_BY_NORM = new Map(
  Object.entries(TEAM_META).map(([name, [iso2, code]]) => [
    normTeam(name),
    { name: name === "USA" ? "United States" : name, iso2, code },
  ])
);

/** Team object: { code (id), name, iso2 } — or a graceful fallback. */
export const teamFor = (jsonName) => {
  if (!jsonName || isRef(jsonName)) return null;
  const meta = META_BY_NORM.get(normTeam(jsonName));
  if (meta) return { id: meta.code, code: meta.code, name: meta.name, iso2: meta.iso2 };
  const code = jsonName.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase() || "TBD";
  return { id: code, code, name: jsonName, iso2: "un" };
};
