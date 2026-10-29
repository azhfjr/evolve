import { PROJECT_FIELDS } from "@/lib/connected/project-fields";
export function ProjectCSVGuide() {
  return (
    <details className="br-csv-guide">
      <summary>
        Project CSV column guide ({PROJECT_FIELDS.length} fields)
      </summary>
      <p>
        Blank cells preserve existing fields; omitted projects are retained.
        Preview every import before confirming. Documents and admin validity are
        managed in the app.
      </p>
      <div className="connected-table">
        <table>
          <thead>
            <tr>
              <th>Column</th>
              <th>Accepted values</th>
            </tr>
          </thead>
          <tbody>
            {PROJECT_FIELDS.map(([key, label, help]) => (
              <tr key={key}>
                <th scope="row">{label}</th>
                <td>{help}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
