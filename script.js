const form = document.getElementById("builder-form");
const zipInput = document.getElementById("zip-input");
const countInput = document.getElementById("variant-count");
const statusEl = document.getElementById("status");
const resultsSection = document.getElementById("results");
const variantGrid = document.getElementById("variant-grid");
const resultTitle = document.getElementById("result-title");
const downloadAllBtn = document.getElementById("download-all");
const variantTemplate = document.getElementById("variant-card");

let latestVariants = [];
let latestImages = [];
let originalHtmlName = "template.html";

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const file = zipInput.files[0];
  const variantCount = Math.min(Math.max(parseInt(countInput.value, 10) || 1, 1), 10);

  if (!file) {
    statusEl.textContent = "Please choose a zip file.";
    return;
  }

  toggleBusy(true);
  statusEl.textContent = "Reading archive...";

  try {
    const { html, htmlFileName, images } = await extractArchive(file);
    originalHtmlName = htmlFileName;
    statusEl.textContent = "Building variants...";

    const variants = await buildVariants(html, images, variantCount);
    latestVariants = variants;
    latestImages = images;

    renderVariants(variants);
    resultTitle.textContent = `${variants.length} variant${variants.length === 1 ? "" : "s"}`;
    resultsSection.hidden = false;
    statusEl.textContent = "Done!";
  } catch (error) {
    console.error(error);
    statusEl.textContent = error.message || "Unable to process archive.";
  } finally {
    toggleBusy(false);
  }
});

downloadAllBtn.addEventListener("click", async () => {
  if (!latestVariants.length) return;
  downloadAllBtn.disabled = true;
  downloadAllBtn.textContent = "Preparing...";

  try {
    const bundle = await zipVariants(latestVariants, latestImages);
    triggerDownload(bundle, "email-variants.zip");
  } catch (error) {
    console.error(error);
    alert("Failed to prepare download.");
  } finally {
    downloadAllBtn.disabled = false;
    downloadAllBtn.textContent = "Download all as zip";
  }
});

async function extractArchive(file) {
  const archive = await JSZip.loadAsync(file);
  const htmlEntry = Object.values(archive.files).find((entry) => entry.name.toLowerCase().endsWith(".html"));

  if (!htmlEntry) {
    throw new Error("No HTML file found in the zip.");
  }

  const images = await Promise.all(
    Object.values(archive.files)
      .filter((entry) => entry.name.toLowerCase().startsWith("images/"))
      .map(async (entry) => {
        const data = await entry.async("uint8array");
        return { name: entry.name, data, uri: toDataUri(entry.name, data) };
      })
  );

  const html = await htmlEntry.async("string");
  return { html, htmlFileName: htmlEntry.name, images };
}

async function buildVariants(baseHtml, images, count) {
  const withInlineImages = inlineImages(baseHtml, images);
  const variants = [];

  for (let i = 0; i < count; i += 1) {
    const variantHtml = forgeVariant(withInlineImages, i);
    variants.push({
      name: deriveVariantName(originalHtmlName, i + 1),
      html: variantHtml,
    });
  }

  return variants;
}

function inlineImages(html, images) {
  if (!images.length) return html;

  const doc = new DOMParser().parseFromString(html, "text/html");
  const imgMap = new Map();

  images.forEach((img) => {
    imgMap.set(normalizePath(img.name), img.uri);
  });

  doc.querySelectorAll("img[src]").forEach((img, index) => {
    const normalized = normalizePath(img.getAttribute("src"));
    if (imgMap.has(normalized)) {
      img.setAttribute("src", imgMap.get(normalized));
    }
    if (!img.hasAttribute("alt")) {
      img.setAttribute("alt", `inline-graphic-${index + 1}`);
    }
  });

  return `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`;
}

function forgeVariant(html, seed) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const body = doc.body;

  stampDocumentMeta(doc, seed);
  wrapContent(body, seed);
  decorateText(body, seed);
  sprinkleNoise(body, seed);

  return `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`;
}

function stampDocumentMeta(doc, seed) {
  const meta = doc.createComment(`variant-${seed + 1}-${Date.now()}`);
  doc.documentElement.insertBefore(meta, doc.documentElement.firstChild);

  const viewport = doc.querySelector("meta[name='viewport']");
  if (!viewport) {
    const v = doc.createElement("meta");
    v.setAttribute("name", "viewport");
    v.setAttribute("content", "width=device-width, initial-scale=1.0");
    doc.head.appendChild(v);
  }
}

function wrapContent(body, seed) {
  const nodes = Array.from(body.childNodes);
  body.textContent = "";

  const outerShell = body.ownerDocument.createElement("table");
  outerShell.setAttribute("role", "presentation");
  outerShell.setAttribute("width", "100%");
  outerShell.style.borderCollapse = "collapse";
  const outerTbody = body.ownerDocument.createElement("tbody");
  const outerRow = body.ownerDocument.createElement("tr");
  const outerCell = body.ownerDocument.createElement("td");
  outerCell.style.padding = "12px";
  outerCell.style.backgroundColor = "#f8fafc";

  const fluidLayer = body.ownerDocument.createElement("div");
  fluidLayer.style.maxWidth = "720px";
  fluidLayer.style.margin = "0 auto";
  fluidLayer.style.backgroundColor = "#ffffff";
  fluidLayer.style.borderRadius = "8px";
  fluidLayer.style.boxShadow = "0 10px 40px rgba(0,0,0,0.05)";
  fluidLayer.style.overflow = "hidden";

  nodes.forEach((node, index) => {
    const containerType = (index + seed) % 3 === 0 ? "table" : "div";
    const container = createWrapper(body.ownerDocument, containerType, seed + index);
    container.appendChild(node.cloneNode(true));
    fluidLayer.appendChild(container);

    if (index < nodes.length - 1) {
      const spacer = body.ownerDocument.createElement("div");
      spacer.style.height = `${8 + ((index + seed) % 4) * 2}px`;
      spacer.style.lineHeight = "1";
      spacer.style.fontSize = "1px";
      spacer.textContent = "\u200b";
      spacer.setAttribute("data-noise", `s-${seed}-${index}`);
      fluidLayer.appendChild(spacer);
    }
  });

  outerCell.appendChild(fluidLayer);
  outerRow.appendChild(outerCell);
  outerTbody.appendChild(outerRow);
  outerShell.appendChild(outerTbody);
  body.appendChild(outerShell);
}

function createWrapper(doc, type, salt) {
  if (type === "table") {
    const table = doc.createElement("table");
    table.setAttribute("role", "presentation");
    table.setAttribute("width", "100%");
    table.style.borderCollapse = "collapse";
    table.style.msoTableLspace = "0pt";
    table.style.msoTableRspace = "0pt";
    table.setAttribute("data-variant", `tbl-${salt}`);

    const tbody = doc.createElement("tbody");
    const row = doc.createElement("tr");
    const cell = doc.createElement("td");
    cell.style.padding = `${6 + (salt % 3)}px ${10 + (salt % 4)}px`;
    cell.style.verticalAlign = "top";
    row.appendChild(cell);
    tbody.appendChild(row);
    table.appendChild(tbody);
    return table;
  }

  const div = doc.createElement("div");
  div.style.padding = `${10 + (salt % 5)}px ${12 + (salt % 6)}px`;
  div.style.borderRadius = `${6 + (salt % 4)}px`;
  div.style.border = "1px solid rgba(226, 232, 240, 0.8)";
  div.style.background = salt % 2 === 0 ? "#ffffff" : "linear-gradient(180deg, #fff, #f8fafc)";
  div.setAttribute("data-variant", `div-${salt}`);
  return div;
}

function decorateText(body, seed) {
  const doc = body.ownerDocument;
  const paragraphs = Array.from(body.querySelectorAll("p, li, td, span"));

  paragraphs.forEach((node, index) => {
    if ((index + seed) % 4 === 0) {
      const wrapper = doc.createElement("span");
      wrapper.style.display = "inline-block";
      wrapper.style.padding = "1px 2px";
      wrapper.style.color = index % 2 === 0 ? "inherit" : "#0f172a";
      wrapper.style.lineHeight = "1.5";
      wrapper.style.wordBreak = "break-word";
      wrapper.setAttribute("data-layer", `text-${seed}-${index}`);
      while (node.firstChild) {
        wrapper.appendChild(node.firstChild);
      }
      node.appendChild(wrapper);
    }
  });
}

function sprinkleNoise(body, seed) {
  const doc = body.ownerDocument;
  const inserts = [
    doc.createComment(`delivered-by-mailbuilder-${seed}`),
    invisibleGlyph(doc, seed),
    spacerTable(doc, seed),
  ];

  inserts.forEach((node) => {
    body.insertBefore(node, body.firstChild);
  });
}

function invisibleGlyph(doc, seed) {
  const span = doc.createElement("span");
  span.style.display = "block";
  span.style.height = "0";
  span.style.overflow = "hidden";
  span.style.fontSize = "1px";
  span.textContent = `\u200b${"\u200b".repeat((seed % 3) + 1)}`;
  span.setAttribute("aria-hidden", "true");
  span.setAttribute("data-noise", `glyph-${seed}`);
  return span;
}

function spacerTable(doc, seed) {
  const table = doc.createElement("table");
  table.setAttribute("role", "presentation");
  table.setAttribute("width", "100%");
  table.style.borderCollapse = "collapse";
  table.style.msoTableLspace = "0pt";
  table.style.msoTableRspace = "0pt";
  table.setAttribute("data-noise", `grid-${seed}`);

  const tbody = doc.createElement("tbody");
  const row = doc.createElement("tr");
  const cell = doc.createElement("td");
  cell.style.height = `${4 + (seed % 4)}px`;
  cell.style.lineHeight = cell.style.height;
  cell.textContent = "\u200b";

  row.appendChild(cell);
  tbody.appendChild(row);
  table.appendChild(tbody);
  return table;
}

function deriveVariantName(baseName, index) {
  const parts = baseName.split(".");
  const ext = parts.pop();
  const stem = parts.join(".") || "template";
  return `${stem}-variant-${index}.${ext || "html"}`;
}

function normalizePath(path) {
  return path.replace(/^\.\//, "").toLowerCase();
}

function toDataUri(name, data) {
  const mime = mimeFromName(name);
  const base64 = arrayBufferToBase64(data);
  return `data:${mime};base64,${base64}`;
}

function mimeFromName(name) {
  const lower = name.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}

function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function triggerDownload(blob, filename) {
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(href);
}

async function zipVariants(variants, images) {
  const zip = new JSZip();

  variants.forEach((variant) => {
    zip.file(variant.name, variant.html);
  });

  const folder = zip.folder("images");
  images.forEach((img) => {
    folder.file(img.name.replace(/^images\//i, ""), img.data);
  });

  return zip.generateAsync({ type: "blob" });
}

function renderVariants(variants) {
  variantGrid.innerHTML = "";

  variants.forEach((variant, index) => {
    const node = variantTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector(".card__title").textContent = variant.name;
    const iframe = node.querySelector("iframe");
    iframe.srcdoc = variant.html;
    node.querySelector("code").textContent = variant.html;

    node.querySelector(".download-one").addEventListener("click", async () => {
      const zip = await zipVariants([variant], latestImages);
      triggerDownload(zip, `${variant.name.replace(/\.html?$/i, "")}.zip`);
    });

    node.querySelector(".copy-one").addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(variant.html);
        node.querySelector(".copy-one").textContent = "Copied!";
        setTimeout(() => {
          node.querySelector(".copy-one").textContent = "Copy HTML";
        }, 1600);
      } catch (err) {
        console.error(err);
        alert("Clipboard is unavailable.");
      }
    });

    node.dataset.index = index;
    variantGrid.appendChild(node);
  });
}

function toggleBusy(isBusy) {
  const btn = document.getElementById("generate-btn");
  btn.disabled = isBusy;
  if (isBusy) {
    btn.textContent = "Working...";
  } else {
    btn.textContent = "Generate variants";
  }
}
