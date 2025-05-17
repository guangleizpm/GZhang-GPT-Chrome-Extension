// Handle messages from the extension
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Received message:', request);
    
    if (request.action === "getSelection") {
        const selection = window.getSelection();
        const selectedText = selection ? selection.toString().trim() : "";
        console.log('Sending selected text:', selectedText);
        sendResponse({ text: selectedText });
    }
    return true;
});

// Add context menu selection handling
document.addEventListener('mouseup', () => {
    const selectedText = window.getSelection().toString().trim();
    if (selectedText) {
        console.log('Text selected:', selectedText);
        chrome.runtime.sendMessage({
            type: 'TEXT_SELECTED',
            text: selectedText
        });
    }
});

// Log that content script has loaded
console.log('SelectGPT content script loaded');