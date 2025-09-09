// Reports Dashboard Controller
class ReportsController {
    constructor() {
        this.authService = new AuthService();
        this.reportService = new ReportService(this.authService);
        this.isAuthenticated = false;
        this.currentUser = null;
        this.reports = [];
        this.filteredReports = [];
        this.currentView = 'grid';
        this.selectedReports = new Set();
        this.isBulkMode = false;
        this.isExporting = false;
        this.currentSort = 'newest';
        this.pendingActions = new Map();
        
        // Stable bound handlers to avoid duplicate listeners
        this.boundReportClick = this.handleReportClick.bind(this);
        this.boundReportSelect = this.handleReportSelect.bind(this);
        // Debounced interactions for smoother UX
        this.debouncedSearch = this.debounce((e) => this.handleSearch(e), 200);
        this.debouncedFilter = this.debounce(() => this.handleFilter(), 150);
        
        this.init();
    }

    async init() {
        // Check authentication
        await this.checkAuthStatus();
        
        if (!this.isAuthenticated) {
            this.redirectToLogin();
            return;
        }

        // Set up event listeners
        this.setupEventListeners();
        
        // Load reports
        await this.loadReports();
        
        // Update UI
        this.updateUI();
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

    redirectToLogin() {
        // Redirect to extension popup for login
        window.location.href = 'popup.html';
    }

    setupEventListeners() {
        // Logout button
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', this.handleLogout.bind(this));
        }

        // Search input
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', this.debouncedSearch);
        }

        // Filter controls
        const domainFilter = document.getElementById('domainFilter');
        const dateFilter = document.getElementById('dateFilter');
        const refreshBtn = document.getElementById('refreshBtn');

        if (domainFilter) {
            domainFilter.addEventListener('change', this.debouncedFilter);
        }
        if (dateFilter) {
            dateFilter.addEventListener('change', this.debouncedFilter);
        }
        if (refreshBtn) {
            refreshBtn.addEventListener('click', this.handleRefresh.bind(this));
        }

        // View controls
        const gridViewBtn = document.getElementById('gridViewBtn');
        const listViewBtn = document.getElementById('listViewBtn');

        if (gridViewBtn) {
            gridViewBtn.addEventListener('click', () => this.setView('grid'));
        }
        if (listViewBtn) {
            listViewBtn.addEventListener('click', () => this.setView('list'));
        }

        // Modal controls
        const closeModalBtn = document.getElementById('closeModalBtn');
        const exportModalBtn = document.getElementById('exportModalBtn');

        if (closeModalBtn) {
            closeModalBtn.addEventListener('click', () => this.closeModal('reportModal'));
        }
        if (exportModalBtn) {
            exportModalBtn.addEventListener('click', this.exportCurrentReport.bind(this));
        }

        // Close modal on outside click
        const modal = document.getElementById('reportModal');
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal || e.target.classList.contains('modal-overlay')) {
                    this.closeModal('reportModal');
                }
            });
        }

        // Setup event delegation for reports list
        this.setupReportEventDelegation();

        // Enhanced Filter Controls
        const sortFilter = document.getElementById('sortFilter');
        const clearFiltersBtn = document.getElementById('clearFiltersBtn');
        const searchBtn = document.getElementById('searchBtn');
        const clearSearchBtn = document.getElementById('clearSearchBtn');

        if (sortFilter) {
            sortFilter.addEventListener('change', this.handleSortChange.bind(this));
        }
        if (clearFiltersBtn) {
            clearFiltersBtn.addEventListener('click', this.clearAllFilters.bind(this));
        }
        if (searchBtn) {
            searchBtn.addEventListener('click', this.performSearch.bind(this));
        }
        if (clearSearchBtn) {
            clearSearchBtn.addEventListener('click', this.clearSearch.bind(this));
        }

        // Enhanced Bulk Controls
        const selectAllCheckbox = document.getElementById('selectAllCheckbox');
        const bulkDeleteBtn = document.getElementById('bulkDeleteBtn');
        const bulkExportBtn = document.getElementById('bulkExportBtn');
        const bulkSelectBtn = document.getElementById('bulkSelectBtn');
        const cancelBulkBtn = document.getElementById('cancelBulkBtn');

        if (selectAllCheckbox) {
            selectAllCheckbox.addEventListener('change', this.handleSelectAll.bind(this));
        }
        if (bulkDeleteBtn) {
            bulkDeleteBtn.addEventListener('click', this.handleBulkDelete.bind(this));
        }
        if (bulkExportBtn) {
            bulkExportBtn.addEventListener('click', this.handleBulkExport.bind(this));
        }
        if (bulkSelectBtn) {
            bulkSelectBtn.addEventListener('click', this.toggleBulkMode.bind(this));
        }
        if (cancelBulkBtn) {
            cancelBulkBtn.addEventListener('click', this.exitBulkMode.bind(this));
        }

        // Enhanced Modal Controls
        const deleteModalBtn = document.getElementById('deleteModalBtn');
        const copyUrlBtn = document.getElementById('copyUrlBtn');
        const exportDropdown = document.getElementById('exportDropdown');

        if (deleteModalBtn) {
            deleteModalBtn.addEventListener('click', this.handleDeleteFromModal.bind(this));
        }
        if (copyUrlBtn) {
            copyUrlBtn.addEventListener('click', this.copyReportUrl.bind(this));
        }
        if (exportDropdown) {
            exportDropdown.addEventListener('click', this.toggleExportDropdown.bind(this));
        }

        // Export Dropdown Items
        document.addEventListener('click', this.handleExportDropdownClick.bind(this));

        // Confirmation Modal Controls
        const confirmCancelBtn = document.getElementById('confirmCancelBtn');
        const confirmActionBtn = document.getElementById('confirmActionBtn');

        if (confirmCancelBtn) {
            confirmCancelBtn.addEventListener('click', this.closeConfirmModal.bind(this));
        }
        if (confirmActionBtn) {
            confirmActionBtn.addEventListener('click', this.executeConfirmedAction.bind(this));
        }

        // Export Progress Modal Controls
        const cancelExportBtn = document.getElementById('cancelExportBtn');
        if (cancelExportBtn) {
            cancelExportBtn.addEventListener('click', this.cancelExport.bind(this));
        }

        // Close modals on overlay click
        this.setupModalOverlayHandlers();
    }

    setupReportEventDelegation() {
        const reportsList = document.getElementById('reportsList');
        if (!reportsList) return;

        // Remove existing event listeners to avoid duplicates
        reportsList.removeEventListener('click', this.boundReportClick);
        
        // Add event delegation
        reportsList.addEventListener('click', this.boundReportClick);
    }

    handleReportClick(event) {
        const target = event.target;
        const reportCard = target.closest('.report-card');
        
        if (!reportCard) return;

        const action = target.dataset.action;
        const reportId = reportCard.dataset.reportId;
        
        // Handle checkbox clicks
        if (target.type === 'checkbox') {
            event.stopPropagation();
            this.toggleReportSelection(reportId, target.checked);
            return;
        }
        
        // Handle stop propagation for links and buttons
        if (action === 'stop-propagation') {
            event.stopPropagation();
            return;
        }
        
        // Handle export action
        if (action === 'export') {
            event.stopPropagation();
            if (reportId) {
                this.exportReport(reportId);
            }
            return;
        }
        
        // Handle delete action
        if (action === 'delete') {
            event.stopPropagation();
            if (reportId) {
                this.deleteReport(reportId);
            }
            return;
        }
        
        // Handle report card click (show details) - only if not in bulk mode
        if (!this.isBulkMode && target.closest('.report-card') && !target.closest('.report-actions') && !target.closest('.report-url')) {
            const report = this.reports.find(r => (r._id || r.id) === reportId);
            if (report) {
                this.showReportDetails(report);
            }
        }
    }

    async loadReports() {
        this.showLoading(true);
        
        try {
            // IMPORTANT: Reports page ONLY loads from backend, never from localStorage
            // localStorage is used only as temporary storage in popup.js for pending reports
            const result = await this.reportService.getReports();
            
            if (result.success) {
                this.reports = result.reports || [];
                this.filteredReports = [...this.reports];
                this.updateReportsList();
                this.updateStats();
                this.updateDomainFilter();
            } else {
                this.showError('Failed to load reports: ' + result.error);
            }
        } catch (error) {
            console.log('Load reports error:', error);
            this.showError('Error loading reports');
        } finally {
            this.showLoading(false);
        }
    }

    updateUI() {
        // Update user email
        const userEmail = document.getElementById('userEmail');
        if (userEmail && this.currentUser) {
            userEmail.textContent = this.currentUser.email;
        }
    }

    updateStats() {
        const totalReports = this.reports.length;
        const totalItems = this.reports.reduce((sum, report) => sum + (report.totalItems || report.data?.length || 0), 0);
        const uniqueDomains = new Set(this.reports.map(report => {
            try {
                return new URL(report.url).hostname;
            } catch {
                return 'Unknown';
            }
        })).size;

        document.getElementById('totalReports').textContent = totalReports;
        document.getElementById('totalItems').textContent = totalItems;
        document.getElementById('uniqueDomains').textContent = uniqueDomains;
    }

    updateDomainFilter() {
        const domainFilter = document.getElementById('domainFilter');
        if (!domainFilter) return;

        const domains = new Set();
        this.reports.forEach(report => {
            try {
                domains.add(new URL(report.url).hostname);
            } catch {
                domains.add('Unknown');
            }
        });

        // Clear existing options except "All Domains"
        domainFilter.innerHTML = '<option value="">All Domains</option>';
        
        // Add domain options
        Array.from(domains).sort().forEach(domain => {
            const option = document.createElement('option');
            option.value = domain;
            option.textContent = domain;
            domainFilter.appendChild(option);
        });
    }

    updateReportsList() {
        const reportsList = document.getElementById('reportsList');
        if (!reportsList) return;

        if (this.filteredReports.length === 0) {
            reportsList.innerHTML = `
                <div class="empty-state">
                    <div style="font-size: 3rem; margin-bottom: 1rem;">📊</div>
                    <p>No reports found</p>
                    <p style="font-size: 0.875rem; color: #64748b; margin-top: 0.5rem;">
                        Create your first report by using the extension popup
                    </p>
                </div>
            `;
            return;
        }

        const html = this.filteredReports.map(report => this.createReportCard(report)).join('');
        reportsList.innerHTML = html;
        
        // Update bulk controls after rendering (but don't call updateReportsList again)
        this.updateBulkControlsState();
    }

    createReportCard(report) {
        const domain = this.getDomainFromUrl(report.url);
        const itemCount = report.totalItems || report.data?.length || 0;
        const createdDate = new Date(report.createdAt).toLocaleDateString();
        const selectorCount = report.selectors?.length || 0;

        return `
            <div class="report-card ${this.isBulkMode ? 'has-checkbox' : ''}" data-report-id="${report._id || report.id}">
                ${this.isBulkMode ? `<input type="checkbox" class="report-checkbox" data-report-id="${report._id || report.id}">` : ''}
                <div class="report-header">
                    <div>
                        <div class="report-title">${this.escapeHtml(report.name)}</div>
                        <a href="${report.url}" target="_blank" class="report-url" data-action="stop-propagation">
                            ${domain}
                        </a>
                    </div>
                </div>
                
                <div class="report-meta">
                    <span>📅 ${createdDate}</span>
                    <span>🎯 ${selectorCount} selectors</span>
                </div>
                
                <div class="report-stats">
                    <div class="stat-badge">
                        <span>📊</span>
                        <span>${itemCount} items</span>
                    </div>
                </div>
                
                <div class="report-actions" data-action="stop-propagation">
                    <button class="btn btn-primary btn-sm" data-action="export" data-report-id="${report._id || report.id}">
                        <span class="icon">📥</span>
                        Export
                    </button>
                    <button class="btn btn-danger btn-sm" data-action="delete" data-report-id="${report._id || report.id}">
                        <span class="icon">🗑️</span>
                        Delete
                    </button>
                </div>
            </div>
        `;
    }

    getDomainFromUrl(url) {
        try {
            return new URL(url).hostname;
        } catch {
            return 'Unknown';
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    handleSearch(event) {
        const query = event.target.value.toLowerCase();
        this.filteredReports = this.reports.filter(report => 
            report.name.toLowerCase().includes(query) ||
            report.url.toLowerCase().includes(query) ||
            this.getDomainFromUrl(report.url).toLowerCase().includes(query)
        );
        this.updateReportsList();
    }

    handleFilter() {
        const domainFilter = document.getElementById('domainFilter').value;
        const dateFilter = document.getElementById('dateFilter').value;
        
        this.filteredReports = this.reports.filter(report => {
            // Domain filter
            if (domainFilter && this.getDomainFromUrl(report.url) !== domainFilter) {
                return false;
            }
            
            // Date filter
            if (dateFilter) {
                const reportDate = new Date(report.createdAt);
                const now = new Date();
                
                switch (dateFilter) {
                    case 'today':
                        return reportDate.toDateString() === now.toDateString();
                    case 'week':
                        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                        return reportDate >= weekAgo;
                    case 'month':
                        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                        return reportDate >= monthAgo;
                }
            }
            
            return true;
        });
        
        this.updateReportsList();
    }

    handleRefresh() {
        this.loadReports();
    }

    setView(view) {
        this.currentView = view;
        const reportsList = document.getElementById('reportsList');
        const gridBtn = document.getElementById('gridViewBtn');
        const listBtn = document.getElementById('listViewBtn');
        
        if (reportsList) {
            reportsList.className = `reports-list ${view}-view`;
        }
        
        if (gridBtn && listBtn) {
            gridBtn.classList.toggle('active', view === 'grid');
            listBtn.classList.toggle('active', view === 'list');
        }
    }

    async showReportDetails(report) {
        const modal = document.getElementById('reportModal');
        const modalTitle = document.getElementById('modalTitle');
        const detailName = document.getElementById('detailName');
        const detailUrl = document.getElementById('detailUrl');
        const detailCreated = document.getElementById('detailCreated');
        const detailItems = document.getElementById('detailItems');
        const detailSelectors = document.getElementById('detailSelectors');
        const detailData = document.getElementById('detailData');
        
        if (!modal) return;
        
        // Update modal content
        modalTitle.textContent = report.name;
        detailName.textContent = report.name;
        detailUrl.textContent = report.url;
        detailCreated.textContent = new Date(report.createdAt).toLocaleString();
        detailItems.textContent = (report.totalItems || report.data?.length || 0);
        
        // Update selectors
        if (report.selectors && report.selectors.length > 0) {
            detailSelectors.innerHTML = report.selectors.map(selector => `
                <div class="selector-item">
                    <div class="selector-name">${this.escapeHtml(selector.name)}</div>
                    <div class="selector-value">${this.escapeHtml(selector.selector)}</div>
                </div>
            `).join('');
        } else {
            detailSelectors.innerHTML = '<p style="color: #64748b; font-style: italic;">No selectors available</p>';
        }
        
        // Update sample data
        // Prefer backend sample when chunks are used
        let sampleData = [];
        if (report.totalItems && report.totalItems > 0 && (!report.data || report.data.length === 0)) {
            const result = await this.reportService.getReportSample(report._id || report.id, 5);
            if (result.success) {
                sampleData = result.sample || [];
            }
        } else if (report.data && report.data.length > 0) {
            sampleData = report.data.slice(0, 5);
        }

        if (sampleData.length > 0) {
            const headers = Object.keys(sampleData[0] || {});
            
            detailData.innerHTML = `
                <div class="data-preview-content">
                    <div style="margin-bottom: 1rem; padding: 0.75rem; background: #e0f2fe; border-radius: 0.5rem; border-left: 4px solid #38aab4;">
                        <strong style="color: #15415e;">📊 Data Summary:</strong>
                        <div style="margin-top: 0.5rem; font-size: 0.875rem; color: #64748b;">
                            • Total Items: ${(report.totalItems || report.data?.length || 0)}<br>
                            • Selectors: ${headers.length}<br>
                            • Showing: First ${sampleData.length} items
                        </div>
                    </div>
                    ${sampleData.map((row, index) => {
                        // Check if this row has any meaningful data
                        const hasData = headers.some(header => {
                            const value = row[header];
                            if (typeof value === 'object' && value !== null) {
                                return Object.values(value).some(v => v && v !== '');
                            }
                            return value && value !== '';
                        });
                        
                        if (!hasData) {
                            return `
                                <div class="data-item" style="margin-bottom: 1.5rem; padding: 1rem; background: #fef3c7; border-radius: 0.5rem; border: 1px solid #f59e0b;">
                                    <h5 style="margin: 0 0 0.75rem 0; color: #92400e; font-size: 0.875rem; font-weight: 600;">Item ${index + 1} - ⚠️ Empty Data</h5>
                                    <p style="margin: 0; color: #92400e; font-size: 0.75rem; font-style: italic;">This item contains no scraped data</p>
                                </div>
                            `;
                        }
                        
                        return `
                            <div class="data-item" style="margin-bottom: 1.5rem; padding: 1rem; background: #f8fafc; border-radius: 0.5rem; border: 1px solid #e2e8f0;">
                                <h5 style="margin: 0 0 0.75rem 0; color: #15415e; font-size: 0.875rem; font-weight: 600;">Item ${index + 1}</h5>
                                ${headers.map(header => {
                                    const value = row[header];
                                    if (typeof value === 'object' && value !== null) {
                                        const nonEmptyFields = Object.keys(value).filter(subKey => {
                                            const subValue = value[subKey];
                                            return subValue && subValue !== '';
                                        });
                                        
                                        if (nonEmptyFields.length === 0) {
                                            return `
                                                <div style="margin-bottom: 0.5rem;">
                                                    <strong style="color: #38aab4; font-size: 0.75rem;">${this.escapeHtml(header)}:</strong>
                                                    <span style="margin-left: 0.5rem; color: #64748b; font-size: 0.75rem; font-style: italic;">No data</span>
                                                </div>
                                            `;
                                        }
                                        
                                        return `
                                            <div style="margin-bottom: 0.5rem;">
                                                <strong style="color: #38aab4; font-size: 0.75rem;">${this.escapeHtml(header)}:</strong>
                                                <div style="margin-left: 0.5rem; font-size: 0.75rem;">
                                                    ${nonEmptyFields.map(subKey => {
                                                        const subValue = value[subKey];
                                                        return `<div><span style="color: #64748b;">${subKey}:</span> <span style="color: #15415e;">${this.escapeHtml(String(subValue))}</span></div>`;
                                                    }).join('')}
                                                </div>
                                            </div>
                                        `;
                                    } else if (value && value !== '') {
                                        return `
                                            <div style="margin-bottom: 0.5rem;">
                                                <strong style="color: #38aab4; font-size: 0.75rem;">${this.escapeHtml(header)}:</strong>
                                                <span style="margin-left: 0.5rem; color: #15415e; font-size: 0.75rem;">${this.escapeHtml(String(value))}</span>
                                            </div>
                                        `;
                                    } else {
                                        return `
                                            <div style="margin-bottom: 0.5rem;">
                                                <strong style="color: #38aab4; font-size: 0.75rem;">${this.escapeHtml(header)}:</strong>
                                                <span style="margin-left: 0.5rem; color: #64748b; font-size: 0.75rem; font-style: italic;">Empty</span>
                                            </div>
                                        `;
                                    }
                                }).join('')}
                            </div>
                        `;
                    }).join('')}
                    ${(report.totalItems || report.data?.length || 0) > 5 ? `
                        <div style="text-align: center; margin-top: 1rem; padding: 1rem; background: #f1f5f9; border-radius: 0.5rem;">
                            <p style="margin: 0; color: #64748b; font-size: 0.875rem;">
                                ... and ${(report.totalItems || report.data?.length || 0) - 5} more items. 
                                <button class="export-all-data-btn" data-report-id="${report._id || report.id}"
                                        style="background: #38aab4; color: white; border: none; padding: 0.25rem 0.75rem; border-radius: 0.25rem; font-size: 0.75rem; cursor: pointer;">
                                    Export All Data
                                </button>
                            </p>
                        </div>
                    ` : ''}
                </div>
            `;
        } else {
            detailData.innerHTML = '<p style="color: #64748b; font-style: italic;">No data available</p>';
        }
        
        // Store current report for export
        this.currentReport = report;
        
        // Show modal
        modal.style.display = 'flex';
    }

    closeModal() {
        const modal = document.getElementById('reportModal');
        if (modal) {
            modal.style.display = 'none';
        }
        this.currentReport = null;
    }

    async exportReport(reportId) {
        try {
            const report = this.reports.find(r => (r._id || r.id) === reportId);
            if (!report) {
                this.showToast('error', 'Export Failed', 'Report not found');
                return;
            }
            
            // Show modern export modal for single report
            this.showModernExportModal([report]);
        } catch (error) {
            console.log('Export report error:', error);
            this.showToast('error', 'Export Failed', error.message);
        }
    }

    // Simple debounce utility to avoid excessive re-rendering
    debounce(fn, delay) {
        let timerId;
        return (...args) => {
            if (timerId) clearTimeout(timerId);
            timerId = setTimeout(() => fn.apply(this, args), delay);
        };
    }

    async exportCurrentReport() {
        if (this.currentReport) {
            await this.exportReport(this.currentReport._id || this.currentReport.id);
        }
    }

    async deleteReport(reportId) {
        if (!confirm('Are you sure you want to delete this report? This action cannot be undone.')) {
            return;
        }
        
        try {
            const result = await this.reportService.deleteReport(reportId);
            
            if (result.success) {
                this.showSuccess('Report deleted successfully');
                await this.loadReports(); // Reload reports
            } else {
                this.showError('Failed to delete report: ' + result.error);
            }
        } catch (error) {
            console.log('Delete report error:', error);
            this.showError('Error deleting report');
        }
    }

    toggleReportSelection(reportId, isSelected) {
        if (isSelected) {
            this.selectedReports.add(reportId);
        } else {
            this.selectedReports.delete(reportId);
        }
        
        this.updateBulkControls();
        this.updateSelectAllCheckbox();
    }

    handleSelectAll(event) {
        const isChecked = event.target.checked;
        
        if (isChecked) {
            // Select all visible reports
            this.filteredReports.forEach(report => {
                this.selectedReports.add(report._id || report.id);
            });
        } else {
            // Deselect all
            this.selectedReports.clear();
        }
        
        this.updateReportCheckboxes();
        this.updateBulkControls();
    }

    updateSelectAllCheckbox() {
        const selectAllCheckbox = document.getElementById('selectAllCheckbox');
        if (!selectAllCheckbox) return;
        
        const totalReports = this.filteredReports.length;
        const selectedCount = this.selectedReports.size;
        
        if (selectedCount === 0) {
            selectAllCheckbox.indeterminate = false;
            selectAllCheckbox.checked = false;
        } else if (selectedCount === totalReports) {
            selectAllCheckbox.indeterminate = false;
            selectAllCheckbox.checked = true;
        } else {
            selectAllCheckbox.indeterminate = true;
            selectAllCheckbox.checked = false;
        }
    }

    updateReportCheckboxes() {
        const checkboxes = document.querySelectorAll('.report-checkbox');
        checkboxes.forEach(checkbox => {
            const reportId = checkbox.dataset.reportId;
            checkbox.checked = this.selectedReports.has(reportId);
        });
    }

    updateBulkControls() {
        const bulkControls = document.getElementById('bulkControls');
        const selectedCount = document.getElementById('selectedCount');
        const bulkDeleteBtn = document.getElementById('bulkDeleteBtn');
        
        if (this.selectedReports.size > 0) {
            this.isBulkMode = true;
            if (bulkControls) bulkControls.style.display = 'flex';
            if (selectedCount) selectedCount.textContent = `${this.selectedReports.size} selected`;
            if (bulkDeleteBtn) bulkDeleteBtn.disabled = false;
        } else {
            this.isBulkMode = false;
            if (bulkControls) bulkControls.style.display = 'none';
            if (bulkDeleteBtn) bulkDeleteBtn.disabled = true;
        }
        
        // Update report cards to show/hide checkboxes without calling updateReportsList
        this.updateReportCheckboxes();
    }

    updateBulkControlsState() {
        const bulkControls = document.getElementById('bulkControls');
        const selectedCount = document.getElementById('selectedCount');
        const bulkDeleteBtn = document.getElementById('bulkDeleteBtn');
        
        if (this.selectedReports.size > 0) {
            this.isBulkMode = true;
            if (bulkControls) bulkControls.style.display = 'flex';
            if (selectedCount) selectedCount.textContent = `${this.selectedReports.size} selected`;
            if (bulkDeleteBtn) bulkDeleteBtn.disabled = false;
        } else {
            this.isBulkMode = false;
            if (bulkControls) bulkControls.style.display = 'none';
            if (bulkDeleteBtn) bulkDeleteBtn.disabled = true;
        }
        
        // Update report checkboxes
        this.updateReportCheckboxes();
    }

    async handleBulkDelete() {
        const selectedCount = this.selectedReports.size;
        
        if (selectedCount === 0) {
            this.showError('No reports selected');
            return;
        }
        
        if (!confirm(`Are you sure you want to delete ${selectedCount} report${selectedCount > 1 ? 's' : ''}? This action cannot be undone.`)) {
            return;
        }
        
        this.showLoading(true);
        
        try {
            const reportIds = Array.from(this.selectedReports);
            const result = await this.reportService.bulkDeleteReports(reportIds);
            
            if (result.success) {
                this.showSuccess(`Successfully deleted ${result.deletedCount} report${result.deletedCount > 1 ? 's' : ''}`);
            } else {
                this.showError(`Failed to delete reports: ${result.error}`);
            }
            
            // Clear selection and reload reports
            this.selectedReports.clear();
            await this.loadReports();
            
        } catch (error) {
            console.log('Bulk delete error:', error);
            this.showError('Error during bulk delete operation');
        } finally {
            this.showLoading(false);
        }
    }

    async handleLogout() {
        try {
            const result = await this.authService.logout();
            
            if (result.success) {
                this.redirectToLogin();
            } else {
                this.showError('Logout failed: ' + result.error);
            }
        } catch (error) {
            console.log('Logout error:', error);
            this.showError('Error during logout');
        }
    }

    showLoading(show) {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) {
            overlay.style.display = show ? 'flex' : 'none';
        }
    }

    showSuccess(message) {
        this.showNotification(message, 'success');
    }

    showError(message) {
        this.showNotification(message, 'error');
    }

    showNotification(message, type) {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 1rem 1.5rem;
            border-radius: 0.25rem;
            color: white;
            font-weight: 500;
            z-index: 3000;
            max-width: 400px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        `;
        
        if (type === 'success') {
            notification.style.background = '#22c55e';
        } else if (type === 'error') {
            notification.style.background = '#ef4444';
        }
        
        notification.textContent = message;
        document.body.appendChild(notification);
        
        // Remove after 3 seconds
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
        }, 3000);
    }

    // Enhanced Filter Methods
    handleSortChange(event) {
        this.currentSort = event.target.value;
        this.applyFiltersAndSort();
    }

    clearAllFilters() {
        // Clear all filter inputs
        document.getElementById('searchInput').value = '';
        document.getElementById('domainFilter').value = '';
        document.getElementById('dateFilter').value = '';
        document.getElementById('sortFilter').value = 'newest';
        document.getElementById('clearSearchBtn').style.display = 'none';
        
        this.currentSort = 'newest';
        this.filteredReports = [...this.reports];
        this.applyFiltersAndSort();
    }

    performSearch() {
        const searchTerm = document.getElementById('searchInput').value.trim();
        if (searchTerm) {
            this.handleSearch({ target: { value: searchTerm } });
        }
    }

    clearSearch() {
        document.getElementById('searchInput').value = '';
        document.getElementById('clearSearchBtn').style.display = 'none';
        this.handleSearch({ target: { value: '' } });
    }

    applyFiltersAndSort() {
        this.sortReports();
        this.updateReportsList();
        this.updateStats();
    }

    sortReports() {
        this.filteredReports.sort((a, b) => {
            switch (this.currentSort) {
                case 'oldest':
                    return new Date(a.created_at) - new Date(b.created_at);
                case 'name':
                    return a.name.localeCompare(b.name);
                case 'items':
                    return (b.data?.length || 0) - (a.data?.length || 0);
                case 'newest':
                default:
                    return new Date(b.created_at) - new Date(a.created_at);
            }
        });
    }

    // Enhanced Bulk Mode Methods
    toggleBulkMode() {
        this.isBulkMode = !this.isBulkMode;
        this.selectedReports.clear();
        this.updateBulkUI();
        this.updateReportsList();
    }

    exitBulkMode() {
        this.isBulkMode = false;
        this.selectedReports.clear();
        this.updateBulkUI();
        this.updateReportsList();
    }

    updateBulkUI() {
        const bulkControls = document.getElementById('bulkControls');
        const normalControls = document.getElementById('normalControls');
        const reportsList = document.getElementById('reportsList');
        
        if (this.isBulkMode) {
            bulkControls.style.display = 'flex';
            normalControls.style.display = 'none';
            reportsList.classList.add('bulk-mode');
        } else {
            bulkControls.style.display = 'none';
            normalControls.style.display = 'flex';
            reportsList.classList.remove('bulk-mode');
        }
        
        this.updateSelectedCount();
    }

    updateSelectedCount() {
        const selectedCount = document.getElementById('selectedCount');
        const count = this.selectedReports.size;
        selectedCount.textContent = `${count} selected`;
        
        // Update select all checkbox
        const selectAllCheckbox = document.getElementById('selectAllCheckbox');
        if (selectAllCheckbox) {
            selectAllCheckbox.checked = count === this.filteredReports.length && count > 0;
            selectAllCheckbox.indeterminate = count > 0 && count < this.filteredReports.length;
        }
    }

    handleReportSelect(event) {
        if (!this.isBulkMode) return;
        
        const reportCard = event.target.closest('.report-card');
        if (!reportCard) return;
        
        const reportId = reportCard.dataset.reportId;
        if (this.selectedReports.has(reportId)) {
            this.selectedReports.delete(reportId);
            reportCard.classList.remove('selected');
        } else {
            this.selectedReports.add(reportId);
            reportCard.classList.add('selected');
        }
        
        this.updateSelectedCount();
    }

    async handleBulkExport() {
        if (this.selectedReports.size === 0) {
            this.showNotification('Please select reports to export', 'warning');
            return;
        }

        const selectedReportsData = this.reports.filter(report => 
            this.selectedReports.has(report.id)
        );

        // Show modern export modal for bulk export
        this.showModernExportModal(selectedReportsData);
    }

    // Enhanced Modal Methods
    setupModalOverlayHandlers() {
        const modals = ['confirmModal', 'exportModal'];
        modals.forEach(modalId => {
            const modal = document.getElementById(modalId);
            if (modal) {
                modal.addEventListener('click', (e) => {
                    if (e.target.classList.contains('modal-overlay') || e.target === modal) {
                        this.closeModal(modalId);
                    }
                });
            }
        });
    }

    closeModal(modalId = 'reportModal') {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = 'none';
        }
    }

    handleDeleteFromModal() {
        const modal = document.getElementById('reportModal');
        const reportId = modal.dataset.currentReportId;
        if (reportId) {
            this.showConfirmModal(
                'Delete Report',
                'Are you sure you want to delete this report?',
                'This action cannot be undone.',
                () => this.deleteReport(reportId),
                '🗑️'
            );
        }
    }

    copyReportUrl() {
        const urlElement = document.getElementById('detailUrl');
        if (urlElement && urlElement.textContent !== '-') {
            navigator.clipboard.writeText(urlElement.textContent).then(() => {
                this.showNotification('URL copied to clipboard', 'success');
            }).catch(() => {
                this.showNotification('Failed to copy URL', 'error');
            });
        }
    }


    toggleExportDropdown(event) {
        event.stopPropagation();
        const dropdown = document.getElementById('exportDropdown');
        dropdown.classList.toggle('open');
    }

    handleExportDropdownClick(event) {
        const dropdownItem = event.target.closest('.dropdown-item');
        if (dropdownItem) {
            const format = dropdownItem.dataset.format;
            const modal = document.getElementById('reportModal');
            const reportId = modal.dataset.currentReportId;
            
            if (reportId) {
                this.exportSingleReport(reportId, format);
            }
        }
        
        // Close dropdown when clicking outside
        if (!event.target.closest('.dropdown')) {
            document.querySelectorAll('.dropdown').forEach(d => d.classList.remove('open'));
        }
    }

    // Confirmation Modal Methods
    showConfirmModal(title, message, details, onConfirm, icon = '⚠️') {
        const confirmModal = document.getElementById('confirmModal');
        const confirmTitle = document.getElementById('confirmTitle');
        const confirmMessage = document.getElementById('confirmMessage');
        const confirmDetails = document.getElementById('confirmDetails');
        const confirmIcon = document.getElementById('confirmIcon');

        confirmTitle.textContent = title;
        confirmMessage.textContent = message;
        confirmDetails.textContent = details;
        confirmIcon.textContent = icon;
        
        // Store the action for later execution
        this.pendingActions.set('confirm', onConfirm);
        
        confirmModal.style.display = 'flex';
    }

    closeConfirmModal() {
        const confirmModal = document.getElementById('confirmModal');
        confirmModal.style.display = 'none';
        this.pendingActions.delete('confirm');
    }

    executeConfirmedAction() {
        const action = this.pendingActions.get('confirm');
        if (action && typeof action === 'function') {
            action();
        }
        this.closeConfirmModal();
    }

    // Export Progress Methods
    async exportMultipleReports(reports, options = {}) {
        console.log('exportMultipleReports called with:', { reports, options, isExporting: this.isExporting });
        
        if (this.isExporting || !reports || !Array.isArray(reports) || reports.length === 0) {
            console.log('Export validation failed:', { 
                isExporting: this.isExporting, 
                reports: reports, 
                isArray: Array.isArray(reports), 
                length: reports?.length 
            });
            this.showToast('error', 'Export Failed', 'No reports selected for export');
            return;
        }
        
        this.isExporting = true;
        this.showExportProgressModal();
        
        try {
            const { 
                format = 'csv', 
                includeMetadata = true, 
                separateFiles = false,
                compressData = false 
            } = options;
            
            // Fetch full data for all selected reports
            const reportsWithData = [];
            let totalItems = 0;
            
            for (let i = 0; i < reports.length; i++) {
                const report = reports[i];
                this.updateExportProgress(
                    Math.round((i / reports.length) * 50), 
                    `Loading ${report.name}...`,
                    `Processing report ${i + 1} of ${reports.length}`
                );
                
                const result = await this.reportService.getReportForExport(report._id || report.id);
                if (result.success && result.report.data) {
                    reportsWithData.push(result.report);
                    totalItems += result.report.data.length;
                } else {
                    console.warn(`Failed to load data for report: ${report.name}`);
                }
                
                // Add delay to show progress
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            if (reportsWithData.length === 0) {
                this.showToast('error', 'Export Failed', 'No data found in selected reports');
                return;
            }
            
            // Generate and download files
            this.updateExportProgress(75, 'Generating files...', 'Creating export files');
            
            if (separateFiles) {
                await this.exportSeparateFiles(reportsWithData, format, includeMetadata);
            } else {
                await this.exportCombinedFile(reportsWithData, format, includeMetadata);
            }
            
            this.updateExportProgress(100, 'Complete!', `Exported ${reportsWithData.length} reports with ${totalItems} items`);
            
            // Show success toast
            this.showToast('success', 'Export Complete', 
                `Successfully exported ${reportsWithData.length} reports with ${totalItems} total items`);
            
            // Close modal after short delay
            setTimeout(() => this.hideExportProgressModal(), 1000);
            
        } catch (error) {
            console.log('Export error:', error);
            this.showToast('error', 'Export Failed', error.message);
            this.hideExportProgressModal();
        } finally {
            this.isExporting = false;
        }
    }

    showExportModal(count, format) {
        const exportModal = document.getElementById('exportModal');
        const exportCount = document.getElementById('exportCount');
        const exportFormat = document.getElementById('exportFormat');
        const exportProgress = document.getElementById('exportProgress');
        const exportProgressBar = document.getElementById('exportProgressBar');
        
        exportCount.textContent = `${count} reports`;
        exportFormat.textContent = format.toUpperCase();
        exportProgress.textContent = '0%';
        exportProgressBar.style.width = '0%';
        
        exportModal.style.display = 'flex';
    }

    async simulateExportProgress(reports, format) {
        const exportStatus = document.getElementById('exportStatus');
        const exportProgress = document.getElementById('exportProgress');
        const exportProgressBar = document.getElementById('exportProgressBar');
        
        const steps = [
            { status: 'Gathering report data...', progress: 20 },
            { status: 'Processing data...', progress: 40 },
            { status: 'Formatting export...', progress: 70 },
            { status: 'Finalizing file...', progress: 90 },
            { status: 'Complete!', progress: 100 }
        ];
        
        for (const step of steps) {
            exportStatus.textContent = step.status;
            exportProgress.textContent = `${step.progress}%`;
            exportProgressBar.style.width = `${step.progress}%`;
            
            await new Promise(resolve => setTimeout(resolve, 800));
        }
    }

    cancelExport() {
        this.isExporting = false;
        this.closeModal('exportModal');
        this.showNotification('Export cancelled', 'info');
    }

    prepareExportData(reports, format) {
        // Prepare data based on format
        switch (format) {
            case 'csv':
                return this.reportsToCSV(reports);
            case 'json':
                return this.reportsToJSON(reports);
            case 'excel':
                return this.reportsToExcel(reports);
            default:
                return this.reportsToCSV(reports);
        }
    }

    reportsToCSV(reports) {
        // Combine all data from all reports into a single CSV
        let allData = [];
        
        for (const report of reports) {
            if (report.data && Array.isArray(report.data)) {
                // Add report metadata to each item
                const enrichedData = report.data.map(item => ({
                    ...item,
                    _reportName: report.name,
                    _reportUrl: report.url,
                    _reportCreated: report.createdAt,
                    _reportDomain: new URL(report.url).hostname
                }));
                allData = allData.concat(enrichedData);
            }
        }
        
        if (allData.length === 0) {
            return 'No data found in selected reports';
        }
        
        // Use CSVUtils to convert the combined data
        return CSVUtils.convertToCSV(allData);
    }

    reportsToJSON(reports) {
        // Structure the data with report metadata
        const structuredData = {
            exportDate: new Date().toISOString(),
            totalReports: reports.length,
            totalItems: reports.reduce((sum, report) => sum + (report.data?.length || 0), 0),
            reports: reports.map(report => ({
                id: report.id,
                name: report.name,
                url: report.url,
                createdAt: report.createdAt,
                domain: new URL(report.url).hostname,
                itemCount: report.data?.length || 0,
                data: report.data || []
            }))
        };
        
        return JSONUtils.convertToJSON(structuredData, true);
    }

    reportsToExcel(reports) {
        // For demo purposes, return CSV format
        // In a real implementation, you'd use a library like xlsx
        return this.reportsToCSV(reports);
    }

    downloadExportFile(data, format, filename) {
        const mimeTypes = {
            'csv': 'text/csv',
            'json': 'application/json',
            'excel': 'application/vnd.ms-excel'
        };
        
        const extensions = {
            'csv': 'csv',
            'json': 'json',
            'excel': 'xls'
        };
        
        const blob = new Blob([data], { type: mimeTypes[format] });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        
        a.href = url;
        a.download = `${filename}.${extensions[format]}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    exportSingleReport(reportId, format) {
        const report = this.reports.find(r => r.id === reportId);
        if (report) {
            this.exportMultipleReports([report], { format });
        }
    }

    // Enhanced Search Method
    handleSearch(event) {
        const searchTerm = event.target.value.toLowerCase().trim();
        const clearSearchBtn = document.getElementById('clearSearchBtn');
        
        // Show/hide clear button
        clearSearchBtn.style.display = searchTerm ? 'flex' : 'none';
        
        if (!searchTerm) {
            this.filteredReports = [...this.reports];
        } else {
            this.filteredReports = this.reports.filter(report => {
                const searchableText = [
                    report.name,
                    report.url,
                    new URL(report.url).hostname
                ].join(' ').toLowerCase();
                
                return searchableText.includes(searchTerm);
            });
        }
        
        this.applyFiltersAndSort();
    }

    // ================== MODERN EXPORT SYSTEM ==================
    
    showModernExportModal(reports) {
        const modal = document.getElementById('modernExportModal');
        const reportsList = document.getElementById('exportReportsList');
        
        // Populate reports list
        reportsList.innerHTML = reports.map(report => `
            <div class="export-report-item">
                <span class="export-report-icon">📄</span>
                <span>${report.name} (${report.totalItems || report.data?.length || 0} items)</span>
            </div>
        `).join('');
        
        // Store reports for export
        this.reportsToExport = reports;
        
        // Show modal
        modal.style.display = 'flex';
        
        // Setup event listeners if not already done
        this.setupModernExportListeners();
    }
    
    setupModernExportListeners() {
        if (this.exportListenersSetup) return;
        this.exportListenersSetup = true;
        
        // Close modal
        document.getElementById('closeExportModal').addEventListener('click', () => {
            this.hideModernExportModal();
            this.reportsToExport = null;
        });
        
        document.getElementById('cancelExportModalBtn').addEventListener('click', () => {
            this.hideModernExportModal();
            this.reportsToExport = null;
        });
        
        // Start export
        document.getElementById('startExportBtn').addEventListener('click', () => {
            this.startModernExport();
        });
        
        // Close progress modal
        document.getElementById('cancelExportProgressBtn').addEventListener('click', () => {
            this.cancelExport();
        });
        
        // Format selection handlers
        document.querySelectorAll('input[name="exportFormat"]').forEach(radio => {
            radio.addEventListener('change', this.updateFormatPreview.bind(this));
        });
    }
    
    hideModernExportModal() {
        document.getElementById('modernExportModal').style.display = 'none';
        // Don't clear reportsToExport here - let the calling method handle it
    }
    
    showExportProgressModal() {
        document.getElementById('exportProgressModal').style.display = 'flex';
    }
    
    hideExportProgressModal() {
        document.getElementById('exportProgressModal').style.display = 'none';
    }
    
    updateExportProgress(percent, status, details) {
        const progressFill = document.getElementById('exportProgressFill');
        const progressPercent = document.getElementById('exportProgressPercent');
        const progressStatus = document.getElementById('exportProgressStatus');
        const progressDetails = document.getElementById('exportProgressDetails');
        
        if (progressFill) progressFill.style.width = `${percent}%`;
        if (progressPercent) progressPercent.textContent = `${percent}%`;
        if (progressStatus) progressStatus.textContent = status;
        if (progressDetails) progressDetails.textContent = details;
        
        // Add pulsing animation for active progress
        if (percent < 100) {
            progressFill?.classList.add('pulsing');
        } else {
            progressFill?.classList.remove('pulsing');
        }
    }
    
    async startModernExport() {
        console.log('startModernExport called, reportsToExport:', this.reportsToExport);
        
        if (!this.reportsToExport || !Array.isArray(this.reportsToExport) || this.reportsToExport.length === 0) {
            this.showToast('error', 'Export Failed', 'No reports selected for export');
            return;
        }
        
        // Get selected options
        const format = document.querySelector('input[name="exportFormat"]:checked')?.value || 'csv';
        const includeMetadata = document.getElementById('includeMetadata')?.checked || false;
        const compressData = document.getElementById('compressData')?.checked || false;
        const separateFiles = document.getElementById('separateFiles')?.checked || false;
        
        console.log('Export options:', { format, includeMetadata, compressData, separateFiles });
        
        // Store reports before hiding modal to prevent clearing
        const reportsToExport = this.reportsToExport;
        
        // Hide export modal and show progress
        this.hideModernExportModal();
        
        // Start export process
        await this.exportMultipleReports(reportsToExport, {
            format,
            includeMetadata,
            compressData,
            separateFiles
        });
        
        // Clear the stored reports after export
        this.reportsToExport = null;
    }
    
    async exportSeparateFiles(reportsWithData, format, includeMetadata) {
        const timestamp = new Date().toISOString().split('T')[0];
        
        for (let i = 0; i < reportsWithData.length; i++) {
            const report = reportsWithData[i];
            this.updateExportProgress(
                75 + Math.round((i / reportsWithData.length) * 20),
                `Exporting ${report.name}...`,
                `Creating file ${i + 1} of ${reportsWithData.length}`
            );
            
            const filename = `${report.name.replace(/[^a-z0-9]/gi, '_')}_${timestamp}`;
            
            if (format === 'csv') {
                const csvContent = CSVUtils.convertToCSV(report.data);
                CSVUtils.downloadCSV(csvContent, `${filename}.csv`);
            } else if (format === 'json') {
                const jsonContent = JSONUtils.convertToJSON(report.data, true);
                JSONUtils.downloadJSON(jsonContent, `${filename}.json`);
            }
            
            // Small delay between downloads
            await new Promise(resolve => setTimeout(resolve, 300));
        }
    }
    
    async exportCombinedFile(reportsWithData, format, includeMetadata) {
        const timestamp = new Date().toISOString().split('T')[0];
        
        if (format === 'csv') {
            const csvContent = this.reportsToCSV(reportsWithData);
            const filename = `onpage-reports-${timestamp}.csv`;
            CSVUtils.downloadCSV(csvContent, filename);
        } else if (format === 'json') {
            const jsonContent = this.reportsToJSON(reportsWithData);
            const filename = `onpage-reports-${timestamp}.json`;
            JSONUtils.downloadJSON(jsonContent, filename);
        } else if (format === 'combined') {
            // Create both CSV and JSON files
            const csvContent = this.reportsToCSV(reportsWithData);
            const jsonContent = this.reportsToJSON(reportsWithData);
            
            CSVUtils.downloadCSV(csvContent, `onpage-reports-${timestamp}.csv`);
            await new Promise(resolve => setTimeout(resolve, 500));
            JSONUtils.downloadJSON(jsonContent, `onpage-reports-${timestamp}.json`);
        }
    }
    
    cancelExport() {
        this.isExporting = false;
        this.hideExportProgressModal();
        this.showToast('info', 'Export Cancelled', 'Export operation was cancelled by user');
    }
    
    updateFormatPreview() {
        const selectedFormat = document.querySelector('input[name="exportFormat"]:checked')?.value;
        // Could add format-specific preview or settings here
    }
    
    // ================== TOAST NOTIFICATION SYSTEM ==================
    
    showToast(type, title, message, duration = 5000) {
        const container = document.getElementById('toastContainer');
        if (!container) return;
        
        const toastId = 'toast-' + Date.now();
        const icons = {
            success: '✅',
            error: '❌',
            warning: '⚠️',
            info: 'ℹ️'
        };
        
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.id = toastId;
        toast.innerHTML = `
            <div class="toast-icon">${icons[type] || icons.info}</div>
            <div class="toast-content">
                <div class="toast-title">${title}</div>
                <div class="toast-message">${message}</div>
            </div>
            <button class="toast-close" onclick="this.closest('.toast').remove()">×</button>
            <div class="toast-progress"></div>
        `;
        
        container.appendChild(toast);
        
        // Trigger animation
        setTimeout(() => toast.classList.add('show'), 100);
        
        // Auto-remove after duration
        if (duration > 0) {
            const progressBar = toast.querySelector('.toast-progress');
            if (progressBar) {
                progressBar.style.width = '100%';
                progressBar.style.transition = `width ${duration}ms linear`;
                setTimeout(() => progressBar.style.width = '0%', 100);
            }
            
            setTimeout(() => {
                toast.classList.add('hide');
                setTimeout(() => {
                    if (toast.parentNode) {
                        toast.parentNode.removeChild(toast);
                    }
                }, 300);
            }, duration);
        }
    }
    
    // Replace old notification methods
    showError(message) {
        this.showToast('error', 'Error', message);
    }
    
    showSuccess(message) {
        this.showToast('success', 'Success', message);
    }
    
    showNotification(message, type = 'info') {
        const titles = {
            success: 'Success',
            error: 'Error',
            warning: 'Warning',
            info: 'Info'
        };
        this.showToast(type, titles[type], message);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.reportsController = new ReportsController();
});
