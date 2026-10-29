/* eslint-disable @typescript-eslint/no-require-imports -- standalone CommonJS preview verification */
const { chromium, expect } = require("@playwright/test");
const path = require("node:path");

(async () => {
  const browser = await chromium.launch({
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({
    viewport: { width: 1640, height: 1180 },
    acceptDownloads: true,
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(
    process.env.BOARD_ROOM_PREVIEW_URL || "http://127.0.0.1:8768/",
  );
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator(".project-row")).toHaveCount(18);
  const aligned = await page.locator(".year-block").evaluateAll((cards) =>
    cards.every((card) => {
      const cells = [...card.querySelectorAll(".year-breakdown-row b")].map(
        (cell) => cell.getBoundingClientRect(),
      );
      return (
        cells.length === 3 &&
        cells.every(
          (cell) =>
            Math.abs(cell.right - cells[0].right) < 0.5 &&
            Math.abs(cell.height - cells[0].height) < 0.5,
        )
      );
    }),
  );
  if (!aligned) throw Error("Yearly category values are not aligned");
  await expect(
    page.locator('[data-year-category="2028:Pembangkit"] b'),
  ).toHaveText("2");
  await expect(
    page.locator('[data-year-category="2028:Transmisi"] b'),
  ).toHaveText("1");
  await expect(
    page.locator('[data-year-category="2028:Gardu Induk"] b'),
  ).toHaveText("0");

  await page.locator('.nav [data-nav="database"]').click();
  await page
    .locator("#actual-csv")
    .setInputFiles(path.join(__dirname, "project-upload-example.csv"));
  await expect(page.locator("#commit-csv")).toBeEnabled();
  await page.screenshot({
    path: path.join(__dirname, "csv-preview.png"),
    fullPage: true,
  });
  await page.locator("#commit-csv").click();
  await expect(page.locator("tbody tr")).toHaveCount(21);
  await page.reload();
  await expect(page.locator(".project-row")).toHaveCount(21);

  const chooseCSV = async (text) => {
    await page.locator('.nav [data-nav="database"]').click();
    await page.locator("#actual-csv").setInputFiles({
      name: "test-projects.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(text),
    });
  };
  await chooseCSV(
    'Project ID,Project name,Category,Capacity,Capacity unit,Planned COD year,Current stage,Custom categories\nBR-006,"Cirata, revised",Transmisi,150,MWac,2035,9,New classification\n',
  );
  await page.locator("#commit-csv").click();
  await page.locator('[data-documents="BR-006"]').first().click();
  await expect(page.locator(".modal")).toContainText("Stage 5 of 10");
  await expect(page.locator(".modal .status.valid").first()).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: "New classification", exact: true }),
  ).toBeChecked();
  await page.locator("#close-modal").click();
  await page.locator('.nav [data-nav="dashboard"]').click();
  await expect(
    page.locator('[data-year-category="2035:Transmisi"] b'),
  ).toHaveText("1");

  await chooseCSV("Project ID,Current stage\nBR-006,9\n");
  await page.locator("#import-update-stages").check();
  await page.locator("#commit-csv").click();
  await page.locator('[data-documents="BR-006"]').first().click();
  await expect(page.locator(".modal")).toContainText("Stage 9 of 10");
  await page.locator("#close-modal").click();

  await chooseCSV(
    "Project ID,Project name,Category\nLOCAL-UNKNOWN,Unscheduled project,Gardu Induk\n",
  );
  await page.locator("#commit-csv").click();
  await page.locator('.nav [data-nav="dashboard"]').click();
  await page.locator('[data-year-block="unknown"]').click();
  await expect(page.locator(".project-row")).toHaveCount(1);
  await expect(page.locator(".schedule")).toContainText("COD not set");
  await page.locator("#clear").click();

  await chooseCSV(
    "Project ID,Project name,Category\nSHOULD-NOT-IMPORT,Valid row,Pembangkit\nINVALID,Invalid row,Wrong category\n",
  );
  await expect(page.locator("#commit-csv")).toBeDisabled();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator("tbody tr")).toHaveCount(22);
  await chooseCSV(
    "Project ID,Project name,Category\nDUP,Duplicate one,Pembangkit\nDUP,Duplicate two,Transmisi\n",
  );
  await expect(page.locator("#commit-csv")).toBeDisabled();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();

  await page.locator('[data-edit-project="new"]').click();
  await page.locator('[name="id"]').fill("LOCAL-NEW");
  await page.locator('[name="name"]').fill("Locally created project");
  await page.locator('[name="start"]').fill("2028");
  await page.locator('[name="cod"]').fill("2027");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page.locator("#editor-error")).toContainText(
    "Start year cannot be later",
  );
  await page.locator('[name="cod"]').fill("2029");
  await page.locator('[name="links"]').fill("javascript:alert(1)");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page.locator("#editor-error")).toContainText("HTTP(S)");
  await page.locator('[name="links"]').fill("https://example.com/project");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page.locator(".modal h1")).toContainText(
    "Locally created project",
  );
  await page.locator("#close-modal").click();

  await page.locator('.nav [data-nav="categories"]').click();
  const rename = page.locator('[data-rename-category="New classification"]');
  await rename.locator("input").fill("Renamed classification");
  await rename.getByRole("button", { name: "Rename" }).click();
  await page.reload();
  await page.locator("#custom").selectOption("Renamed classification");
  await expect(page.locator(".project-row")).toHaveCount(1);
  await expect(page.locator(".project-row")).toContainText("Cirata, revised");
  await page.locator("#clear").click();
  await page.locator("#role").click();
  await page.locator('.nav [data-nav="database"]').click();
  await expect(page.locator("#actual-csv")).toHaveCount(0);
  await expect(page.locator('[data-edit-project="new"]')).toHaveCount(0);
  await page.locator("#role").click();
  const manyRows = Array.from(
    { length: 100 },
    (_, i) => `DENSE-${i},Dense project ${i},Pembangkit,2028`,
  ).join("\n");
  await chooseCSV(
    "Project ID,Project name,Category,Planned COD year\n" + manyRows + "\n",
  );
  await page.locator("#commit-csv").click();
  await page.locator('.nav [data-nav="dashboard"]').click();
  const countsCorrect = await page.locator(".year-block").evaluateAll((cards) =>
    cards.every((card) => {
      const counts = [...card.querySelectorAll(".year-breakdown-row b")];
      const total = Number(card.querySelector(":scope > strong").textContent);
      return (
        counts.reduce((sum, cell) => sum + Number(cell.textContent), 0) ===
          total &&
        counts.every(
          (cell) =>
            Math.abs(
              cell.getBoundingClientRect().right -
                counts[0].getBoundingClientRect().right,
            ) < 0.5,
        )
      );
    }),
  );
  if (!countsCorrect)
    throw Error(
      "Category counts must align and sum to each year total, including three-digit counts",
    );
  await page.locator("#reset-local-preview").click();
  await page.locator("#confirm-local-reset").click();
  await expect(page.locator(".project-row")).toHaveCount(18);
  await page.locator("#dismiss-toast").click();
  await page.screenshot({
    path: path.join(__dirname, "desktop.png"),
    fullPage: true,
  });
  await page.locator('[data-expand="BR-001"]').first().click();
  await page.screenshot({
    path: path.join(__dirname, "expanded.png"),
    fullPage: true,
  });
  await page.locator('.nav [data-nav="portfolio"]').click();
  await page.screenshot({
    path: path.join(__dirname, "table.png"),
    fullPage: true,
  });
  await page.locator('[data-documents="BR-006"]').first().click();
  await page.screenshot({
    path: path.join(__dirname, "project-details.png"),
    fullPage: true,
  });
  await page.locator("#close-modal").click();
  await page.locator('.nav [data-nav="database"]').click();
  await page.screenshot({
    path: path.join(__dirname, "database.png"),
    fullPage: true,
  });
  await page.locator('.nav [data-nav="categories"]').click();
  await page.screenshot({
    path: path.join(__dirname, "categories.png"),
    fullPage: true,
  });
  await page.locator('.nav [data-nav="dashboard"]').click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: path.join(__dirname, "mobile.png"),
    fullPage: true,
  });
  await page.locator('[data-expand="BR-001"]').first().click();
  await page.screenshot({
    path: path.join(__dirname, "mobile-expanded.png"),
    fullPage: true,
  });
  if (
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
  )
    throw Error("Mobile expansion overflows the page");
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Board Room navigation" })
    .locator('[data-nav="portfolio"]')
    .click();
  await page.screenshot({
    path: path.join(__dirname, "mobile-table.png"),
    fullPage: true,
  });
  if (
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
  )
    throw Error("Mobile table overflows the page");
  if (errors.length) throw Error(errors.join("\n"));
  console.log(
    "Passed: count alignment, local CSV merge, persistence, stage protection/override, review preservation, dynamic/unknown COD, atomic invalid-import rejection, project editor, safe links, category rename, member preview restrictions, reset and mobile layouts.",
  );
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
