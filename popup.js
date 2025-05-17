document.addEventListener("DOMContentLoaded", async () => {
    let port = chrome.runtime.connect({ name: "gz-select-generator" });
    let selectedText = '';

    // Get DOM elements
    const responseDiv = document.getElementById('response');
    const errorDiv = document.getElementById('error');
    const apiKeyInput = document.getElementById('api-key-input');
    const saveApiKeyBtn = document.getElementById('save-api-key');
    const changeApiKeyBtn = document.getElementById('change-api-key');
    const apiKeyStatus = document.getElementById('api-key-status');
    const selectedTextDiv = document.getElementById('selected-text');
    const promptInput = document.getElementById('prompt-input');
    const sendPromptBtn = document.getElementById('send-prompt');

    // Handle API key UI
    function showApiKeyInput() {
        apiKeyInput.style.display = 'block';
        saveApiKeyBtn.style.display = 'block';
        changeApiKeyBtn.style.display = 'none';
        apiKeyStatus.textContent = 'Please enter your OpenAI API key:';
    }

    function showChangeApiKey() {
        apiKeyInput.style.display = 'none';
        saveApiKeyBtn.style.display = 'none';
        changeApiKeyBtn.style.display = 'block';
        apiKeyStatus.textContent = 'API key is set';
    }

    // Update UI with selected text
    function updateSelectedText(text) {
        selectedText = text;
        selectedTextDiv.textContent = text || 'No text selected';
        sendPromptBtn.disabled = !text || !promptInput.value.trim();
        console.log("Selected text updated:", text);
    }

    // Save API key
    saveApiKeyBtn.addEventListener('click', () => {
        const apiKey = apiKeyInput.value.trim();
        if (apiKey) {
            console.log('Saving API key...');
            port.postMessage({ type: 'SET_API_KEY', apiKey });
            apiKeyInput.value = '';
        }
    });

    // Change API key
    changeApiKeyBtn.addEventListener('click', () => {
        showApiKeyInput();
    });

    // Enable/disable send button based on prompt input
    promptInput.addEventListener('input', () => {
        sendPromptBtn.disabled = !promptInput.value.trim() || !selectedText;
    });

    // Send prompt with selected text
    sendPromptBtn.addEventListener('click', () => {
        const prompt = promptInput.value.trim();
        if (prompt && selectedText) {
            console.log('Sending prompt...');
            responseDiv.textContent = 'Loading...';
            errorDiv.style.display = 'none';
            
            // Combine prompt with selected text
            const fullPrompt = `${prompt}\n\nText: "${selectedText}"`;
            console.log('Full prompt:', fullPrompt);
            
            port.postMessage({ 
                type: 'QUERY',
                question: fullPrompt 
            });
        }
    });

    // Listen for messages from the background script
    port.onMessage.addListener((msg) => {
        console.log('Received message:', msg);
        
        if (msg.type === 'API_KEY_STATUS') {
            if (msg.hasKey) {
                showChangeApiKey();
            } else {
                showApiKeyInput();
            }
            return;
        }

        if (msg.type === 'API_KEY_SAVED') {
            showChangeApiKey();
            return;
        }

        if (msg.type === 'ERROR') {
            console.error('Error received:', msg.error);
            errorDiv.style.display = 'block';
            errorDiv.textContent = `Error: ${msg.error}`;
            responseDiv.textContent = '';
            return;
        }

        if (msg.type === 'CONTENT') {
            console.log('Content received:', msg.content);
            if (responseDiv.textContent === 'Loading...') {
                responseDiv.textContent = '';
            }
            responseDiv.textContent += msg.content;
            return;
        }

        if (msg.type === 'SELECTED_TEXT') {
            console.log('Selected text message received:', msg.text);
            updateSelectedText(msg.text);
            return;
        }

        if (msg.type === 'DONE') {
            console.log('Stream complete');
            return;
        }
    });

    // Check API key status on popup open
    console.log('Checking API key status...');
    port.postMessage({ type: 'GET_API_KEY_STATUS' });
});