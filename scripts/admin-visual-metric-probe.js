(() => {
  const round = (value) => Math.round(value * 64) / 64;
  const visible = (element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      rect.width > 0 &&
      rect.height > 0
    );
  };
  const rect = (element) => {
    if (!element) return null;
    const box = element.getBoundingClientRect();
    return {
      tag: element.tagName.toLowerCase(),
      className:
        typeof element.className === "string" ? element.className : "",
      x: round(box.x),
      y: round(box.y),
      width: round(box.width),
      height: round(box.height),
    };
  };
  const first = (selectors) => {
    for (const selector of selectors) {
      const match = [...document.querySelectorAll(selector)].find(visible);
      if (match) return match;
    }
    return null;
  };
  const all = (selectors, limit = 20) => {
    const matches = [];
    const seen = new Set();
    for (const selector of selectors) {
      for (const element of document.querySelectorAll(selector)) {
        if (seen.has(element) || !visible(element)) continue;
        seen.add(element);
        matches.push(rect(element));
        if (matches.length >= limit) return matches;
      }
    }
    return matches;
  };

  const container = first(["#container_wr", ".container_wr", "main"]);
  const summary = first([
    ".local_ov01",
    ".local_desc01",
    ".ov_listall",
    "[class*='summary']",
    "[class*='resultBar']",
  ]);
  const search = first([
    ".local_sch01",
    ".local_sch03",
    ".local_sch",
    "form[class*='search']",
    "[class*='filterPanel']",
    "[class*='filters']",
  ]);
  const tables = all([
    ".tbl_head01 > table",
    ".tbl_frm01 > table",
    ".tbl_head01 table",
    ".tbl_frm01 table",
    "table",
  ]);
  const topButtons = all([
    ".btn_fixed_top a",
    ".btn_fixed_top button",
    "[class*='fixed'][class*='top'] a",
    "[class*='fixed'][class*='top'] button",
  ]);
  const headings = all(["#container_wr > h2", ".container_wr > h2", "main h2"]);

  return {
    href: `${location.pathname}${location.search}`,
    title: document.title,
    viewport: {
      width: innerWidth,
      height: innerHeight,
      devicePixelRatio,
    },
    document: {
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
    },
    container: rect(container),
    summary: rect(summary),
    search: rect(search),
    tables,
    topButtons,
    headings,
  };
})()
