// background.js

// 1. Create the Context Menu Item on Install
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "open-pdf-editor",
    title: "Open in PDF Editor",
    // Show this menu on Links and on the Page itself
    contexts: ["link", "page"],
    // Only show if the link or page looks like a PDF
    targetUrlPatterns: ["*://*/*.pdf*"],
  });
});

// 2. Listen for the Context Menu Click
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "open-pdf-editor") {
    // Logic: Did they click a link? OR are they on a PDF page?
    const pdfUrl = info.linkUrl || info.pageUrl;

    if (pdfUrl) {
      // Create the internal URL for your viewer
      const viewerUrl = chrome.runtime.getURL(
        `viewer.html?file=${encodeURIComponent(pdfUrl)}`
      );

      // Open it in a new tab
      chrome.tabs.create({ url: viewerUrl });
    }
  }
});

// 3. Keep your existing Icon Click Listener (Optional but recommended)
chrome.action.onClicked.addListener((tab) => {
  if (tab.url.endsWith(".pdf")) {
    const viewerUrl = chrome.runtime.getURL(
      `viewer.html?file=${encodeURIComponent(tab.url)}`
    );
    chrome.tabs.update(tab.id, { url: viewerUrl });
  }
});
