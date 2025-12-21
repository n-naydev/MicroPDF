// app.js
import * as pdfjsLib from "./libs/pdf.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc = "./libs/pdf.worker.mjs";
const { PDFDocument, rgb, StandardFonts } = window.PDFLib;

// --- STATE ---
let currentTool = "select"; // 'select', 'field', 'text', 'signature'
let pdfDoc = null;
let currentPdfBytes = null;
let scale = 1.5;
let activePageViewport = null;
// Defaults
let textSettings = { size: 14, color: "#000000" };
let sigSettings = { width: 2, color: "#000000" };

// --- TOOLBAR LOGIC ---
document.getElementById("tool-select").onclick = () => setTool("select");
document.getElementById("tool-field").onclick = () => setTool("field");
document.getElementById("tool-text").onclick = () => setTool("text");
document.getElementById("tool-signature").onclick = () => setTool("signature");

function setTool(tool) {
  currentTool = tool;
  document
    .querySelectorAll(".tool-btn")
    .forEach((b) => b.classList.remove("active"));
  document.getElementById(`tool-${tool}`).classList.add("active");

  const sub = document.getElementById("sub-toolbar");
  sub.innerHTML = "";

  // Hide sub-toolbar for Field AND Select tools
  if (tool === "field" || tool === "select") {
    // HIDE the toolbar entirely for Fields (Clean look)
    sub.style.display = "none";
  } else if (tool === "text") {
    sub.style.display = "flex";
    sub.innerHTML = `
        <div class="tool-option" title="Font Size">
            <i class="fa-solid fa-text-height"></i>
            <input type="number" id="opt-font-size" value="${textSettings.size}" min="8" max="72">
        </div>
        <div class="tool-option" title="Text Color">
            <i class="fa-solid fa-palette"></i>
            <input type="color" id="opt-text-color" value="${textSettings.color}">
        </div>
    `;
    // Listeners
    document.getElementById("opt-font-size").onchange = (e) =>
      (textSettings.size = parseInt(e.target.value));
    document.getElementById("opt-text-color").oninput = (e) =>
      (textSettings.color = e.target.value);
  } else if (tool === "signature") {
    sub.style.display = "flex";
    sub.innerHTML = `
        <div class="tool-option" title="Stroke Thickness">
            <i class="fa-solid fa-pen-nib"></i>
            <input type="range" id="opt-sig-width" min="1" max="10" value="${sigSettings.width}">
        </div>
        <div class="tool-option" title="Stroke Color">
            <i class="fa-solid fa-palette"></i>
            <input type="color" id="opt-sig-color" value="${sigSettings.color}">
        </div>
    `;
    // Listeners
    document.getElementById("opt-sig-width").oninput = (e) =>
      (sigSettings.width = parseInt(e.target.value));
    document.getElementById("opt-sig-color").oninput = (e) =>
      (sigSettings.color = e.target.value);
  }
}

// Initialize default view
setTool("field");

// --- INITIALIZATION (Standard) ---
const urlParams = new URLSearchParams(window.location.search);
const pdfUrl = urlParams.get("file");

// ... (Imports and State stay the same) ...

// --- REPLACED: Initialization ---
if (pdfUrl) {
  const loadingTask = pdfjsLib.getDocument(pdfUrl);
  loadingTask.promise.then(async (pdf) => {
    pdfDoc = pdf;
    currentPdfBytes = await fetch(pdfUrl).then((res) => res.arrayBuffer());

    // Loop through ALL pages
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      await renderOnePage(pageNum);
    }

    // After rendering all pages, load existing form fields (if any)
    if (!window.fieldsLoaded) {
      loadExistingFields();
      window.fieldsLoaded = true;
    }
  });
}

// --- REPLACED: Render Logic ---
async function renderOnePage(num) {
  const page = await pdfDoc.getPage(num);
  const viewport = page.getViewport({ scale: scale });

  // 1. Create the Page Container
  const wrapper = document.getElementById("pdf-wrapper");
  const pageContainer = document.createElement("div");
  pageContainer.className = "page-container";
  pageContainer.dataset.pageNumber = num; // Store page number for saving later!

  // 2. Create Canvas
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d");

  // 3. Create Overlay (Drawing Layer)
  const overlay = document.createElement("div");
  overlay.className = "drawing-layer";
  overlay.style.width = viewport.width + "px";
  overlay.style.height = viewport.height + "px";

  // 4. Assemble
  pageContainer.appendChild(canvas);
  pageContainer.appendChild(overlay);
  wrapper.appendChild(pageContainer);

  // 5. Render PDF
  await page.render({ canvasContext: ctx, viewport: viewport }).promise;

  // 6. Setup Interaction for THIS specific page
  // We pass the 'overlay' element directly so the function knows where to attach listeners
  setupInteractionLayer(overlay, viewport);
}

function renderPage(num) {
  pdfDoc.getPage(num).then((page) => {
    const canvas = document.getElementById("pdf-canvas");
    const ctx = canvas.getContext("2d");
    activePageViewport = page.getViewport({ scale: scale });
    canvas.height = activePageViewport.height;
    canvas.width = activePageViewport.width;
    page.render({ canvasContext: ctx, viewport: activePageViewport });
    setupInteractionLayer(activePageViewport.width, activePageViewport.height);
  });
}

// --- INTERACTION LAYER (Click-to-Place Version) ---
function setupInteractionLayer(overlay, viewport) {
  // We don't look up by ID anymore. We use the 'overlay' passed to us.

  const defaultSizes = {
    field: { w: 200, h: 30 },
    text: { w: 200, h: 30 },
    signature: { w: 250, h: 120 },
  };

  overlay.addEventListener("mousedown", (e) => {
    // 1. Only trigger if clicking blank space (not an existing box)
    if (e.target !== overlay) return;

    if (currentTool === "select") {
      // 1. Clear previous selection unless Shift is held
      if (!e.shiftKey) deselectAll();

      // 2. Create the visual marquee box
      const marquee = document.createElement("div");
      marquee.className = "selection-marquee";
      overlay.appendChild(marquee);

      const startX = e.offsetX;
      const startY = e.offsetY;

      // 3. Define Mouse Move (Resize Marquee)
      const onMarqueeMove = (ev) => {
        // Robust coordinate calculation relative to the overlay
        const rect = overlay.getBoundingClientRect();
        const currentX = ev.clientX - rect.left;
        const currentY = ev.clientY - rect.top;

        // Calculate Width/Height/Top/Left (Handling negative drag directions)
        const width = Math.abs(currentX - startX);
        const height = Math.abs(currentY - startY);
        const left = Math.min(currentX, startX);
        const top = Math.min(currentY, startY);

        marquee.style.width = width + "px";
        marquee.style.height = height + "px";
        marquee.style.left = left + "px";
        marquee.style.top = top + "px";
      };

      // 4. Define Mouse Up (Finalize Selection)
      const onMarqueeUp = () => {
        // Find all potential items
        const allItems = document.querySelectorAll(
          ".field-box, .text-box, .signature-box"
        );

        allItems.forEach((item) => {
          if (elementsOverlap(marquee, item)) {
            item.classList.add("selected");
          }
        });

        // Cleanup
        marquee.remove();
        overlay.removeEventListener("mousemove", onMarqueeMove);
        window.removeEventListener("mouseup", onMarqueeUp);
      };

      // Attach temporary listeners
      overlay.addEventListener("mousemove", onMarqueeMove);
      window.addEventListener("mouseup", onMarqueeUp); // Window ensures we catch release outside canvas

      return; // Stop here, don't create a box
    }
    const selected = document.querySelector(".selected");
    const editing = document.querySelector(".editing");
    if (selected || editing) {
      deselectAll();
      return;
    }
    // 2. Get the default size for the current tool
    const size = defaultSizes[currentTool];

    // 3. Create the element immediately
    const newBox = document.createElement("div");

    // Assign Class
    if (currentTool === "field") newBox.className = "field-box";
    if (currentTool === "text") newBox.className = "text-box";
    if (currentTool === "signature") newBox.className = "signature-box";

    // Apply Styles (Position & Size)
    newBox.style.width = size.w + "px";
    newBox.style.height = size.h + "px";

    // Position the top-left corner where user clicked
    newBox.style.left = e.offsetX + "px";
    newBox.style.top = e.offsetY + "px";

    // Append to DOM
    overlay.appendChild(newBox);

    // 4. Initialize the internals (Delete btn, Textarea, Canvas, etc.)
    finalizeWidget(newBox, currentTool);

    // 5. Auto-select the new box so user can move it immediately if needed
    deselectAll();
    if (newBox.className !== "field-box") {
      newBox.classList.add("selected");
      newBox.classList.add("editing");
    }
  });
}

function finalizeWidget(element, type) {
  // 1. Delete Button
  const delBtn = document.createElement("div");
  delBtn.className = "delete-btn";
  delBtn.innerHTML = "×";
  delBtn.onclick = (e) => {
    e.stopPropagation();
    element.remove();
  };
  element.appendChild(delBtn);

  // 2. Resize Handle
  const resizeHandle = document.createElement("div");
  resizeHandle.className = "resize-handle";
  initResize(resizeHandle, element);
  element.appendChild(resizeHandle);

  // 3. Type Specific Content
  if (type === "text") {
    const input = document.createElement("textarea");
    input.className = "text-input";
    input.placeholder = "Double-click to type...";

    // Apply Settings
    input.style.fontSize = textSettings.size + "px";
    input.style.color = textSettings.color;
    element.dataset.fontSize = textSettings.size;
    element.dataset.fontColor = textSettings.color;

    element.appendChild(input);
  } else if (type === "signature") {
    const canvas = document.createElement("canvas");
    canvas.className = "signature-canvas";
    canvas.width = element.clientWidth;
    canvas.height = element.clientHeight;
    element.appendChild(canvas);

    setupSignatureDrawing(canvas, sigSettings.width, sigSettings.color);
  }

  if (type !== "field") {
    element.classList.add("selected");
    element.classList.add("editing");
  }

  // 4. Initialize Interaction
  makeBoxInteractive(element);
}

function makeBoxInteractive(box) {
  // A. SINGLE CLICK -> Select
  box.addEventListener("mousedown", (e) => {
    // If we are in EDIT mode, do NOT trigger selection/drag logic
    // This lets the click pass through to the Textarea or Canvas
    if (box.classList.contains("editing")) {
      e.stopPropagation();
      return;
    }

    // If clicking controls (X button or Resize), ignore
    if (e.target !== box && !box.contains(e.target)) return;
    if (
      e.target.className === "delete-btn" ||
      e.target.className === "resize-handle"
    )
      return;

    e.stopPropagation();
    if (e.shiftKey) {
      // Toggle selection
      if (box.classList.contains("selected")) {
        box.classList.remove("selected");
      } else {
        box.classList.add("selected");
      }
    } else {
      // Normal Click: If not already selected, select ONLY this one
      if (!box.classList.contains("selected")) {
        deselectAll();
        box.classList.add("selected");
      }
    }

    // Only Drag if NOT editing
    initDrag(e);
  });

  // B. DOUBLE CLICK -> Enter Edit Mode
  box.addEventListener("dblclick", (e) => {
    e.stopPropagation();

    // 1. Remove 'selected' style (dashed blue)
    box.classList.remove("selected");

    // 2. Add 'editing' style (green border, pointer-events: auto)
    if (!box.classList.contains("field-box")) {
      box.classList.add("editing");
    }

    // 3. Focus if it's text
    const input = box.querySelector("textarea");
    if (input) {
      input.focus();
    }
  });
}

function deselectAll() {
  // When clicking outside, we exit BOTH "Selected" and "Editing" modes
  document
    .querySelectorAll(".field-box, .text-box, .signature-box")
    .forEach((b) => {
      b.classList.remove("selected");
      b.classList.remove("editing");
    });
}

// --- SIGNATURE DRAWING LOGIC ---
function setupSignatureDrawing(canvas, width, color) {
  const ctx = canvas.getContext("2d");
  ctx.lineWidth = width; // <--- USE SETTING
  ctx.strokeStyle = color; // <--- USE SETTING
  ctx.lineCap = "round";

  let painting = false;

  // We need to account for mouse position relative to the CANVAS, not the page
  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }

  canvas.addEventListener("mousedown", (e) => {
    painting = true;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  });

  window.addEventListener("mouseup", () => {
    painting = false;
    ctx.beginPath();
  });

  canvas.addEventListener("mousemove", (e) => {
    if (!painting) return;
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  });
}

// --- BOX INTERACTION LOGIC (Restored) ---

function initDrag(e) {
  const startX = e.clientX;
  const startY = e.clientY;

  // 1. Find all selected items
  const selectedItems = document.querySelectorAll(".selected");

  // 2. Prepare items for global dragging
  const dragData = [];

  selectedItems.forEach((item) => {
    // A. Get current absolute position on screen
    const rect = item.getBoundingClientRect();

    // B. Save reference to its current parent (in case we cancel)
    const oldParent = item.parentElement;

    // C. Move item to BODY so it can float over everything
    document.body.appendChild(item);

    // D. Position it absolutely on the body to match where it was visually
    item.style.position = "fixed"; // 'fixed' is easier for screen-relative drag
    item.style.left = rect.left + "px";
    item.style.top = rect.top + "px";
    item.style.zIndex = 9999; // Float above everything

    dragData.push({
      el: item,
      startX: rect.left,
      startY: rect.top,
      oldParent: oldParent,
    });
  });

  const onMouseMove = (ev) => {
    const dx = ev.clientX - startX;
    const dy = ev.clientY - startY;

    dragData.forEach((data) => {
      data.el.style.left = data.startX + dx + "px";
      data.el.style.top = data.startY + dy + "px";
    });
  };

  const onMouseUp = (ev) => {
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);

    // 3. DROPPING THE ITEM
    // We need to find which Page Container is under the mouse

    // Hide items temporarily so elementFromPoint sees the page, not the box
    dragData.forEach((d) => (d.el.style.display = "none"));

    // Find the element under the cursor
    const elementBelow = document.elementFromPoint(ev.clientX, ev.clientY);

    // Show items again
    dragData.forEach((d) => (d.el.style.display = "block"));

    // Find the closest page container
    const pageContainer = elementBelow
      ? elementBelow.closest(".page-container")
      : null;

    if (pageContainer) {
      // 4. FOUND A NEW PAGE!
      const newOverlay = pageContainer.querySelector(".drawing-layer");
      const overlayRect = newOverlay.getBoundingClientRect();

      dragData.forEach((data) => {
        // Append to the new page's overlay
        newOverlay.appendChild(data.el);

        // Convert Fixed Coords (Screen) -> Absolute Coords (Overlay)
        const currentRect = data.el.getBoundingClientRect();

        // New Left = BoxScreenX - OverlayScreenX
        const newLeft = currentRect.left - overlayRect.left;
        const newTop = currentRect.top - overlayRect.top;

        data.el.style.position = "absolute"; // Back to absolute
        data.el.style.left = newLeft + "px";
        data.el.style.top = newTop + "px";
        data.el.style.zIndex = ""; // Reset Z-Index
      });
    } else {
      // 5. DROPPED OUTSIDE ANY PAGE?
      // Revert to old parent or just keep it on the last valid page?
      // Usually revert is safer:
      dragData.forEach((data) => {
        data.oldParent.appendChild(data.el);
        // We'd need to recalculate position relative to old parent here,
        // but for simplicity, let's assume users won't drop in the void often.
        // A better UX is to snap to the nearest page.

        // For MVP: Just Snap back to where it started relative to screen
        // (This part needs Math to put it back into the old parent's coord system)
        const rect = data.el.getBoundingClientRect();
        const parentRect = data.oldParent.getBoundingClientRect();

        data.el.style.position = "absolute";
        data.el.style.left = rect.left - parentRect.left + "px";
        data.el.style.top = rect.top - parentRect.top + "px";
        data.el.style.zIndex = "";
      });
    }
  };

  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("mouseup", onMouseUp);
}

function initResize(handle, box) {
  handle.addEventListener("mousedown", (e) => {
    e.stopPropagation();
    e.preventDefault();

    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = parseInt(
      document.defaultView.getComputedStyle(box).width,
      10
    );
    const startHeight = parseInt(
      document.defaultView.getComputedStyle(box).height,
      10
    );

    // If resizing a signature, we need to resize the canvas too
    const canvas = box.querySelector("canvas");

    function doDrag(e) {
      const newW = startWidth + e.clientX - startX;
      const newH = startHeight + e.clientY - startY;

      box.style.width = newW + "px";
      box.style.height = newH + "px";

      // Resize canvas if it exists (for signatures)
      if (canvas) {
        clipboard.sigData = canvas.toDataURL();
        canvas.width = newW;
        canvas.height = newH;
        const ctx = canvas.getContext("2d");
        const img = new Image();
        img.onload = () => {
          ctx.drawImage(img, 0, 0);
        };
        img.src = clipboard.sigData;
      }
    }

    function stopDrag() {
      document.documentElement.removeEventListener("mousemove", doDrag);
      document.documentElement.removeEventListener("mouseup", stopDrag);
    }

    document.documentElement.addEventListener("mousemove", doDrag);
    document.documentElement.addEventListener("mouseup", stopDrag);
  });
}

// --- SAVE LOGIC (The Heavy Lifter) ---
document.getElementById("save-btn").addEventListener("click", async () => {
  console.log("000");
  if (!currentPdfBytes) return;
  console.log("000.111");

  const doc = await PDFDocument.load(currentPdfBytes);
  const form = doc.getForm();
  const helveticaFont = await doc.embedFont(StandardFonts.Helvetica);

  console.log("000.222");
  // Helper to get the correct PDF page object for a specific DOM element
  const getPageForBox = (box) => {
    // 1. Go up to the .page-container
    const container = box.closest(".page-container");
    // 2. Get the page number (Stored in data attribute)
    const num = parseInt(container.dataset.pageNumber);
    // 3. Return the pdf-lib page (0-indexed)
    return {
      page: doc.getPages()[num - 1],
      height: doc.getPages()[num - 1].getHeight(), // Get actual PDF height
    };
  };

  // 1. PROCESS TEXT
  document.querySelectorAll(".text-box").forEach((box) => {
    const { page, height } = getPageForBox(box);
    const rect = getPdfRect(box, height); // Pass page height to helper
    // ... drawText logic ...
    page.drawText(box.querySelector("textarea").value, {
      x: rect.x + 2,
      y: rect.y + rect.h - 14, // Simple adjustment
      size: parseInt(box.dataset.fontSize),
      font: helveticaFont,
      color: rgb(0, 0, 0), // (Simplified for brevity)
    });
  });

  // 3. PROCESS SIGNATURES
  const sigs = document.querySelectorAll(".signature-box");

  // 2. Use 'for...of' to wait for each await
  for (const box of sigs) {
    const { page, height } = getPageForBox(box);
    const rect = getPdfRect(box, height);
    const canvas = box.querySelector("canvas");

    // Convert canvas to PNG image data
    const pngImageBytes = canvas.toDataURL("image/png");

    // This await will now correctly pause the loop
    const pngImage = await doc.embedPng(pngImageBytes);

    page.drawImage(pngImage, {
      x: rect.x,
      y: rect.y,
      width: rect.w,
      height: rect.h,
    });
  }

  document.querySelectorAll(".field-box").forEach((box, i) => {
    const { page, height } = getPageForBox(box);
    const rect = getPdfRect(box, height);
    const textField = form.createTextField(`field_${i}_${Date.now()}`);
    textField.addToPage(page, {
      x: rect.x,
      y: rect.y,
      width: rect.w,
      height: rect.h,
      borderWidth: 0,
    });
  });

  // Save and Download
  const pdfBytes = await doc.save();
  const blob = new Blob([pdfBytes], { type: "application/pdf" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "edited_form.pdf";
  link.click();
});

// Update helper to accept Page Height dynamically
function getPdfRect(element, pdfPageHeight) {
  const screenX = element.offsetLeft;
  const screenY = element.offsetTop;
  const screenW = element.offsetWidth;
  const screenH = element.offsetHeight;

  // Note: activePageViewport is GONE. We use the DOM overlay height or similar.
  // Actually, simplest is:
  return {
    x: screenX / scale,
    y: pdfPageHeight - (screenY + screenH) / scale, // Calculate from Bottom
    w: screenW / scale,
    h: screenH / scale,
  };
}

// --- HELPER: Hex to PDF RGB (0-1 range) ---
function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return { r, g, b };
}

// --- SMART COPY / PASTE LOGIC ---
let clipboard = null;

document.addEventListener("keydown", (e) => {
  // 1. DELETE
  if (e.key === "Delete" || e.key === "Backspace") {
    const selected = document.querySelectorAll(".selected");
    selected.forEach((el) => el.remove());
  }

  // 2. COPY (Ctrl+C)
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
    const selected = document.querySelector(".selected");
    if (selected && !selected.classList.contains("editing")) {
      // Don't copy if typing text

      // A. Identify Type
      let type = "field";
      if (selected.classList.contains("text-box")) type = "text";
      if (selected.classList.contains("signature-box")) type = "signature";

      // B. Capture Basic Props
      clipboard = {
        type: type,
        width: selected.style.width,
        height: selected.style.height,
        left: parseInt(selected.style.left || 0),
        top: parseInt(selected.style.top || 0),
        // Capture Settings (Color/Size)
        fontSize: selected.dataset.fontSize,
        fontColor: selected.dataset.fontColor,
      };

      // C. Capture Content
      if (type === "text") {
        clipboard.textContent = selected.querySelector("textarea").value;
      } else if (type === "signature") {
        // Save the drawing as a Base64 image string
        const canvas = selected.querySelector("canvas");
        clipboard.sigData = canvas.toDataURL();
      }

      console.log("Copied:", clipboard);
    }
  }

  // 3. PASTE (Ctrl+V)
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
    if (clipboard) {
      const overlay = document.getElementById("drawing-layer");

      // A. Create Wrapper
      const newBox = document.createElement("div");
      newBox.style.width = clipboard.width;
      newBox.style.height = clipboard.height;

      // Offset logic
      clipboard.left += 20;
      clipboard.top += 20;
      newBox.style.left = clipboard.left + "px";
      newBox.style.top = clipboard.top + "px";

      // Add correct class
      if (clipboard.type === "field") newBox.className = "field-box";
      if (clipboard.type === "text") newBox.className = "text-box";
      if (clipboard.type === "signature") newBox.className = "signature-box";

      overlay.appendChild(newBox);

      // B. Re-apply Settings BEFORE finalizing (so inputs get correct styles)
      // We temporarily override the global settings to match the copied box
      const originalTextSettings = { ...textSettings };
      const originalSigSettings = { ...sigSettings };

      if (clipboard.fontSize) textSettings.size = clipboard.fontSize;
      if (clipboard.fontColor) textSettings.color = clipboard.fontColor;
      // Note: Signature thickness isn't easily retrievable from canvas, using current global default

      // C. Build the internals
      finalizeWidget(newBox, clipboard.type);

      // Restore global settings
      textSettings = originalTextSettings;

      // D. Restore Content
      if (clipboard.type === "text") {
        newBox.querySelector("textarea").value = clipboard.textContent;
      } else if (clipboard.type === "signature") {
        // We need to draw the saved image back onto the new canvas
        const canvas = newBox.querySelector("canvas");
        const ctx = canvas.getContext("2d");
        const img = new Image();
        img.onload = () => {
          ctx.drawImage(img, 0, 0);
        };
        img.src = clipboard.sigData;
      }

      // E. Select the new box
      deselectAll();
      newBox.classList.add("selected");
    }
  }

  // 4. NUDGE (Arrow Keys)
  const selected = document.querySelector(".selected");
  if (
    selected &&
    !selected.classList.contains("editing") &&
    ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)
  ) {
    e.preventDefault();
    const currentLeft = parseInt(selected.style.left || 0);
    const currentTop = parseInt(selected.style.top || 0);
    const shift = e.shiftKey ? 10 : 1;

    if (e.key === "ArrowUp") selected.style.top = currentTop - shift + "px";
    if (e.key === "ArrowDown") selected.style.top = currentTop + shift + "px";
    if (e.key === "ArrowLeft") selected.style.left = currentLeft - shift + "px";
    if (e.key === "ArrowRight")
      selected.style.left = currentLeft + shift + "px";
  }
}),
  height;

function elementsOverlap(el1, el2) {
  const r1 = el1.getBoundingClientRect();
  const r2 = el2.getBoundingClientRect();

  return !(
    r1.right < r2.left ||
    r1.left > r2.right ||
    r1.bottom < r2.top ||
    r1.top > r2.bottom
  );
}

async function loadExistingFields() {
  if (!currentPdfBytes) return;
  const doc = await PDFDocument.load(currentPdfBytes);
  const form = doc.getForm();
  const fields = form.getFields();

  fields.forEach((field) => {
    if (field.constructor.name === "PDFTextField") {
      const widgets = field.acroField.getWidgets();
      widgets.forEach((widget) => {
        const rect = widget.getRectangle();

        // IMPORTANT: Find out which page this widget belongs to
        // pdf-lib refers to pages by object reference (PRef)
        const pRef = widget.P();

        // For MVP: We will loop through pages to find the match
        // (Optimized lookup omitted for brevity, simple loop is fine for small docs)
        let pageIndex = -1;
        doc.getPages().forEach((p, idx) => {
          if (p.ref === pRef) pageIndex = idx;
        });

        // If we found the page (0-indexed), find the DOM element (1-indexed)
        if (pageIndex !== -1) {
          const pageNum = pageIndex + 1;
          const container = document.querySelector(
            `.page-container[data-page-number="${pageNum}"]`
          );
          const overlay = container.querySelector(".drawing-layer");

          // Retrieve viewport dimensions from the canvas/overlay for math
          const overlayHeight = parseFloat(overlay.style.height);

          const width = rect.width * scale;
          const height = rect.height * scale;
          const x = rect.x * scale;
          const y = overlayHeight - rect.y * scale - height;

          const newBox = document.createElement("div");
          newBox.className = "field-box";
          newBox.style.width = width + "px";
          newBox.style.height = height + "px";
          newBox.style.left = x + "px";
          newBox.style.top = y + "px";

          overlay.appendChild(newBox);
          finalizeWidget(newBox, "field");
        }
      });
    }
  });
}
