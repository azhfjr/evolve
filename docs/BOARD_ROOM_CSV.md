# Board Room CSV field guide

Projects use stable Project IDs. Assets use unique RUPTL codes. Upload assets first when connecting codes through a project CSV. Leave Project ID blank for new projects; copy the saved UUID before later updates.

| Column              | Accepted values                                                                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Project ID          | Stable project UUID from project details. Leave blank to create a new project.                                                                                |
| Project name        | Required for new projects; at most 160 characters.                                                                                                            |
| Primary category    | Pembangkit, Transmisi or Gardu Induk; blank preserves an existing value.                                                                                      |
| Voltage             | Text such as 150 kV or 275/150 kV.                                                                                                                            |
| Capacity            | Nonnegative number; a capacity unit is required when supplied.                                                                                                |
| Capacity unit       | MW, MVA, kms, MWh, MWp, MWac or a custom unit.                                                                                                                |
| Planned COD year    | Whole year, YYYY, from 2026 to 2040 for new or changed assignments; unchanged historical years are preserved.                                                 |
| Current stage       | 0 means Not started; 1–10 are workflow positions, not physical completion.                                                                                    |
| Start year          | Whole year, YYYY, no later than planned COD year.                                                                                                             |
| Description         | Optional project description, at most 2,000 characters.                                                                                                       |
| Location            | Project location; the editor offers the five Kalimantan provinces.                                                                                            |
| Project links       | HTTP(S) links separated by semicolons or an exported list.                                                                                                    |
| Project link labels | Labels in the same order as project links.                                                                                                                    |
| Completed           | true or false. Completed projects must be at stage 10.                                                                                                        |
| Custom fields       | JSON object mapping published stable field keys to option IDs; blank preserves existing metadata. Sync existing projects before using newly published fields. |
| Asset RUPTL codes   | Semicolon-separated codes from Assets. Assets assigned elsewhere require explicit reassignment.                                                               |

Encoded requests must fit within 4 MiB, at most 5,000 rows. Blank cells preserve existing values; omitted records remain. Asset imports offer explicit field clearing in preview. A stale preview must be regenerated. Stage updates on existing projects are opt-in; jumps, reversals and reopening require a reason. Legacy CSV mode preserves compatibility with former project codes and personal mappings. Scope and document requirements are retired from active workflows. Files and validity reviews remain in the app.
