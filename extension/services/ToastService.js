class ToastService {
    constructor() {
        this.toasts = [];
        this.maxToasts = 3;
        this.defaultDuration = 4000;
        this.init();
    }

    init() {
        // Create toast container if it doesn't exist
        if (!document.getElementById('toast-container')) {
            const container = document.createElement('div');
            container.id = 'toast-container';
            container.className = 'toast-container';
            document.body.appendChild(container);
        }
    }

    show(message, type = 'info', duration = null, options = {}) {
        const toast = this.createToast(message, type, options);
        this.addToast(toast);
        
        // Auto remove after duration
        const removeDuration = duration || this.defaultDuration;
        setTimeout(() => {
            this.removeToast(toast.id);
        }, removeDuration);

        return toast.id;
    }

    success(message, duration = null, options = {}) {
        return this.show(message, 'success', duration, options);
    }

    error(message, duration = null, options = {}) {
        return this.show(message, 'error', duration, options);
    }

    warning(message, duration = null, options = {}) {
        return this.show(message, 'warning', duration, options);
    }

    info(message, duration = null, options = {}) {
        return this.show(message, 'info', duration, options);
    }

    createToast(message, type, options = {}) {
        const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const toast = document.createElement('div');
        
        toast.id = id;
        toast.className = `toast toast-${type}`;
        
        // Toast content
        const content = document.createElement('div');
        content.className = 'toast-content';
        
        // Icon
        const icon = document.createElement('div');
        icon.className = 'toast-icon';
        icon.innerHTML = this.getIcon(type);
        
        // Message
        const messageEl = document.createElement('div');
        messageEl.className = 'toast-message';
        messageEl.textContent = message;
        
        // Close button
        const closeBtn = document.createElement('button');
        closeBtn.className = 'toast-close';
        closeBtn.innerHTML = '×';
        closeBtn.onclick = () => this.removeToast(id);
        
        content.appendChild(icon);
        content.appendChild(messageEl);
        toast.appendChild(content);
        toast.appendChild(closeBtn);
        
        // Add action button if provided
        if (options.action) {
            const actionBtn = document.createElement('button');
            actionBtn.className = 'toast-action';
            actionBtn.textContent = options.action.text;
            actionBtn.onclick = options.action.handler;
            content.appendChild(actionBtn);
        }
        
        return toast;
    }

    getIcon(type) {
        const icons = {
            success: '✓',
            error: '✕',
            warning: '⚠',
            info: 'ℹ'
        };
        return icons[type] || icons.info;
    }

    addToast(toast) {
        const container = document.getElementById('toast-container');
        container.appendChild(toast);
        
        // Trigger animation
        setTimeout(() => {
            toast.classList.add('toast-show');
        }, 10);
        
        this.toasts.push(toast.id);
        
        // Limit number of toasts
        if (this.toasts.length > this.maxToasts) {
            const oldestToast = this.toasts.shift();
            this.removeToast(oldestToast);
        }
    }

    removeToast(id) {
        const toast = document.getElementById(id);
        if (toast) {
            toast.classList.add('toast-hide');
            
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
                const index = this.toasts.indexOf(id);
                if (index > -1) {
                    this.toasts.splice(index, 1);
                }
            }, 300);
        }
    }

    clear() {
        this.toasts.forEach(id => this.removeToast(id));
    }

    // Specific toast methods for common scenarios
    showRegistrationSuccess(userName) {
        return this.success(`Welcome ${userName}! Account created successfully.`, 5000, {
            action: {
                text: 'Continue',
                handler: () => {
                    // This will be handled by the popup controller
                    window.dispatchEvent(new CustomEvent('toast-action-continue'));
                }
            }
        });
    }

    showLoginError(errorMessage) {
        let message = 'Login failed';
        let duration = 5000;
        
        if (errorMessage.includes('Invalid email or password')) {
            message = 'Invalid email or password. Please check your credentials.';
        } else if (errorMessage.includes('User not found')) {
            message = 'No account found with this email address.';
        } else if (errorMessage.includes('Token')) {
            message = 'Session expired. Please log in again.';
        } else {
            message = errorMessage;
        }
        
        return this.error(message, duration);
    }

    showValidationError(field, message) {
        return this.warning(`${field}: ${message}`, 4000);
    }

    showNetworkError() {
        return this.error('Network error. Please check your connection and try again.', 6000);
    }

    showLoading(message = 'Loading...') {
        return this.info(message, null); // No auto-remove for loading
    }

    hideLoading(toastId) {
        if (toastId) {
            this.removeToast(toastId);
        }
    }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ToastService;
}
