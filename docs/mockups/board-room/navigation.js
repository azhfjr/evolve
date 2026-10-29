/* Preview navigation follows Locker Room's desktop, rail and drawer sizing. */
(() => {
  const app = document.querySelector(".app");
  const sidebar = document.querySelector(".sidebar");
  const main = document.querySelector(".main");
  const menuIcon =
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>';
  const closeIcon =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg>';
  const collapseIcon =
    '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18m7-14-4 5 4 5"/></svg>';
  const brand = sidebar.querySelector(".brand");
  [...brand.childNodes]
    .filter((n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim())
    .forEach((n) => {
      const span = document.createElement("span");
      span.className = "brand-word";
      span.textContent = n.textContent;
      n.replaceWith(span);
    });
  brand.querySelector("span:last-child").classList.add("brand-word");
  const navButtons = [...sidebar.querySelectorAll("[data-nav]")];
  navButtons.forEach((b) => {
    const label = [...b.childNodes].find(
      (n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim(),
    );
    b.setAttribute("aria-label", label.textContent.trim());
    b.title = label.textContent.trim();
    const span = document.createElement("span");
    span.className = "nav-label";
    span.textContent = label.textContent;
    label.replaceWith(span);
  });
  const collapse = document.createElement("button");
  collapse.className = "navigation-toggle navigation-collapse";
  collapse.innerHTML = collapseIcon;
  collapse.setAttribute("aria-label", "Collapse navigation");
  collapse.setAttribute("aria-expanded", "true");
  sidebar.firstElementChild.append(collapse);
  collapse.onclick = () => {
    const collapsed = app.classList.toggle("navigation-collapsed");
    collapse.setAttribute("aria-expanded", String(!collapsed));
    collapse.setAttribute(
      "aria-label",
      collapsed ? "Expand navigation" : "Collapse navigation",
    );
  };
  const dialog = document.createElement("dialog");
  dialog.className = "navigation-drawer";
  dialog.setAttribute("aria-label", "Board Room navigation");
  document.body.append(dialog);
  const close = document.createElement("button");
  close.className = "navigation-toggle navigation-close";
  close.innerHTML = closeIcon;
  close.setAttribute("aria-label", "Close navigation");
  sidebar.firstElementChild.append(close);
  close.onclick = () => dialog.close();
  const rail = document.createElement("div");
  rail.className = "tablet-navigation";
  rail.innerHTML = `<button class="navigation-toggle" aria-label="Open navigation">${menuIcon}</button><nav aria-label="Board Room shortcuts">${navButtons.map((b) => `<button data-nav="${b.dataset.nav}" aria-label="${b.getAttribute("aria-label")}" title="${b.title}">${b.querySelector("[data-icon]").innerHTML}</button>`).join("")}</nav>`;
  app.prepend(rail);
  const mobile = document.createElement("div");
  mobile.className = "mobile-navigation";
  mobile.innerHTML = `<button class="navigation-toggle" aria-label="Open navigation">${menuIcon}</button><div class="brand">${brand.innerHTML}</div><span>Board Room</span>`;
  main.prepend(mobile);
  function open() {
    dialog.append(sidebar);
    dialog.showModal();
    close.focus();
  }
  rail.firstElementChild.onclick = open;
  mobile.firstElementChild.onclick = open;
  dialog.addEventListener("close", () => app.prepend(sidebar));
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) dialog.close();
  });
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-nav]") && dialog.open) dialog.close();
  });
  const sync = () =>
    rail.querySelectorAll("[data-nav]").forEach((b) => {
      const active =
        b.dataset.nav ===
        document.querySelector(".nav button.active")?.dataset.nav;
      b.classList.toggle("active", active);
      if (active) b.setAttribute("aria-current", "page");
      else b.removeAttribute("aria-current");
    });
  new MutationObserver(sync).observe(sidebar.querySelector("nav"), {
    subtree: true,
    attributes: true,
    attributeFilter: ["class"],
  });
  sync();
  window.matchMedia("(max-width:1100px)").addEventListener("change", (e) => {
    if (!e.matches && dialog.open) dialog.close();
  });
})();
