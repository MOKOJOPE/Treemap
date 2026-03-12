// == DATA MODEL ==
let rootNode = null;
let currentNode = null;
let navStack = [];
let colorScheme = "random";
let rects = [];
let allFiles = [];
let totalFiles = 0,
  totalDirs = 0,
  totalSize = 0,
  largestSize = 0;

// == FILE TYPE CLASSIFICATION ==
const FILE_TYPES = {
  document: {
    exts: ["doc", "docx", "pdf", "odt", "rtf", "pages", "tex", "md", "rst"],
    color: "#4e9af1",
    label: "Document",
  },
  spreadsheet: {
    exts: ["xls", "xlsx", "csv", "ods", "numbers"],
    color: "#22c55e",
    label: "Spreadsheet",
  },
  slideshow: {
    exts: ["ppt", "pptx", "odp", "key"],
    color: "#f59e0b",
    label: "Slideshow",
  },
  plaintext: {
    exts: [
      "txt",
      "log",
      "cfg",
      "conf",
      "ini",
      "yaml",
      "yml",
      "toml",
      "json",
      "xml",
    ],
    color: "#94a3b8",
    label: "Plain Text",
  },
  executable: {
    exts: ["exe", "bin", "app", "dmg", "deb", "rpm", "sh", "bat", "cmd", "msi"],
    color: "#ef4444",
    label: "Executable",
  },
  sourcecode: {
    exts: [
      "js",
      "ts",
      "jsx",
      "tsx",
      "py",
      "java",
      "c",
      "cpp",
      "h",
      "hpp",
      "cs",
      "go",
      "rs",
      "rb",
      "php",
      "swift",
      "kt",
      "scala",
      "r",
      "m",
    ],
    color: "#a78bfa",
    label: "Source Code",
  },
  objectcode: {
    exts: ["o", "obj", "so", "dll", "lib", "a", "class", "pyc", "pyd", "wasm"],
    color: "#fb7185",
    label: "Object Code",
  },
  image: {
    exts: [
      "jpg",
      "jpeg",
      "png",
      "gif",
      "bmp",
      "svg",
      "webp",
      "ico",
      "tiff",
      "psd",
      "ai",
      "raw",
      "heic",
    ],
    color: "#06b6d4",
    label: "Image",
  },
  audio: {
    exts: ["mp3", "wav", "flac", "aac", "ogg", "m4a", "wma", "aiff"],
    color: "#f97316",
    label: "Audio",
  },
  video: {
    exts: ["mp4", "mov", "avi", "mkv", "webm", "wmv", "flv", "m4v"],
    color: "#ec4899",
    label: "Video",
  },
  archive: {
    exts: ["zip", "tar", "gz", "7z", "rar", "bz2", "xz", "tgz"],
    color: "#84cc16",
    label: "Archive",
  },
  font: {
    exts: ["ttf", "otf", "woff", "woff2", "eot"],
    color: "#e879f9",
    label: "Font",
  },
};

function getFileType(filename) {
  const ext = (filename.split(".").pop() || "").toLowerCase();
  for (const [type, info] of Object.entries(FILE_TYPES)) {
    if (info.exts.includes(ext)) return type;
  }
  return "other";
}

// == COLOR SCHEMES ==
const MUTED_PALETTE = [
  "#5b7fa6",
  "#7a9e7e",
  "#c4845a",
  "#8b6fb5",
  "#b5736a",
  "#4e8fa3",
  "#a08c5b",
  "#6b9e8c",
  "#9a6b8f",
  "#7a8c5a",
  "#c47a5a",
  "#5a7ab5",
  "#8fa06b",
  "#b56b7a",
  "#5a9a8f",
  "#a07a9a",
  "#7ab56b",
  "#9a7a5a",
  "#6b8fa0",
  "#b5a06b",
  "#7a5ab5",
  "#5ab57a",
  "#b5855a",
  "#5a85b5",
  "#a05a7a",
];

let trueRandomCache = new Map();

function getTrueRandomColor(path) {
  if (trueRandomCache.has(path)) return trueRandomCache.get(path);
  const color = MUTED_PALETTE[Math.floor(Math.random() * MUTED_PALETTE.length)];
  trueRandomCache.set(path, color);
  return color;
}

function shuffleRandomColors() {
  trueRandomCache.clear();
  if (currentNode) renderTreemap(currentNode);
}

function getTypeColor(filename) {
  return FILE_TYPES[getFileType(filename)]?.color || "#555577";
}

function getAgeColor(lastModified) {
  if (!lastModified) return "#444466";
  const age = Date.now() - lastModified;
  const yr = 365.25 * 24 * 3600 * 1000;
  if (age < yr * 0.25) return "#2ecc71";
  if (age < yr) return "#27ae60";
  if (age < yr * 2) return "#f39c12";
  if (age < yr * 5) return "#e67e22";
  if (age < yr * 10) return "#c0392b";
  return "#6c3483";
}

function getPermColor(node) {
  const isExec = ["exe", "bin", "sh", "bat", "cmd", "app"].includes(
    (node.name.split(".").pop() || "").toLowerCase(),
  );
  const combo =
    1 * 4 +
    (!node.name.startsWith(".") && node.size > 0 ? 2 : 0) +
    (isExec ? 1 : 0);
  return {
    0: "#1a1a2e",
    1: "#6c3aed",
    2: "#c0392b",
    3: "#a93226",
    4: "#1e8449",
    5: "#1a7a8a",
    6: "#b7770d",
    7: "#27ae60",
  }[combo];
}

function getEntropyColor(node) {
  const h = node.name.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return MUTED_PALETTE[
    Math.abs(Math.round(h * Math.log1p(node.size))) % MUTED_PALETTE.length
  ];
}

function getColor(node, scheme) {
  if (node.isDir) return null;
  switch (scheme) {
    case "random":
      return getTrueRandomColor(node.path);
    case "type":
      return getTypeColor(node.name);
    case "age":
      return getAgeColor(node.lastModified);
    case "perms":
      return getPermColor(node);
    case "entropy":
      return getEntropyColor(node);
    default:
      return getTrueRandomColor(node.path);
  }
}

// == DIRECTORY LOADING ==
function loadDirectory(input) {
  const files = Array.from(input.files);
  if (!files.length) return;
  setStatus(
    "loading",
    "Processing " + files.length.toLocaleString() + " files...",
  );
  showProgress(10);
  setTimeout(() => {
    totalFiles = 0;
    totalDirs = 0;
    totalSize = 0;
    largestSize = 0;
    trueRandomCache.clear();
    rootNode = buildTree(files);
    currentNode = rootNode;
    navStack = [rootNode];
    allFiles = files;
    computeStats();
    showProgress(90);
    renderTreemap(currentNode);
    updateBreadcrumb();
    updateLegend();
    document.getElementById("emptyState").style.display = "none";
    document.getElementById("pathBar").innerHTML =
      "<span>" + rootNode.name + "</span>";
    setStatus(
      "idle",
      "Loaded " +
        totalFiles.toLocaleString() +
        " files in " +
        Math.max(0, totalDirs - 1).toLocaleString() +
        " directories",
    );
    hideProgress();
  }, 50);
}

function buildTree(files) {
  const root = { name: "root", path: "", isDir: true, children: {}, size: 0 };
  for (const file of files) {
    const parts = file.webkitRelativePath
      ? file.webkitRelativePath.split("/")
      : [file.name];
    if (parts.length > 1) root.name = parts[0];
    let node = root;
    for (let i = 1; i < parts.length - 1; i++) {
      const p = parts[i];
      if (!node.children[p]) {
        node.children[p] = {
          name: p,
          path: parts.slice(0, i + 1).join("/"),
          isDir: true,
          children: {},
          size: 0,
        };
        totalDirs++;
      }
      node = node.children[p];
    }
    const fname = parts[parts.length - 1];
    // Give 0-byte files a minimum size of 1 so they still appear
    node.children[fname] = {
      name: fname,
      path: file.webkitRelativePath || fname,
      isDir: false,
      size: Math.max(file.size, 1),
      realSize: file.size,
      lastModified: file.lastModified,
      type: file.type,
      children: {},
    };
    totalFiles++;
  }
  computeTreeSizes(root);
  return root;
}

function computeTreeSizes(node) {
  if (!node.isDir) return node.size;
  let t = 0;
  for (const c of Object.values(node.children)) t += computeTreeSizes(c);
  // Dirs with no files still need size>0 to show; give them 1
  node.size = Math.max(t, 1);
  return node.size;
}

function computeStats() {
  totalFiles = 0;
  totalDirs = 0;
  totalSize = 0;
  largestSize = 0;
  let largestName = "";
  function walk(node) {
    if (!node.isDir) {
      totalFiles++;
      totalSize += node.realSize ?? node.size;
      if (node.size > largestSize) {
        largestSize = node.size;
        largestName = node.name;
      }
    } else {
      totalDirs++;
      for (const c of Object.values(node.children)) walk(c);
    }
  }
  walk(rootNode);
  document.getElementById("statFiles").textContent =
    totalFiles.toLocaleString();
  document.getElementById("statDirs").textContent = Math.max(
    0,
    totalDirs - 1,
  ).toLocaleString();
  document.getElementById("statSize").textContent = formatSize(totalSize);
  document.getElementById("statLargest").textContent = largestName
    ? formatSize(largestSize)
    : "\u2014";
}

// ============================================================
// SQUARIFIED TREEMAP  — always fills 100% of the given rect
// ============================================================
function squarify(nodes, x, y, w, h) {
  const out = [];
  // filter & sort descending
  const items = nodes.filter((n) => n.size > 0).sort((a, b) => b.size - a.size);
  if (!items.length || w <= 0 || h <= 0) return out;
  _squarify(items, x, y, w, h, out);
  return out;
}

function _squarify(items, x, y, w, h, out) {
  if (!items.length || w <= 0 || h <= 0) return;

  const total = items.reduce((s, n) => s + n.size, 0);
  if (total === 0) return;

  // If only one item — give it the whole rect
  if (items.length === 1) {
    out.push({ node: items[0], x, y, w, h });
    return;
  }

  let row = [];
  let rowSum = 0;
  let i = 0;
  const shortSide = Math.min(w, h);

  while (i < items.length) {
    const candidate = items[i];
    const newSum = rowSum + candidate.size;
    if (
      row.length === 0 ||
      _worst(row, rowSum, total, w, h) >=
        _worst([...row, candidate], newSum, total, w, h)
    ) {
      row.push(candidate);
      rowSum += candidate.size;
      i++;
    } else {
      // Commit the current row, recurse on remainder
      _placeRow(row, rowSum, total, x, y, w, h, out);
      const frac = rowSum / total;
      if (w >= h) {
        const dw = w * frac;
        _squarify(items.slice(i), x + dw, y, w - dw, h, out);
      } else {
        const dh = h * frac;
        _squarify(items.slice(i), x, y + dh, w, h - dh, out);
      }
      return;
    }
  }
  // Commit the final row — stretch it to fill remaining space exactly
  _placeRow(row, rowSum, total, x, y, w, h, out);
}

function _worst(row, rowSum, total, w, h) {
  if (!rowSum) return Infinity;
  const frac = rowSum / total;
  const rw = w >= h ? w * frac : w;
  const rh = w >= h ? h : h * frac;
  let worst = 0;
  for (const n of row) {
    const f = n.size / rowSum;
    const iw = w >= h ? rw * f : rw; // wait — fix axis
    const ih = w >= h ? rh : rh * f;
    // actually: along the short side
    const cellW = w >= h ? rw * f : rw;
    const cellH = w >= h ? rh : rh * f;
    const r =
      cellW > 0 && cellH > 0
        ? Math.max(cellW / cellH, cellH / cellW)
        : Infinity;
    if (r > worst) worst = r;
  }
  return worst;
}

function _placeRow(row, rowSum, total, x, y, w, h, out) {
  if (!row.length || !rowSum) return;
  const frac = rowSum / total;
  // The row occupies a strip along the short side
  if (w >= h) {
    // horizontal strip on the left
    const stripW = w * frac;
    let cy = y;
    for (const n of row) {
      const cellH = h * (n.size / rowSum);
      out.push({ node: n, x, y: cy, w: stripW, h: cellH });
      cy += cellH;
    }
  } else {
    // vertical strip on the top
    const stripH = h * frac;
    let cx = x;
    for (const n of row) {
      const cellW = w * (n.size / rowSum);
      out.push({ node: n, x: cx, y, w: cellW, h: stripH });
      cx += cellW;
    }
  }
}

// == CANVAS RENDERING ==
const canvas = document.getElementById("treemap");
const ctx = canvas.getContext("2d");

function renderTreemap(node) {
  const wrap = canvas.parentElement;
  canvas.width = wrap.clientWidth;
  canvas.height = wrap.clientHeight;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  rects = [];
  if (!node) return;

  const PAD = 4;
  const children = Object.values(node.children).filter((c) => c.size > 0);
  layoutAndDraw(
    children,
    PAD,
    PAD,
    canvas.width - PAD * 2,
    canvas.height - PAD * 2,
    0,
  );
}

function layoutAndDraw(children, x, y, w, h, depth) {
  if (!children.length || w < 2 || h < 2) return;
  const GAP = depth === 0 ? 2 : 1;
  const items = squarify(children, x, y, w, h);

  for (const { node, x: rx, y: ry, w: rw, h: rh } of items) {
    if (rw < 1 || rh < 1) continue;

    // Apply inner gap by shrinking each rect slightly
    const gx = rx + GAP * 0.5;
    const gy = ry + GAP * 0.5;
    const gw = rw - GAP;
    const gh = rh - GAP;
    if (gw < 1 || gh < 1) continue;

    if (node.isDir) {
      const dirChildren = Object.values(node.children).filter(
        (c) => c.size > 0,
      );

      // Draw dir background
      ctx.fillStyle = "rgba(255,255,255,0.025)";
      ctx.fillRect(gx, gy, gw, gh);
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.lineWidth = 1;
      ctx.strokeRect(gx + 0.5, gy + 0.5, gw - 1, gh - 1);

      // Dir header bar
      const HEADER = gh > 20 && gw > 50 ? 15 : 0;
      if (HEADER) {
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.fillRect(gx, gy, gw, HEADER);
        ctx.fillStyle = "rgba(255,255,255,0.65)";
        ctx.font = "bold 8px Space Mono,monospace";
        ctx.fillText(
          truncate(node.name, Math.floor((gw - 8) / 5.2)),
          gx + 4,
          gy + 10,
        );
      }

      if (dirChildren.length && gw > 8 && gh - HEADER > 8) {
        layoutAndDraw(dirChildren, gx, gy + HEADER, gw, gh - HEADER, depth + 1);
      }
      rects.push({ node, x: gx, y: gy, w: gw, h: gh, isDir: true });
    } else {
      // File rect
      const color = getColor(node, colorScheme);
      ctx.fillStyle = color;
      ctx.fillRect(gx, gy, gw, gh);

      // Dark border
      ctx.strokeStyle = "rgba(0,0,0,0.3)";
      ctx.lineWidth = 0.5;
      ctx.strokeRect(gx + 0.5, gy + 0.5, gw - 1, gh - 1);

      // Top sheen
      if (gw > 8 && gh > 8) {
        const grad = ctx.createLinearGradient(gx, gy, gx, gy + gh * 0.45);
        grad.addColorStop(0, "rgba(255,255,255,0.15)");
        grad.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = grad;
        ctx.fillRect(gx, gy, gw, gh * 0.45);
      }

      // Label — always rendered when there's room
      if (gw > 28 && gh > 12) {
        const fs = Math.min(10, Math.max(7, gh * 0.25));
        const labelH = fs + 5;
        // Semi-transparent strip for legibility
        ctx.fillStyle = "rgba(0,0,0,0.4)";
        ctx.fillRect(gx, gy, gw, labelH);
        ctx.fillStyle = "rgba(255,255,255,0.93)";
        ctx.font = fs + "px Space Mono,monospace";
        const maxCh = Math.floor((gw - 6) / (fs * 0.6));
        ctx.fillText(truncate(node.name, maxCh), gx + 3, gy + labelH - 3);
        // Size
        if (gh > labelH + 12 && gw > 40) {
          ctx.fillStyle = "rgba(255,255,255,0.45)";
          ctx.font = "7px Space Mono,monospace";
          ctx.fillText(
            formatSize(node.realSize ?? node.size),
            gx + 3,
            gy + labelH + 10,
          );
        }
      }
      rects.push({ node, x: gx, y: gy, w: gw, h: gh, isDir: false });
    }
  }
}

function truncate(str, maxLen) {
  maxLen = Math.max(3, Math.floor(maxLen));
  return str.length <= maxLen ? str : str.slice(0, maxLen - 1) + "\u2026";
}

// == TOOLTIP & HOVER ==
const tooltip = document.getElementById("tooltip");

canvas.addEventListener("mousemove", (e) => {
  const r = canvas.getBoundingClientRect();
  const hit = findHit(e.clientX - r.left, e.clientY - r.top);
  if (hit) {
    showTooltip(hit, e.clientX, e.clientY);
    canvas.style.cursor = hit.isDir ? "pointer" : "default";
  } else {
    tooltip.style.display = "none";
    canvas.style.cursor = "default";
  }
});
canvas.addEventListener("mouseleave", () => {
  tooltip.style.display = "none";
});
canvas.addEventListener("dblclick", (e) => {
  const r = canvas.getBoundingClientRect();
  const hit = findHit(e.clientX - r.left, e.clientY - r.top);
  if (hit && hit.isDir) {
    navStack.push(hit.node);
    currentNode = hit.node;
    trueRandomCache.clear();
    renderTreemap(currentNode);
    updateBreadcrumb();
    document.getElementById("pathBar").innerHTML =
      "<span>" + (hit.node.path || hit.node.name) + "</span>";
  }
});

function findHit(mx, my) {
  let best = null,
    bestArea = Infinity;
  for (const r of rects) {
    if (mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h) {
      const a = r.w * r.h;
      if (a < bestArea) {
        bestArea = a;
        best = r.node;
      }
    }
  }
  return best;
}

function showTooltip(node, cx, cy) {
  document.getElementById("ttName").textContent = node.name;
  const dispSize = node.realSize ?? node.size;
  document.getElementById("ttSize").textContent =
    formatSize(dispSize) +
    (dispSize > 0 ? " (" + dispSize.toLocaleString() + " bytes)" : "");
  document.getElementById("ttPath").textContent =
    "\uD83D\uDCC1 " + (node.path || node.name);
  if (node.isDir) {
    document.getElementById("ttType").textContent = "Directory";
    document.getElementById("ttMod").textContent = "\u2014";
    document.getElementById("ttPermRow").style.display = "none";
  } else {
    const ftype = getFileType(node.name);
    document.getElementById("ttType").textContent =
      (FILE_TYPES[ftype]?.label || "Unknown") +
      " (." +
      node.name.split(".").pop() +
      ")";
    document.getElementById("ttMod").textContent = node.lastModified
      ? new Date(node.lastModified).toLocaleDateString("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
        })
      : "\u2014";
    const isExec = ["exe", "bin", "sh", "bat", "cmd", "app"].includes(
      (node.name.split(".").pop() || "").toLowerCase(),
    );
    const w2 = !node.name.startsWith(".") && (node.realSize ?? node.size) > 0;
    document.getElementById("ttPerms").textContent =
      "r" + (w2 ? "w" : "-") + (isExec ? "x" : "-") + " (inferred)";
    document.getElementById("ttPermRow").style.display = "flex";
  }
  tooltip.style.display = "block";
  const tw = tooltip.offsetWidth,
    th = tooltip.offsetHeight,
    vw = window.innerWidth,
    vh = window.innerHeight;
  let tx = cx + 16,
    ty = cy - 10;
  if (tx + tw > vw - 10) tx = cx - tw - 16;
  if (ty + th > vh - 10) ty = vh - th - 10;
  tooltip.style.left = tx + "px";
  tooltip.style.top = ty + "px";
}

// == BREADCRUMB ==
function updateBreadcrumb() {
  const bc = document.getElementById("breadcrumb");
  bc.innerHTML = "";
  navStack.forEach((node, i) => {
    const item = document.createElement("div");
    item.className =
      "breadcrumb-item" + (i === navStack.length - 1 ? " current" : "");
    item.textContent =
      (i === 0 ? "\u2302 " : "  ".repeat(i) + "\u2514 ") + node.name;
    item.onclick = () => {
      navStack = navStack.slice(0, i + 1);
      currentNode = navStack[navStack.length - 1];
      trueRandomCache.clear();
      renderTreemap(currentNode);
      updateBreadcrumb();
    };
    bc.appendChild(item);
  });
}

// == LEGEND ==
function updateLegend() {
  const leg = document.getElementById("legend");
  leg.innerHTML = "";
  const shuffleBtn = document.getElementById("shuffleBtn");

  if (colorScheme === "random") {
    if (shuffleBtn) shuffleBtn.style.display = "inline-block";
    const sw = document.createElement("div");
    sw.style.cssText = "display:flex;flex-wrap:wrap;gap:3px;margin-bottom:8px;";
    MUTED_PALETTE.slice(0, 15).forEach((c) => {
      const d = document.createElement("div");
      d.style.cssText =
        "width:12px;height:12px;border-radius:2px;background:" + c;
      sw.appendChild(d);
    });
    leg.appendChild(sw);
    const info = document.createElement("div");
    info.style.cssText =
      "color:var(--text-dim);font-size:0.6rem;line-height:1.5;";
    info.textContent =
      "Random color from muted palette. Shuffle to re-randomize.";
    leg.appendChild(info);
  } else {
    if (shuffleBtn) shuffleBtn.style.display = "none";
    if (colorScheme === "type") {
      [
        ...Object.entries(FILE_TYPES),
        ["other", { color: "#555577", label: "Other" }],
      ].forEach(([, info]) => {
        const item = document.createElement("div");
        item.className = "legend-item";
        item.innerHTML =
          '<div class="legend-swatch" style="background:' +
          info.color +
          '"></div>' +
          info.label;
        leg.appendChild(item);
      });
    } else if (colorScheme === "age") {
      [
        ["< 3 months", "#2ecc71"],
        ["< 1 year", "#27ae60"],
        ["< 2 years", "#f39c12"],
        ["< 5 years", "#e67e22"],
        ["< 10 years", "#c0392b"],
        ["10+ years", "#6c3483"],
      ].forEach(([label, color]) => {
        const item = document.createElement("div");
        item.className = "legend-item";
        item.innerHTML =
          '<div class="legend-swatch" style="background:' +
          color +
          '"></div>' +
          label;
        leg.appendChild(item);
      });
    } else if (colorScheme === "perms") {
      [
        ["---", "#1a1a2e"],
        ["--x", "#6c3aed"],
        ["-w-", "#c0392b"],
        ["-wx", "#a93226"],
        ["r--", "#1e8449"],
        ["r-x", "#1a7a8a"],
        ["rw-", "#b7770d"],
        ["rwx", "#27ae60"],
      ].forEach(([label, color]) => {
        const item = document.createElement("div");
        item.className = "legend-item";
        item.innerHTML =
          '<div class="legend-swatch" style="background:' +
          color +
          '"></div><code>' +
          label +
          "</code>";
        leg.appendChild(item);
      });
    } else {
      const info = document.createElement("div");
      info.style.cssText = "color:var(--text-dim);font-size:0.6rem;";
      info.textContent = "Colors derived from name entropy + size.";
      leg.appendChild(info);
    }
  }
}

// == SCHEME SWITCHING ==
function setScheme(scheme) {
  colorScheme = scheme;
  document
    .querySelectorAll(".scheme-btn")
    .forEach((b) => b.classList.toggle("active", b.dataset.scheme === scheme));
  if (scheme === "random") trueRandomCache.clear();
  if (currentNode) renderTreemap(currentNode);
  updateLegend();
}

// == UTILS ==
function formatSize(bytes) {
  if (!bytes || bytes <= 0) return "0 B";
  const k = 1024,
    s = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + s[i];
}
function setStatus(state, msg) {
  document.getElementById("statusDot").className =
    "status-dot " + (state === "loading" ? "" : "idle");
  document.getElementById("statusText").textContent = msg;
}
function showProgress(pct) {
  document.getElementById("progressWrap").style.display = "block";
  document.getElementById("progressBar").style.width = pct + "%";
}
function hideProgress() {
  setTimeout(() => {
    document.getElementById("progressWrap").style.display = "none";
  }, 600);
}

// == RESIZE ==
let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (currentNode) renderTreemap(currentNode);
  }, 100);
});
