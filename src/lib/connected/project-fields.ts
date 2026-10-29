export const PROJECT_FIELDS = [
  [
    "externalId",
    "Project ID",
    "Stable project UUID from project details. Leave blank to create a new project.",
  ],
  [
    "name",
    "Project name",
    "Required for new projects; at most 160 characters.",
  ],
  [
    "category",
    "Primary category",
    "Pembangkit, Transmisi or Gardu Induk; blank preserves an existing value.",
  ],
  ["voltage", "Voltage", "Text such as 150 kV or 275/150 kV."],
  [
    "capacity",
    "Capacity",
    "Nonnegative number; a capacity unit is required when supplied.",
  ],
  ["unit", "Capacity unit", "MW, MVA, kms, MWh, MWp, MWac or a custom unit."],
  [
    "codYear",
    "Planned COD year",
    "Whole year, YYYY, from 2026 to 2040 for new or changed assignments; unchanged historical years are preserved.",
  ],
  [
    "stage",
    "Current stage",
    "0 means Not started; 1–10 are workflow positions, not physical completion.",
  ],
  [
    "startYear",
    "Start year",
    "Whole year, YYYY, no later than planned COD year.",
  ],
  [
    "description",
    "Description",
    "Optional project description, at most 2,000 characters.",
  ],
  [
    "location",
    "Location",
    "Project location; the editor offers the five Kalimantan provinces.",
  ],
  [
    "links",
    "Project links",
    "HTTP(S) links separated by semicolons or an exported list.",
  ],
  [
    "linkLabels",
    "Project link labels",
    "Labels in the same order as project links.",
  ],
  [
    "completed",
    "Completed",
    "true or false. Completed projects must be at stage 10.",
  ],
  [
    "customValues",
    "Custom fields",
    "JSON object mapping published stable field keys to option IDs; blank preserves existing metadata. Sync existing projects before using newly published fields.",
  ],
  [
    "assetCodes",
    "Asset RUPTL codes",
    "Semicolon-separated codes from Assets. Assets assigned elsewhere require explicit reassignment.",
  ],
] as const;
export const PROJECT_HEADERS = PROJECT_FIELDS.map(([, label]) => label);
