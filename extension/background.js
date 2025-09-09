// Background service worker for OnPage.dev extension
class BackgroundService {
    constructor() {
        this.init();
    }

    init() {
        // Listen for messages from content scripts and popup
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.handleMessage(message, sender, sendResponse);
        });

        // Handle extension installation
        chrome.runtime.onInstalled.addListener((details) => {
            this.handleInstallation(details);
        });

        // Handle tab updates
        chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
            this.handleTabUpdate(tabId, changeInfo, tab);
        });
    }

    handleMessage(message, sender, sendResponse) {
        switch (message.action) {
            case 'scrapedData':
                this.handleScrapedData(message.data, sender);
                sendResponse({ success: true });
                break;
            
            case 'scrapingComplete':
                this.handleScrapingComplete(message.data, sender);
                sendResponse({ success: true });
                break;
            
            case 'elementsSelected':
                this.handleElementsSelected(message.elements, sender);
                sendResponse({ success: true });
                break;
            
            case 'elementSelectionComplete':
                this.handleElementSelectionComplete(message.elements, sender);
                sendResponse({ success: true });
                break;
            
            case 'elementSelectionCancelled':
                this.handleElementSelectionCancelled(sender);
                sendResponse({ success: true });
                break;
            
            case 'getActiveTab':
                this.getActiveTab().then(tab => {
                    sendResponse({ success: true, tab });
                });
                return true; // Keep message channel open for async response
            
            default:
                sendResponse({ success: false, error: 'Unknown action' });
        }
    }

    handleInstallation(details) {
        if (details.reason === 'install') {
            console.log('OnPage.dev extension installed');
            
            // Set default settings
            chrome.storage.local.set({
                'onpage_settings': {
                    autoSave: true,
                    maxDataPoints: 1000,
                    scrollDelay: 2000
                }
            });
        } else if (details.reason === 'update') {
            console.log('OnPage.dev extension updated');
        }
    }

    handleTabUpdate(tabId, changeInfo, tab) {
        // Handle tab updates if needed
        if (changeInfo.status === 'complete' && tab.url) {
            // Tab finished loading
            console.log('Tab updated:', tab.url);
        }
    }

    async handleScrapedData(data, sender) {
        try {
            // Store scraped data temporarily
            const result = await chrome.storage.local.get(['onpage_temp_data']);
            const existingData = result.onpage_temp_data || [];
            
            // Merge new data with existing data
            const mergedData = [...existingData, ...data];
            
            await chrome.storage.local.set({
                'onpage_temp_data': mergedData
            });

            this.notifyPopup('scrapedData', { data: data });
        } catch (error) {
            console.log('Error handling scraped data:', error);
        }
    }

    async handleScrapingComplete(data, sender) {
        try {
            // Store final scraped data
            await chrome.storage.local.set({
                'onpage_temp_data': data,
                'onpage_scraping_complete': true
            });

            // Notify popup
            this.notifyPopup('scrapingComplete', { data });
        } catch (error) {
            console.log('Error handling scraping complete:', error);
        }
    }

    handleElementsSelected(elements, sender) {
        // Store selected elements
        chrome.storage.local.set({
            'onpage_selected_elements': elements
        });

        // Notify popup
        this.notifyPopup('elementsSelected', { elements });
    }

    handleElementSelectionComplete(elements, sender) {
        // Store final selected elements
        chrome.storage.local.set({
            'onpage_selected_elements': elements,
            'onpage_selection_complete': true
        });

        // Notify popup
        this.notifyPopup('elementSelectionComplete', { elements });
    }

    handleElementSelectionCancelled(sender) {
        // Clear selected elements
        chrome.storage.local.remove(['onpage_selected_elements', 'onpage_selection_complete']);

        // Notify popup
        this.notifyPopup('elementSelectionCancelled');
    }

    async getActiveTab() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            return tab;
        } catch (error) {
            console.log('Error getting active tab:', error);
            return null;
        }
    }

    notifyPopup(action, data = {}) {
        // Try to send message to popup
        chrome.runtime.sendMessage({
            action: action,
            ...data
        }).catch(error => {
            // Popup might not be open, that's okay
            console.log('Popup not available:', error.message);
        });
    }

    // Utility methods
    async getStoredData(key) {
        try {
            const result = await chrome.storage.local.get([key]);
            return result[key] || null;
        } catch (error) {
            console.log(`Error getting stored data for key ${key}:`, error);
            return null;
        }
    }

    async setStoredData(key, value) {
        try {
            await chrome.storage.local.set({ [key]: value });
            return true;
        } catch (error) {
            console.log(`Error setting stored data for key ${key}:`, error);
            return false;
        }
    }

    async clearStoredData(keys) {
        try {
            await chrome.storage.local.remove(keys);
            return true;
        } catch (error) {
            console.log('Error clearing stored data:', error);
            return false;
        }
    }
}

// Initialize background service
const backgroundService = new BackgroundService();
