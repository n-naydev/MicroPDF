# MicroPDF 📄✍️

A private, offline-first Chrome Extension for editing, signing, and filling PDF forms directly in your browser. 

**No servers. No uploads. 100% Privacy.**

![App Screenshot](<img width="1149" height="762" alt="image" src="https://github.com/user-attachments/assets/313bce04-22f8-46cd-a08a-95f7aa57366a" />)

## 🚀 Features

* **Edit & Fill:** Type text anywhere on the page or add standard PDF form fields.
* **Sign Documents:** Draw signatures with a smooth, pressure-sensitive pen tool.
* **Multi-Page Support:** Seamlessly view all pages and drag widgets between pages.
* **Rich Text Tools:** Choose font families (Helvetica, Times, Courier), colors, and sizes.
* **Smart Selection:** Group select items using `Shift+Click` or drag a marquee box.
* **Clipboard:** Copy and paste widgets (`Ctrl+C` / `Ctrl+V`) across the document.
* **Privacy Focused:** All processing happens locally using WebAssembly. Your files never leave your computer.

## 🛠️ Installation (Developer Mode)

Since this extension is not yet in the Chrome Web Store, you can install it manually:

1.  **Clone or Download** this repository.
2.  Open Chrome and navigate to `chrome://extensions/`.
3.  Toggle **Developer mode** in the top right corner.
4.  Click **Load unpacked**.
5.  Select the folder containing this repository (ensure `manifest.json` is in the root of the folder you select).

## 📖 Usage

### Opening a PDF
* **Right-click** any PDF link or file in your browser and select "Open in PDF Editor".
* Or, click the extension icon in the toolbar to launch the viewer.

### The Toolbar
| Tool | Icon | Description |
| :--- | :---: | :--- |
| **Select** | ↖️ | Click to select items. Drag to create a selection box. Move groups. |
| **Field** | ☑️ | Create a standard PDF form input field. |
| **Text** | 🅰️ | Add text. Double-click to type. Use sub-toolbar to change font/color. |
| **Signature** | ✒️ | Create a signature box. Double-click to draw your signature. |

### Keyboard Shortcuts
* **Delete / Backspace:** Remove selected items.
* **Ctrl + C:** Copy selected item.
* **Ctrl + V:** Paste item.
* **Arrow Keys:** Nudge selected items by 1px (Shift+Arrow for 10px).
* **Shift + Click:** Select multiple items.

## 🏗️ Tech Stack

This project is built with vanilla web technologies and powerful libraries:

* **JavaScript (ES6+)**: Core logic (drag-and-drop, state management).
* **[PDF.js](https://mozilla.github.io/pdf.js/)**: Used for rendering PDF pages to HTML Canvas.
* **[PDF-lib](https://pdf-lib.js.org/)**: Used for modifying the raw PDF data, embedding fonts, and saving the file.

## 🤝 Contributing

Pull requests are welcome! For major changes, please open an issue first to discuss what you would like to change.

1.  Fork the Project
2.  Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3.  Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4.  Push to the Branch (`git push origin feature/AmazingFeature`)
5.  Open a Pull Request

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.

## 🤖 Acknowledgments

* **Vibe Coding:** Built with the assistance of LLMs (Gemini) to accelerate development.
* **Libraries:** `pdf.js` and `pdf-lib` for the heavy liftin

---
*Built with ❤️ for privacy.*
