// app.js
import * as pdfjsLib from "./libs/pdf.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc = "./libs/pdf.worker.mjs";
const { PDFDocument, rgb, StandardFonts } = window.PDFLib;

// --- STATE ---
let currentTool = "field"; // 'field', 'text', 'signature'
let pdfDoc = null;
let currentPdfBytes = null;
let scale = 1.5;
let activePageViewport = null;
// Defaults
let textSettings = { size: 14, color: "#000000" };
let sigSettings = { width: 2, color: "#000000" };

// --- TOOLBAR LOGIC ---
document.getElementById("tool-field").onclick = () => setTool("field");
document.getElementById("tool-text").onclick = () => setTool("text");
document.getElementById("tool-signature").onclick = () => setTool("signature");

function setTool(tool) {
  currentTool = tool;

  // 1. Update UI Buttons
  document
    .querySelectorAll(".tool-btn")
    .forEach((b) => b.classList.remove("active"));
  document.getElementById(`tool-${tool}`).classList.add("active");

  // 2. Render Sub-Toolbar
  const sub = document.getElementById("sub-toolbar");
  sub.innerHTML = ""; // Clear previous

  if (tool === "field") {
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

// --- INTERACTION LAYER ---
function setupInteractionLayer(w, h) {
  const overlay = document.getElementById("drawing-layer");
  overlay.style.width = w + "px";
  overlay.style.height = h + "px";

  let isDrawingBox = false;
  let startX, startY;
  let tempBox = null;

  overlay.addEventListener("mousedown", (e) => {
    if (e.target !== overlay) return;

    isDrawingBox = true;
    startX = e.offsetX;
    startY = e.offsetY;

    // Create the visual box
    tempBox = document.createElement("div");
    tempBox.style.left = startX + "px";
    tempBox.style.top = startY + "px";
    tempBox.style.width = "0px";
    tempBox.style.height = "0px";
    overlay.appendChild(tempBox);

    // Class depends on tool
    if (currentTool === "field") tempBox.className = "field-box";
    if (currentTool === "text") tempBox.className = "text-box";
    if (currentTool === "signature") tempBox.className = "signature-box";

    deselectAll();
  });

  overlay.addEventListener("mousemove", (e) => {
    if (!isDrawingBox) return;
    const width = e.offsetX - startX;
    const height = e.offsetY - startY;
    tempBox.style.width = Math.abs(width) + "px";
    tempBox.style.height = Math.abs(height) + "px";
    tempBox.style.left = (width < 0 ? e.offsetX : startX) + "px";
    tempBox.style.top = (height < 0 ? e.offsetY : startY) + "px";
  });

  overlay.addEventListener("mouseup", () => {
    if (!isDrawingBox) return;
    isDrawingBox = false;

    // Small threshold to prevent accidental clicks
    if (parseInt(tempBox.style.width) < 20) {
      tempBox.remove();
      tempBox = null;
      return;
    }

    finalizeWidget(tempBox, currentTool);
    tempBox = null;
  });
}

// --- UPDATED WIDGET LOGIC ---

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
    deselectAll();
    box.classList.add("selected");

    // Only Drag if NOT editing
    initDrag(e, box);
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

function initDrag(e, box) {
  const startX = e.clientX;
  const startY = e.clientY;

  // Get current position (parse '100px' -> 100)
  const startLeft = parseInt(box.style.left || 0);
  const startTop = parseInt(box.style.top || 0);

  function doDrag(e) {
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    box.style.left = startLeft + dx + "px";
    box.style.top = startTop + dy + "px";
  }

  function stopDrag() {
    document.documentElement.removeEventListener("mousemove", doDrag);
    document.documentElement.removeEventListener("mouseup", stopDrag);
  }

  document.documentElement.addEventListener("mousemove", doDrag);
  document.documentElement.addEventListener("mouseup", stopDrag);
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

// Update the overlay click listener to call deselectAll
document.getElementById("drawing-layer").addEventListener("mousedown", (e) => {
  if (e.target.id === "drawing-layer") {
    deselectAll();
  }
});

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
    const selected = document.querySelector(".selected");
    if (selected && !selected.classList.contains("editing")) {
      selected.remove();
    }
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
