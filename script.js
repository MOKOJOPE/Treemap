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
  const ext = filename.split(".").pop().toLowerCase();
  for (const [type, info] of Object.entries(FILE_TYPES)) {
    if (info.exts.includes(ext)) return type;
  }
  return "other";
}

// == COLOR SCHEMES ==

// TRUE RANDOM: uses Math.random() — new colors every render until shuffled again.
// Cached per render-session so all rects stay stable WITHIN one render,
// but a Shuffle click clears the cache and redraws with fresh colors.
let trueRandomCache = new Map();

function getTrueRandomColor(path) {
  if (trueRandomCache.has(path)) return trueRandomCache.get(path);
  const h = Math.random() * 360;
  const s = 50 + Math.random() * 30;
  const l = 35 + Math.random() * 20;
  const color = `hsl(${h.toFixed(1)},${s.toFixed(1)}%,${l.toFixed(1)}%)`;
  trueRandomCache.set(path, color);
  return color;
}

// Called by the Shuffle button — wipes the cache so next render picks all-new colors
function shuffleRandomColors() {
  trueRandomCache.clear();
  if (currentNode) renderTreemap(currentNode);
}

function getTypeColor(filename) {
  const type = getFileType(filename);
  return FILE_TYPES[type]?.color || "#555577";
}

function getAgeColor(lastModified) {
  if (!lastModified) return "#444466";
  const age = Date.now() - lastModified;
  const yr = 365.25 * 24 * 3600 * 1000;
  if (age < yr * 0.25) return "#00ffaa";
  if (age < yr) return "#7ee8a2";
  if (age < yr * 2) return "#f59e0b";
  if (age < yr * 5) return "#f97316";
  if (age < yr * 10) return "#ef4444";
  return "#7c3aed";
}

function getPermColor(node) {
  const isExec = ["exe", "bin", "sh", "bat", "cmd", "app"].includes(
    (node.name.split(".").pop() || "").toLowerCase(),
  );
  const r = true;
  const w = !node.name.startsWith(".") && node.size > 0;
  const x = isExec;
  const combo = (r ? 4 : 0) + (w ? 2 : 0) + (x ? 1 : 0);
  const permColors = {
    0: "#1a1a2e",
    1: "#7c3aed",
    2: "#ef4444",
    3: "#ec4899",
    4: "#22c55e",
    5: "#06b6d4",
    6: "#f59e0b",
    7: "#00ffaa",
  };
  return permColors[combo];
}

function getEntropyColor(node) {
  const nameHash = node.name.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const sizeVar = Math.log1p(node.size);
  const val = (nameHash * sizeVar) % 360;
  const sat = 60 + (node.size % 40);
  return `hsl(${Math.abs(val | 0)},${sat}%,42%)`;
}

function getColor(node, scheme) {
  if (node.isDir) return "transparent";
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

  setStatus("loading", `Processing ${files.length.toLocaleString()} files...`);
  showProgress(0);

  setTimeout(() => {
    totalFiles = 0;
    totalDirs = 0;
    totalSize = 0;
    largestSize = 0;

    const tree = buildTree(files);
    rootNode = tree;
    currentNode = tree;
    navStack = [tree];
    allFiles = files;

    // Clear random cache so fresh colors are drawn for the new directory
    trueRandomCache.clear();

    computeStats();
    renderTreemap(currentNode);
    updateBreadcrumb();
    updateLegend();
    document.getElementById("emptyState").style.display = "none";
    document.getElementById("pathBar").innerHTML = `<span>${tree.name}</span>`;
    setStatus(
      "idle",
      `Loaded ${totalFiles.toLocaleString()} files in ${totalDirs.toLocaleString()} directories`,
    );
    hideProgress();
  }, 50);
}

function buildTree(files) {
  const root = { name: "root", path: "", isDir: true, children: {}, size: 0 };

  for (const file of files) {
    const pathParts = file.webkitRelativePath
      ? file.webkitRelativePath.split("/")
      : [file.name];

    if (pathParts.length > 1) root.name = pathParts[0];

    let node = root;
    for (let i = 1; i < pathParts.length - 1; i++) {
      const part = pathParts[i];
      if (!node.children[part]) {
        node.children[part] = {
          name: part,
          path: pathParts.slice(0, i + 1).join("/"),
          isDir: true,
          children: {},
          size: 0,
        };
        totalDirs++;
      }
      node = node.children[part];
    }

    const fname = pathParts[pathParts.length - 1];
    node.children[fname] = {
      name: fname,
      path: file.webkitRelativePath || fname,
      isDir: false,
      size: file.size,
      lastModified: file.lastModified,
      type: file.type,
      fileRef: file,
      children: {},
    };
    totalFiles++;
  }

  computeTreeSizes(root);
  return root;
}

function computeTreeSizes(node) {
  if (!node.isDir) return node.size;
  let total = 0;
  for (const child of Object.values(node.children))
    total += computeTreeSizes(child);
  node.size = total;
  return total;
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
      totalSize += node.size;
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
    : "—";
}

// == SQUARIFIED TREEMAP ==
function squarify(children, x, y, w, h) {
  const result = [];
  const items = [...children]
    .sort((a, b) => b.size - a.size)
    .filter((n) => n.size > 0);
  if (!items.length || !w || !h) return result;
  layoutRow(items, x, y, w, h, result);
  return result;
}

function layoutRow(items, x, y, w, h, out) {
  if (!items.length) return;
  const total = items.reduce((s, n) => s + n.size, 0);
  if (total === 0) return;

  let row = [],
    rowArea = 0,
    i = 0;

  while (i < items.length) {
    const item = items[i];
    const testRow = [...row, item];
    const testArea = rowArea + item.size;

    if (
      row.length === 0 ||
      worstRatio(testRow, testArea, total, w, h) <=
        worstRatio(row, rowArea, total, w, h)
    ) {
      row.push(item);
      rowArea += item.size;
      i++;
    } else {
      placeRow(row, rowArea, total, x, y, w, h, out);
      const placed = rowArea / total;
      if (w <= h) {
        y += h * placed;
        h -= h * placed;
      } else {
        x += w * placed;
        w -= w * placed;
      }
      row = [];
      rowArea = 0;
    }
  }
  if (row.length) placeRow(row, rowArea, total, x, y, w, h, out);
}

function worstRatio(row, rowArea, total, w, h) {
  if (!rowArea) return Infinity;
  const frac = rowArea / total;
  const rowW = w <= h ? w : w * frac;
  const rowH = w <= h ? h * frac : h;
  let worst = 0;
  for (const item of row) {
    const f = item.size / rowArea;
    const iw = w <= h ? rowW * f : rowW;
    const ih = w <= h ? rowH : rowH * f;
    const r = Math.max(iw / ih, ih / iw);
    if (r > worst) worst = r;
  }
  return worst;
}

function placeRow(row, rowArea, total, x, y, w, h, out) {
  const frac = rowArea / total;
  const rowW = w <= h ? w : w * frac;
  const rowH = w <= h ? h * frac : h;
  let pos = w <= h ? x : y;

  for (const item of row) {
    const f = item.size / rowArea;
    if (w <= h) {
      out.push({ node: item, x: pos, y, w: rowW * f, h: rowH });
      pos += rowW * f;
    } else {
      out.push({ node: item, x, y: pos, w: rowW, h: rowH * f });
      pos += rowH * f;
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
  layoutAndDraw(
    Object.values(node.children),
    0,
    0,
    canvas.width,
    canvas.height,
    0,
  );
}

function layoutAndDraw(children, x, y, w, h, depth) {
  const pad = 1;
  const items = squarify(children, x + pad, y + pad, w - pad * 2, h - pad * 2);

  for (const item of items) {
    const { node, x: rx, y: ry, w: rw, h: rh } = item;
    if (rw < 1 || rh < 1) continue;

    if (node.isDir) {
      const dirChildren = Object.values(node.children).filter(
        (c) => c.size > 0,
      );
      if (dirChildren.length > 0 && rw > 10 && rh > 14) {
        ctx.fillStyle = "rgba(255,255,255,0.03)";
        ctx.fillRect(rx, ry, rw, rh);
        ctx.strokeStyle = "rgba(255,255,255,0.08)";
        ctx.lineWidth = 1;
        ctx.strokeRect(rx + 0.5, ry + 0.5, rw - 1, rh - 1);

        const labelH = rh > 20 ? 14 : 0;
        if (labelH > 0 && rw > 30) {
          ctx.fillStyle = "rgba(0,0,0,0.4)";
          ctx.fillRect(rx, ry, rw, labelH);
          ctx.fillStyle = "rgba(255,255,255,0.5)";
          ctx.font = "7px Space Mono, monospace";
          ctx.fillText(truncate(node.name, rw / 5), rx + 4, ry + 10);
        }
        layoutAndDraw(dirChildren, rx, ry + labelH, rw, rh - labelH, depth + 1);
        rects.push({ node, x: rx, y: ry, w: rw, h: rh, isDir: true });
      } else {
        ctx.fillStyle = "rgba(255,255,255,0.04)";
        ctx.fillRect(rx, ry, rw, rh);
        rects.push({ node, x: rx, y: ry, w: rw, h: rh, isDir: true });
      }
    } else {
      const color = getColor(node, colorScheme);
      ctx.fillStyle = color;
      ctx.fillRect(rx, ry, rw, rh);

      ctx.strokeStyle = "rgba(0,0,0,0.4)";
      ctx.lineWidth = 0.5;
      ctx.strokeRect(rx + 0.5, ry + 0.5, rw - 1, rh - 1);

      if (rw > 8 && rh > 8) {
        const grad = ctx.createLinearGradient(rx, ry, rx, ry + rh * 0.6);
        grad.addColorStop(0, "rgba(255,255,255,0.12)");
        grad.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = grad;
        ctx.fillRect(rx, ry, rw, rh * 0.6);
      }

      if (rw > 40 && rh > 20) {
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.font = `${Math.min(10, rh * 0.35)}px Space Mono, monospace`;
        ctx.fillText(
          truncate(node.name, (rw - 6) / 5.5),
          rx + 3,
          ry + Math.min(12, rh * 0.55),
        );
        if (rh > 28 && rw > 50) {
          ctx.fillStyle = "rgba(255,255,255,0.45)";
          ctx.font = "7px Space Mono, monospace";
          ctx.fillText(
            formatSize(node.size),
            rx + 3,
            ry + Math.min(24, rh * 0.8),
          );
        }
      }

      rects.push({ node, x: rx, y: ry, w: rw, h: rh, isDir: false });
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
  const rect = canvas.getBoundingClientRect();
  const hit = findHit(e.clientX - rect.left, e.clientY - rect.top);
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
  const rect = canvas.getBoundingClientRect();
  const hit = findHit(e.clientX - rect.left, e.clientY - rect.top);
  if (hit && hit.isDir) {
    navStack.push(hit.node);
    currentNode = hit.node;
    trueRandomCache.clear();
    renderTreemap(currentNode);
    updateBreadcrumb();
    document.getElementById("pathBar").innerHTML =
      `<span>${hit.node.path || hit.node.name}</span>`;
  }
});

function findHit(mx, my) {
  let best = null,
    bestArea = Infinity;
  for (const r of rects) {
    if (mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h) {
      const area = r.w * r.h;
      if (area < bestArea) {
        bestArea = area;
        best = r.node;
      }
    }
  }
  return best;
}

function showTooltip(node, cx, cy) {
  document.getElementById("ttName").textContent = node.name;
  document.getElementById("ttSize").textContent =
    formatSize(node.size) +
    (node.size > 0 ? ` (${node.size.toLocaleString()} bytes)` : "");
  document.getElementById("ttPath").textContent =
    "\u{1F4C1} " + (node.path || node.name);

  if (node.isDir) {
    document.getElementById("ttType").textContent = "Directory";
    document.getElementById("ttMod").textContent = "\u2014";
    document.getElementById("ttPermRow").style.display = "none";
  } else {
    const ftype = getFileType(node.name);
    document.getElementById("ttType").textContent =
      (FILE_TYPES[ftype]?.label || "Unknown") +
      ` (.${node.name.split(".").pop()})`;
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
    const r = true,
      w = !node.name.startsWith(".") && node.size > 0,
      x = isExec;
    document.getElementById("ttPerms").textContent =
      `${r ? "r" : "-"}${w ? "w" : "-"}${x ? "x" : "-"} (inferred)`;
    document.getElementById("ttPermRow").style.display = "flex";
  }

  tooltip.style.display = "block";
  const tw = tooltip.offsetWidth,
    th = tooltip.offsetHeight;
  const vw = window.innerWidth,
    vh = window.innerHeight;
  let tx = cx + 16,
    ty = cy - 10;
  if (tx + tw > vw - 10) tx = cx - tw - 16;
  if (ty + th > vh - 10) ty = vh - th - 10;
  tooltip.style.left = tx + "px";
  tooltip.style.top = ty + "px";
}

// == BREADCRUMB & NAVIGATION ==
function updateBreadcrumb() {
  const bc = document.getElementById("breadcrumb");
  bc.innerHTML = "";
  for (let i = 0; i < navStack.length; i++) {
    const node = navStack[i];
    const item = document.createElement("div");
    item.className =
      "breadcrumb-item" + (i === navStack.length - 1 ? " current" : "");
    item.textContent =
      (i === 0 ? "\u2302 " : "  ".repeat(i) + "\u2514 ") + node.name;
    const idx = i;
    item.onclick = () => {
      navStack = navStack.slice(0, idx + 1);
      currentNode = navStack[navStack.length - 1];
      trueRandomCache.clear();
      renderTreemap(currentNode);
      updateBreadcrumb();
    };
    bc.appendChild(item);
  }
}

// == LEGEND ==
function updateLegend() {
  const leg = document.getElementById("legend");
  leg.innerHTML = "";

  const shuffleBtn = document.getElementById("shuffleBtn");

  if (colorScheme === "random") {
    // Show the shuffle button only in random mode
    if (shuffleBtn) shuffleBtn.style.display = "inline-block";

    const info = document.createElement("div");
    info.className = "legend-item";
    info.style.cssText =
      "color:var(--text-dim);font-size:0.6rem;line-height:1.5;";
    info.textContent =
      "Each file gets a random color. Click Shuffle to re-randomize.";
    leg.appendChild(info);
  } else {
    if (shuffleBtn) shuffleBtn.style.display = "none";

    if (colorScheme === "type") {
      for (const [, info] of Object.entries(FILE_TYPES)) {
        const item = document.createElement("div");
        item.className = "legend-item";
        item.innerHTML = `<div class="legend-swatch" style="background:${info.color}"></div>${info.label}`;
        leg.appendChild(item);
      }
      const other = document.createElement("div");
      other.className = "legend-item";
      other.innerHTML = `<div class="legend-swatch" style="background:#555577"></div>Other`;
      leg.appendChild(other);
    } else if (colorScheme === "age") {
      const ages = [
        ["< 3 months", "#00ffaa"],
        ["< 1 year", "#7ee8a2"],
        ["< 2 years", "#f59e0b"],
        ["< 5 years", "#f97316"],
        ["< 10 years", "#ef4444"],
        ["10+ years", "#7c3aed"],
      ];
      for (const [label, color] of ages) {
        const item = document.createElement("div");
        item.className = "legend-item";
        item.innerHTML = `<div class="legend-swatch" style="background:${color}"></div>${label}`;
        leg.appendChild(item);
      }
    } else if (colorScheme === "perms") {
      const permColors = {
        0: ["---", "#1a1a2e"],
        1: ["--x", "#7c3aed"],
        2: ["-w-", "#ef4444"],
        3: ["-wx", "#ec4899"],
        4: ["r--", "#22c55e"],
        5: ["r-x", "#06b6d4"],
        6: ["rw-", "#f59e0b"],
        7: ["rwx", "#00ffaa"],
      };
      for (const [, [label, color]] of Object.entries(permColors)) {
        const item = document.createElement("div");
        item.className = "legend-item";
        item.innerHTML = `<div class="legend-swatch" style="background:${color}"></div><code>${label}</code>`;
        leg.appendChild(item);
      }
    } else if (colorScheme === "entropy") {
      const item = document.createElement("div");
      item.className = "legend-item";
      item.style.cssText = "color:var(--text-dim);font-size:0.6rem;";
      item.textContent = "Colors derived from name entropy + size variance";
      leg.appendChild(item);
    }
  }
}

// == COLOR SCHEME SWITCHING ==
function setScheme(scheme) {
  colorScheme = scheme;
  document.querySelectorAll(".scheme-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.scheme === scheme);
  });
  // Always clear random cache when switching TO random so it draws fresh
  if (scheme === "random") trueRandomCache.clear();
  if (currentNode) renderTreemap(currentNode);
  updateLegend();
}

// == UTILS ==
function formatSize(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024,
    sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
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
