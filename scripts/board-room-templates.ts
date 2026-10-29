import { writeFile } from "node:fs/promises";
import {
  PROJECT_FIELDS,
  PROJECT_HEADERS,
} from "../src/lib/connected/project-fields";
import { ASSET_HEADERS } from "../src/lib/assets/model";
import { CSV_COLUMNS } from "../src/lib/board-room/csv";
async function main() {
  await writeFile(
    "public/board-room/project-upload-template.csv",
    PROJECT_HEADERS.join(",") + "\n",
  );
  await writeFile(
    "public/board-room/project-upload-template-legacy.csv",
    Object.values(CSV_COLUMNS).join(",") + "\n",
  );
  await writeFile(
    "public/board-room/asset-upload-template.csv",
    ASSET_HEADERS.join(",") + "\n",
  );
  await writeFile(
    "public/board-room/project-upload-example.csv",
    PROJECT_HEADERS.join(",") +
      "\n,Example solar project,Pembangkit,150 kV,50,MWp,2028,0,2026,Synthetic example,Kalimantan Barat,,,false,,\n",
  );
  await writeFile(
    "public/board-room/asset-upload-example.csv",
    ASSET_HEADERS.join(",") +
      "\nKAL-EXAMPLE-001,Example power plant,Pembangkit,100,MW,Kalimantan Timur,150 kV,\nKAL-EXAMPLE-002,Example transmission line,Transmisi,75,kms,Kalimantan Selatan,150 kV,\n",
  );
  await writeFile(
    "docs/BOARD_ROOM_CSV.md",
    "# Board Room CSV field guide\n\nProjects use stable Project IDs. Assets use unique RUPTL codes. Upload assets first when connecting codes through a project CSV. Leave Project ID blank for new projects; copy the saved UUID before later updates.\n\n| Column | Accepted values |\n| --- | --- |\n" +
      PROJECT_FIELDS.map(
        ([, label, help]) => "| " + label + " | " + help + " |",
      ).join("\n") +
      "\n\nEncoded requests must fit within 4 MiB, at most 5,000 rows. Blank cells preserve existing values; omitted records remain. Asset imports offer explicit field clearing in preview. A stale preview must be regenerated. Stage updates on existing projects are opt-in; jumps, reversals and reopening require a reason. Legacy CSV mode preserves compatibility with former project codes and personal mappings. Scope and document requirements are retired from active workflows. Files and validity reviews remain in the app.\n",
  );
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
