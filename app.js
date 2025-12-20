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

if (pdfUrl) {
  const loadingTask = pdfjsLib.getDocument(pdfUrl);
  loadingTask.promise.then(async (pdf) => {
    pdfDoc = pdf;
    currentPdfBytes = await fetch(pdfUrl).then((res) => res.arrayBuffer());
    renderPage(1);
  });
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
function setupInteractionLayer(w, h) {
  const overlay = document.getElementById("drawing-layer");
  overlay.style.width = w + "px";
  overlay.style.height = h + "px";

  // Standard dimensions for "1 row input" style
  const defaultSizes = {
    field: { w: 200, h: 30 }, // Looks like a standard form input
    text: { w: 200, h: 30 }, // Fits size 14 text nicely
    signature: { w: 250, h: 120 }, // Big enough to sign name
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

  // 2. Record starting positions for EVERY selected item
  const initialPositions = [];
  selectedItems.forEach((item) => {
    initialPositions.push({
      el: item,
      left: parseFloat(item.style.left),
      top: parseFloat(item.style.top),
    });
  });

  const onMouseMove = (ev) => {
    const dx = ev.clientX - startX;
    const dy = ev.clientY - startY;

    // 3. Move EVERY selected item by the same delta
    initialPositions.forEach((pos) => {
      pos.el.style.left = pos.left + dx + "px";
      pos.el.style.top = pos.top + dy + "px";
    });
  };

  const onMouseUp = () => {
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
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
  if (!currentPdfBytes) return;

  const doc = await PDFDocument.load(currentPdfBytes);
  const page = doc.getPages()[0];
  const form = doc.getForm();
  const helveticaFont = await doc.embedFont(StandardFonts.Helvetica);

  // 1. PROCESS FORM FIELDS
  document.querySelectorAll(".field-box").forEach((box, i) => {
    const rect = getPdfRect(box);
    const textField = form.createTextField(`field_${i}_${Date.now()}`);
    textField.addToPage(page, {
      x: rect.x,
      y: rect.y,
      width: rect.w,
      height: rect.h,
      borderWidth: 0,
    });
  });

  // 2. PROCESS TEXT
  document.querySelectorAll(".text-box").forEach((box) => {
    const textVal = box.querySelector("textarea").value;
    if (!textVal) return;
    const rect = getPdfRect(box);

    // Retrieve stored settings
    const size = parseInt(box.dataset.fontSize) || 14;
    const hexColor = box.dataset.fontColor || "#000000";
    const { r, g, b } = hexToRgb(hexColor); // Convert to 0-1 range

    page.drawText(textVal, {
      x: rect.x + 2,
      y: rect.y + rect.h - size, // Adjust Y based on font size
      size: size,
      font: helveticaFont,
      color: rgb(r, g, b), // Use dynamic color
    });
  });

  // 3. PROCESS SIGNATURES
  const sigs = document.querySelectorAll(".signature-box");
  for (const box of sigs) {
    const canvas = box.querySelector("canvas");
    // Convert canvas to PNG image data
    const pngImageBytes = canvas.toDataURL("image/png");
    const pngImage = await doc.embedPng(pngImageBytes);
    const rect = getPdfRect(box);

    page.drawImage(pngImage, {
      x: rect.x,
      y: rect.y,
      width: rect.w,
      height: rect.h,
    });
  }

  // Save and Download
  const pdfBytes = await doc.save();
  const blob = new Blob([pdfBytes], { type: "application/pdf" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "edited_form.pdf";
  link.click();
});

// Helper: Convert DOM Element position to PDF Coordinates
function getPdfRect(element) {
  const screenX = element.offsetLeft;
  const screenY = element.offsetTop;
  const screenW = element.offsetWidth;
  const screenH = element.offsetHeight;

  return {
    x: screenX / scale,
    y: (activePageViewport.height - (screenY + screenH)) / scale,
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
});

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
