import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Locator, type Page } from "@playwright/test";

async function camera(viewport: Locator) {
  return viewport.evaluate((element) => ({
    x: Number((element as HTMLElement).dataset.cameraX),
    y: Number((element as HTMLElement).dataset.cameraY),
    zoom: Number((element as HTMLElement).dataset.cameraZoom),
  }));
}

async function expectFitted(viewport: Locator) {
  await expect
    .poll(() =>
      viewport.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        const nodes = [...element.querySelectorAll(".connection-node-shell")];
        return (
          nodes.length > 0 &&
          nodes.every((node) => {
            const rect = node.getBoundingClientRect();
            return (
              rect.left >= bounds.left &&
              rect.right <= bounds.right &&
              rect.top >= bounds.top &&
              rect.bottom <= bounds.bottom
            );
          })
        );
      }),
    )
    .toBe(true);
}

async function openMap(page: Page) {
  await page.goto("/demo?section=connection&label=design");
  await expect(page.locator(".connection-node").first()).toBeVisible();
  await expect(page.locator(".connection-viewport")).toHaveAttribute(
    "data-camera-zoom",
    /[1-9]/,
  );
  await expectFitted(page.locator(".connection-viewport"));
}

test("selected label connects every project, and each project connects only its own tasks", async ({
  page,
}) => {
  await openMap(page);
  await expect(
    page.locator('.connection-node-shell[data-kind="label"]'),
  ).toHaveCount(1);
  await expect(page.locator('[data-anchor="label:design"]')).toContainText(
    "#design",
  );
  await expect(page.locator(".connection-map-tools")).toContainText("#design");
  const projects = page.locator('.connection-node-shell[data-kind="project"]');
  const tasks = page.locator('.connection-node-shell[data-kind="task"]');
  expect(await projects.count()).toBeGreaterThan(1);
  expect(await tasks.count()).toBeGreaterThan(2);
  await expect(page.locator(".connection-lines path")).toHaveCount(
    (await tasks.count()) + (await projects.count()),
  );
  const graph = await page
    .locator(".connection-tree-scene")
    .evaluate((element) => ({
      anchors: [
        ...element.querySelectorAll<HTMLElement>(".connection-node-shell"),
      ].map((node) => node.dataset.anchor),
      edges: [
        ...element.querySelectorAll<SVGPathElement>(".connection-lines path"),
      ].map((path) => ({
        source: path.dataset.source,
        target: path.dataset.target,
      })),
    }));
  for (const edge of graph.edges) {
    if (edge.source === "label:design")
      expect(edge.target).toMatch(/^project:/);
    else {
      expect(edge.source).toMatch(/^project:/);
      expect(edge.target).toMatch(/^task:/);
    }
    expect(graph.anchors).toContain(edge.source);
    expect(graph.anchors).toContain(edge.target);
  }
  expect(new Set(graph.edges.map((edge) => edge.target)).size).toBe(
    (await tasks.count()) + (await projects.count()),
  );
  // Known demo fixtures ensure edges cannot silently connect across project clusters.
  for (const [title, projectId] of [
    ["Refine the homepage experience", "00000000-0000-4000-8000-000000000001"],
    ["Design social launch assets", "00000000-0000-4000-8000-000000000003"],
  ]) {
    const task = page.locator(".connection-node-shell").filter({
      has: page.getByRole("button", {
        name: `Open task: ${title}`,
        exact: true,
      }),
    });
    const anchor = await task.getAttribute("data-anchor");
    await expect(
      page.locator(`.connection-lines path[data-target="${anchor}"]`),
    ).toHaveAttribute("data-source", `project:${projectId}`);
  }
  await expectFitted(page.locator(".connection-viewport"));
});

test("native fullscreen preserves zoom and returns keyboard focus on exit", async ({
  page,
}) => {
  await openMap(page);
  const initialZoom = (await camera(page.locator(".connection-viewport"))).zoom;
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect
    .poll(async () => (await camera(page.locator(".connection-viewport"))).zoom)
    .toBeCloseTo(initialZoom * 1.2, 5);
  const zoomLabel = await page
    .getByLabel("Map zoom", { exact: true })
    .textContent();
  await page
    .getByRole("button", { name: "Enter fullscreen", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Connection fullscreen",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => Boolean(document.fullscreenElement)))
    .toBe(true);
  await expect(dialog.getByLabel("Map zoom", { exact: true })).toHaveText(
    zoomLabel!,
  );
  expect(
    (
      await new AxeBuilder({ page })
        .include(".connection-immersive")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await dialog
    .getByRole("button", { name: "Exit fullscreen", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => Boolean(document.fullscreenElement)))
    .toBe(false);
  await expect(
    page.getByRole("button", { name: "Enter fullscreen", exact: true }),
  ).toBeFocused();
  await expect(page.getByLabel("Map zoom", { exact: true })).toHaveText(
    zoomLabel!,
  );
});

test("fullscreen fallback fills a phone viewport and Escape restores the map", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 740 });
  await page.addInitScript(() => {
    Element.prototype.requestFullscreen = async () => {
      throw new DOMException("Unavailable", "NotAllowedError");
    };
  });
  await openMap(page);
  await page
    .getByRole("button", { name: "Enter fullscreen", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Connection fullscreen",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  const bounds = await dialog.boundingBox();
  expect(bounds!.x).toBe(0);
  expect(bounds!.y).toBe(0);
  expect(bounds!.width).toBe(390);
  expect(bounds!.height).toBe(740);
  await expect(
    dialog.getByRole("button", { name: "Exit fullscreen", exact: true }),
  ).toBeVisible();
  const initialZoom = (await camera(dialog.locator(".connection-viewport")))
    .zoom;
  await dialog.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect
    .poll(
      async () => (await camera(dialog.locator(".connection-viewport"))).zoom,
    )
    .toBeCloseTo(initialZoom * 1.2, 5);
  const zoomLabel = await dialog
    .getByLabel("Map zoom", { exact: true })
    .textContent();
  expect(
    (
      await new AxeBuilder({ page })
        .include(".connection-immersive")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Enter fullscreen", exact: true }),
  ).toBeFocused();
  await expect(page.getByLabel("Map zoom", { exact: true })).toHaveText(
    zoomLabel!,
  );
});

test("immersive map remeasures after viewport resize and retains working inline controls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 740 });
  // Native OS fullscreen windows cannot be resized with Browser.setWindowBounds.
  // Phone rotation/resize uses the viewport fallback; native entry/exit is covered separately.
  await page.addInitScript(() => {
    Element.prototype.requestFullscreen = async () => {
      throw new DOMException("Unavailable", "NotAllowedError");
    };
  });
  await openMap(page);
  const viewport = page.locator(".connection-viewport");
  await page
    .getByRole("button", { name: "Enter fullscreen", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Connection fullscreen",
    exact: true,
  });
  await expect(dialog.locator(".connection-lines path")).toHaveCount(
    (await dialog.locator('.connection-node-shell[data-kind="task"]').count()) +
      (await dialog
        .locator('.connection-node-shell[data-kind="project"]')
        .count()),
  );
  await page.getByRole("button", { name: "Fit map", exact: true }).click();
  await expectFitted(viewport);
  await page.setViewportSize({ width: 500, height: 740 });
  await page.getByRole("button", { name: "Fit map", exact: true }).click();
  await expectFitted(viewport);
  const fitted = await camera(viewport);
  await viewport.focus();
  await page.keyboard.press("End");
  await expect.poll(async () => (await camera(viewport)).y).not.toBe(fitted.y);
  const panned = await camera(viewport);
  const worldCenter = () =>
    viewport.evaluate((element) => {
      const view = element as HTMLElement;
      const zoom = Number(view.dataset.cameraZoom);
      return {
        x: (view.clientWidth / 2 - Number(view.dataset.cameraX)) / zoom,
        y: (view.clientHeight / 2 - Number(view.dataset.cameraY)) / zoom,
      };
    });
  const immersiveCenter = await worldCenter();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect
    .poll(async () => (await camera(viewport)).zoom)
    .toBe(panned.zoom);
  await expect
    .poll(async () => (await worldCenter()).x)
    .toBeCloseTo(immersiveCenter.x, 5);
  await expect
    .poll(async () => (await worldCenter()).y)
    .toBeCloseTo(immersiveCenter.y, 5);
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect
    .poll(async () => (await camera(viewport)).zoom)
    .toBeCloseTo(panned.zoom * 1.2, 5);
  await page.getByRole("button", { name: "Fit map", exact: true }).click();
  await expectFitted(viewport);
  const inlineFit = await camera(viewport);
  await viewport.focus();
  await page.keyboard.press("PageDown");
  await expect
    .poll(async () => (await camera(viewport)).y)
    .not.toBe(inlineFit.y);
  await page.keyboard.press("0");
  await expect.poll(() => camera(viewport)).toEqual(inlineFit);
});

for (const action of ["task", "project", "edit"] as const) {
  test(`opening ${action} exits native fullscreen before its destination opens`, async ({
    page,
  }) => {
    await openMap(page);
    await page
      .getByRole("button", { name: "Enter fullscreen", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Connection fullscreen",
      exact: true,
    });
    await expect
      .poll(() => page.evaluate(() => Boolean(document.fullscreenElement)))
      .toBe(true);
    if (action === "edit") {
      await dialog
        .getByRole("button", { name: /^Edit labels for/ })
        .first()
        .click();
      await expect(
        page.getByRole("dialog", {
          name: "Edit connection labels",
          exact: true,
        }),
      ).toBeVisible();
    } else {
      await dialog
        .getByRole("button", { name: new RegExp(`^Open ${action}:`) })
        .first()
        .click();
      if (action === "task")
        await expect(
          page.getByRole("region", { name: "Task editor", exact: true }),
        ).toBeVisible();
      else
        await expect(
          page.getByRole("button", { name: "Edit project", exact: true }),
        ).toBeVisible();
    }
    await expect(dialog).toHaveCount(0);
    await expect
      .poll(() => page.evaluate(() => Boolean(document.fullscreenElement)))
      .toBe(false);
    if (action === "edit") {
      const labelsDialog = page.getByRole("dialog", {
        name: "Edit connection labels",
        exact: true,
      });
      await labelsDialog.getByLabel("Project labels", { exact: true }).focus();
      const suggestions = labelsDialog.getByRole("group", {
        name: "Existing connection labels",
        exact: true,
      });
      await expect(suggestions).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(suggestions).toHaveCount(0);
      await expect(labelsDialog).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(
        page.getByRole("dialog", {
          name: "Edit connection labels",
          exact: true,
        }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Enter fullscreen", exact: true }),
      ).toBeFocused();
    }
  });
}

test("browser fullscreen exit closes the immersive modal and restores focus", async ({
  page,
}) => {
  await openMap(page);
  await page
    .getByRole("button", { name: "Enter fullscreen", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => Boolean(document.fullscreenElement)))
    .toBe(true);
  await page.evaluate(() => document.exitFullscreen());
  await expect(
    page.getByRole("dialog", { name: "Connection fullscreen", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Enter fullscreen", exact: true }),
  ).toBeFocused();
});

test("a delayed fullscreen request cannot leave fullscreen active after closing", async ({
  page,
}) => {
  await page.addInitScript(() => {
    let current: Element | null = null;
    Object.defineProperty(document, "fullscreenElement", {
      get: () => current,
    });
    Element.prototype.requestFullscreen = () => {
      return new Promise<void>((resolve) => {
        Object.assign(window, {
          completeFullscreenRequest: () => {
            current = document.documentElement;
            document.dispatchEvent(new Event("fullscreenchange"));
            resolve();
          },
        });
      });
    };
    document.exitFullscreen = async () => {
      current = null;
      document.dispatchEvent(new Event("fullscreenchange"));
    };
  });
  await openMap(page);
  await page
    .getByRole("button", { name: "Enter fullscreen", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "Connection fullscreen", exact: true }),
  ).toHaveCount(0);
  await page.evaluate(() =>
    (
      window as unknown as { completeFullscreenRequest: () => void }
    ).completeFullscreenRequest(),
  );
  await expect
    .poll(() => page.evaluate(() => Boolean(document.fullscreenElement)))
    .toBe(false);
  await expect(
    page.getByRole("button", { name: "Enter fullscreen", exact: true }),
  ).toBeFocused();
});

test("fullscreen supports background dragging and one-finger touch panning", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 740 });
  await page.addInitScript(() => {
    Element.prototype.requestFullscreen = async () => {
      throw new DOMException("Unavailable", "NotAllowedError");
    };
  });
  await openMap(page);
  await page
    .getByRole("button", { name: "Enter fullscreen", exact: true })
    .click();
  const viewport = page.locator(".connection-viewport");
  const bounds = (await viewport.boundingBox())!;
  const before = await camera(viewport);
  await page.mouse.move(bounds.x + 8, bounds.y + 180);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 8, bounds.y + 60, { steps: 6 });
  await page.mouse.up();
  await expect
    .poll(async () => (await camera(viewport)).y)
    .toBeCloseTo(before.y - 120, 1);
  await expect(viewport).not.toHaveAttribute("data-dragging", "true");
  await viewport.focus();
  await page.keyboard.press("Home");
  // Home publishes the fitted camera on the next animation frame. Wait for
  // visible geometry before capturing the baseline for touch-only panning.
  await expectFitted(viewport);
  const fitted = await camera(viewport);
  const session = await context.newCDPSession(page);
  await session.send("Emulation.setTouchEmulationEnabled", {
    enabled: true,
    maxTouchPoints: 2,
  });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: bounds.x + 8, y: bounds.y + 200 }],
  });
  for (const offset of [170, 140, 110, 80]) {
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: bounds.x + 8, y: bounds.y + offset }],
    });
    await page.evaluate(() => new Promise(requestAnimationFrame));
  }
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect
    .poll(async () => (await camera(viewport)).y)
    .toBeLessThan(fitted.y - 30);
  expect((await camera(viewport)).zoom).toBeCloseTo(fitted.zoom, 5);
  await session.detach();
});

test("node dragging updates its edges without opening it, and Fit map restores the layout", async ({
  page,
}) => {
  await openMap(page);
  const viewport = page.locator(".connection-viewport");
  await page.getByRole("button", { name: "Fit map", exact: true }).click();
  const fitted = await camera(viewport);
  const node = page
    .locator('.connection-node-shell[data-kind="project"]')
    .first();
  const anchor = await node.getAttribute("data-anchor");
  const position = await node.evaluate((element) => ({
    left: (element as HTMLElement).style.left,
    top: (element as HTMLElement).style.top,
  }));
  const edge = page
    .locator(`.connection-lines path[data-source="${anchor}"]`)
    .first();
  const path = await edge.getAttribute("d");
  const bounds = (await node.locator(".connection-node").boundingBox())!;
  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    bounds.x + bounds.width / 2 + 70,
    bounds.y + bounds.height / 2 + 40,
    { steps: 8 },
  );
  await page.mouse.up();
  await expect
    .poll(() =>
      node.evaluate((element) => ({
        left: (element as HTMLElement).style.left,
        top: (element as HTMLElement).style.top,
      })),
    )
    .not.toEqual(position);
  const dragged = await node.evaluate((element) => ({
    left: parseFloat((element as HTMLElement).style.left),
    top: parseFloat((element as HTMLElement).style.top),
  }));
  expect(dragged.left - parseFloat(position.left)).toBeCloseTo(
    70 / fitted.zoom,
    0,
  );
  expect(dragged.top - parseFloat(position.top)).toBeCloseTo(
    40 / fitted.zoom,
    0,
  );
  await expect(edge).not.toHaveAttribute("d", path!);
  await expect(page.locator("main h1")).toHaveText("Connection");
  await expect(
    page.getByRole("region", { name: "Task editor", exact: true }),
  ).toHaveCount(0);
  expect(await camera(viewport)).toEqual(fitted);
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await viewport.focus();
  await page.keyboard.press("ArrowRight");
  await page.getByRole("button", { name: "Fit map", exact: true }).click();
  await expect
    .poll(() =>
      node.evaluate((element) => ({
        left: (element as HTMLElement).style.left,
        top: (element as HTMLElement).style.top,
      })),
    )
    .toEqual(position);
  await expect(edge).toHaveAttribute("d", path!);
  await expect.poll(() => camera(viewport)).toEqual(fitted);
  await expectFitted(viewport);
});

test("wheel zoom keeps the world point under the pointer stationary", async ({
  page,
}) => {
  await openMap(page);
  const viewport = page.locator(".connection-viewport");
  const bounds = (await viewport.boundingBox())!;
  const point = { x: bounds.width * 0.3, y: bounds.height * 0.65 };
  const before = await camera(viewport);
  await page.mouse.move(bounds.x + point.x, bounds.y + point.y);
  await page.mouse.wheel(0, -120);
  await expect
    .poll(async () => (await camera(viewport)).zoom)
    .toBeGreaterThan(before.zoom);
  const after = await camera(viewport);
  expect((point.x - after.x) / after.zoom).toBeCloseTo(
    (point.x - before.x) / before.zoom,
    0,
  );
  expect((point.y - after.y) / after.zoom).toBeCloseTo(
    (point.y - before.y) / before.zoom,
    0,
  );
  await expect(page.locator(".connection-tree-scene")).toHaveAttribute(
    "style",
    /translate\(.+px.+px\) scale\(/,
  );
});

test("two-finger touchscreen pinch zooms the graph without moving nodes or opening work", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 740 });
  await openMap(page);
  const viewport = page.locator(".connection-viewport");
  await viewport.scrollIntoViewIfNeeded();
  const bounds = (await viewport.boundingBox())!;
  const before = await camera(viewport);
  const positions = () =>
    page.locator(".connection-node-shell").evaluateAll((nodes) =>
      nodes.map((node) => ({
        left: (node as HTMLElement).style.left,
        top: (node as HTMLElement).style.top,
      })),
    );
  const initialPositions = await positions();
  const center = {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  };
  const session = await context.newCDPSession(page);
  await session.send("Emulation.setTouchEmulationEnabled", {
    enabled: true,
    maxTouchPoints: 2,
  });
  const points = (distance: number) => [
    { id: 1, x: center.x - distance, y: center.y },
    { id: 2, x: center.x + distance, y: center.y },
  ];
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: points(30),
  });
  for (const distance of [40, 50, 60, 70, 80]) {
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: points(distance),
    });
    await page.evaluate(() => new Promise(requestAnimationFrame));
  }
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect
    .poll(async () => (await camera(viewport)).zoom)
    .toBeGreaterThan(before.zoom * 1.5);
  expect(await positions()).toEqual(initialPositions);
  await expect(page.locator("main h1")).toHaveText("Connection");
  await expect(
    page.getByRole("region", { name: "Task editor", exact: true }),
  ).toHaveCount(0);
  await expect(viewport).not.toHaveAttribute("data-dragging", "true");
  await session.detach();
});

test("wide fullscreen fits separate project clusters and exposes focused node context", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openMap(page);
  await page
    .getByRole("button", { name: "Enter fullscreen", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Connection fullscreen",
    exact: true,
  });
  await dialog.getByRole("button", { name: "Fit map", exact: true }).click();
  await expectFitted(dialog.locator(".connection-viewport"));
  await expect(
    dialog.locator('.connection-node-shell[data-kind="label"]'),
  ).toHaveCount(1);
  await expect(dialog.locator(".connection-map-tools")).toContainText(
    "#design",
  );
  await expect(dialog.locator(".connection-lines path")).toHaveCount(
    (await dialog.locator('.connection-node-shell[data-kind="task"]').count()) +
      (await dialog
        .locator('.connection-node-shell[data-kind="project"]')
        .count()),
  );
  const viewport = dialog.locator(".connection-viewport");
  await viewport.focus();
  for (let i = 0; i < 3; i++) await page.keyboard.press("End");
  const task = dialog.getByRole("button", {
    name: "Open task: Refine the homepage experience",
    exact: true,
  });
  await expect
    .poll(async () => {
      const node = (await task.boundingBox())!,
        view = (await viewport.boundingBox())!;
      return node.y + node.height < view.y || node.y > view.y + view.height;
    })
    .toBe(true);
  await task.focus();
  await expect(task).toBeFocused();
  await expect
    .poll(async () => {
      const node = (await task.boundingBox())!,
        view = (await viewport.boundingBox())!;
      return (
        node.x >= view.x &&
        node.y >= view.y &&
        node.x + node.width <= view.x + view.width &&
        node.y + node.height <= view.y + view.height
      );
    })
    .toBe(true);
  await expect(dialog.locator(".connection-map-selection")).toContainText(
    "Refine the homepage experience",
  );
  const taskAnchor = await task.locator("..").getAttribute("data-anchor");
  await expect(
    dialog.locator(`.connection-lines path[data-target="${taskAnchor}"]`),
  ).toHaveAttribute("data-highlighted", "true");
  await expect(
    dialog.locator(
      '.connection-node-shell[data-anchor="project:00000000-0000-4000-8000-000000000001"]',
    ),
  ).toHaveAttribute("data-highlighted", "true");
  await expect(
    dialog.locator(
      '.connection-node-shell[data-anchor="project:00000000-0000-4000-8000-000000000003"]',
    ),
  ).toHaveAttribute("data-highlighted", "false");
});

test("dense overview keeps nodes separate from controls and a node tap restores interactive detail", async ({
  page,
}) => {
  await openMap(page);
  const viewport = page.locator(".connection-viewport");
  for (let i = 0; i < 12; i++)
    await page.getByRole("button", { name: "Zoom out", exact: true }).click();
  await expect
    .poll(async () => (await camera(viewport)).zoom)
    .toBeLessThan(0.3);
  await expect(viewport.getByRole("button")).toHaveCount(0);
  await expect(page.locator(".connection-map-hint")).toContainText("Overview");
  const node = viewport
    .locator('.connection-node-shell[data-kind="project"]')
    .first();
  const anchor = await node.getAttribute("data-anchor");
  await node.click();
  await expect
    .poll(async () => (await camera(viewport)).zoom)
    .toBeGreaterThanOrEqual(0.36);
  await expect(
    viewport.locator(`[data-anchor="${anchor}"]`).getByRole("button"),
  ).toBeVisible();
  await expect(page.locator("main h1")).toHaveText("Connection");
});

test("label root is a nonnavigating Fit action and never exposes a label editor", async ({
  page,
}) => {
  await openMap(page);
  const root = page.locator('[data-anchor="label:design"]');
  await expect(root).toHaveAttribute("data-kind", "label");
  await page
    .locator('.connection-node-shell[data-kind="project"]')
    .last()
    .getByRole("button")
    .focus();
  const projectEditor = page.locator(".connection-label-action");
  const projectContext = await projectEditor.getAttribute("aria-label");
  await root.getByRole("button").focus();
  await expect(projectEditor).toHaveAttribute("aria-label", projectContext!);
  await expect(
    root.getByRole("button", { name: "Fit map for #design", exact: true }),
  ).toBeVisible();
  await root.getByRole("button").click();
  await expectFitted(page.locator(".connection-viewport"));
  await expect(page.locator("main h1")).toHaveText("Connection");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Edit labels for #design", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.locator('.connection-lines path[data-source="label:design"]'),
  ).toHaveCount(
    await page.locator('.connection-node-shell[data-kind="project"]').count(),
  );
  await expect(
    page.locator(
      '.connection-lines path[data-source="label:design"][data-target^="task:"]',
    ),
  ).toHaveCount(0);
});
