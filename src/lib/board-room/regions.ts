export const PROVINCES = [
  {
    code: "ID-KB",
    name: "Kalimantan Barat",
    english: "West Kalimantan",
    bps: "61",
    short: "Kalbar",
  },
  {
    code: "ID-KT",
    name: "Kalimantan Tengah",
    english: "Central Kalimantan",
    bps: "62",
    short: "Kalteng",
  },
  {
    code: "ID-KS",
    name: "Kalimantan Selatan",
    english: "South Kalimantan",
    bps: "63",
    short: "Kalsel",
  },
  {
    code: "ID-KI",
    name: "Kalimantan Timur",
    english: "East Kalimantan",
    bps: "64",
    short: "Kaltim",
  },
  {
    code: "ID-KU",
    name: "Kalimantan Utara",
    english: "North Kalimantan",
    bps: "65",
    short: "Kaltara",
  },
] as const;
export const REGION_CODES = [
  "ID-KB",
  "ID-KT",
  "ID-KS",
  "ID-KI",
  "ID-KU",
] as const;
export type ProvinceCode = (typeof REGION_CODES)[number];
export type Region = ProvinceCode | "missing" | "unrecognized";
export function normalizedLocation(value: string) {
  return value.toLowerCase().replace(/[ \t\n\r\f\v._-]+/g, "");
}
export function provinceAliases(p: (typeof PROVINCES)[number]) {
  return [p.name, p.english, p.code, p.bps, p.short].map(normalizedLocation);
}
export function classifyRegion(value: string | null | undefined): Region {
  const normalized = normalizedLocation(value ?? "");
  if (!(value ?? "").replace(/[ \t\n\r\f\v]+/g, "")) return "missing";
  return (
    PROVINCES.find((p) => provinceAliases(p).includes(normalized))?.code ??
    "unrecognized"
  );
}
export const MAP_CATEGORIES = [
  "Pembangkit",
  "Transmisi",
  "Gardu Induk",
  "uncategorized",
] as const;
export type RegionCategory = {
  category: (typeof MAP_CATEGORIES)[number];
  contextCount: number;
  matchingCount: number;
};
export type RegionalAnalytics = {
  contextTotal: number;
  matchingTotal: number;
  provinces: {
    code: ProvinceCode;
    name: string;
    contextCount: number;
    matchingCount: number;
    categories?: RegionCategory[];
  }[];
  missing: {
    contextCount: number;
    matchingCount: number;
    categories?: RegionCategory[];
  };
  unrecognized: {
    contextCount: number;
    matchingCount: number;
    categories?: RegionCategory[];
  };
};
