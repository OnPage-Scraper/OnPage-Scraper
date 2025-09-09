// Main popup script for OnPage.dev extension
class PopupController {
    constructor() {
        this.authService = new AuthService();
        this.reportService = new ReportService(this.authService);
        this.scrapingService = new ScrapingService();
        this.toastService = new ToastService();
        this.isAuthenticated = false;
        this.selectedElements = [];
        this.scrapedData = [];
        this._isSavingReport = false;
        this._currentIdempotencyKey = null;
        // Chunked upload state
        this._chunkBuffer = [];
        this._chunkSize = 1000; // Default, will be loaded from user preferences
        this._currentReportId = null;
        this._initialReportCreated = false;
        this._totalItemsSaved = 0;
        
        // New features state
        this.settings = {
            scanMode: 'quick',
            autoExtract: 'off'
        };
        this.isScanning = false;
        this.isExtracting = false;
        this.currentProgress = 0;
        
        // Workflow state
        this.currentStep = 1;
        this.completedSteps = [];
        
        // Extraction options
        this.extractionOptions = {
            text: true,
            images: false,
            links: false,
            structured: false,
            deepScan: false,
            visibleOnly: true,
            excludeDuplicates: true
        };
        
        
        // Live preview
        this.logData = {
            elementsFound: 0,
            dataExtracted: 0,
            errors: 0,
            messages: []
        };
        
        this.init();
    }

    async init() {
        // Check authentication status
        await this.checkAuthStatus();
        
        // Check if we're returning from element selection
        await this.checkSelectionMode();
        
        // Set up event listeners
        this.setupEventListeners();
        
        // Listen for messages from background script
        this.setupMessageListeners();
        
        // Show appropriate UI
        this.updateUI();
    }

    async checkSelectionMode() {
        try {
            
            // Check multiple storage sources
            let elements = null;
            let selectionMode = false;
            
            // Method 1: Chrome storage
            try {
                const result = await chrome.storage.local.get(['onpage_selection_mode', 'onpage_selected_elements']);
                
                if (result.onpage_selected_elements && result.onpage_selected_elements.length > 0) {
                    elements = result.onpage_selected_elements;
                }
                selectionMode = result.onpage_selection_mode;
            } catch (error) {
                console.log('❌ Chrome storage error:', error);
            }
            
            // Method 2: Regular localStorage (if Chrome storage failed)
            if (!elements) {
                try {
                    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                    if (tab) {
                        const localStorageResult = await chrome.scripting.executeScript({
                            target: { tabId: tab.id },
                            function: () => {
                                try {
                                    const stored = localStorage.getItem('onpage_selected_elements');
                                    return stored ? JSON.parse(stored) : null;
                                } catch (error) {
                                    console.log('localStorage read error:', error);
                                    return null;
                                }
                            }
                        });
                        
                        if (localStorageResult && localStorageResult[0] && localStorageResult[0].result) {
                            elements = localStorageResult[0].result;
                        }
                    }
                } catch (error) {
                    console.log('❌ localStorage access error:', error);
                }
            }
            
            // Method 3: Session storage (if both above failed)
            if (!elements) {
                try {
                    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                    if (tab) {
                        const sessionStorageResult = await chrome.scripting.executeScript({
                            target: { tabId: tab.id },
                            function: () => {
                                try {
                                    const stored = sessionStorage.getItem('onpage_selected_elements');
                                    return stored ? JSON.parse(stored) : null;
                                } catch (error) {
                                    console.log('sessionStorage read error:', error);
                                    return null;
                                }
                            }
                        });
                        
                        if (sessionStorageResult && sessionStorageResult[0] && sessionStorageResult[0].result) {
                            elements = sessionStorageResult[0].result;
                        }
                    }
                } catch (error) {
                    console.log('❌ sessionStorage access error:', error);
                }
            }
            
            // Process found elements
            if (elements && elements.length > 0) {
                this.selectedElements = elements;
                this.updateSelectorsList();
                this.updateScrapingButtons();
                
                if (selectionMode) {
                    // We're returning from element selection mode
                    this.showStatus(`Selected ${this.selectedElements.length} elements`, 'success');
                    // Clear the selection mode flag
                    await chrome.storage.local.remove(['onpage_selection_mode']);
                } else {
                    // Elements were loaded from storage
                    this.showStatus(`Loaded ${this.selectedElements.length} selected elements`, 'info');
                }
            } else if (selectionMode) {
                // Selection mode was active but no elements were selected
                await chrome.storage.local.remove(['onpage_selection_mode']);
                this.showStatus('Element selection cancelled', 'info');
            } else {
            }
        } catch (error) {
            console.log('❌ Error checking selection mode:', error);
        }
    }

    async checkAuthStatus() {
        try {
            const isAuth = await this.authService.isAuthenticated();
            if (isAuth) {
                const verification = await this.authService.verifyToken();
                this.isAuthenticated = verification.success;
                if (this.isAuthenticated) {
                    this.currentUser = verification.user;
                }
            } else {
                this.isAuthenticated = false;
            }
        } catch (error) {
            console.log('Auth check error:', error);
            this.isAuthenticated = false;
        }
    }

    setupEventListeners() {
        // Login form
        const loginForm = document.getElementById('loginFormElement');
        if (loginForm) {
            loginForm.addEventListener('submit', this.handleLogin.bind(this));
        }

        // Register form
        const registerForm = document.getElementById('registerFormElement');
        if (registerForm) {
            registerForm.addEventListener('submit', this.handleRegister.bind(this));
        }

        // Form toggles
        const showRegisterLink = document.getElementById('showRegister');
        const showLoginLink = document.getElementById('showLogin');
        
        if (showRegisterLink) {
            showRegisterLink.addEventListener('click', (e) => {
                e.preventDefault();
                this.showRegisterForm();
            });
        }
        
        if (showLoginLink) {
            showLoginLink.addEventListener('click', (e) => {
                e.preventDefault();
                this.showLoginForm();
            });
        }

        // Listen for toast action events
        window.addEventListener('toast-action-continue', () => {
            // Handle continue action from registration success toast
            this.showPage('login');
        });

        // Settings button
        const settingsBtn = document.getElementById('settingsBtn');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', () => this.showPage('settings'));
        }

        // Settings form
        const settingsForm = document.getElementById('settingsForm');
        if (settingsForm) {
            settingsForm.addEventListener('submit', (e) => this.handleSettingsSave(e));
        }

        // Back to dashboard button
        const backToDashboard = document.getElementById('backToDashboard');
        if (backToDashboard) {
            backToDashboard.addEventListener('click', () => this.showPage('home'));
        }

        // Dashboard buttons
        const logoutBtn = document.getElementById('logoutBtn');
        const selectElementsBtn = document.getElementById('selectElementsBtn');
        const extractionBtn = document.getElementById('extractionBtn');
        const viewReportsBtn = document.getElementById('viewReportsBtn');

        if (logoutBtn) {
            logoutBtn.addEventListener('click', this.handleLogout.bind(this));
        }
        
        if (selectElementsBtn) {
            selectElementsBtn.addEventListener('click', this.handleSelectElements.bind(this));
        }
        
        if (extractionBtn) {
            extractionBtn.addEventListener('click', this.handleExtractionToggle.bind(this));
        }
        
        if (viewReportsBtn) {
            viewReportsBtn.addEventListener('click', this.handleViewReports.bind(this));
        }

        // Clear all selectors button
        const clearAllSelectorsBtn = document.getElementById('clearAllSelectorsBtn');
        if (clearAllSelectorsBtn) {
            clearAllSelectorsBtn.addEventListener('click', this.clearAllSelectors.bind(this));
        }

        // Event delegation for remove selector buttons
        const selectorsList = document.getElementById('selectorsList');
        if (selectorsList) {
            selectorsList.addEventListener('click', (e) => {
                if (e.target.classList.contains('remove-selector')) {
                    const index = parseInt(e.target.dataset.selectorIndex);
                    this.removeSelector(index);
                }
            });
        }

        // New feature buttons
        const rescanBtn = document.getElementById('rescanBtn');
        const retryBtn = document.getElementById('retryBtn');
        const dismissErrorBtn = document.getElementById('dismissErrorBtn');
        if (rescanBtn) {
            rescanBtn.addEventListener('click', this.performRescan.bind(this));
        }
        if (retryBtn) {
            retryBtn.addEventListener('click', this.retryExtraction.bind(this));
        }
        if (dismissErrorBtn) {
            dismissErrorBtn.addEventListener('click', this.dismissError.bind(this));
        }

        // Reports tab button
        const reportsTabBtn = document.getElementById('reportsTabBtn');
        if (reportsTabBtn) {
            reportsTabBtn.addEventListener('click', this.openReportsInNewTab.bind(this));
        }

        // Completion card buttons
        const viewReportBtn = document.getElementById('viewReportBtn');
        const newExtractionBtn = document.getElementById('newExtractionBtn');

        if (viewReportBtn) {
            viewReportBtn.addEventListener('click', this.handleViewReports.bind(this));
        }
        if (newExtractionBtn) {
            newExtractionBtn.addEventListener('click', this.startNewExtraction.bind(this));
        }

        // Workflow button
        const workflowBtn = document.getElementById('workflowBtn');
        if (workflowBtn) {
            workflowBtn.addEventListener('click', this.handleWorkflowAction.bind(this));
        }

        // Extraction options
        const extractionOptions = ['extractText', 'extractImages', 'extractLinks', 'extractStructured', 'deepScan', 'visibleOnly', 'excludeDuplicates'];
        extractionOptions.forEach(optionId => {
            const checkbox = document.getElementById(optionId);
            if (checkbox) {
                checkbox.addEventListener('change', this.updateExtractionOptions.bind(this));
            }
        });

        // Container selector button
        const selectContainerBtn = document.getElementById('selectContainerBtn');
        if (selectContainerBtn) {
            selectContainerBtn.addEventListener('click', this.handleSelectContainer.bind(this));
        }

        // Container selector input
        const containerSelector = document.getElementById('containerSelector');
        if (containerSelector) {
            containerSelector.addEventListener('input', this.updateExtractionSummary.bind(this));
        }

        // Log drawer toggle
        const logToggle = document.getElementById('logToggle');
        const logHeader = document.getElementById('logHeader');
        if (logToggle) {
            logToggle.addEventListener('click', this.toggleLogDrawer.bind(this));
        }
        if (logHeader) {
            logHeader.addEventListener('click', this.toggleLogDrawer.bind(this));
        }

        // Manual selector inputs
        const addSelectorBtn = document.getElementById('addSelectorBtn');
        const selectorName = document.getElementById('selectorName');
        const selectorValue = document.getElementById('selectorValue');
        const examplesToggle = document.getElementById('examplesToggle');
        const examplesHeader = document.querySelector('.examples-header');
        
        if (addSelectorBtn) {
            addSelectorBtn.addEventListener('click', this.handleAddManualSelector.bind(this));
        }
        
        // Allow Enter key to add selector
        if (selectorName) {
            selectorName.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.handleAddManualSelector();
                }
            });
        }
        
        if (selectorValue) {
            selectorValue.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.handleAddManualSelector();
                }
            });
        }
        
        // Toggle examples
        if (examplesToggle) {
            examplesToggle.addEventListener('click', this.toggleExamples.bind(this));
        }
        if (examplesHeader) {
            examplesHeader.addEventListener('click', this.toggleExamples.bind(this));
        }
        
        // Example items click handlers
        document.addEventListener('click', (e) => {
            if (e.target.closest('.example-item')) {
                const exampleItem = e.target.closest('.example-item');
                const name = exampleItem.dataset.name;
                const selector = exampleItem.dataset.selector;
                this.fillSelectorInputs(name, selector);
            }
        });




        // Quick action cards
        document.addEventListener('click', (e) => {
            if (e.target.closest('.action-card')) {
                const action = e.target.closest('.action-card').dataset.action;
                if (action) {
                    this.showPage(action);
                }
            }
        });
    }

    setupMessageListeners() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.handleBackgroundMessage(message, sender, sendResponse);
        });
    }

    initPageNavigation() {
        const navLinks = document.querySelectorAll('.nav-link[data-page]');
        navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                const page = e.target.dataset.page;
                if (page) {
                this.showPage(page);
                }
            });
        });
    }

    showPage(pageName) {
        // Hide all sub-pages
        const subPages = document.querySelectorAll('.sub-page');
        subPages.forEach(page => {
            page.classList.remove('active');
        });

        // Show selected page
        const targetPage = document.getElementById(pageName + 'Page');
        if (targetPage) {
            targetPage.classList.add('active');
        }
        
        // Update extraction summary when showing the combined page
        if (pageName === 'selectExtract') {
            this.updateExtractionSummary();
        }

        // Update navigation
        const navLinks = document.querySelectorAll('.nav-link');
        navLinks.forEach(link => {
            link.classList.remove('active');
        });

        const activeNavLink = document.querySelector(`.nav-link[data-page="${pageName}"]`);
        if (activeNavLink) {
            activeNavLink.classList.add('active');
        }

        // Update page-specific elements
        this.updatePageSpecificUI(pageName);
    }

    updateSelectedElementsUI() {
        // Complete step 1 if elements are selected
        if (this.selectedElements.length > 0) {
            this.completeStep(1);
        }
        
        // Update extraction summary if on the combined page
        this.updateExtractionSummary();
    }

    handleBackgroundMessage(message, sender, sendResponse) {
        switch (message.action) {
            case 'elementsSelected':
                this.updateSelectedElements(message.elements);
                break;
            
            case 'elementSelectionComplete':
                this.handleElementSelectionComplete(message.elements);
                break;
            
            case 'elementSelectionCancelled':
                this.handleElementSelectionCancelled();
                break;
            
            case 'scrapedData':
                this.updateScrapedData(message.data);
                break;
            
            case 'scrapingComplete':
                // Avoid double handling if multiple sources emit completion
                if (this._handledScrapingComplete) {
                    return;
                }
                this._handledScrapingComplete = true;
                // Reset the flag shortly after to allow future sessions
                setTimeout(() => { this._handledScrapingComplete = false; }, 2000);
                this.handleScrapingComplete(message); // Pass the full message object
                break;
        }
    }

    async handleLogin(e) {
        e.preventDefault();
        
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        
        // Basic validation
        if (!email.trim()) {
            this.toastService.showValidationError('Email', 'is required');
            document.getElementById('email').focus();
            return;
        }
        
        if (!password.trim()) {
            this.toastService.showValidationError('Password', 'is required');
            document.getElementById('password').focus();
            return;
        }
        
        if (!this.isValidEmail(email)) {
            this.toastService.showValidationError('Email', 'format is invalid');
            document.getElementById('email').focus();
            return;
        }
        
        // Show loading toast
        const loadingToast = this.toastService.showLoading('Signing you in...');
        
        try {
        const result = await this.authService.login(email, password);
        
            this.toastService.hideLoading(loadingToast);
        
        if (result.success) {
            this.isAuthenticated = true;
            this.currentUser = result.user;
            this.updateUI();
                
                // Load user settings including chunk size
                this.loadUserSettings();
                
                // Show personalized welcome message
                this.toastService.success(`Welcome back, ${result.user.firstName}!`, 4000);
                
                // Clear login form
                this.clearLoginForm();
            
        } else {
                // Use the enhanced error handling from ToastService
                this.toastService.showLoginError(result.error);
            }
        } catch (error) {
            this.toastService.hideLoading(loadingToast);
            this.toastService.showNetworkError();
        }
    }

    async handleRegister(e) {
        e.preventDefault();
        
        // Collect form data
        const userData = {
            email: document.getElementById('regEmail').value,
            password: document.getElementById('regPassword').value,
            firstName: document.getElementById('regFirstName').value,
            lastName: document.getElementById('regLastName').value,
            company: document.getElementById('regCompany').value,
            role: document.getElementById('regRole').value
        };
        
        // Enhanced client-side validation with specific error messages
        if (!userData.firstName.trim()) {
            this.toastService.showValidationError('First Name', 'is required');
            document.getElementById('regFirstName').focus();
            return;
        }
        
        if (!userData.lastName.trim()) {
            this.toastService.showValidationError('Last Name', 'is required');
            document.getElementById('regLastName').focus();
            return;
        }
        
        if (!userData.email.trim()) {
            this.toastService.showValidationError('Email', 'is required');
            document.getElementById('regEmail').focus();
            return;
        }
        
        if (!this.isValidEmail(userData.email)) {
            this.toastService.showValidationError('Email', 'format is invalid');
            document.getElementById('regEmail').focus();
            return;
        }
        
        if (userData.password.length < 6) {
            this.toastService.showValidationError('Password', 'must be at least 6 characters');
            document.getElementById('regPassword').focus();
            return;
        }
        
        // Show loading toast
        const loadingToast = this.toastService.showLoading('Creating your account...');
        
        try {
            const result = await this.authService.register(userData);
            
            this.toastService.hideLoading(loadingToast);
        
        if (result.success) {
                // Show success toast with action button
                this.toastService.showRegistrationSuccess(result.user.firstName);
                
                // Clear form
                this.clearRegistrationForm();
                
                // Show login page after a short delay
                setTimeout(() => {
                    this.showPage('login');
                }, 1000);
            
        } else {
                // Handle specific error messages
                if (result.error.includes('User already exists')) {
                    this.toastService.error('An account with this email already exists. Please try logging in instead.', 6000);
                } else if (result.error.includes('Validation failed')) {
                    this.toastService.error('Please check your information and try again.', 5000);
                } else {
                    this.toastService.error(result.error, 5000);
                }
            }
        } catch (error) {
            this.toastService.hideLoading(loadingToast);
            this.toastService.showNetworkError();
        }
    }

    async handleLogout() {
        const result = await this.authService.logout();
        
        if (result.success) {
            this.isAuthenticated = false;
            this.currentUser = null;
            this.updateUI();
            this.toastService.success('Logged out successfully', 3000);
        } else {
            this.toastService.error(result.error, 5000);
        }
    }

    async handleSelectElements() {
        try {
            // Navigate to combined page first
            this.showPage('selectExtract');
            
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (!tab) {
                this.showStatus('No active tab found', 'error');
                return;
            }

            // Store the current popup state before closing
            await chrome.storage.local.set({
                'onpage_selection_mode': true,
                'onpage_selected_elements': this.selectedElements
            });

            // Inject the content script
            try {
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ['content.js']
                });
                
                // Wait for content script to initialize
                await new Promise(resolve => setTimeout(resolve, 300));
                
                // Send message to start selection
                await chrome.tabs.sendMessage(tab.id, { action: 'startElementSelection' });
                
                // Close popup to allow element selection
                window.close();
                
            } catch (error) {
                console.log('❌ Element selection setup error:', error);
                
                // Try alternative approach - reload the page and inject
                this.showStatus('Setting up element selection...', 'info');
                
                try {
                    // Reload the page to ensure clean state
                    await chrome.tabs.reload(tab.id);
                    
                    // Wait for page to load
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    
                    // Inject content script
                    await chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        files: ['content.js']
                    });
                    
                    // Wait for initialization
                    await new Promise(resolve => setTimeout(resolve, 500));
                    
                    // Start selection
                    await chrome.tabs.sendMessage(tab.id, { action: 'startElementSelection' });
                    
                    window.close();
                    
                } catch (retryError) {
                    console.log('❌ Retry failed:', retryError);
                    this.showStatus('Please refresh the page and try again', 'error');
                }
            }
            
        } catch (error) {
            console.log('❌ Element selection error:', error);
            this.showStatus('Error starting element selection. Please refresh the page and try again.', 'error');
        }
    }

    async handleStartScraping() {
        if (this.selectedElements.length === 0) {
            this.showStatus('Please select elements first', 'error');
            this.showPage('selectExtract');
            return;
        }

        try {
            // Navigate to scraper page
            this.showPage('selectExtract');
            
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (!tab) {
                this.showStatus('No active tab found', 'error');
                return;
            }

            // Start scraping
            // Generate an idempotency key for this scraping session
            this._currentIdempotencyKey = `scrape_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
            const result = await this.scrapingService.startScraping(this.selectedElements, tab.url, this.extractionOptions);
            
            if (result.success) {
                this.updateScrapingButtons(true);
                this.showStatus('Scraping started...', 'info');
            } else {
                this.showStatus(result.error, 'error');
            }
        } catch (error) {
            console.log('Start scraping error:', error);
            this.showStatus('Error starting scraping', 'error');
        }
    }

    async handleStopScraping() {
        try {
            const result = await this.scrapingService.stopScraping();
            
            if (result.success) {
                this.updateScrapingButtons(false);
                this.showStatus('Scraping stopped', 'info');
            } else {
                this.showStatus(result.error, 'error');
            }
        } catch (error) {
            console.log('Stop scraping error:', error);
            this.showStatus('Error stopping scraping', 'error');
        }
    }

    async handleExtractionToggle() {
        if (this.isExtracting) {
            await this.stopExtraction();
        } else {
            await this.startExtraction();
        }
    }

    async startExtraction() {
        if (this.selectedElements.length === 0) {
            this.showStatus('Please select elements first', 'error');
            this.showPage('selectExtract');
            return;
        }

        try {
            // Set extracting state
            this.isExtracting = true;
            
            // Show progress
            this.showProgress('Starting Extraction', 'Initializing...');
            this.addLogMessage('Starting extraction process...');
            
            // Navigate to scraper page if not already there
            this.showPage('selectExtract');
            
            // Update button after page is shown
            setTimeout(() => {
                this.updateExtractionButton();
            }, 100);
            
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (!tab) {
                throw new Error('No active tab found');
            }

            // Simulate extraction progress
            await this.simulateExtractionProgress();
            
            // Generate an idempotency key for this scraping session
            this._currentIdempotencyKey = `scrape_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
            const result = await this.scrapingService.startScraping(this.selectedElements, tab.url, this.extractionOptions);
            
            if (result.success) {
                this.updateScrapingButtons(true); // Ensure button state is correct
                this.addLogMessage('Extraction started successfully');
                this.showStatus('Extraction in progress...', 'info');
                
                // The actual extraction will happen in the background
                // The completion will be handled by the message listener when 'scrapingComplete' is received
            } else {
                throw new Error(result.error || 'Failed to start extraction');
            }
        } catch (error) {
            console.log('Start extraction error:', error);
            this.showError('Extraction Failed', error.message);
            this.stopExtraction();
        }
    }

    async stopExtraction() {
        try {
            this.addLogMessage('Stopping extraction...');
            
            const result = await this.scrapingService.stopScraping();
            
            if (result.success) {
                this.addLogMessage('Extraction stopped successfully');
                
                // Always save the extracted data when manually stopping
                if (this.scrapedData.length > 0) {
                    this.addLogMessage(`Saving ${this.scrapedData.length} extracted items...`);
                    
                    // Flush any remaining chunks in the buffer
                    await this.flushRemainingChunks();
                    
                    // Show completion card with extracted data info
                    this.showCompletionCard(this.scrapedData.length, this.selectedElements.length);
                    
                    // Complete step 2 and enable step 3
                    this.completeStep(2);
                    
                    // Save report based on authentication status
                    if (this.isAuthenticated) {
                        // For authenticated users, data was saved during extraction via chunking
                        this.addLogMessage('Data saved to your account');
                        this.showStatus(`Extraction stopped. Saved ${this.scrapedData.length} items`, 'success');
                    } else {
                        // For non-authenticated users, save to localStorage
                        this.saveScrapedDataToLocalStorage(this.scrapedData);
                        this.addLogMessage('Data saved locally for later sync');
                        this.showStatus(`Extraction stopped. Saved ${this.scrapedData.length} items locally`, 'success');
                    }
                    
                    // Update log data with final extraction results
                    this.updateLogData({
                        elementsFound: this.selectedElements.length,
                        dataExtracted: this.scrapedData.length,
                        errors: 0
                    });
                } else {
                    this.addLogMessage('No data to save');
                    this.showStatus('Extraction stopped - no data extracted', 'info');
                }
            } else {
                this.addLogMessage('Error stopping extraction: ' + result.error);
                this.showStatus(result.error, 'error');
            }
        } catch (error) {
            console.log('Stop extraction error:', error);
            this.showStatus('Error stopping extraction', 'error');
        } finally {
            this.isExtracting = false;
            this.hideProgress();
            this.updateExtractionButton();
        }
    }

    async handleViewReports() {
        // Open reports in new tab
        chrome.tabs.create({ url: chrome.runtime.getURL('reports.html') });
    }

    async openReportsInNewTab() {
        // Open reports page in new tab
        chrome.tabs.create({ url: chrome.runtime.getURL('reports.html') });
    }

    updateUI() {
        const loginForm = document.getElementById('loginForm');
        const registerForm = document.getElementById('registerForm');
        const dashboard = document.getElementById('dashboard');
        const pageNav = document.getElementById('pageNav');
        const userName = document.getElementById('userName');
        const userEmail = document.getElementById('userEmail');

        if (this.isAuthenticated) {
            loginForm.style.display = 'none';
            registerForm.style.display = 'none';
            dashboard.style.display = 'block';
            pageNav.style.display = 'flex';
            
            if (this.currentUser) {
                if (userName) {
                    userName.textContent = `${this.currentUser.firstName} ${this.currentUser.lastName}`;
                }
                if (userEmail) {
                userEmail.textContent = this.currentUser.email;
                }
            }
            
            // Initialize page navigation
            this.initPageNavigation();
            
            // Show home page by default
            this.showPage('home');
            
            // Update UI elements
            this.updateSelectedElementsUI();
            this.updateWorkflowUI();
            this.updateExtractionButton();
            
            // Check for pending reports and sync them
            this.checkAndSyncPendingReports();
        } else {
            loginForm.style.display = 'block';
            registerForm.style.display = 'none';
            dashboard.style.display = 'none';
            pageNav.style.display = 'none';
            
            // Show pending reports count for non-authenticated users
            this.updatePendingReportsInfo();
        }
    }

    async checkAndSyncPendingReports() {
        try {
            const pendingReports = JSON.parse(localStorage.getItem('onpage_temp_data') || '[]');
            if (pendingReports.length > 0) {
                console.log(`🔄 Found ${pendingReports.length} pending reports, syncing...`);
                await this.syncPendingReports();
            }
        } catch (error) {
            console.log('Error checking pending reports:', error);
        }
    }

    updatePendingReportsInfo() {
        try {
            const pendingReports = JSON.parse(localStorage.getItem('onpage_temp_data') || '[]');
            const statusMessage = document.getElementById('statusMessage');
            
            if (pendingReports.length > 0 && statusMessage) {
                statusMessage.textContent = `${pendingReports.length} report(s) saved locally. Login to sync to cloud.`;
                statusMessage.className = 'status-message info';
            }
        } catch (error) {
            console.log('Error updating pending reports info:', error);
        }
    }

    showLoginForm() {
        document.getElementById('loginForm').style.display = 'block';
        document.getElementById('registerForm').style.display = 'none';
    }

    showRegisterForm() {
        document.getElementById('loginForm').style.display = 'none';
        document.getElementById('registerForm').style.display = 'block';
    }

    updateSelectedElements(elements) {
        // Mark elements as visually selected if they don't have a source
        const elementsWithSource = elements.map(element => ({
            ...element,
            source: element.source || 'visual'
        }));
        
        this.selectedElements = elementsWithSource;
        this.updateSelectorsList();
        this.updateScrapingButtons();
    }

    updateSelectorsList() {
        const selectorsList = document.getElementById('selectorsList');
        const clearAllBtn = document.getElementById('clearAllSelectorsBtn');
        
        if (this.selectedElements.length === 0) {
            selectorsList.innerHTML = `
                <div class="empty-state">
                    <p>No elements selected yet</p>
                    <small>Click "Start Element Selection" to begin</small>
                </div>
            `;
            if (clearAllBtn) {
                clearAllBtn.style.display = 'none';
            }
        } else {
            // Show clear all button
            if (clearAllBtn) {
                clearAllBtn.style.display = 'block';
            }

            const html = this.selectedElements.map((element, index) => {
                const sourceIcon = element.source === 'manual' ? '✏️' : '🎯';
                const sourceTitle = element.source === 'manual' ? 'Manually added' : 'Visually selected';
                
                return `
                    <div class="selector-item">
                        <div class="selector-info">
                            <div class="selector-header">
                                <div class="selector-name">${element.name}</div>
                                <span class="selector-source" title="${sourceTitle}">${sourceIcon}</span>
                            </div>
                            <div class="selector-value">${element.selector}</div>
                        </div>
                        <button class="remove-selector" data-selector-index="${index}">Remove</button>
                    </div>
                `;
            }).join('');

            selectorsList.innerHTML = html;
        }
        
        // Update workflow state
        this.updateSelectedElementsUI();
    }

    removeSelector(index) {
        this.selectedElements.splice(index, 1);
        this.updateSelectorsList();
        this.updateScrapingButtons();
        
        // Save updated selection to storage
        this.saveSelectedElements();
    }
    
    async saveSelectedElements() {
        try {
            await chrome.storage.local.set({
                'onpage_selected_elements': this.selectedElements
            });
        } catch (error) {
            console.log('Error saving selected elements:', error);
        }
    }
    
    async clearAllSelectors() {
        if (confirm('Are you sure you want to clear all selected elements?')) {
            this.selectedElements = [];
            this.updateSelectorsList();
            this.updateScrapingButtons();
            
            // Clear from all storage sources
            await this.clearElementsFromAllStorage();
            
            // Clear highlights from page
            try {
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                if (tab) {
                    // First ensure content script is injected
                    await this.ensureContentScriptInjected(tab.id);
                    
                    // Then send the message
                    await chrome.tabs.sendMessage(tab.id, { action: 'clearAllHighlights' });
                }
            } catch (error) {
                console.log('Error clearing highlights:', error);
                // Try alternative method - clear from localStorage directly
                try {
                    localStorage.removeItem('onpage_selected_elements');
                    localStorage.removeItem('onpage_temp_data');
                    sessionStorage.removeItem('onpage_selected_elements');
                } catch (storageError) {
                    console.log('Error clearing storage:', storageError);
                }
            }
            
            this.showStatus('All elements cleared', 'info');
        }
    }

    async ensureContentScriptInjected(tabId) {
        try {
            // Try to ping the content script first
            await chrome.tabs.sendMessage(tabId, { action: 'ping' });
        } catch (error) {
            // Content script not available, inject it
            try {
                await chrome.scripting.executeScript({
                    target: { tabId: tabId },
                    files: ['content.js']
                });
                
                // Wait a bit for the script to initialize
                await new Promise(resolve => setTimeout(resolve, 100));
            } catch (injectError) {
                console.log('Error injecting content script:', injectError);
                throw injectError;
            }
        }
    }
    
    async clearElementsFromAllStorage() {
        try {
            // Clear from Chrome storage
            await chrome.storage.local.remove(['onpage_selected_elements']);
            console.log('✅ Cleared from Chrome storage');
            
            // Clear from localStorage
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab) {
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    function: () => {
                        try {
                            localStorage.removeItem('onpage_selected_elements');
                            localStorage.removeItem('onpage_temp_data');
                            sessionStorage.removeItem('onpage_selected_elements');
                            console.log('✅ Cleared from localStorage and sessionStorage');
                        } catch (error) {
                            console.log('❌ Error clearing localStorage:', error);
                        }
                    }
                });
            }
        } catch (error) {
            console.log('❌ Error clearing storage:', error);
        }
    }

    updateScrapingButtons(isScraping = false) {
        // Update the extraction state and button
        this.isExtracting = isScraping;
        this.updateExtractionButton();
    }

    handleElementSelectionComplete(elements) {
        // Mark elements as visually selected and merge with existing manual selectors
        const visualElements = elements.map(element => ({
            ...element,
            source: 'visual'
        }));
        
        // Merge with existing manual selectors, avoiding duplicates by name
        const existingNames = this.selectedElements.map(el => el.name.toLowerCase());
        const newElements = visualElements.filter(el => !existingNames.includes(el.name.toLowerCase()));
        
        this.selectedElements = [...this.selectedElements, ...newElements];
        
        this.updateSelectorsList();
        this.updateScrapingButtons();
        this.showStatus(`Added ${newElements.length} visually selected elements`, 'success');
        
        // Navigate to selector page to show results
        this.showPage('selectExtract');
    }

    handleElementSelectionCancelled() {
        this.showStatus('Element selection cancelled', 'info');
    }

    updateScrapedData(data) {
        // data is a delta (new items since last message)
        if (Array.isArray(data) && data.length > 0) {
            // Simple deduplication: check if this exact data was just added
            const lastBatch = this.scrapedData.slice(-data.length);
            const isDuplicate = lastBatch.length === data.length && 
                JSON.stringify(lastBatch) === JSON.stringify(data);
            
            if (isDuplicate) {
                return;
            }
            this.scrapedData.push(...data);
            this._chunkBuffer.push(...data);
            this.flushChunksIfNeeded();
        }
        this.showStatus(`Scraped ${this.scrapedData.length} items`, 'info');
      
        // Update log data with current extraction progress
        this.updateLogData({
            elementsFound: this.selectedElements.length,
            dataExtracted: this.scrapedData.length,
            errors: 0
        });
    }

    async handleScrapingComplete(message) {
        
        // Only handle completion if we're actually extracting
        if (!this.isExtracting) {
            return;
        }
        
        const data = message.data || message; // Handle both old and new message formats
        const isManualStop = message.manualStop || false;
        
        // The data from content script is the full accumulated data
        // We should not add it again since we've been receiving incremental updates
        // Just flush any remaining chunks in the buffer
        await this.flushRemainingChunks();
        
        // Stop the scraping service to reset its state (only if not already stopped manually)
        if (!isManualStop) {
            await this.scrapingService.stopScraping();
        }
        
        this.updateScrapingButtons(false);
        
        // Hide progress and preview since extraction is complete
        this.hideProgress();
        this.isExtracting = false;
        this.updateExtractionButton();
        
        // Show completion card with actual extracted data info
        this.showCompletionCard(data.length || this.scrapedData.length, this.selectedElements.length);
        
        // Complete step 2 and enable step 3
        this.completeStep(2);
        
        // Auto-save report if user is authenticated
        if (!this.isAuthenticated) {
            // If not authenticated, save to localStorage for later sync
            this.saveScrapedDataToLocalStorage(this.scrapedData);
        }
        
        const completionType = isManualStop ? 'stopped manually' : 'completed automatically';
        this.addLogMessage(`Extraction ${completionType} with ${this.scrapedData.length} items`);
        this.showStatus(`Extraction ${completionType}! Found ${this.scrapedData.length} items`, 'success');
        
        // Update log data with actual extraction results
        this.updateLogData({
            elementsFound: this.selectedElements.length,
            dataExtracted: this.scrapedData.length,
            errors: 0
        });
    }

    async flushChunksIfNeeded() {
        if (!this.isAuthenticated) return;
        while (this._chunkBuffer.length >= this._chunkSize) {
            const chunk = this._chunkBuffer.splice(0, this._chunkSize);
            await this.persistChunk(chunk);
        }
    }

    async flushRemainingChunks() {
        if (!this.isAuthenticated) return;
        if (this._chunkBuffer.length === 0) return;
        const chunk = this._chunkBuffer.splice(0, this._chunkBuffer.length);
        await this.persistChunk(chunk);
    }

    async persistChunk(chunk) {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab) return;
            
            if (!this._initialReportCreated || !this._currentReportId) {
                // First chunk: create report
                const reportName = `Scrape from ${new URL(tab.url).hostname} - ${new Date().toLocaleDateString()}`;
                const payload = {
                    name: reportName,
                    url: tab.url,
                    selectors: this.selectedElements,
                    data: chunk,
                    idempotencyKey: this._currentIdempotencyKey
                };
                const result = await this.reportService.createReportChunk(payload);
                if (result.success) {
                    this._currentReportId = result.report.id;
                    this._initialReportCreated = true;
                    this._totalItemsSaved += chunk.length;
                    this.toastService.success(`Report created! Saved ${this._totalItemsSaved} items`, 3000);
                } else {
                    this.toastService.error('Failed to create report: ' + result.error, 5000);
                }
            } else {
                // Subsequent chunks: append
                const result = await this.reportService.appendReportChunk(this._currentReportId, chunk);
                if (result.success) {
                    this._totalItemsSaved += chunk.length;
                    this.toastService.info(`Saved ${this._totalItemsSaved} items total`, 2000);
                } else {
                    this.toastService.error('Failed to append data: ' + result.error, 5000);
                }
            }
        } catch (error) {
            console.log('Persist chunk error:', error);
            this.toastService.error('Network error while saving chunk', 5000);
        }
    }

    async saveReport(data) {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            const reportName = `Scrape from ${new URL(tab.url).hostname} - ${new Date().toLocaleDateString()}`;
            
            const reportData = {
                name: reportName,
                url: tab.url,
                selectors: this.selectedElements,
                data: data,
                idempotencyKey: this._currentIdempotencyKey
            };

            // Prevent concurrent duplicate saves
            if (this._isSavingReport) {
                return;
            }
            this._isSavingReport = true;
            const result = await this.reportService.saveReport(reportData);
            this._isSavingReport = false;
            
            if (result.success) {
                this.showStatus('Report saved successfully!', 'success');
                
                // Clean up any temporary data from localStorage since it's now saved to backend
                this.clearTempDataFromLocalStorage();
            } else {
                this.showStatus('Failed to save report: ' + result.error, 'error');
            }
        } catch (error) {
            this._isSavingReport = false;
            console.log('Save report error:', error);
            this.showStatus('Error saving report', 'error');
        }
    }

    clearTempDataFromLocalStorage() {
        try {
            localStorage.removeItem('onpage_temp_data');
        } catch (error) {
            console.log('Error clearing temp data from localStorage:', error);
        }
    }

    saveScrapedDataToLocalStorage(data) {
        try {
            const [tab] = chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs && tabs[0]) {
                    const now = new Date();
                    const timestamp = now.toISOString();
                    const reportName = `Scrape from ${new URL(tabs[0].url).hostname} - ${now.toLocaleDateString()} ${now.toLocaleTimeString()}`;
                    
                    const reportData = {
                        name: reportName,
                        url: tabs[0].url,
                        selectors: this.selectedElements,
                        data: data,
                        createdAt: timestamp,
                        pendingSync: true, // Mark for sync when user logs in
                        tempId: `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, // Unique temp ID
                        idempotencyKey: `offline_${Date.now()}_${Math.random().toString(36).slice(2,10)}`
                    };

                    // Get existing pending reports from onpage_temp_data
                    const existingPending = JSON.parse(localStorage.getItem('onpage_temp_data') || '[]');
                    existingPending.push(reportData);
                    
                    // Save to localStorage
                    localStorage.setItem('onpage_temp_data', JSON.stringify(existingPending));
                    
                    this.showStatus(`Data saved locally. ${existingPending.length} report(s) pending sync.`, 'info');
                }
            });
        } catch (error) {
            console.log('Error saving scraped data to localStorage:', error);
            this.showStatus('Error saving data locally', 'error');
        }
    }

    async syncPendingReports() {
        try {
            const pendingReports = JSON.parse(localStorage.getItem('onpage_temp_data') || '[]');
            
            if (pendingReports.length === 0) {
                return;
            }

            
            const successfulSyncs = [];
            const failedSyncs = [];
            
            for (const report of pendingReports) {
                try {
                    const result = await this.reportService.saveReport(report);
                    if (result.success) {
                        successfulSyncs.push(report);
                        
                        // Remove this specific report from localStorage immediately after successful save
                        this.removeReportFromLocalStorage(report.tempId);
                    } else {
                        failedSyncs.push(report);
                        console.log('❌ Failed to sync report:', report.name, result.error);
                    }
                } catch (error) {
                    failedSyncs.push(report);
                    console.log('❌ Error syncing report:', report.name, error);
                }
            }
            
            // Update localStorage with only failed syncs
            if (successfulSyncs.length > 0) {
                localStorage.setItem('onpage_temp_data', JSON.stringify(failedSyncs));
                console.log(`🧹 Removed ${successfulSyncs.length} successfully synced reports from localStorage`);
                
                if (failedSyncs.length > 0) {
                    console.log(`⚠️ ${failedSyncs.length} reports failed to sync and remain in localStorage for retry`);
                } else {
                    console.log('🎉 All pending reports synced successfully!');
                }
            }
            
        } catch (error) {
            console.log('Error syncing pending reports:', error);
        }
    }

    removeReportFromLocalStorage(tempId) {
        try {
            const pendingReports = JSON.parse(localStorage.getItem('onpage_temp_data') || '[]');
            const filteredReports = pendingReports.filter(report => report.tempId !== tempId);
            localStorage.setItem('onpage_temp_data', JSON.stringify(filteredReports));
        } catch (error) {
            console.log('Error removing report from localStorage:', error);
        }
    }


    showStatus(message, type = 'info') {
        const statusMessage = document.getElementById('statusMessage');
        if (statusMessage) {
            statusMessage.textContent = message;
            statusMessage.className = `status-message ${type}`;
            
            // Auto-hide after 3 seconds
            setTimeout(() => {
                statusMessage.textContent = '';
                statusMessage.className = 'status-message';
            }, 3000);
        }
    }

    // Helper methods for form management
    clearLoginForm() {
        document.getElementById('email').value = '';
        document.getElementById('password').value = '';
    }

    clearRegistrationForm() {
        document.getElementById('regFirstName').value = '';
        document.getElementById('regLastName').value = '';
        document.getElementById('regEmail').value = '';
        document.getElementById('regPassword').value = '';
        document.getElementById('regCompany').value = '';
        document.getElementById('regRole').value = 'other';
    }

    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    // Settings management

    loadUserSettings() {
        if (this.currentUser) {
            const prefs = this.currentUser.preferences || {};
            
            // Load chunk size (default to 1000 if not set)
            const chunkSize = prefs.scraping?.chunkSize || 1000;
            this._chunkSize = chunkSize;
            const chunkSizeSelect = document.getElementById('chunkSize');
            if (chunkSizeSelect) {
                chunkSizeSelect.value = chunkSize;
            }
            
            // Load auto-save setting
            if (prefs.scraping && prefs.scraping.autoSave !== undefined) {
                const autoSaveCheckbox = document.getElementById('autoSave');
                if (autoSaveCheckbox) {
                    autoSaveCheckbox.checked = prefs.scraping.autoSave;
                }
            }
            
            // Load notification settings
            if (prefs.notifications) {
                const extensionNotifications = document.getElementById('extensionNotifications');
                const emailNotifications = document.getElementById('emailNotifications');
                
                if (extensionNotifications) {
                    extensionNotifications.checked = prefs.notifications.extension !== false;
                }
                if (emailNotifications) {
                    emailNotifications.checked = prefs.notifications.email !== false;
                }
            }
        }
    }

    async handleSettingsSave(e) {
        e.preventDefault();
        
        const formData = new FormData(e.target);
        const settings = {
            chunkSize: parseInt(formData.get('chunkSize')),
            autoSave: formData.has('autoSave'),
            extensionNotifications: formData.has('extensionNotifications'),
            emailNotifications: formData.has('emailNotifications')
        };
        
        // Update local chunk size
        this._chunkSize = settings.chunkSize;
        
        // Save to backend
        try {
            // Prepare preferences structure for backend
            const preferences = {
                scraping: {
                    chunkSize: settings.chunkSize,
                    autoSave: settings.autoSave
                },
                notifications: {
                    extension: settings.extensionNotifications,
                    email: settings.emailNotifications
                }
            };

            // Save to backend
            const result = await this.authService.updatePreferences(preferences);
            
            if (result.success) {
                this.toastService.success('Settings saved successfully!', 3000);
                
                // Update current user with response from backend
                this.currentUser = result.user;
                
                // Save to local storage as backup
                await chrome.storage.local.set({ 'onpage_user_settings': settings });
            } else {
                throw new Error(result.error || 'Failed to save settings');
            }
            
            // Return to dashboard
            setTimeout(() => {
                this.showPage('home');
            }, 1000);
            
        } catch (error) {
            console.log('Error saving settings:', error);
            this.toastService.error('Failed to save settings', 5000);
        }
    }

    showLoading(show) {
        const spinner = document.getElementById('loadingSpinner');
        if (spinner) {
            spinner.style.display = show ? 'flex' : 'none';
        }
    }

    async performRescan() {
        this.hideSummaryCard();
        // Rescan functionality removed - quick scan no longer available
        this.showStatus('Rescan functionality has been removed', 'info');
    }

    showProgress(title, status) {
        const progressContainer = document.getElementById('progressContainer');
        const extractionProgress = document.getElementById('extractionProgress');
        const progressTitle = document.getElementById('progressTitle');
        const extractionTitle = document.getElementById('extractionTitle');
        const progressStatus = document.getElementById('progressStatus');
        const extractionStatus = document.getElementById('extractionStatus');
        const progressFill = document.getElementById('progressFill');
        const extractionFill = document.getElementById('extractionFill');

        // Show progress on both home and scraper pages
        if (progressContainer) {
            progressContainer.style.display = 'block';
            if (progressTitle) progressTitle.textContent = title;
            if (progressStatus) progressStatus.textContent = status;
            if (progressFill) progressFill.style.width = '0%';
        }
        if (extractionProgress) {
            extractionProgress.style.display = 'block';
            if (extractionTitle) extractionTitle.textContent = title;
            if (extractionStatus) extractionStatus.textContent = status;
            if (extractionFill) extractionFill.style.width = '0%';
        }
    }

    hideProgress() {
        const progressContainer = document.getElementById('progressContainer');
        const extractionProgress = document.getElementById('extractionProgress');
        
        if (progressContainer) {
            progressContainer.style.display = 'none';
        }
        if (extractionProgress) {
            extractionProgress.style.display = 'none';
        }
    }

    async simulateProgress(steps) {
        for (const step of steps) {
            document.getElementById('progressFill').style.width = step.progress + '%';
            document.getElementById('progressStatus').textContent = step.status;
            await new Promise(resolve => setTimeout(resolve, 800));
        }
    }

    showSummaryCard(results) {
        const summaryCard = document.getElementById('summaryCard');
        const elementsCount = document.getElementById('elementsCount');
        const extractableCount = document.getElementById('extractableCount');

        if (summaryCard) {
            summaryCard.style.display = 'block';
            elementsCount.textContent = results.elementsFound;
            extractableCount.textContent = results.extractableCount;
        }
    }

    hideSummaryCard() {
        const summaryCard = document.getElementById('summaryCard');
        if (summaryCard) {
            summaryCard.style.display = 'none';
        }
    }

    showError(title, message) {
        const errorContainer = document.getElementById('errorContainer');
        const errorTitle = document.getElementById('errorTitle');
        const errorMessage = document.getElementById('errorMessage');

        if (errorContainer) {
            errorContainer.style.display = 'block';
            errorTitle.textContent = title;
            errorMessage.textContent = message;
        }

        this.hideProgress();
    }

    dismissError() {
        const errorContainer = document.getElementById('errorContainer');
        if (errorContainer) {
            errorContainer.style.display = 'none';
        }
    }

    async retryExtraction() {
        this.dismissError();
        await this.handleStartScraping();
    }


    formatRelativeTime(timestamp) {
        const now = new Date();
        const time = new Date(timestamp);
        const diffMs = now - time;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        return `${diffDays}d ago`;
    }


    updatePageSpecificUI(pageName) {
        switch (pageName) {
            case 'home':
                this.updateSelectedElementsUI();
                break;
            case 'selectExtract':
                this.updateSelectorsList();
                this.updateScrapingButtons(this.isExtracting); // Preserve current state
                this.updateExtractionSummary();
                break;
            case 'settings':
                this.loadUserSettings();
                break;
        }
    }


    // ================== NEW WORKFLOW METHODS ==================

    updateWorkflowUI() {
        // Update step indicators
        document.querySelectorAll('.workflow-step').forEach((step, index) => {
            const stepNumber = index + 1;
            step.classList.remove('active', 'completed');
            
            if (stepNumber === this.currentStep) {
                step.classList.add('active');
            } else if (this.completedSteps.includes(stepNumber)) {
                step.classList.add('completed');
            }
        });

        // Update workflow button text and action
        const workflowBtn = document.getElementById('workflowBtn');
        const workflowBtnText = document.getElementById('workflowBtnText');
        
        if (workflowBtn && workflowBtnText) {
            let buttonText = '';
            let isEnabled = true;

            switch (this.currentStep) {
                case 1:
                    buttonText = 'Start: Select Elements';
                    break;
                case 2:
                    buttonText = 'Configure & Extract';
                    isEnabled = this.selectedElements.length > 0;
                    break;
                case 3:
                    buttonText = 'Open Reports Page';
                    isEnabled = true; // Always enabled since it just opens the reports page
                    break;
                default:
                    buttonText = 'Complete';
                    isEnabled = false;
            }

            workflowBtnText.textContent = buttonText;
            workflowBtn.disabled = !isEnabled;
        }
    }

    handleWorkflowAction() {
        switch (this.currentStep) {
            case 2:
                this.showPage('selectExtract');
                break;
            case 3:
                // Open the dedicated reports page
                chrome.tabs.create({ url: chrome.runtime.getURL('reports.html') });
                break;
        }
    }

    completeStep(stepNumber) {
        if (!this.completedSteps.includes(stepNumber)) {
            this.completedSteps.push(stepNumber);
        }
        
        if (stepNumber === this.currentStep && stepNumber < 3) {
            this.currentStep = stepNumber + 1;
        }
        
        this.updateWorkflowUI();
    }

    updateExtractionOptions(event) {
        const checkbox = event.target;
        const optionKey = checkbox.id.replace('extract', '').toLowerCase();
        
        // Map checkbox IDs to option keys
        const optionMap = {
            'text': 'text',
            'images': 'images',
            'links': 'links',
            'structured': 'structured',
            'deepscan': 'deepScan',
            'visibleonly': 'visibleOnly',
            'excludeduplicates': 'excludeDuplicates'
        };

        const mappedKey = optionMap[optionKey];
        if (mappedKey && this.extractionOptions.hasOwnProperty(mappedKey)) {
            this.extractionOptions[mappedKey] = checkbox.checked;
        }
        
        this.updateExtractionSummary();
    }

    // ================== PREVIEW & LOG METHODS ==================



    toggleLogDrawer() {
        const logContent = document.getElementById('logContent');
        const logToggle = document.getElementById('logToggle');

        if (logContent && logToggle) {
            const isOpen = logContent.style.display === 'block';
            
            logContent.style.display = isOpen ? 'none' : 'block';
            logToggle.classList.toggle('expanded', !isOpen);
        }
    }

    updateLogData(data) {
        Object.assign(this.logData, data);
        
        const logElementsFound = document.getElementById('logElementsFound');
        const logDataExtracted = document.getElementById('logDataExtracted');
        const logErrors = document.getElementById('logErrors');

        if (logElementsFound) logElementsFound.textContent = this.logData.elementsFound;
        if (logDataExtracted) logDataExtracted.textContent = this.logData.dataExtracted;
        if (logErrors) logErrors.textContent = this.logData.errors;
    }

    addLogMessage(message) {
        const timestamp = new Date().toLocaleTimeString();
        this.logData.messages.push(`[${timestamp}] ${message}`);
        
        const logMessages = document.getElementById('logMessages');
        if (logMessages) {
            logMessages.innerHTML = this.logData.messages.slice(-50).join('\n'); // Keep last 50 messages
            logMessages.scrollTop = logMessages.scrollHeight;
        }
    }


    // ================== UTILITY METHODS ==================

    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    updateExtractionButton() {
        const extractionBtn = document.getElementById('extractionBtn');
        const extractionBtnIcon = document.getElementById('extractionBtnIcon');
        const extractionBtnText = document.getElementById('extractionBtnText');

        // Debug logs removed for cleaner output

        if (extractionBtn && extractionBtnIcon && extractionBtnText) {
            if (this.isExtracting) {
                extractionBtnIcon.textContent = '⏸';
                extractionBtnText.textContent = 'Stop Extraction';
                extractionBtn.style.background = 'var(--accent-red)';
                extractionBtn.disabled = false; // Always enable when extracting
                console.log('Button updated to Stop Extraction');
            } else {
                extractionBtnIcon.textContent = '▶';
                extractionBtnText.textContent = 'Start Extraction';
                extractionBtn.style.background = '';
                extractionBtn.disabled = this.selectedElements.length === 0;
                console.log('Button updated to Start Extraction');
            }
        } else {
            console.log('Extraction button elements not found:', {
                extractionBtn: !!extractionBtn,
                extractionBtnIcon: !!extractionBtnIcon,
                extractionBtnText: !!extractionBtnText
            });
        }
    }

    async simulateExtractionProgress() {
        const steps = [
            { progress: 10, status: 'Analyzing page structure...', delay: 500 },
            { progress: 25, status: 'Locating selected elements...', delay: 800 },
            { progress: 45, status: 'Extracting data...', delay: 1000 },
            { progress: 70, status: 'Processing content...', delay: 700 },
            { progress: 90, status: 'Finalizing extraction...', delay: 500 },
            { progress: 100, status: 'Complete!', delay: 200 }
        ];

        for (const step of steps) {
            // Update progress on both progress containers
            const progressFill = document.getElementById('progressFill');
            const extractionFill = document.getElementById('extractionFill');
            const progressStatus = document.getElementById('progressStatus');
            const extractionStatus = document.getElementById('extractionStatus');

            if (progressFill) progressFill.style.width = step.progress + '%';
            if (extractionFill) extractionFill.style.width = step.progress + '%';
            if (progressStatus) progressStatus.textContent = step.status;
            if (extractionStatus) extractionStatus.textContent = step.status;

            // Add log message
            this.addLogMessage(step.status);

            // Update log data
            this.updateLogData({
                elementsFound: Math.floor(step.progress / 20),
                dataExtracted: Math.floor(step.progress / 10),
                errors: step.progress < 50 ? 0 : (step.progress > 80 ? 1 : 0)
            });


            await new Promise(resolve => setTimeout(resolve, step.delay));
        }
    }

    showCompletionCard(itemsCount, elementsCount) {
        const completionCard = document.getElementById('completionCard');
        const extractedItemsCount = document.getElementById('extractedItemsCount');
        const extractedElementsCount = document.getElementById('extractedElementsCount');

        if (completionCard) {
            completionCard.style.display = 'block';
        }
        if (extractedItemsCount) {
            extractedItemsCount.textContent = itemsCount;
        }
        if (extractedElementsCount) {
            extractedElementsCount.textContent = elementsCount;
        }

        // Hide progress and preview areas
        this.hideProgress();

        // Add completion animation
        if (completionCard) {
            completionCard.style.opacity = '0';
            completionCard.style.transform = 'translateY(20px)';
            completionCard.style.transition = 'all 0.3s ease';
            
            setTimeout(() => {
                completionCard.style.opacity = '1';
                completionCard.style.transform = 'translateY(0)';
            }, 100);
        }
    }

    hideCompletionCard() {
        const completionCard = document.getElementById('completionCard');
        if (completionCard) {
            completionCard.style.display = 'none';
        }
    }

    startNewExtraction() {
        // Hide completion card
        this.hideCompletionCard();
        
        // Reset state
        this.scrapedData = [];
        this.isExtracting = false;
        // Reset chunked upload state
        this._chunkBuffer = [];
        this._currentReportId = null;
        this._initialReportCreated = false;
        this._totalItemsSaved = 0;
        
        // Clear preview and log
        this.clearPreview();
        this.logData = {
            elementsFound: 0,
            dataExtracted: 0,
            errors: 0,
            messages: []
        };
        
        // Update UI
        this.updateExtractionButton();
        this.showStatus('Ready for new extraction', 'info');
        
        // Navigate to selector page if no elements selected
        if (this.selectedElements.length === 0) {
            this.showPage('selectExtract');
        }
    }

    // New method to update extraction summary
    updateExtractionSummary() {
        const summaryElement = document.getElementById('extractionSummary');
        const elementCountElement = document.getElementById('summaryElementCount');
        const containerElement = document.getElementById('summaryContainer');
        const dataTypesElement = document.getElementById('summaryDataTypes');
        
        if (!summaryElement) return;
        
        // Show summary if elements are selected
        if (this.selectedElements.length > 0) {
            summaryElement.style.display = 'block';
            
            // Update element count
            if (elementCountElement) {
                elementCountElement.textContent = this.selectedElements.length;
            }
            
            // Update container selector
            if (containerElement) {
                const containerInput = document.getElementById('containerSelector');
                const containerValue = containerInput ? containerInput.value.trim() : '';
                containerElement.textContent = containerValue || 'None';
            }
            
            // Update data types
            if (dataTypesElement) {
                const dataTypes = [];
                if (document.getElementById('extractText')?.checked) dataTypes.push('Text');
                if (document.getElementById('extractImages')?.checked) dataTypes.push('Images');
                if (document.getElementById('extractLinks')?.checked) dataTypes.push('Links');
                if (document.getElementById('extractStructured')?.checked) dataTypes.push('Structured');
                
                dataTypesElement.textContent = dataTypes.length > 0 ? dataTypes.join(', ') : 'Text';
            }
        } else {
            summaryElement.style.display = 'none';
        }
    }

    // Handle container selector selection
    async handleSelectContainer() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (!tab) {
                this.showStatus('No active tab found', 'error');
                return;
            }

            // Store the current popup state before closing
            await chrome.storage.local.set({
                'onpage_container_selection_mode': true
            });

            // Inject the content script
            try {
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ['content.js']
                });
            } catch (error) {
                // Content script might already be injected
                console.log('Content script injection skipped:', error.message);
            }

            // Send message to content script to start container selection
            await chrome.tabs.sendMessage(tab.id, {
                action: 'startContainerSelection'
            });

            // Close popup to allow user to interact with the page
            window.close();
            
        } catch (error) {
            console.log('Error starting container selection:', error);
            this.showStatus('Error starting container selection', 'error');
        }
    }

    // ================== MANUAL SELECTOR METHODS ==================

    handleAddManualSelector() {
        const nameInput = document.getElementById('selectorName');
        const valueInput = document.getElementById('selectorValue');
        
        if (!nameInput || !valueInput) {
            console.log('Manual selector inputs not found');
            return;
        }
        
        const name = nameInput.value.trim();
        const selector = valueInput.value.trim();
        
        // Validation
        if (!name) {
            this.showStatus('Please enter an element name', 'error');
            nameInput.focus();
            return;
        }
        
        if (!selector) {
            this.showStatus('Please enter a CSS selector', 'error');
            valueInput.focus();
            return;
        }
        
        // Check if name already exists
        const existingElement = this.selectedElements.find(el => el.name.toLowerCase() === name.toLowerCase());
        if (existingElement) {
            this.showStatus(`Element with name "${name}" already exists`, 'error');
            nameInput.focus();
            return;
        }
        
        // Validate CSS selector
        if (!this.validateCSSSelector(selector)) {
            this.showStatus('Invalid CSS selector syntax', 'error');
            valueInput.focus();
            return;
        }
        
        // Add to selected elements
        const newElement = {
            name: name,
            selector: selector,
            source: 'manual'
        };
        
        this.selectedElements.push(newElement);
        
        // Update UI
        this.updateSelectorsList();
        this.updateScrapingButtons();
        this.updateSelectedElementsUI();
        
        // Clear inputs
        nameInput.value = '';
        valueInput.value = '';
        
        // Save to storage
        this.saveSelectedElements();
        
        // Show success
        this.showStatus(`Added selector: ${name}`, 'success');
        
        // Focus back to name input for next entry
        nameInput.focus();
    }
    
    validateCSSSelector(selector) {
        try {
            // Try to use querySelector with the selector
            document.querySelector(selector);
            return true;
        } catch (error) {
            try {
                // Also try querySelectorAll in case it's a complex selector
                document.querySelectorAll(selector);
                return true;
            } catch (error2) {
                console.warn('Invalid CSS selector:', selector, error2.message);
                return false;
            }
        }
    }
    
    toggleExamples() {
        const content = document.getElementById('examplesContent');
        const toggle = document.getElementById('examplesToggle');
        
        if (!content || !toggle) return;
        
        const isOpen = content.style.display === 'block';
        
        content.style.display = isOpen ? 'none' : 'block';
        toggle.classList.toggle('expanded', !isOpen);
    }
    
    fillSelectorInputs(name, selector) {
        const nameInput = document.getElementById('selectorName');
        const valueInput = document.getElementById('selectorValue');
        
        if (nameInput && valueInput) {
            nameInput.value = name;
            valueInput.value = selector;
            nameInput.focus();
            
            // Highlight the inputs briefly
            nameInput.style.background = '#e8f5e8';
            valueInput.style.background = '#e8f5e8';
            
            setTimeout(() => {
                nameInput.style.background = '';
                valueInput.style.background = '';
            }, 1000);
        }
    }

}

// Initialize popup controller when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.popupController = new PopupController();
});
