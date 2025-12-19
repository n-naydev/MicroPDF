chrome.action.onClicked.addListener((tab) => {
  // Check if current URL ends in .pdf
  if (tab.url.endsWith(".pdf")) {
    // Redirect to our internal viewer, passing the PDF url as a parameter
    const viewerUrl =
      chrome.runtime.getURL("viewer.html") +
      "?file=" +
      encodeURIComponent(tab.url);
    chrome.tabs.create({ url: viewerUrl });
  } else {
    alert("This is not a PDF!");
  }
});
