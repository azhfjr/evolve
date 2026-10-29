import { expect, type Locator, type Page } from "@playwright/test";

/** Shared editors may be a page or a dialog; each workflow still asserts one surface. */
export function editorSurface(page: Page) {
  return page
    .getByRole("dialog")
    .or(page.getByRole("region", { name: "Task editor", exact: true }));
}
export async function selectOption(
  control: Locator,
  choice: string | { label?: string; value?: string },
) {
  if (await control.evaluate((element) => element.tagName === "SELECT")) {
    await control.selectOption(choice);
    return;
  }
  await control.click();
  const list = control.page().getByRole("listbox");
  const value = typeof choice === "string" ? choice : choice.value;
  const label = typeof choice === "string" ? undefined : choice.label;
  const option =
    value !== undefined
      ? list.locator(`[role="option"][data-value=${JSON.stringify(value)}]`)
      : list.getByRole("option", { name: label, exact: true });
  await expect(option).toBeVisible();
  // Scrolling to a boundary can mount/unmount Radix's scroll indicators and
  // move an option after click() has measured its point. Settle scrolling and
  // pointer focus first, then let click() check the final position again.
  await option.scrollIntoViewIfNeeded();
  await option.hover();
  const selectedValue = await option.getAttribute("data-value");
  await option.click();
  await expect(list).toHaveCount(0);
  await expect(control).toHaveAttribute("data-value", selectedValue!);
}
