// =============================================================================
// FileScan Treemap Visualizer
// Renders a squarified treemap of a user-selected directory tree.
// =============================================================================

// =============================================================================
// SECTION 1: GLOBAL STATE
// Tracks the current directory tree, navigation stack, and display settings.
// =============================================================================

let rootNode = null; // root of the parsed directory tree
let currentNode = null; // the node currently being displayed (can be a sub-dir)
let navStack = []; // breadcrumb history — array of ancestor nodes
let colorScheme = "random";
let rects = []; // flat list of drawn rects for hit-testing on hover
let allFiles = [];
let totalFiles = 0,
  totalDirs = 0,
  totalSize = 0,
  largestSize = 0;

// =============================================================================
// SECTION 2: FILE TYPE CLASSIFICATION
// Maps file extensions to categories used by the "File Type" color scheme.
// =============================================================================

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

// Returns the type key ('image', 'audio', etc.) for a given filename.
function getFileType(filename) {
  const ext = (filename.split(".").pop() || "").toLowerCase();
  for (const [type, info] of Object.entries(FILE_TYPES)) {
    if (info.exts.includes(ext)) return type;
  }
  return "other";
}

// =============================================================================
// SECTION 3: COLOR SCHEMES
// Five ways to assign colors to file rectangles.
// =============================================================================

// A hand-picked palette of muted, visually distinct colors.
// Used by both the "Random" and "Entropy" schemes so colors are never neon.
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

// Cache so each file keeps the same random color within one render session.
// Cleared by shuffleRandomColors() to produce a fresh set.
let trueRandomCache = new Map();

// RANDOM: picks a random palette entry for each file path and caches it.
// Calling shuffleRandomColors() clears the cache and re-renders.
function getTrueRandomColor(path) {
  if (trueRandomCache.has(path)) return trueRandomCache.get(path);
  const color = MUTED_PALETTE[Math.floor(Math.random() * MUTED_PALETTE.length)];
  trueRandomCache.set(path, color);
  return color;
}

function shuffleRandomColors() {
  trueRandomCache.clear(); // clear cache so next render picks new colors
  if (currentNode) renderTreemap(currentNode);
}

// FILE TYPE: returns the pre-defined color for the file's category.
function getTypeColor(fn) {
  return FILE_TYPES[getFileType(fn)]?.color || "#555577";
}

// AGE: maps last-modified date to a green→red→purple gradient.
// Bright green = very recent; purple = 10+ years old.
function getAgeColor(lastModified) {
  if (!lastModified) return "#444466";
  const age = Date.now() - lastModified;
  const yr = 365.25 * 24 * 3600 * 1000;
  if (age < yr * 0.25) return "#2ecc71"; // < 3 months
  if (age < yr) return "#27ae60"; // < 1 year
  if (age < yr * 2) return "#f39c12"; // < 2 years
  if (age < yr * 5) return "#e67e22"; // < 5 years
  if (age < yr * 10) return "#c0392b"; // < 10 years
  return "#6c3483"; // 10+ years
}

// PERMISSIONS: infers r/w/x from filename heuristics (browser has no real perms API).
// Produces one of 8 distinct colors — one per combination of read/write/execute bits.
function getPermColor(node) {
  const isExec = ["exe", "bin", "sh", "bat", "cmd", "app"].includes(
    (node.name.split(".").pop() || "").toLowerCase(),
  );
  const r = true; // all readable files
  const w = !node.name.startsWith(".") && node.size > 0; // writable if not hidden & non-empty
  const x = isExec; // executable if known exec extension
  // Encode the 3 bits as a number 0-7 and map to a color
  const combo = (r ? 4 : 0) + (w ? 2 : 0) + (x ? 1 : 0);
  const MAP = {
    0: "#1a1a2e", // --- (no permissions)
    1: "#6c3aed", // --x
    2: "#c0392b", // -w-
    3: "#a93226", // -wx
    4: "#1e8449", // r--
    5: "#1a7a8a", // r-x
    6: "#b7770d", // rw-
    7: "#27ae60", // rwx (full permissions)
  };
  return MAP[combo];
}

// ENTROPY: deterministic color derived from the file's name and size.
// Files with similar names/sizes get similar hues; very different ones diverge.
function getEntropyColor(node) {
  const nameHash = node.name.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const idx =
    Math.abs(Math.round(nameHash * Math.log1p(node.size))) %
    MUTED_PALETTE.length;
  return MUTED_PALETTE[idx];
}

// Master color dispatcher — routes to the active scheme.
function getColor(node, scheme) {
  if (node.isDir) return null; // directories have no fill color
  if (node._isBucket) return "#2a2a3e"; // grouped "N more files" bucket
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

// =============================================================================
// SECTION 4: DIRECTORY LOADING & TREE CONSTRUCTION
//
// REQUIREMENT 1 — File size:
//   Each file node stores `size = file.size` (bytes), read from the browser's
//   File API. This is the exact byte count reported by the OS. Zero-byte files
//   get a minimum size of 1 so they still appear as a tiny sliver.
//
// REQUIREMENT 2 — Directory size:
//   computeTreeSizes() recursively sums the sizes of all children.
//   A directory's size = sum of all descendant file sizes (not its own disk
//   overhead). This makes each directory's rectangle area proportional to
//   the total bytes it contains.
//
// REQUIREMENT 5 — Change root at runtime:
//   The user can click "Open Directory" at any time to load a new directory.
//   loadDirectory() resets all state (rootNode, currentNode, navStack) and
//   re-renders from scratch. Double-clicking any sub-directory in the treemap
//   also changes currentNode, effectively re-rooting the view at that folder.
// =============================================================================

function loadDirectory(input) {
  const files = Array.from(input.files);
  if (!files.length) return;

  setStatus(
    "loading",
    "Processing " + files.length.toLocaleString() + " files...",
  );
  showProgress(10);

  // Use setTimeout so the browser repaints the progress bar before heavy work
  setTimeout(() => {
    // Reset all counters for the new directory
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
    showProgress(80);
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

// Parses the flat File list into a nested tree of directory/file nodes.
// Each node: { name, path, isDir, children, size, realSize, lastModified }
function buildTree(files) {
  const root = { name: "root", path: "", isDir: true, children: {}, size: 0 };

  for (const file of files) {
    // webkitRelativePath gives the full relative path, e.g. "myFolder/sub/file.txt"
    const parts = file.webkitRelativePath
      ? file.webkitRelativePath.split("/")
      : [file.name];

    if (parts.length > 1) root.name = parts[0]; // set root name to chosen folder

    // Walk / create intermediate directory nodes
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

    // Create the leaf file node.
    // REQUIREMENT 1: size comes directly from file.size (bytes from the File API).
    // We store realSize for display and use size (min 1) for layout math.
    const fname = parts[parts.length - 1];
    node.children[fname] = {
      name: fname,
      path: file.webkitRelativePath || fname,
      isDir: false,
      size: Math.max(file.size, 1), // layout size (min 1 to keep visible)
      realSize: file.size, // true byte count shown in tooltip
      lastModified: file.lastModified,
      type: file.type,
      children: {},
    };
    totalFiles++;
  }

  // REQUIREMENT 2: recursively compute directory sizes bottom-up
  computeTreeSizes(root);
  return root;
}

// REQUIREMENT 2 — Directory size computation:
// Recursively sums children. A directory's size equals the total of all
// files it contains at any depth, so its rectangle area reflects its
// share of total disk usage.
function computeTreeSizes(node) {
  if (!node.isDir) return node.size; // base case: file returns its own size
  let total = 0;
  for (const child of Object.values(node.children)) {
    total += computeTreeSizes(child); // recurse into each child
  }
  node.size = Math.max(total, 1); // min 1 so empty dirs still render
  return node.size;
}

// Walks the final tree to tally stats shown in the sidebar.
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

// =============================================================================
// SECTION 5: SMART BUCKETING
// When a directory has many tiny children that would render as hairline slivers
// (e.g. hundreds of same-sized MP3s), we group them into one "N more items"
// placeholder. This prevents the spiral-sliver anti-pattern.
// =============================================================================

function prepareChildren(nodes, availW, availH) {
  if (!nodes.length) return [];
  const area = availW * availH;
  const total = nodes.reduce((s, n) => s + n.size, 0);
  if (total === 0) return [];

  // Any item whose rectangle would be smaller than 6×6 px gets bucketed
  const MIN_CELL_AREA = 36;

  const sorted = [...nodes].sort((a, b) => b.size - a.size);
  const keep = [];
  const bucket = [];

  for (const n of sorted) {
    const cellArea = area * (n.size / total);
    // Always keep the first 2 items so the layout is never empty
    if (cellArea >= MIN_CELL_AREA || keep.length < 2) {
      keep.push(n);
    } else {
      bucket.push(n);
    }
  }

  // Merge all bucketed items into one synthetic node
  if (bucket.length > 1) {
    const bucketSize = bucket.reduce((s, n) => s + n.size, 0);
    keep.push({
      name: bucket.length + " more items",
      path: "__bucket__",
      isDir: false,
      _isBucket: true,
      _bucketItems: bucket,
      size: bucketSize,
      realSize: bucketSize,
      children: {},
    });
  } else if (bucket.length === 1) {
    keep.push(bucket[0]); // only one small item — just show it
  }

  return keep;
}

// =============================================================================
// SECTION 6: SQUARIFIED TREEMAP LAYOUT
//
// REQUIREMENT 3 — Rectangle dimensions:
//   Each rectangle's area is proportional to its node's size relative to the
//   total size of all siblings. Given a container of width W and height H:
//     - A strip of items is allocated W * (stripSum / total) wide (or H * frac tall).
//     - Within the strip, each item gets cellH = H * (item.size / stripSum).
//   This guarantees that area(rect) / area(container) = item.size / total.
//
// REQUIREMENT 4 — Alternating horizontal and vertical:
//   squarifyFill() checks whether the remaining rectangle is wider or taller:
//     if (w >= h)  → place items as a VERTICAL COLUMN on the left (cells stack top-to-bottom)
//     else         → place items as a HORIZONTAL ROW on the top  (cells stack left-to-right)
//   After placing one strip, recursion continues on the remaining rectangle,
//   which often has the opposite orientation — so strips naturally alternate.
// =============================================================================

// Entry point: filters, sorts, then delegates to the recursive filler.
function treemapLayout(nodes, x, y, w, h) {
  const items = nodes.filter((n) => n.size > 0).sort((a, b) => b.size - a.size);
  if (!items.length || w <= 0 || h <= 0) return [];
  const total = items.reduce((s, n) => s + n.size, 0);
  const out = [];
  squarifyFill(items, total, x, y, w, h, out);
  return out;
}

// Recursive squarified layout — always fills the full rectangle.
// 1. Find the best "row" (subset) of items that minimises worst aspect ratio.
// 2. Place them as a strip along the short side.
// 3. Recurse on the leftover rectangle with the remaining items.
function squarifyFill(items, total, x, y, w, h, out) {
  if (!items.length || w < 0.5 || h < 0.5) return;

  // Base case: one item gets the entire remaining rectangle
  if (items.length === 1) {
    out.push({ node: items[0], x, y, w, h });
    return;
  }

  const row = bestRow(items, total, w, h);
  const rowSum = row.reduce((s, n) => s + n.size, 0);
  const frac = rowSum / total; // fraction of the container this strip occupies

  // REQUIREMENT 4 — Orientation decision:
  // If the rectangle is WIDER than tall → place a vertical column strip on the LEFT.
  // If the rectangle is TALLER than wide → place a horizontal row strip on the TOP.
  if (w >= h) {
    // --- VERTICAL COLUMN (items stacked top-to-bottom) ---
    const colW = w * frac; // strip width proportional to its share of total size
    let cy = y;
    for (const n of row) {
      // REQUIREMENT 3: each cell's height = H * (item.size / stripSum)
      const cellH = h * (n.size / rowSum);
      out.push({ node: n, x, y: cy, w: colW, h: cellH });
      cy += cellH;
    }
    // Recurse on the right remainder — it is taller-than-wide, so next iteration
    // will place a horizontal row, naturally alternating orientation.
    const rem = items.slice(row.length);
    if (rem.length) {
      const remTotal = rem.reduce((s, n) => s + n.size, 0);
      squarifyFill(rem, remTotal, x + colW, y, w - colW, h, out);
    }
  } else {
    // --- HORIZONTAL ROW (items stacked left-to-right) ---
    const rowH = h * frac; // strip height proportional to its share of total size
    let cx = x;
    for (const n of row) {
      // REQUIREMENT 3: each cell's width = W * (item.size / stripSum)
      const cellW = w * (n.size / rowSum);
      out.push({ node: n, x: cx, y, w: cellW, h: rowH });
      cx += cellW;
    }
    // Recurse on the bottom remainder — it is wider-than-tall, so next iteration
    // will place a vertical column, naturally alternating orientation.
    const rem = items.slice(row.length);
    if (rem.length) {
      const remTotal = rem.reduce((s, n) => s + n.size, 0);
      squarifyFill(rem, remTotal, x, y + rowH, w, h - rowH, out);
    }
  }
}

// Greedily finds the subset of items that minimises the worst aspect ratio
// in the current strip. Stops adding items when aspect ratio starts to worsen.
function bestRow(items, total, w, h) {
  let row = [items[0]];
  let rowSum = items[0].size;
  for (let i = 1; i < items.length; i++) {
    const candidate = items[i];
    const newRow = [...row, candidate];
    const newSum = rowSum + candidate.size;
    if (
      worstAspect(newRow, newSum, total, w, h) <=
      worstAspect(row, rowSum, total, w, h)
    ) {
      row = newRow;
      rowSum = newSum;
    } else {
      break; // adding this item would increase the worst ratio — stop here
    }
  }
  return row;
}

// Computes the worst (most extreme) aspect ratio among cells in a candidate row.
// Aspect ratio = max(w/h, h/w) — 1.0 is a perfect square; higher is worse.
function worstAspect(row, rowSum, total, w, h) {
  if (!rowSum) return Infinity;
  const frac = rowSum / total;
  const stripW = w >= h ? w * frac : w;
  const stripH = w >= h ? h : h * frac;
  let worst = 0;
  for (const n of row) {
    const f = n.size / rowSum;
    const cellW = w >= h ? stripW * f : stripW;
    const cellH = w >= h ? stripH : stripH * f;
    if (cellW <= 0 || cellH <= 0) continue;
    const ratio = Math.max(cellW / cellH, cellH / cellW);
    if (ratio > worst) worst = ratio;
  }
  return worst;
}

// =============================================================================
// SECTION 7: CANVAS RENDERING
//
// REQUIREMENT 6 — Window resize:
//   renderTreemap() re-reads canvas.parentElement.clientWidth/Height every time
//   it is called. A debounced 'resize' listener at the bottom of this file calls
//   renderTreemap() whenever the window changes size, so the treemap always fills
//   the available space exactly.
// =============================================================================

const canvas = document.getElementById("treemap");
const ctx = canvas.getContext("2d");

// Top-level render: resizes the canvas to match its container, then draws.
function renderTreemap(node) {
  const wrap = canvas.parentElement;

  // REQUIREMENT 6: canvas dimensions always match the container pixel size
  canvas.width = wrap.clientWidth;
  canvas.height = wrap.clientHeight;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  rects = [];
  if (!node) return;

  const PAD = 3; // outer padding so rects don't touch the canvas edge
  const children = Object.values(node.children).filter((c) => c.size > 0);
  drawLevel(
    children,
    PAD,
    PAD,
    canvas.width - PAD * 2,
    canvas.height - PAD * 2,
    0,
  );
}

// Recursively lays out and draws one level of the tree.
// `depth` tracks nesting level to adjust gap sizes.
function drawLevel(children, x, y, w, h, depth) {
  if (!children.length || w < 2 || h < 2) return;

  const GAP = depth === 0 ? 2 : 1; // outer level has slightly larger gaps

  // Bucket tiny items to avoid sliver spirals
  const prepared = prepareChildren(children, w, h);
  const laid = treemapLayout(prepared, x, y, w, h);

  for (const { node, x: rx, y: ry, w: rw, h: rh } of laid) {
    // Shrink each rect by GAP to create visible spacing between cells
    const gx = rx + GAP * 0.5;
    const gy = ry + GAP * 0.5;
    const gw = rw - GAP;
    const gh = rh - GAP;
    if (gw < 1 || gh < 1) continue;

    if (node._isBucket) {
      // ── BUCKET (grouped small files) ──
      ctx.fillStyle = "#2a2a3e";
      ctx.fillRect(gx, gy, gw, gh);
      ctx.strokeStyle = "rgba(255,255,255,0.1)";
      ctx.lineWidth = 0.5;
      ctx.strokeRect(gx + 0.5, gy + 0.5, gw - 1, gh - 1);
      if (gw > 30 && gh > 12) {
        ctx.fillStyle = "rgba(255,255,255,0.45)";
        ctx.font = "7px Space Mono,monospace";
        ctx.fillText(
          truncate(node.name, Math.floor((gw - 6) / 4.5)),
          gx + 3,
          gy + gh * 0.5 + 3,
        );
      }
      rects.push({ node, x: gx, y: gy, w: gw, h: gh, isDir: false });
    } else if (node.isDir) {
      // ── DIRECTORY ──
      const kids = Object.values(node.children).filter((c) => c.size > 0);

      ctx.fillStyle = "rgba(20,20,35,0.9)";
      ctx.fillRect(gx, gy, gw, gh);
      ctx.strokeStyle = "rgba(255,255,255,0.14)";
      ctx.lineWidth = 1;
      ctx.strokeRect(gx + 0.5, gy + 0.5, gw - 1, gh - 1);

      // Header bar with directory name
      const HBAR = gh > 20 && gw > 40 ? 15 : 0;
      if (HBAR) {
        ctx.fillStyle = "rgba(255,255,255,0.08)";
        ctx.fillRect(gx, gy, gw, HBAR);
        ctx.fillStyle = "rgba(255,255,255,0.72)";
        ctx.font = "bold 8px Space Mono,monospace";
        ctx.fillText(
          truncate(node.name, Math.floor((gw - 8) / 5.2)),
          gx + 4,
          gy + 10,
        );
      }

      // Recurse into children
      if (kids.length && gw > 8 && gh - HBAR > 8) {
        drawLevel(
          kids,
          gx + 1,
          gy + HBAR + 1,
          gw - 2,
          gh - HBAR - 2,
          depth + 1,
        );
      } else if (!kids.length && gw > 30 && gh > 14) {
        ctx.fillStyle = "rgba(255,255,255,0.18)";
        ctx.font = "7px Space Mono,monospace";
        ctx.fillText("(empty)", gx + 4, gy + gh * 0.5 + 3);
      }
      rects.push({ node, x: gx, y: gy, w: gw, h: gh, isDir: true });
    } else {
      // ── FILE ──
      const color = getColor(node, colorScheme);
      ctx.fillStyle = color;
      ctx.fillRect(gx, gy, gw, gh);

      // Thin dark border to separate adjacent same-colored rects
      ctx.strokeStyle = "rgba(0,0,0,0.28)";
      ctx.lineWidth = 0.5;
      ctx.strokeRect(gx + 0.5, gy + 0.5, gw - 1, gh - 1);

      // Subtle top sheen for depth
      if (gw > 6 && gh > 6) {
        const gr = ctx.createLinearGradient(gx, gy, gx, gy + gh * 0.5);
        gr.addColorStop(0, "rgba(255,255,255,0.16)");
        gr.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = gr;
        ctx.fillRect(gx, gy, gw, gh * 0.5);
      }

      // Filename and size label (only when the rect is large enough to read)
      if (gw > 25 && gh > 11) {
        const fs = Math.min(10, Math.max(7, gh * 0.25));
        const lh = fs + 5;
        ctx.fillStyle = "rgba(0,0,0,0.42)";
        ctx.fillRect(gx, gy, gw, lh);
        ctx.fillStyle = "rgba(255,255,255,0.93)";
        ctx.font = fs + "px Space Mono,monospace";
        ctx.fillText(
          truncate(node.name, Math.floor((gw - 5) / (fs * 0.61))),
          gx + 3,
          gy + lh - 3,
        );
        if (gh > lh + 11 && gw > 38) {
          ctx.fillStyle = "rgba(255,255,255,0.45)";
          ctx.font = "7px Space Mono,monospace";
          ctx.fillText(
            formatSize(node.realSize ?? node.size),
            gx + 3,
            gy + lh + 9,
          );
        }
      }
      rects.push({ node, x: gx, y: gy, w: gw, h: gh, isDir: false });
    }
  }
}

// Truncates a string with an ellipsis if it exceeds maxLen characters.
function truncate(str, maxLen) {
  maxLen = Math.max(3, Math.floor(maxLen));
  return str.length <= maxLen ? str : str.slice(0, maxLen - 1) + "\u2026";
}

// =============================================================================
// SECTION 8: TOOLTIP & MOUSE INTERACTION
//
// REQUIREMENT 7 — Tooltips:
//   On mousemove, findHit() searches the rects array for the smallest rect
//   under the cursor (deepest/most specific node). showTooltip() then populates
//   the #tooltip div with: file name, size (human-readable + raw bytes),
//   file type, last-modified date, and inferred permissions.
//   The tooltip is repositioned to avoid going off-screen.
// =============================================================================

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

// Double-click a directory to zoom into it (changes currentNode = new root)
canvas.addEventListener("dblclick", (e) => {
  const r = canvas.getBoundingClientRect();
  const hit = findHit(e.clientX - r.left, e.clientY - r.top);
  if (hit && hit.isDir) {
    // REQUIREMENT 5: change the displayed root to the clicked sub-directory
    navStack.push(hit.node);
    currentNode = hit.node;
    trueRandomCache.clear();
    renderTreemap(currentNode);
    updateBreadcrumb();
    document.getElementById("pathBar").innerHTML =
      "<span>" + (hit.node.path || hit.node.name) + "</span>";
  }
});

// Finds the smallest (i.e. most specific / deepest) rect under (mx, my).
function findHit(mx, my) {
  let best = null;
  let bestArea = Infinity;
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

// REQUIREMENT 7 — Populates and positions the tooltip.
// Shows: name, size (human + bytes), file type, last-modified, permissions.
function showTooltip(node, cx, cy) {
  // Name — show a hint for bucket nodes
  document.getElementById("ttName").textContent = node._isBucket
    ? node.name + " \u2014 double-click a dir to drill in"
    : node.name;

  // Size — show both human-readable (e.g. "1.4 MB") and exact bytes
  const sz = node.realSize ?? node.size;
  document.getElementById("ttSize").textContent =
    formatSize(sz) + (sz > 0 ? " (" + sz.toLocaleString() + " bytes)" : "");

  // Relative path
  document.getElementById("ttPath").textContent =
    "\uD83D\uDCC1 " + (node.path || node.name);

  if (node.isDir || node._isBucket) {
    document.getElementById("ttType").textContent = node._isBucket
      ? "Grouped small files"
      : "Directory";
    document.getElementById("ttMod").textContent = "\u2014";
    document.getElementById("ttPermRow").style.display = "none";
  } else {
    // File type from extension
    const ft = getFileType(node.name);
    document.getElementById("ttType").textContent =
      (FILE_TYPES[ft]?.label || "Unknown") +
      " (." +
      node.name.split(".").pop() +
      ")";

    // Last modified date
    document.getElementById("ttMod").textContent = node.lastModified
      ? new Date(node.lastModified).toLocaleDateString("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
        })
      : "\u2014";

    // Inferred permissions (r/w/x)
    const isExec = ["exe", "bin", "sh", "bat", "cmd", "app"].includes(
      (node.name.split(".").pop() || "").toLowerCase(),
    );
    const canWrite = !node.name.startsWith(".") && sz > 0;
    document.getElementById("ttPerms").textContent =
      "r" + (canWrite ? "w" : "-") + (isExec ? "x" : "-") + " (inferred)";
    document.getElementById("ttPermRow").style.display = "flex";
  }

  // Position tooltip — flip to the left/up if it would overflow the viewport
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

// =============================================================================
// SECTION 9: NAVIGATION — BREADCRUMB & ROOT SWITCHING
//
// REQUIREMENT 5 (continued):
//   The breadcrumb panel shows the path from the original root down to
//   currentNode. Clicking any breadcrumb item re-roots the view at that level.
//   "Open Directory" in the header always resets to a brand-new tree.
// =============================================================================

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
      // Navigate back up to the clicked ancestor
      navStack = navStack.slice(0, i + 1);
      currentNode = navStack[navStack.length - 1];
      trueRandomCache.clear();
      renderTreemap(currentNode);
      updateBreadcrumb();
    };
    bc.appendChild(item);
  });
}

// =============================================================================
// SECTION 10: LEGEND & COLOR SCHEME UI
// =============================================================================

function updateLegend() {
  const leg = document.getElementById("legend");
  leg.innerHTML = "";
  const sb = document.getElementById("shuffleBtn");

  if (colorScheme === "random") {
    if (sb) sb.style.display = "inline-block";

    // Show a mini swatch preview of the palette
    const swatchRow = document.createElement("div");
    swatchRow.style.cssText =
      "display:flex;flex-wrap:wrap;gap:3px;margin-bottom:8px;";
    MUTED_PALETTE.slice(0, 15).forEach((c) => {
      const d = document.createElement("div");
      d.style.cssText =
        "width:12px;height:12px;border-radius:2px;background:" + c;
      swatchRow.appendChild(d);
    });
    leg.appendChild(swatchRow);

    const info = document.createElement("div");
    info.style.cssText =
      "color:var(--text-dim);font-size:0.6rem;line-height:1.5;";
    info.textContent =
      "Random muted color per file. Click Shuffle to re-randomize.";
    leg.appendChild(info);
  } else {
    if (sb) sb.style.display = "none";

    if (colorScheme === "type") {
      // One row per file category
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
      // All 8 r/w/x combinations
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
          '"></div>' +
          "<code>" +
          label +
          "</code>";
        leg.appendChild(item);
      });
    } else {
      // Entropy
      const info = document.createElement("div");
      info.style.cssText = "color:var(--text-dim);font-size:0.6rem;";
      info.textContent = "Colors derived from filename hash \xd7 log(size).";
      leg.appendChild(info);
    }
  }
}

// Called by the color-scheme buttons in the toolbar.
function setScheme(scheme) {
  colorScheme = scheme;
  document.querySelectorAll(".scheme-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.scheme === scheme);
  });
  if (scheme === "random") trueRandomCache.clear(); // fresh colors on every switch
  if (currentNode) renderTreemap(currentNode);
  updateLegend();
}

// =============================================================================
// SECTION 11: UTILITY FUNCTIONS
// =============================================================================

// Converts raw byte count to a human-readable string (KB, MB, GB …).
function formatSize(bytes) {
  if (!bytes || bytes <= 0) return "0 B";
  const k = 1024;
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + units[i];
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

// =============================================================================
// SECTION 12: RESPONSIVE RESIZE
//
// REQUIREMENT 6 — Resize handling:
//   Whenever the window is resized, renderTreemap() is called after a short
//   debounce delay. It re-reads the container dimensions and redraws the entire
//   treemap at the new size — every rectangle scales correctly because all
//   dimensions are computed as fractions of the available canvas area.
// =============================================================================

let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (currentNode) renderTreemap(currentNode);
  }, 100); // 100ms debounce — avoids redraws on every pixel of drag
});
