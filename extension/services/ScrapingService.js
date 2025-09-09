class ScrapingService {
    constructor() {
        this.isScraping = false;
        this.scrapedData = [];
        this.selectors = [];
    }

    async startScraping(selectors, url, extractionOptions = {}) {
        
        if (this.isScraping) {
            return { success: false, error: 'Scraping is already in progress' };
        }

        this.isScraping = true;
        this.scrapedData = [];
        this.selectors = selectors;

        try {
            // Get the active tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (!tab) {
                throw new Error('No active tab found');
            }

            // Check if content script is already available
            try {
                await chrome.tabs.sendMessage(tab.id, { action: 'ping' });
            } catch (error) {
                // Content script not available, inject it
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ['content.js']
                });
                // Wait for content script to initialize
                await new Promise(resolve => setTimeout(resolve, 200));
            }

            // Inject scraping function
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                function: scrapePageFunction,
                args: [selectors, extractionOptions]
            });

            return { success: true };
        } catch (error) {
            console.log('Start scraping error:', error);
            this.isScraping = false;
            return { success: false, error: error.message };
        }
    }

    async stopScraping() {
        this.isScraping = false;
        
        try {
            // Get the active tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (tab) {
                // Send stop message to content script
                await chrome.tabs.sendMessage(tab.id, { action: 'stopScraping' });
            }

            return { success: true };
        } catch (error) {
            console.log('Stop scraping error:', error);
            return { success: false, error: error.message };
        }
    }

    async getScrapedData() {
        return this.scrapedData;
    }


    // Method to be called from popup to get current scraping status
    getScrapingStatus() {
        return {
            isScraping: this.isScraping,
            dataCount: this.scrapedData.length
        };
    }

    // Method to clear scraped data
    clearData() {
        this.scrapedData = [];
        this.selectors = [];
    }
}

// Standalone function for injection into page context
function scrapePageFunction(selectors, extractionOptions = {}) {
    // Prevent multiple instances from running
    if (window.OnPageScrapingActive) {
        console.log('⚠️ Scraping already active, ignoring duplicate call');
        return;
    }
    window.OnPageScrapingActive = true;
    
    
    // Set default options
    const options = {
        text: true,
        images: false,
        links: false,
        structured: false,
        deepScan: false,
        visibleOnly: true,
        excludeDuplicates: true,
        ...extractionOptions
    };
    
    const scrapedData = [];
    const seenKeys = new Set();
    let isScraping = true;
    let lastDataLength = 0;
    let noNewDataCount = 0;
    let scrollCount = 0;
    let lastPageContent = '';
    let consecutiveNoScrolls = 0;
    const maxNoNewDataCount = 8; // Stop after 8 consecutive scrolls with no new data (increased)
    const maxScrollCount = 100; // Maximum number of scrolls to prevent infinite loops (increased)
    const maxConsecutiveNoScrolls = 5; // Stop if we can't scroll anymore

    // Function to extract text from element, joining multiple text nodes with commas
    const extractTextWithCommas = (element) => {
        if (!element) return '';
        
        // Get all direct child nodes (text nodes and elements)
        const childNodes = Array.from(element.childNodes);
        const textParts = [];
        
        childNodes.forEach(node => {
            if (node.nodeType === Node.TEXT_NODE) {
                // Direct text node
                const text = node.textContent?.trim();
                if (text) {
                    textParts.push(text);
                }
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                // Element node - get its text content
                const text = node.textContent?.trim();
                if (text) {
                    textParts.push(text);
                }
            }
        });
        
        // If we found multiple text parts, join with commas
        if (textParts.length > 1) {
            const result = textParts.join(', ');
            console.log(`🔗 Multiple text parts found, joined with commas: "${result}"`);
            return result;
        } else if (textParts.length === 1) {
            return textParts[0];
        } else {
            // Fallback to the original method if no child text nodes found
            return element.textContent?.trim() || element.innerText?.trim() || '';
        }
    };

    const normalize = (str) => (str || '').toString().trim().toLowerCase().replace(/\s+/g, ' ');

    const buildItemKey = (item) => {
        // Prefer link href if present
        for (const key of Object.keys(item)) {
            const val = item[key];
            if (val && typeof val === 'object' && val.href) {
                return `href:${normalize(val.href)}`;
            }
        }
        // Fallback: combine common fields
        const candidates = [];
        if (item.name?.text) candidates.push(normalize(item.name.text));
        if (item.title?.text) candidates.push(normalize(item.title.text));
        if (item.address?.text) candidates.push(normalize(item.address.text));
        if (item.location?.text) candidates.push(normalize(item.location.text));
        if (candidates.length > 0) return candidates.join('|');
        // Last resort: stringify minimal
        return JSON.stringify(Object.fromEntries(Object.entries(item).map(([k, v]) => [k, v?.text || v?.href || v?.src || ''])));
    };

    const scrapeElements = () => {
        const data = {};
        let hasData = false;


        selectors.forEach(selector => {
            let elements = [];
            
            if (options.deepScan) {
                // Deep scan: include elements from iframes and shadow DOM
                elements = [...document.querySelectorAll(selector.selector)];
                
                // Scan iframes
                document.querySelectorAll('iframe').forEach(iframe => {
                    try {
                        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                        if (iframeDoc) {
                            elements.push(...iframeDoc.querySelectorAll(selector.selector));
                        }
                    } catch (e) {
                        // Cross-origin iframe, skip silently
                    }
                });
                
                // Scan shadow DOM
                document.querySelectorAll('*').forEach(el => {
                    if (el.shadowRoot) {
                        elements.push(...el.shadowRoot.querySelectorAll(selector.selector));
                    }
                });
            } else {
                // Regular scan
                elements = document.querySelectorAll(selector.selector);
            }
            
            if (elements.length > 0) {
                data[selector.name] = Array.from(elements).filter(el => {
                    // Apply visibleOnly filter if enabled
                    if (options.visibleOnly) {
                        const rect = el.getBoundingClientRect();
                        const isVisible = rect.width > 0 && rect.height > 0 && 
                                         getComputedStyle(el).visibility !== 'hidden' &&
                                         getComputedStyle(el).display !== 'none';
                        return isVisible;
                    }
                    return true;
                }).map(el => {
                    const elementData = {};
                    
                    // Always include basic element info
                    elementData.tagName = el.tagName.toLowerCase();
                    elementData.className = el.className || '';
                    elementData.id = el.id || '';

                    // Extract text content based on options
                    if (options.text) {
                        elementData.text = extractTextWithCommas(el);
                    }

                    // Extract href for links based on options
                    if (options.links && (el.tagName === 'A' || el.hasAttribute('href'))) {
                        elementData.href = el.href || el.getAttribute('href') || '';
                    }

                    // Extract src for images based on options
                    if (options.images && el.tagName === 'IMG') {
                        elementData.src = el.src || el.getAttribute('data-src') || el.getAttribute('data-lazy-src') || '';
                        elementData.alt = el.alt || '';
                    }

                    // Extract structured data based on options
                    if (options.structured) {
                    // Extract title attribute
                    if (el.hasAttribute('title')) {
                        elementData.title = el.getAttribute('title') || '';
                    }

                    // Extract data attributes
                    const dataAttributes = {};
                    Array.from(el.attributes).forEach(attr => {
                        if (attr.name.startsWith('data-')) {
                            dataAttributes[attr.name] = attr.value;
                        }
                    });
                    if (Object.keys(dataAttributes).length > 0) {
                        elementData.dataAttributes = dataAttributes;
                    }

                    // Extract common attributes
                    if (el.hasAttribute('value')) {
                        elementData.value = el.value || el.getAttribute('value') || '';
                    }

                    if (el.hasAttribute('placeholder')) {
                        elementData.placeholder = el.getAttribute('placeholder') || '';
                    }

                    if (el.hasAttribute('aria-label')) {
                        elementData.ariaLabel = el.getAttribute('aria-label') || '';
                        }
                    }

                    // For form elements, extract additional info (if structured data is enabled)
                    if (options.structured && ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName)) {
                        elementData.type = el.type || '';
                        elementData.name = el.name || '';
                    }

                    // Extract innerHTML for complex elements (if structured data is enabled)
                    if (options.structured && el.children.length === 0 && el.innerHTML && el.innerHTML.length < 500) {
                        elementData.innerHTML = el.innerHTML;
                    }

                    return elementData;
                });
                hasData = true;
            }
        });

        if (hasData) {
            // If a container selector is provided (name 'container' or flag), use container-relative extraction
            const containerSelectorObj = selectors.find(s => s.name === 'container' || s.container === true);
            if (containerSelectorObj) {
                const containers = document.querySelectorAll(containerSelectorObj.selector);
                containers.forEach(containerEl => {
                    const item = {};
                    selectors.forEach(sel => {
                        if (sel === containerSelectorObj) return;
                        const target = containerEl.querySelector(sel.selector);
                        if (target) {
                            const elementData = {};
                            
                            // Always include basic element info
                            elementData.tagName = target.tagName.toLowerCase();
                            elementData.className = target.className || '';
                            elementData.id = target.id || '';
                            
                            // Extract text content based on options
                            if (options.text) {
                                elementData.text = extractTextWithCommas(target);
                            }
                            
                            // Extract href for links based on options
                            if (options.links && (target.tagName === 'A' || target.hasAttribute('href'))) {
                                elementData.href = target.href || target.getAttribute('href') || '';
                            }
                            
                            // Extract src for images based on options
                            if (options.images && target.tagName === 'IMG') {
                                elementData.src = target.src || target.getAttribute('data-src') || target.getAttribute('data-lazy-src') || '';
                                elementData.alt = target.alt || '';
                            }
                            
                            // Extract structured data based on options
                            if (options.structured) {
                                if (target.hasAttribute('title')) {
                                    elementData.title = target.getAttribute('title') || '';
                                }
                                // Add other structured data attributes as needed
                            }
                            
                            item[sel.name] = elementData;
                        }
                    });
                    if (options.excludeDuplicates) {
                        const key = buildItemKey(item);
                        if (!seenKeys.has(key)) {
                            seenKeys.add(key);
                            scrapedData.push(item);
                        }
                    } else {
                        scrapedData.push(item);
                    }
                });
            } else {
                // Fallback: index-based alignment with de-duplication
                const maxLength = Math.max(...Object.values(data).map(arr => arr.length));
            for (let i = 0; i < maxLength; i++) {
                const item = {};
                selectors.forEach(selector => {
                    if (data[selector.name] && data[selector.name][i]) {
                        item[selector.name] = data[selector.name][i];
                        }
                    });
                    if (options.excludeDuplicates) {
                        const key = buildItemKey(item);
                        if (!seenKeys.has(key)) {
                            seenKeys.add(key);
                            scrapedData.push(item);
                        }
                    } else {
                        scrapedData.push(item);
                    }
                }
            }
        }

        return hasData;
    };

    const scrollAndScrape = async () => {
        if (!isScraping) return;


        // Store current scroll position
        const currentScrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const currentScrollHeight = document.documentElement.scrollHeight;

        // Scrape current view
        const hasData = scrapeElements();

        // Check if we got new data
        const startIndex = lastDataLength;
        if (scrapedData.length > lastDataLength) {
            noNewDataCount = 0;
            console.log(`📊 Found ${scrapedData.length - lastDataLength} new items (total: ${scrapedData.length})`);
            lastDataLength = scrapedData.length;
        } else {
            noNewDataCount++;
            console.log(`⏸️ No new data found (${noNewDataCount}/${maxNoNewDataCount} attempts)`);
        }

        // Send data to background script (only the delta)
        const newData = scrapedData.slice(startIndex);
        if (newData.length > 0) {
            chrome.runtime.sendMessage({
                action: 'scrapedData',
                data: newData
            });
        }

        // Check if we've reached the bottom of the page
        const newScrollHeight = document.documentElement.scrollHeight;
        const isAtBottom = (window.innerHeight + window.pageYOffset) >= newScrollHeight - 50; // 50px tolerance (reduced)
        
        // Increment scroll count
        scrollCount++;
        console.log(`🔄 Scroll ${scrollCount}/${maxScrollCount} - Position: ${currentScrollTop}, Height: ${currentScrollHeight}, AtBottom: ${isAtBottom}`);

        // Stop conditions:
        // 1. Maximum scroll count reached (safety limit)
        // 2. No new data for several scrolls AND we're at the bottom
        // 3. Can't scroll anymore (page doesn't change position)
        if (scrollCount >= maxScrollCount) {
            console.log('🛑 Scraping stopped: Maximum scroll count reached');
            isScraping = false;
            chrome.runtime.sendMessage({
                action: 'scrapingComplete',
                data: scrapedData
            });
            return;
        }
        
        // Only stop for no new data if we're also at the bottom of the page
        if (noNewDataCount >= maxNoNewDataCount && isAtBottom) {
            console.log('🛑 Scraping stopped: No new data and at bottom');
            isScraping = false;
            chrome.runtime.sendMessage({
                action: 'scrapingComplete',
                data: scrapedData
            });
            return;
        }

        // Store position before scrolling
        const beforeScrollTop = window.pageYOffset || document.documentElement.scrollTop;
        
        // Scroll down - try multiple methods for compatibility
        const scrollAmount = Math.max(window.innerHeight * 0.8, 600); // At least 600px or 80% of viewport
        
        // Method 1: Standard scrollBy
        window.scrollBy(0, scrollAmount);
        
        // Method 2: Alternative scroll method if the first didn't work
        setTimeout(() => {
            const checkScrollTop = window.pageYOffset || document.documentElement.scrollTop;
            if (checkScrollTop === beforeScrollTop) {
                // Try alternative scroll methods
                document.documentElement.scrollTop += scrollAmount;
                if (document.body) {
                    document.body.scrollTop += scrollAmount;
                }
                // Also try programmatic scroll
                window.scrollTo({
                    top: beforeScrollTop + scrollAmount,
                    behavior: 'smooth'
                });
            }
        }, 100);
        
        // Wait for content to load and check if page height changed
        setTimeout(() => {
            const finalScrollHeight = document.documentElement.scrollHeight;
            const finalScrollTop = window.pageYOffset || document.documentElement.scrollTop;
            
            // Check if we actually scrolled
            if (finalScrollTop === beforeScrollTop) {
                consecutiveNoScrolls++;
                console.log(`⚠️ No scroll movement detected (${consecutiveNoScrolls}/${maxConsecutiveNoScrolls})`);
            } else {
                consecutiveNoScrolls = 0; // Reset counter if we did scroll
            }
            
            // Get current page content hash to detect if content changed
            const currentPageContent = document.documentElement.innerHTML.length.toString();
            
            // If we can't scroll anymore, we've reached the end
            if (consecutiveNoScrolls >= maxConsecutiveNoScrolls) {
                console.log('🛑 Scraping stopped: Cannot scroll further');
                isScraping = false;
                window.OnPageScrapingActive = false;
                chrome.runtime.sendMessage({
                    action: 'scrapingComplete',
                    data: scrapedData
                });
                return;
            }
            
            // If page height didn't change and we're at the same scroll position, we've reached the end
            if (finalScrollHeight === currentScrollHeight && finalScrollTop === currentScrollTop && noNewDataCount > 2) {
                console.log('🛑 Scraping stopped: Page height unchanged and no scroll');
                isScraping = false;
                window.OnPageScrapingActive = false;
                chrome.runtime.sendMessage({
                    action: 'scrapingComplete',
                    data: scrapedData
                });
                return;
            }
            
            // If page content hasn't changed for several iterations, we might be in a loop
            if (currentPageContent === lastPageContent && noNewDataCount > 3) {
                console.log('🛑 Scraping stopped: Page content unchanged');
                isScraping = false;
                window.OnPageScrapingActive = false;
                chrome.runtime.sendMessage({
                    action: 'scrapingComplete',
                    data: scrapedData
                });
                return;
            }
            
            lastPageContent = currentPageContent;
            
            // Continue scraping
            scrollAndScrape();
        }, 3000); // Increased timeout to 3 seconds for better content loading
    };

    // Listen for stop message
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'stopScraping') {
            console.log('🛑 Manual stop requested - saving current data');
            isScraping = false;
            window.OnPageScrapingActive = false; // Clear the flag
            chrome.runtime.sendMessage({
                action: 'scrapingComplete',
                data: scrapedData,
                manualStop: true // Flag to indicate this was a manual stop
            });
        }
    });

    // Start scraping
    scrollAndScrape();
}
