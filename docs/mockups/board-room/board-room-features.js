/* Local preview features. This is not the shared, authenticated production app. */
(() => {
  "use strict";
  const storageKey = "evolve-board-room-preview-v3";
  const csvHeaders = [
    "Project ID",
    "Project name",
    "Category",
    "Custom categories",
    "Capacity",
    "Capacity unit",
    "Planned COD year",
    "Current stage",
    "Start year",
    "Description",
    "Location",
    "Project links",
  ];
  const initial = JSON.stringify({ projects, customCategories, stageNames });
  let storageAvailable = true;
  let importDraft = null;
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const safeUrl = (value) => {
    const url = new URL(value);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      throw Error("Links must be HTTP(S) URLs without embedded credentials.");
    return url.href;
  };
  const normalizeProject = (p) => ({
    ...p,
    description: p.description || "",
    links: p.links || [],
    capacity: p.capacity ?? null,
    unit: p.unit || "",
    cod: p.cod ?? null,
    start: p.start ?? null,
  });
  projects = projects.map(normalizeProject);
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
    if (
      saved &&
      saved.version === 3 &&
      Array.isArray(saved.projects) &&
      saved.projects.length <= 5000 &&
      saved.projects.every(
        (p) =>
          p &&
          typeof p.id === "string" &&
          typeof p.name === "string" &&
          categories.includes(p.category) &&
          Array.isArray(p.tags) &&
          Array.isArray(p.documents),
      ) &&
      Array.isArray(saved.customCategories) &&
      Array.isArray(saved.stageNames) &&
      saved.stageNames.length === 10
    ) {
      projects = saved.projects.map(normalizeProject);
      customCategories = saved.customCategories;
      stageNames = saved.stageNames;
    }
  } catch {
    storageAvailable = false;
  }

  function persist() {
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ version: 3, projects, customCategories, stageNames }),
      );
      storageAvailable = true;
    } catch {
      storageAvailable = false;
    }
  }

  const baseRender = render;
  render = function () {
    baseRender();
    persist();
    const content = document.getElementById("content");
    content.insertAdjacentHTML(
      "afterbegin",
      `<div class="local-storage-note"><span>${storageAvailable ? "Local working preview · Changes saved in this browser" : "Browser storage unavailable · Keep this tab open or export your CSV"} · Document contents are not uploaded</span>${state.admin ? '<button id="reset-local-preview">Reset local preview</button>' : ""}</div>`,
    );
    document.querySelector('.nav [data-nav="portfolio"] .num').textContent =
      projects.length;
    if (
      state.admin &&
      ["dashboard", "portfolio", "database"].includes(state.page)
    ) {
      document
        .querySelector(".heading-actions,.database-actions")
        ?.insertAdjacentHTML(
          "afterbegin",
          `<button class="button" data-edit-project="new">${icon("plus", 12)} Add project</button>`,
        );
    }
    if (state.page === "database" && state.admin) {
      document
        .getElementById("preview-import")
        ?.insertAdjacentHTML(
          "beforebegin",
          `<label class="button primary file-upload-control" style="cursor:pointer;margin-right:7px">${icon("upload", 13)} Choose CSV<input id="actual-csv" type="file" accept=".csv,text/csv" style="display:none"></label>`,
        );
      document.querySelector(".notice").innerHTML =
        "<b>Working local import.</b> Choose a CSV, preview validation and changes, then merge into this browser’s project database. Nothing is sent to a server. The example preview remains available separately.";
    }
    if (state.page === "categories" && state.admin) {
      document.querySelectorAll(".category-item").forEach((item) => {
        const button = item.querySelector("[data-custom-filter]");
        if (!button) return;
        const name = button.dataset.customFilter;
        const form = document.createElement("form");
        form.className = "category-rename";
        form.dataset.renameCategory = name;
        form.innerHTML = `<input aria-label="Rename ${esc(name)}" value="${esc(name)}" required maxlength="45"><button>Rename</button>`;
        item.append(form);
      });
    }
    const yearSelect = document.getElementById("year");
    if (yearSelect && projects.some((p) => p.cod === null))
      yearSelect.insertAdjacentHTML(
        "beforeend",
        `<option value="unknown" ${state.year === "unknown" ? "selected" : ""}>COD not set</option>`,
      );
  };

  const baseYearSummary = yearSummary;
  yearSummary = function () {
    const list = filtered(true).filter((p) => p.cod === null);
    if (!list.length) return baseYearSummary();
    const card = `<button class="year-block ${state.year === "unknown" ? "active" : ""}" data-year-block="unknown" aria-pressed="${state.year === "unknown"}"><span class="year-top">COD not set</span><strong>${list.length}</strong><small>projects</small><div class="year-breakdown">${categories.map((c) => `<span class="year-breakdown-row"><i class="cat-dot" style="--c:${colors[c]}"></i>${c}<b>${list.filter((p) => p.category === c).length}</b></span>`).join("")}</div></button>`;
    return baseYearSummary().replace(
      "</div></section>",
      `${card}</div></section>`,
    );
  };

  const baseDetails = openDetails;
  openDetails = function (id) {
    baseDetails(id);
    const p = projects.find((p) => p.id === id);
    if (state.admin)
      document
        .querySelector(".modal-body")
        .insertAdjacentHTML(
          "afterbegin",
          `<button class="button small" style="margin-bottom:13px" data-edit-project="${esc(id)}">Edit name, category, years and links</button>`,
        );
    const label = [...document.querySelectorAll(".modal h3")].find(
      (h) => h.textContent === "Project links",
    );
    if (label) {
      label.nextElementSibling?.remove();
      label.insertAdjacentHTML(
        "afterend",
        p.links.length
          ? p.links
              .map(
                (url) =>
                  `<a class="button small" style="margin:0 6px 6px 0" href="${esc(safeUrl(url))}" target="_blank" rel="noopener noreferrer">${icon("link", 12)} ${esc(new URL(url).hostname)} ${icon("arrow", 11)}</a>`,
              )
              .join("")
          : '<p class="field-hint" style="margin-bottom:12px">No project links added. Use Edit to add references.</p>',
      );
    }
  };

  function modal(title, body) {
    focusBeforeModal = document.activeElement;
    document.getElementById("modal-root").innerHTML =
      `<div class="modal-backdrop" id="backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-head"><div><h2 id="modal-title">${esc(title)}</h2><p class="subtitle">Local preview · Changes apply across all Board Room views</p></div><button class="button small" id="close-modal" aria-label="Close dialog">${icon("close", 14)}</button></div><div class="modal-body">${body}</div></section></div>`;
    document.getElementById("close-modal").focus();
  }

  function projectEditor(id) {
    if (!state.admin) return;
    const p = projects.find((p) => p.id === id) || {
      id: "",
      name: "",
      category: categories[0],
      capacity: null,
      unit: "MW",
      start: null,
      cod: null,
      description: "",
      location: "",
      links: [],
      tags: [],
    };
    modal(
      id === "new" ? "Add project" : `Edit ${p.name}`,
      `<form id="full-project-form" class="edit-form" data-existing="${esc(id)}"><div class="settings-grid"><label class="field">Project ID<input name="id" value="${esc(p.id)}" required maxlength="80" pattern="[A-Za-z0-9][A-Za-z0-9._-]*" ${id !== "new" ? "readonly" : ""}></label><label class="field">Project name<input name="name" value="${esc(p.name)}" required maxlength="160"></label><label class="field">Primary category<select name="category">${categories.map((c) => `<option ${p.category === c ? "selected" : ""}>${c}</option>`).join("")}</select></label><label class="field">Location<input name="location" value="${esc(p.location)}" maxlength="160"></label><label class="field">Start year<input name="start" type="number" min="1900" max="2200" step="1" value="${p.start ?? ""}" placeholder="YYYY"></label><label class="field">Planned COD year<input name="cod" type="number" min="1900" max="2200" step="1" value="${p.cod ?? ""}" placeholder="YYYY"></label><label class="field">Capacity<input name="capacity" type="number" min="0" step="any" value="${p.capacity ?? ""}"></label><label class="field">Capacity unit<input name="unit" value="${esc(p.unit)}" maxlength="30" list="capacity-units"><datalist id="capacity-units">${["MW", "MVA", "kms", "MWh", "MWp", "MWac"].map((u) => `<option value="${u}">`).join("")}</datalist><small class="field-hint">Choose a preset or enter a custom unit.</small></label><label class="field wide">Description<textarea name="description" maxlength="2000">${esc(p.description)}</textarea></label><label class="field wide">Project links<textarea name="links" placeholder="One https:// link per line">${esc(p.links.join("\n"))}</textarea></label><fieldset class="wide" style="border:0;padding:0"><legend style="font-size:11px;margin-bottom:9px">Custom categories</legend><div class="choice-list">${customCategories.map((c) => `<label class="choice-chip"><input type="checkbox" name="tags" value="${esc(c)}" ${p.tags.includes(c) ? "checked" : ""}>${esc(c)}</label>`).join("")}</div></fieldset></div><div id="editor-error" role="alert"></div><div class="settings-actions"><button class="button" type="button" id="close-modal">Cancel</button><button class="button primary">Save project</button></div></form>`,
    );
  }

  function numberOrNull(value, name, integer = false) {
    if (String(value).trim() === "") return null;
    if (!/^\d+(?:\.\d+)?$/.test(String(value).trim()))
      throw Error(`${name} must be a nonnegative number.`);
    const n = Number(value);
    if (!Number.isFinite(n) || (integer && !Number.isInteger(n)))
      throw Error(`${name} must be ${integer ? "a whole number" : "finite"}.`);
    if (integer && (n < 1900 || n > 2200))
      throw Error(`${name} must be a year from 1900 to 2200.`);
    return n;
  }

  function checkProject(p) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(p.id))
      throw Error(
        "Project ID: use 1–80 letters, digits, periods, underscores or hyphens.",
      );
    if (!p.name || p.name.length > 160)
      throw Error(
        "Project name is required and must fit within 160 characters.",
      );
    if (!categories.includes(p.category))
      throw Error("Category must be Pembangkit, Transmisi or Gardu Induk.");
    if (p.capacity !== null && !p.unit.trim())
      throw Error("A capacity value requires a capacity unit.");
    if (
      p.unit.length > 30 ||
      p.description.length > 2000 ||
      p.location.length > 160
    )
      throw Error("Unit, description or location exceeds its length limit.");
    if (p.start !== null && p.cod !== null && p.start > p.cod)
      throw Error("Start year cannot be later than planned COD year.");
    if (p.tags.some((t) => !t || t.length > 45) || p.tags.length > 30)
      throw Error(
        "Use at most 30 custom categories, each up to 45 characters.",
      );
    if (p.links.length > 20) throw Error("Use at most 20 project links.");
    p.links = p.links.map(safeUrl);
    return p;
  }

  function parseCSV(text) {
    if (text.includes("\0"))
      throw Error("CSV contains invalid null characters.");
    const rows = [];
    let row = [],
      cell = "",
      quoted = false,
      closed = false;
    const pushCell = () => {
      row.push(cell);
      cell = "";
      closed = false;
    };
    const pushRow = () => {
      pushCell();
      if (row.some((v) => v.trim())) rows.push(row);
      row = [];
      if (rows.length > 5001) throw Error("Use at most 5,000 project rows.");
    };
    text = text.replace(/^\uFEFF/, "");
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (c === '"' && text[i + 1] === '"') {
          cell += '"';
          i++;
        } else if (c === '"') {
          quoted = false;
          closed = true;
        } else cell += c;
      } else if (c === ",") pushCell();
      else if (c === "\r" || c === "\n") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        pushRow();
      } else if (c === '"' && cell === "" && !closed) quoted = true;
      else if (closed) {
        if (!/\s/.test(c))
          throw Error("Unexpected text after a quoted CSV field.");
      } else if (c === '"')
        throw Error("Invalid quote in an unquoted CSV field.");
      else cell += c;
    }
    if (quoted) throw Error("CSV contains an unclosed quoted field.");
    if (cell || row.length || closed) pushRow();
    return rows;
  }

  function buildPreview(source, updateStages) {
    const rows = parseCSV(source);
    if (rows.length < 2)
      throw Error("CSV needs a header and at least one project row.");
    const headers = rows.shift().map((h) => h.trim());
    if (
      new Set(headers).size !== headers.length ||
      headers.some((h) => !csvHeaders.includes(h))
    )
      throw Error(
        "Use unique template column names. Unrecognized columns are not imported.",
      );
    if (!headers.includes("Project ID"))
      throw Error("Project ID column is required.");
    const errors = [],
      changes = [],
      seen = new Set();
    const base = clone(projects);
    rows.forEach((cells, index) => {
      try {
        if (cells.length !== headers.length)
          throw Error("The number of values does not match the header.");
        const values = Object.fromEntries(
          headers.map((h, i) => [h, cells[i].trim()]),
        );
        const id = values["Project ID"];
        if (seen.has(id)) throw Error(`Duplicate Project ID ${id}.`);
        seen.add(id);
        const existing = base.find((p) => p.id === id);
        const next = existing
          ? clone(existing)
          : {
              id,
              name: "",
              category: "",
              capacity: null,
              unit: "",
              start: null,
              cod: null,
              description: "",
              location: "",
              links: [],
              tags: [],
              stage: 0,
              valid: false,
              complete: false,
              files: 0,
              documents: [],
            };
        const fields = {
          "Project name": "name",
          Category: "category",
          "Capacity unit": "unit",
          Description: "description",
          Location: "location",
        };
        for (const [header, field] of Object.entries(fields))
          if (values[header]) next[field] = values[header];
        for (const [header, field] of [
          ["Capacity", "capacity"],
          ["Start year", "start"],
          ["Planned COD year", "cod"],
        ])
          if (values[header])
            next[field] = numberOrNull(
              values[header],
              header,
              field !== "capacity",
            );
        if (values["Custom categories"])
          next.tags = [
            ...new Set(
              values["Custom categories"]
                .split(";")
                .map((t) => t.trim())
                .filter(Boolean)
                .map(
                  (t) =>
                    customCategories.find(
                      (c) => c.toLowerCase() === t.toLowerCase(),
                    ) || t,
                ),
            ),
          ];
        if (values["Project links"])
          next.links = values["Project links"]
            .split(";")
            .map((v) => v.trim())
            .filter(Boolean);
        if (values["Current stage"]) {
          const stage = Number(values["Current stage"]);
          if (
            !/^\d+$/.test(values["Current stage"]) ||
            !Number.isInteger(stage) ||
            stage < 1 ||
            stage > 10
          )
            throw Error("Current stage must be an integer from 1 to 10.");
          if (!existing || updateStages) {
            if (next.stage !== stage) next.complete = false;
            next.stage = stage;
          }
        }
        checkProject(next);
        const kind = !existing
          ? "New"
          : JSON.stringify(next) === JSON.stringify(existing)
            ? "Unchanged"
            : "Updated";
        changes.push({ kind, project: next });
      } catch (error) {
        errors.push(`Row ${index + 2}: ${error.message}`);
      }
    });
    return {
      source,
      updateStages,
      changes,
      errors,
      snapshot: JSON.stringify(projects),
    };
  }

  function showImport(source, updateStages = false) {
    if (!state.admin) return;
    try {
      importDraft = buildPreview(source, updateStages);
    } catch (error) {
      modal(
        "CSV needs attention",
        `<div class="error-list" role="alert">${esc(error.message)}</div><p class="field-hint">Correct the file and choose it again. No project data has changed.</p>`,
      );
      return;
    }
    const { changes, errors } = importDraft;
    const newCategories = [
      ...new Set(
        changes
          .flatMap((c) => c.project.tags)
          .filter((t) => !customCategories.includes(t)),
      ),
    ];
    modal(
      "Review CSV merge",
      `<div class="notice">Local import only. Matching Project IDs are updated. Missing projects stay in the database. Blank cells preserve existing values. Existing stages ${updateStages ? "will be updated when supplied" : "are preserved"}.</div><div class="import-summary">${["New", "Updated", "Unchanged"].map((k) => `<div><strong>${changes.filter((c) => c.kind === k).length}</strong><small>${k}</small></div>`).join("")}<div><strong>${errors.length}</strong><small>Invalid rows</small></div></div>${errors.length ? `<div class="error-list" role="alert">${errors.slice(0, 30).map(esc).join("<br>")}${errors.length > 30 ? "<br>More errors omitted; fix the file and retry." : ""}</div>` : ""}${newCategories.length ? `<div class="notice"><b>New custom categories to create and assign:</b> ${newCategories.map(esc).join(", ")}</div>` : ""}<label class="import-option"><input id="import-update-stages" type="checkbox" ${updateStages ? "checked" : ""}>Update existing project stages from this CSV</label><div class="import-table"><table><thead><tr><th>Action</th><th>Project ID</th><th>Project</th><th>Category</th><th>COD year</th></tr></thead><tbody>${changes
        .slice(0, 100)
        .map(
          (c) =>
            `<tr><td>${c.kind}</td><td>${esc(c.project.id)}</td><td>${esc(c.project.name)}</td><td>${esc(c.project.category)}</td><td>${c.project.cod ?? "Not set"}</td></tr>`,
        )
        .join(
          "",
        )}</tbody></table></div><p class="field-hint" style="margin:12px 0">Showing up to 100 preview rows. Uploaded documents and admin review status are preserved; CSV cannot mark a project valid.</p><div style="display:flex;gap:8px;margin-top:15px"><button class="button primary" id="commit-csv" ${errors.length ? "disabled" : ""}>Confirm local import</button><button class="button" id="close-modal">Cancel</button></div>`,
    );
  }

  exportCSV = function () {
    const safeCell = (value) =>
      /^[=+\-@\t\r]/.test(String(value)) ? "'" + value : value;
    const rows = [
      csvHeaders,
      ...filtered().map((p) => [
        p.id,
        p.name,
        p.category,
        p.tags.join("; "),
        p.capacity ?? "",
        p.unit,
        p.cod ?? "",
        p.stage || "",
        p.start ?? "",
        p.description,
        p.location,
        p.links.join("; "),
      ]),
    ];
    const text = rows
      .map((row) =>
        row
          .map((v) => '"' + String(safeCell(v)).replaceAll('"', '""') + '"')
          .join(","),
      )
      .join("\r\n");
    const url = URL.createObjectURL(
      new Blob([text], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "board-room-projects.csv";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify("Filtered projects exported with the upload-template columns");
  };

  document.addEventListener(
    "click",
    (event) => {
      const button = event.target.closest("button");
      if (!button) return;
      if (button.dataset.editProject) {
        event.stopImmediatePropagation();
        projectEditor(button.dataset.editProject);
      } else if (button.id === "commit-csv") {
        event.stopImmediatePropagation();
        if (!state.admin || !importDraft || importDraft.errors.length) return;
        if (importDraft.snapshot !== JSON.stringify(projects)) {
          notify(
            "Projects changed since preview. Choose the CSV again to refresh.",
          );
          return;
        }
        const next = clone(projects);
        for (const change of importDraft.changes) {
          const i = next.findIndex((p) => p.id === change.project.id);
          if (i < 0) next.push(change.project);
          else next[i] = change.project;
        }
        if (next.length > 5000) {
          notify("This local preview supports at most 5,000 projects.");
          return;
        }
        const old = {
          projects: clone(projects),
          categories: [...customCategories],
        };
        projects = next;
        customCategories = [
          ...new Set([...customCategories, ...projects.flatMap((p) => p.tags)]),
        ];
        importDraft = null;
        closeModal();
        render();
        notify("CSV merged into this browser’s project database", () => {
          projects = old.projects;
          customCategories = old.categories;
          render();
          notify("Import undone");
        });
      } else if (button.id === "reset-local-preview") {
        event.stopImmediatePropagation();
        if (!state.admin) return;
        modal(
          "Reset local preview?",
          '<p class="field-hint">This removes this browser’s project edits, imports, stage names and custom categories, then restores the original sample portfolio. It does not affect any server or other browser.</p><div style="display:flex;gap:8px;margin-top:20px"><button class="button primary" id="confirm-local-reset">Reset local data</button><button class="button" id="close-modal">Cancel</button></div>',
        );
      } else if (button.id === "confirm-local-reset") {
        event.stopImmediatePropagation();
        if (!state.admin) return;
        const original = JSON.parse(initial);
        projects = original.projects.map(normalizeProject);
        customCategories = original.customCategories;
        stageNames = original.stageNames;
        Object.assign(state, {
          search: "",
          category: "",
          custom: "",
          valid: "",
          stage: null,
          year: "",
          expanded: null,
          page: "dashboard",
          view: "timeline",
        });
        closeModal();
        render();
        notify("Original sample portfolio restored");
      }
    },
    true,
  );

  document.addEventListener("change", async (event) => {
    if (event.target.id === "actual-csv" && state.admin) {
      const file = event.target.files[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) {
        notify("Choose a UTF-8 CSV no larger than 5 MiB");
        return;
      }
      try {
        const text = new TextDecoder("utf-8", { fatal: true }).decode(
          await file.arrayBuffer(),
        );
        showImport(text);
      } catch (error) {
        notify(`Could not read CSV: ${error.message}`);
      }
    }
    if (event.target.id === "import-update-stages" && importDraft)
      showImport(importDraft.source, event.target.checked);
  });

  document.addEventListener(
    "submit",
    (event) => {
      if (event.target.getAttribute("id") === "full-project-form") {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!state.admin) return;
        try {
          const form = event.target,
            data = new FormData(form),
            existing = projects.find((p) => p.id === form.dataset.existing);
          const next = existing
            ? clone(existing)
            : {
                stage: 0,
                valid: false,
                complete: false,
                files: 0,
                documents: [],
              };
          Object.assign(next, {
            id: String(data.get("id")).trim(),
            name: String(data.get("name")).trim(),
            category: data.get("category"),
            location: String(data.get("location")).trim(),
            description: String(data.get("description")).trim(),
            capacity: numberOrNull(data.get("capacity"), "Capacity"),
            unit: String(data.get("unit")).trim(),
            start: numberOrNull(data.get("start"), "Start year", true),
            cod: numberOrNull(data.get("cod"), "Planned COD year", true),
            tags: data.getAll("tags"),
            links: String(data.get("links"))
              .split(/\r?\n/)
              .map((v) => v.trim())
              .filter(Boolean),
          });
          checkProject(next);
          if (!existing && projects.some((p) => p.id === next.id))
            throw Error("That Project ID already exists.");
          if (!existing && projects.length >= 5000)
            throw Error("This local preview supports at most 5,000 projects.");
          if (existing) projects[projects.indexOf(existing)] = next;
          else projects.push(next);
          render();
          openDetails(next.id);
          notify(
            existing
              ? "Project updated across Board Room"
              : "Project added to Board Room",
          );
        } catch (error) {
          document.getElementById("editor-error").innerHTML =
            `<div class="error-list">${esc(error.message)}</div>`;
        }
      }
      if (event.target.dataset.renameCategory !== undefined) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!state.admin) return;
        const old = event.target.dataset.renameCategory,
          next = event.target.querySelector("input").value.trim();
        if (!next || next.length > 45) {
          notify("Use a category name of 1–45 characters");
          return;
        }
        if (
          customCategories.some(
            (c) => c !== old && c.toLowerCase() === next.toLowerCase(),
          )
        ) {
          notify("That custom category already exists");
          return;
        }
        customCategories = customCategories.map((c) => (c === old ? next : c));
        projects.forEach(
          (p) => (p.tags = p.tags.map((c) => (c === old ? next : c))),
        );
        if (state.custom === old) state.custom = next;
        render();
        notify("Category renamed; project assignments preserved");
      }
    },
    true,
  );
  render();
})();
