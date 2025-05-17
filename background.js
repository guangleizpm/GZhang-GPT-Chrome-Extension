let apiKey = '';
let lastSelectedText = '';
let sidePanelPort = null;

// Function to store API key
const setApiKey = (key) => {
    apiKey = key;
    // Store in chrome.storage for persistence
    chrome.storage.local.set({ 'openai_api_key': key });
    console.log('API key saved');
};

// Load API key on startup
chrome.storage.local.get(['openai_api_key'], (result) => {
    if (result.openai_api_key) {
        apiKey = result.openai_api_key;
        console.log('API key loaded from storage');
    }
});

// Set up side panel on install
chrome.runtime.onInstalled.addListener(() => {
    // Set the side panel configuration
    chrome.sidePanel
        .setPanelBehavior({ openPanelOnActionClick: true })
        .catch((error) => console.error('Failed to set panel behavior:', error));
});

// Listen for selected text from content script
chrome.runtime.onMessage.addListener((message, sender) => {
    console.log('Received message:', message);
    if (message.type === 'TEXT_SELECTED') {
        lastSelectedText = message.text;
        console.log('Text selected:', lastSelectedText);
        
        // If we have a connection to the side panel, send the text
        if (sidePanelPort) {
            sidePanelPort.postMessage({ 
                type: 'SELECTED_TEXT', 
                text: lastSelectedText 
            });
        }
    }
});

// Handle extension icon click
chrome.action.onClicked.addListener(async () => {
    console.log('Extension icon clicked');
    
    // Get the active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
        console.error('No active tab found');
        return;
    }

    // Get the selected text
    try {
        const response = await chrome.tabs.sendMessage(tab.id, { action: "getSelection" });
        if (response && response.text) {
            lastSelectedText = response.text;
            console.log('Selected text updated:', lastSelectedText);
            // If we have a connection to the side panel, send the text
            if (sidePanelPort) {
                sidePanelPort.postMessage({ 
                    type: 'SELECTED_TEXT', 
                    text: lastSelectedText 
                });
            }
        }
    } catch (error) {
        console.error('Error getting selection:', error);
    }
});

async function streamResponse(port, response) {
    try {
        console.log('Starting to stream response');
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullResponse = '';
        
        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                console.log('Stream complete');
                if (!fullResponse) {
                    port.postMessage({ type: 'ERROR', error: 'No response received' });
                }
                port.postMessage({ type: 'DONE' });
                break;
            }
            
            const chunk = decoder.decode(value);
            console.log('Received chunk:', chunk);
            const lines = chunk.split('\n');
            
            for (const line of lines) {
                if (line.trim() === '' || line.includes('data: [DONE]')) continue;
                
                try {
                    const cleanedLine = line.replace(/^data: /, '').trim();
                    if (!cleanedLine) continue;
                    
                    console.log('Processing line:', cleanedLine);
                    const parsed = JSON.parse(cleanedLine);
                    const content = parsed.choices[0]?.delta?.content;
                    if (content) {
                        console.log('Sending content:', content);
                        fullResponse += content;
                        port.postMessage({ type: 'CONTENT', content });
                    }
                } catch (e) {
                    console.error('Error parsing line:', e, 'Line:', line);
                    continue;
                }
            }
        }
    } catch (error) {
        console.error('Error streaming response:', error);
        port.postMessage({ type: 'ERROR', error: 'Error streaming response' });
    }
}

async function getResponse(port, question) {
    if (!apiKey) {
        console.error('API key missing');
        port.postMessage({ type: 'ERROR', error: 'API_KEY_MISSING' });
        return;
    }

    try {
        console.log('Sending request to OpenAI with question:', question);
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-3.5-turbo',
                messages: [{
                    role: 'user',
                    content: question
                }],
                stream: true
            })
        });

        console.log('OpenAI response status:', response.status);
        if (!response.ok) {
            const error = await response.json();
            console.error('API error:', error);
            port.postMessage({ type: 'ERROR', error: error.error?.message || 'API_ERROR' });
            return;
        }

        await streamResponse(port, response);
    } catch (error) {
        console.error('Network error:', error);
        port.postMessage({ type: 'ERROR', error: 'NETWORK_ERROR' });
    }
}

chrome.runtime.onConnect.addListener((port) => {
    console.log('Port connected:', port.name);
    
    // Store the side panel port if this is the side panel connecting
    if (port.name === "gz-select-generator") {
        sidePanelPort = port;
        // Send any existing selected text
        if (lastSelectedText) {
            port.postMessage({ 
                type: 'SELECTED_TEXT', 
                text: lastSelectedText 
            });
        }
    }

    port.onMessage.addListener((msg) => {
        console.log('Port message received:', msg);
        if (msg.type === 'SET_API_KEY') {
            setApiKey(msg.apiKey);
            port.postMessage({ type: 'API_KEY_SAVED' });
            return;
        }

        if (msg.type === 'GET_API_KEY_STATUS') {
            port.postMessage({ 
                type: 'API_KEY_STATUS', 
                hasKey: Boolean(apiKey)
            });
            return;
        }

        if (msg.type === 'QUERY') {
            getResponse(port, msg.question);
            return;
        }
    });

    // Handle port disconnection
    port.onDisconnect.addListener(() => {
        console.log('Port disconnected:', port.name);
        if (port === sidePanelPort) {
            sidePanelPort = null;
        }
    });
});
