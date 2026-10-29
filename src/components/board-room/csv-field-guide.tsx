import {
  CSV_COLUMNS,
  CSV_FIELD_HELP,
  type ColumnKey,
} from "@/lib/board-room/csv";
export function CSVFieldGuide() {
  return (
    <details className="br-csv-guide">
      <summary>Legacy CSV column guide</summary>
      <p>
        Blank cells preserve existing values. Use the blank template for your
        own list; example rows are synthetic. Files and admin document-validity
        decisions are managed in the app.
      </p>
      <div>
        <table>
          <thead>
            <tr>
              <th>Column</th>
              <th>Accepted values</th>
            </tr>
          </thead>
          <tbody>
            {(Object.entries(CSV_COLUMNS) as [ColumnKey, string][])
              .filter(([key]) => key !== "scope")
              .map(([key, label]) => (
                <tr key={key}>
                  <th scope="row">{label}</th>
                  <td>{CSV_FIELD_HELP[key]}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
