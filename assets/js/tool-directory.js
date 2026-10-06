const directory = document.querySelector("[data-tool-directory]");

if (directory) {
  const search = directory.querySelector("[data-tool-search]");
  const filters = [...directory.querySelectorAll("[data-tool-filter]")];
  const items = [...directory.querySelectorAll("[data-tool-item]")];
  const empty = directory.querySelector("[data-tool-empty]");
  const status = directory.querySelector("[data-tool-status]");
  let activeCategory = "all";

  const update = () => {
    const query = search.value.trim().toLocaleLowerCase("en");
    let visibleCount = 0;

    for (const item of items) {
      const matchesCategory = activeCategory === "all" || item.dataset.category === activeCategory;
      const matchesQuery = !query || item.dataset.search.includes(query);
      item.hidden = !(matchesCategory && matchesQuery);
      if (!item.hidden) visibleCount += 1;
    }

    empty.hidden = visibleCount !== 0;
    status.textContent = visibleCount === 1 ? "1 tool shown." : `${visibleCount} tools shown.`;
  };

  for (const filter of filters) {
    filter.addEventListener("click", () => {
      activeCategory = filter.dataset.toolFilter;
      for (const candidate of filters) candidate.setAttribute("aria-pressed", String(candidate === filter));
      update();
    });
  }

  search.addEventListener("input", update);
  directory.dataset.directoryReady = "true";
}
