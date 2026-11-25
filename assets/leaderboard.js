(() => {
  "use strict";
  const tables = window.SAGE_RESULTS;
  const id = name => document.getElementById(name);
  if (!Array.isArray(tables) || !tables.length) {
    id("toggle-screen").hidden = true;
    id("view-title").textContent = "Benchmark results";
    id("view-panel").hidden = true;
    id("no-views").hidden = false;
    id("no-views").textContent = "Results could not be loaded. Check that the site’s assets folder contains results.js.";
    return;
  }

  const state = { table: tables[0], metric: 0, direction: "desc" };
  const folded = value => String(value ?? "").toLowerCase().normalize("NFKC").replace(/[\s\-–_./]/g, "");
  const scopes = {public: "Public benchmarks", private: "Private benchmarks"};
  const benchInput = id("bench-search");
  const benchMenu = id("bench-menu");
  const benchmarks = tables.flatMap(table =>
    [...new Set(table.columns.map(column => column.benchmark))].map(name => ({name, table}))
  ).sort((a, b) => a.name.localeCompare(b.name, "en", {numeric: true}));
  let selectedBenchmark = null;
  let browseScope = null;
  const modelInput = id("model-search");
  const modelMenu = id("model-menu");
  let modelSelection = null;
  let browseFamily = null;
  const node = (tag, value, className) => {
    const element = document.createElement(tag);
    if (value != null) element.textContent = value;
    if (className) element.className = className;
    return element;
  };
  function modelGroup(row) {
    return [row.family, row.scale].filter(Boolean).join(" · ");
  }
  function colLabel(column) {
    return [column.benchmark, column.metric].filter(Boolean).join(" · ");
  }
  function viewColumns(table) {
    const indexed = table.columns.map((column, index) => ({...column, index}));
    if (selectedBenchmark) {
      return table === selectedBenchmark.table ? indexed.filter(col => col.benchmark === selectedBenchmark.name) : [];
    }
    const term = folded(benchInput.value);
    const tableMatch = folded([table.title, scopes[table.scope]].join(" ")).includes(term);
    return indexed.filter(column =>
      tableMatch || folded([column.benchmark, column.metric, column.category].join(" ")).includes(term));
  }
  function menuButton(label, className, action) {
    const button = node("button", label, className);
    button.type = "button";
    button.addEventListener("click", action);
    return button;
  }
  function renderBenchMenu() {
    const fragment = document.createDocumentFragment();
    const searching = !selectedBenchmark && Boolean(benchInput.value.trim());
    if (!searching && !browseScope) {
      for (const [scope, title] of Object.entries(scopes)) {
        const button = menuButton(title, "lb-browse-scope", () => {
          browseScope = scope;
          renderBenchMenu();
          benchMenu.querySelector("button").focus({preventScroll: true});
        });
        button.dataset.scope = scope;
        fragment.append(button);
      }
    } else {
      if (browseScope) {
        const back = menuButton(scopes[browseScope], "lb-browse-back", () => {
          const previous = browseScope;
          browseScope = null;
          renderBenchMenu();
          benchMenu.querySelector('[data-scope="' + previous + '"]').focus({preventScroll: true});
        });
        back.setAttribute("aria-label", "Back to benchmark groups");
        fragment.append(back);
      }
      const list = node("div", null, "lb-browse-list");
      const matches = searching ? new Map(tables.map(table =>
        [table, new Set(viewColumns(table).map(column => column.benchmark))]
      )) : null;
      for (const [scope, title] of Object.entries(scopes)) {
        if (browseScope && scope !== browseScope) continue;
        const entries = benchmarks.filter(entry => entry.table.scope === scope && (!matches || matches.get(entry.table).has(entry.name)));
        if (searching && entries.length) list.append(node("h3", title));
        for (const entry of entries) {
          const button = menuButton(entry.name, "lb-browse-option", () => {
            selectedBenchmark = entry;
            benchInput.value = entry.name;
            closeBenchMenu(true);
            selectView(entry.table);
          });
          if (benchmarks.some(other => other !== entry && other.table.scope === scope && other.name === entry.name)) {
            const context = entry.table.title.replace(/^(?:Public|Private)\s+/i, "").split(" · ")[0];
            button.append(node("small", context[0].toUpperCase() + context.slice(1)));
          }
          if (entry === selectedBenchmark) button.setAttribute("aria-current", "true");
          list.append(button);
        }
      }
      if (!list.childElementCount) {
        benchMenu.replaceChildren();
        closeBenchMenu();
        return false;
      }
      fragment.append(list);
    }
    benchMenu.replaceChildren(fragment);
    return true;
  }
  function bindPicker(prefix, renderMenu, resetBrowse, onInput) {
    const finder = id(prefix + "-finder");
    const input = id(prefix + "-search");
    const menu = id(prefix + "-menu");
    const toggle = id(prefix + "-toggle");
    function show(visible) {
      menu.hidden = !visible;
      input.setAttribute("aria-expanded", String(visible));
      toggle.setAttribute("aria-expanded", String(visible));
    }
    function open() {
      if (!menu.hidden) return;
      resetBrowse();
      if (renderMenu()) show(true);
    }
    function close(restoreFocus = false) {
      if (restoreFocus) input.focus({preventScroll: true});
      show(false);
    }
    input.addEventListener("focus", open);
    input.addEventListener("click", open);
    input.addEventListener("input", () => {
      resetBrowse();
      onInput();
      show(renderMenu());
    });
    toggle.addEventListener("click", () => {
      if (!menu.hidden) close(true);
      else {
        input.focus({preventScroll: true});
        open();
      }
    });
    finder.addEventListener("focusout", event => {
      if (event.relatedTarget && !finder.contains(event.relatedTarget)) close();
    });
    document.addEventListener("pointerdown", event => {
      if (!menu.hidden && !finder.contains(event.target)) close();
    });
    finder.addEventListener("keydown", event => {
      if (event.key === "Escape" && !menu.hidden) {
        event.preventDefault();
        event.stopPropagation();
        close(true);
      } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        open();
        const buttons = Array.from(menu.querySelectorAll("button"));
        const index = buttons.indexOf(document.activeElement);
        const next = event.key === "ArrowDown" ? Math.min(index + 1, buttons.length - 1) :
          (index < 0 ? buttons.length - 1 : Math.max(0, index - 1));
        if (!menu.hidden) buttons[next]?.focus();
      }
    });
    return {close};
  }
  function closeBenchMenu(restoreFocus = false) {
    benchPicker.close(restoreFocus);
  }
  function modelLabel(row) {
    return row.model + " · " + (row.size || "Size unreported");
  }
  function modelMatches(row) {
    if (modelSelection) {
      return row.family === modelSelection.family && (!modelSelection.model ||
        (row.model === modelSelection.model && row.size === modelSelection.size));
    }
    const words = modelInput.value.trim().split(/[\s·]+/);
    const searchable = folded([row.model, row.size || "Size unreported", row.family].join(" "));
    return words.every(word => searchable.includes(folded(word)));
  }
  function chooseModel(selection) {
    modelSelection = selection;
    modelInput.value = !selection ? "" : selection.model ? modelLabel(selection) : selection.family;
    modelPicker.close(true);
    drawTable();
  }
  function positionModelMenu() {
    const rect = id("model-finder").getBoundingClientRect();
    const viewport = window.visualViewport;
    const top = viewport?.offsetTop || 0;
    const bottom = top + (viewport?.height || window.innerHeight);
    const below = bottom - rect.bottom;
    modelMenu.dataset.placement = below < 200 && rect.top - top > below ? "above" : "below";
  }
  function renderModelMenu() {
    positionModelMenu();
    const fragment = document.createDocumentFragment();
    const searching = !modelSelection && Boolean(modelInput.value.trim());
    const candidates = searching ? state.table.rows.filter(modelMatches) : state.table.rows;
    if (!candidates.length) {
      modelMenu.replaceChildren();
      return false;
    }
    const families = [...new Set(candidates.map(row => row.family))];
    if (!browseFamily && !searching) {
      const all = menuButton("All models", "lb-browse-option", () => chooseModel(null));
      if (!modelSelection && !searching) all.setAttribute("aria-current", "true");
      fragment.append(all);
    } else if (browseFamily) {
      const back = menuButton(browseFamily, "lb-browse-back", () => {
        const previous = browseFamily;
        browseFamily = null;
        renderModelMenu();
        [...modelMenu.querySelectorAll("[data-family]")].find(item => item.dataset.family === previous)?.focus({preventScroll:true});
      });
      back.setAttribute("aria-label", "Back to model families");
      const currentFamily = browseFamily;
      const all = menuButton("All models in this family", "lb-browse-option", () => chooseModel({family:currentFamily}));
      if (modelSelection?.family === currentFamily && !modelSelection.model) all.setAttribute("aria-current", "true");
      fragment.append(back, all);
    }
    const list = node("div", null, "lb-browse-list");
    for (const family of families) {
      if (browseFamily && family !== browseFamily) continue;
      if (!browseFamily && !searching) {
        const button = menuButton(family, "lb-browse-scope", () => {
          browseFamily = family;
          renderModelMenu();
          modelMenu.querySelector("button").focus({preventScroll:true});
        });
        button.dataset.family = family;
        list.append(button);
        continue;
      }
      if (searching) list.append(node("h3", family));
      const models = candidates.filter(row => row.family === family).sort((a,b) =>
        modelLabel(a).localeCompare(modelLabel(b), "en", {numeric:true}));
      for (const row of models) {
        const button = menuButton(row.model, "lb-browse-option", () => chooseModel(row));
        button.append(node("small", row.size || "Size unreported"));
        button.setAttribute("aria-label", modelLabel(row));
        button.dataset.model = row.model;
        button.dataset.size = row.size || "";
        if (modelSelection?.model && modelMatches(row)) button.setAttribute("aria-current", "true");
        list.append(button);
      }
    }
    fragment.append(list);
    modelMenu.replaceChildren(fragment);
    return true;
  }
  function setView(table) {
    state.table = table;
    document.querySelector(".lb-spill").scrollTo(0, 0);
    const first = viewColumns(table)[0];
    state.metric = first?.index ?? 0;
    state.direction = first?.direction ?? "desc";
    modelPicker.close();
    if (modelSelection && !table.rows.some(modelMatches)) {
      modelSelection = null;
      modelInput.value = "";
    }
  }
  function updateIndex() {
    const groups = id("lb-index");
    const mobile = id("view-picker");
    groups.replaceChildren();
    mobile.replaceChildren();
    const available = selectedBenchmark ? tables : tables.filter(table => viewColumns(table).length);
    id("view-panel").hidden = !available.length;
    id("no-views").hidden = !!available.length;
    mobile.disabled = !available.length;
    if (!available.length) {
      id("scope-tag").textContent = "";
      id("view-title").textContent = "No matching benchmarks";
      groups.append(node("p", "No matches", "lb-index-none"));
      return;
    }
    if (!available.includes(state.table)) setView(available[0]);
    Object.entries(scopes).forEach(([scope, title]) => {
      const views = available.filter(table => table.scope === scope);
      if (!views.length) return;
      const section = node("div", null, "lb-list-section");
      section.append(node("h3", title));
      const menu = document.createElement("optgroup");
      menu.label = title;
      for (const view of views) {
        const item = node("a", null, "lb-item");
        item.href = "#" + encodeURIComponent(view.id);
        item.append(node("span", view.title));
        if (view.id === state.table.id) item.setAttribute("aria-current", "true");
        item.addEventListener("click", event => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          selectWholeView(view);
        });
        section.append(item);
        menu.append(new Option(view.title, view.id));
      }
      groups.append(section);
      mobile.append(menu);
    });
    mobile.value = state.table.id;
  }
  function selectWholeView(view) {
    if (selectedBenchmark) {
      selectedBenchmark = null;
      benchInput.value = "";
    }
    closeBenchMenu();
    selectView(view);
  }
  function selectView(view) {
    setView(view);
    const hash = "#" + encodeURIComponent(view.id);
    if (location.hash !== hash) location.hash = hash;
    refresh();
    if (id("view-title").getBoundingClientRect().bottom < 0) {
      id("board").scrollIntoView({block: "start"});
    }
  }
  function fromLocation() {
    let selected = location.hash ? null : tables[0];
    if (location.hash) {
      try {
        selected = tables.find(table => table.id === decodeURIComponent(location.hash.slice(1)));
      } catch { return; }
    }
    if (selected && state.table !== selected) {
      if (!viewColumns(selected).length) {
        benchInput.value = "";
        selectedBenchmark = null;
        closeBenchMenu();
      }
      setView(selected);
    }
  }
  function getRanks(rows, metric, direction) {
    const sorted = [...rows].filter(row => row.values[metric] != null).sort((a,b) =>
      (Number(a.values[metric]) - Number(b.values[metric])) * (direction === "asc" ? 1 : -1)
    );
    const ranks = new Map();
    let previous;
    let rank;
    sorted.forEach((row, i) => {
      const value = Number(row.values[metric]);
      if (i === 0 || previous !== value) rank = i + 1;
      ranks.set(row, rank);
      previous = value;
    });
    return ranks;
  }
  function drawHead(columns) {
    const headers = node("tr");
    const fixed = node("th", state.metric >= 0 ? "Rank · Model / Size" : "Model / Size", "lb-sticky");
    fixed.scope = "col";
    headers.append(fixed);
    columns.forEach(column => {
      const current = state.metric === column.index;
      const th = node("th", null, current ? "lb-selected" : "");
      th.scope = "col";
      if (current) th.setAttribute("aria-sort", state.direction === "asc" ? "ascending" : "descending");
      const button = node("button");
      button.type = "button";
      button.title = "Sort by " + colLabel(column);
      const name = node("strong", column.benchmark);
      const detail = node("span", column.metric || "Score");
      const arrow = node("i", current ? (state.direction === "desc" ? "↓" : "↑") : "↕");
      arrow.setAttribute("aria-hidden", "true");
      detail.append(arrow);
      button.append(name, detail);
      button.addEventListener("click", () => {
        state.direction = current ? (state.direction === "desc" ? "asc" : "desc") : column.direction;
        state.metric = column.index;
        drawTable();
        id("cols").querySelector('[aria-sort] button')?.focus({preventScroll: true});
      });
      th.append(button);
      headers.append(th);
    });
    id("cols").replaceChildren(headers);
  }
  function drawTable() {
    const table = state.table;
    const columns = viewColumns(table);
    if (!columns.length) return;
    if (state.metric >= 0 && !columns.some(col => col.index === state.metric)) {
      state.metric = columns[0].index;
      state.direction = columns[0].direction;
    }
    const matches = table.rows.filter(modelMatches);
    const reference = matches.length ? table.rows.find(row => row.model === "Sage-Med-Preview") : null;
    const rows = matches.filter(row => row !== reference);
    const metric = state.metric;
    const ranked = metric >= 0;
    const ranks = ranked ? getRanks(table.rows, metric, table.columns[metric].direction) : null;
    if (ranked) rows.sort((a,b) => {
      const av = a.values[metric], bv = b.values[metric];
      if (av == null || bv == null) return Number(av == null) - Number(bv == null);
      return (Number(av) - Number(bv)) * (state.direction === "asc" ? 1 : -1);
    });
    id("scope-tag").textContent = scopes[table.scope];
    id("view-title").textContent = table.title;
    let rowCount = rows.length + (rows.length === 1 ? " model configuration" : " model configurations");
    if (reference) rowCount = rows.length ? rowCount + " + 1 reference" : "1 reference model";
    const metricCount = columns.length + (columns.length === 1 ? " metric" : " metrics");
    id("row-summary").textContent = rowCount + " · " + metricCount;
    id("table-caption").textContent = table.title + ". " +
      (ranked ? "Sorted by " + colLabel(table.columns[metric]) + (state.direction === "asc" ? ", ascending." : ", descending.") : "Grouped by model family and size.")
      + (reference ? " Sage-Med-Preview appears last for comparison." : "");
    id("order-reset").disabled = !ranked;
    id("no-models").hidden = matches.length > 0;
    drawHead(columns);
    const fragment = document.createDocumentFragment();
    let lastGroup = null;
    if (reference) rows.push(reference);
    rows.forEach(row => {
      if (!ranked && row !== reference && modelGroup(row) !== lastGroup) {
        lastGroup = modelGroup(row);
        const tr = node("tr", null, "lb-group");
        const cell = node("th", lastGroup);
        cell.colSpan = columns.length + 1;
        tr.append(cell);
        fragment.append(tr);
      }
      const tr = node("tr", null, row.model === "Sage-Med-Preview" ? "lb-ours" : "");
      if (row === reference) tr.classList.add("lb-reference");
      const model = node("th", null, "lb-sticky");
      model.scope = "row";
      const line = node("div", null, "lb-model-cell");
      line.title = modelGroup(row);
      if (ranked) {
        const rank = ranks.get(row);
        const prefix = node("span", rank ?? "—", "lb-rank");
        prefix.setAttribute("aria-label", rank ? "Rank " + rank + " for this metric" : "Unranked");
        line.append(prefix);
      }
      const label = node("span", null, "lb-model-label");
      const detail = (row.size || "Size unreported") + (row === reference ? " · Reference" : "");
      label.append(node("b", row.model), node("small", detail));
      line.append(label);
      model.append(line);
      tr.append(model);
      for (const col of columns) {
        const val = row.values[col.index];
        const cell = node("td", val ?? "—");
        if (metric === col.index) cell.classList.add("lb-selected");
        if (val == null) cell.classList.add("lb-missing");
        if (row.marks[col.index] === 1) cell.classList.add("lb-best");
        if (row.marks[col.index] === 2) cell.classList.add("lb-second");
        tr.append(cell);
      }
      fragment.append(tr);
    });
    id("scores").replaceChildren(fragment);
  }
  function refresh() { updateIndex(); drawTable(); }
  const comparisonModels = new Set();
  for (const table of tables) {
    for (const row of table.rows) {
      if (row.model !== "Sage-Med-Preview") comparisonModels.add(JSON.stringify([row.model, row.size]));
    }
  }
  id("model-total").textContent = comparisonModels.size;
  const benchmarkCounts = Object.keys(scopes).map(scope => ({
    scope,
    count: new Set(benchmarks.filter(entry => entry.table.scope === scope).map(entry => entry.name)).size
  }));
  id("benchmark-total").textContent = benchmarkCounts.reduce((total, group) => total + group.count, 0);
  id("benchmark-split").textContent = benchmarkCounts.map(group => group.count + " " + group.scope).join(" · ");
  id("view-picker").addEventListener("change", event => selectWholeView(tables.find(table => table.id === event.target.value)));
  const benchPicker = bindPicker("bench", renderBenchMenu, () => { browseScope = null; }, () => {
    selectedBenchmark = null;
    refresh();
  });
  const modelPicker = bindPicker("model", renderModelMenu, () => { browseFamily = null; }, () => {
    modelSelection = null;
    drawTable();
  });
  const repositionOpenModelMenu = () => {
    if (!modelMenu.hidden) positionModelMenu();
  };
  window.addEventListener("resize", repositionOpenModelMenu);
  window.visualViewport?.addEventListener("resize", repositionOpenModelMenu);
  window.visualViewport?.addEventListener("scroll", repositionOpenModelMenu);
  id("order-reset").addEventListener("click", () => { state.metric = -1; drawTable(); });
  id("clear-models").addEventListener("click", () => {
    chooseModel(null);
  });
  id("clear-bench").addEventListener("click", () => {
    benchInput.value = "";
    selectedBenchmark = null;
    closeBenchMenu();
    refresh();
    benchInput.focus();
  });
  addEventListener("hashchange", () => { fromLocation(); refresh(); });
  const board = id("board");
  const screenToggle = id("toggle-screen");
  let expanded = false;
  let returnPosition;
  let obscured = [];

  function updateScreen(expand) {
    if (expanded === expand) return;
    expanded = expand;
    if (expand) {
      returnPosition = {x: window.scrollX, y: window.scrollY};
      obscured = Array.from(document.querySelectorAll(".lb-skip, .masthead, .lb-intro, .site-footer"))
        .filter(element => !element.inert);
      obscured.forEach(element => { element.inert = true; });
    } else {
      obscured.forEach(element => { element.inert = false; });
      obscured = [];
    }
    board.classList.toggle("is-expanded", expand);
    document.documentElement.classList.toggle("lb-screen-open", expand);
    screenToggle.setAttribute("aria-pressed", String(expand));
    id("screen-label").textContent = expand ? "Exit full screen" : "Full screen";
    screenToggle.focus({preventScroll:true});
    if (!expand) window.scrollTo({left:returnPosition.x, top:returnPosition.y, behavior:"instant"});
  }
  async function exitScreen() {
    if (document.fullscreenElement === board) {
      try { await document.exitFullscreen(); } catch { return; }
    }
    updateScreen(false);
  }
  screenToggle.addEventListener("click", async () => {
    if (expanded) {
      await exitScreen();
      return;
    }
    updateScreen(true);
    if (board.requestFullscreen && document.fullscreenEnabled) {
      try {
        await board.requestFullscreen();
        if (!expanded && document.fullscreenElement === board) await document.exitFullscreen();
      } catch {
        // The expanded layout also works when a browser blocks native fullscreen.
      }
    }
  });
  document.addEventListener("fullscreenchange", () => {
    if (expanded && document.fullscreenElement !== board) updateScreen(false);
  });
  document.addEventListener("keydown", event => {
    if (expanded && event.key === "Escape") {
      event.preventDefault();
      exitScreen();
    }
  });
  setView(tables[0]);
  fromLocation();
  refresh();
})();
