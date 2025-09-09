class AuthService {
    constructor() {
        this.baseURL = 'http://localhost:3000';
        this.tokenKey = 'onpage_token';
        this.userKey = 'onpage_user';
    }

    async login(email, password) {
        try {
            const response = await fetch(`${this.baseURL}/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Login failed');
            }

            // Store token and user info
            await chrome.storage.local.set({
                [this.tokenKey]: data.token,
                [this.userKey]: data.user
            });

            return { success: true, user: data.user };
        } catch (error) {
            console.log('Login error:', error);
            return { success: false, error: error.message };
        }
    }

    async register(userData) {
        try {
            const response = await fetch(`${this.baseURL}/auth/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(userData)
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Registration failed');
            }

            // Store token and user info
            await chrome.storage.local.set({
                [this.tokenKey]: data.token,
                [this.userKey]: data.user
            });

            return { success: true, user: data.user };
        } catch (error) {
            console.log('Registration error:', error);
            return { success: false, error: error.message };
        }
    }

    async logout() {
        try {
            await chrome.storage.local.remove([this.tokenKey, this.userKey]);
            return { success: true };
        } catch (error) {
            console.log('Logout error:', error);
            return { success: false, error: error.message };
        }
    }

    async getToken() {
        try {
            const result = await chrome.storage.local.get([this.tokenKey]);
            return result[this.tokenKey] || null;
        } catch (error) {
            console.log('Get token error:', error);
            return null;
        }
    }

    async getUser() {
        try {
            const result = await chrome.storage.local.get([this.userKey]);
            return result[this.userKey] || null;
        } catch (error) {
            console.log('Get user error:', error);
            return null;
        }
    }

    async isAuthenticated() {
        const token = await this.getToken();
        const user = await this.getUser();
        return !!(token && user);
    }

    async verifyToken() {
        try {
            const token = await this.getToken();
            if (!token) {
                return { success: false, error: 'No token found' };
            }

            const response = await fetch(`${this.baseURL}/auth/verify`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                }
            });

            const data = await response.json();

            if (!response.ok) {
                // Token is invalid, clear storage
                await this.logout();
                return { success: false, error: data.message || 'Token verification failed' };
            }

            return { success: true, user: data.user };
        } catch (error) {
            console.log('Token verification error:', error);
            await this.logout();
            return { success: false, error: error.message };
        }
    }

    async makeAuthenticatedRequest(url, options = {}) {
        const token = await this.getToken();
        if (!token) {
            throw new Error('No authentication token found');
        }

        const defaultOptions = {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                ...options.headers
            }
        };

        return fetch(url, { ...defaultOptions, ...options });
    }

    async updatePreferences(preferences) {
        try {
            const response = await this.makeAuthenticatedRequest(`${this.baseURL}/auth/preferences`, {
                method: 'PUT',
                body: JSON.stringify({ preferences })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Failed to update preferences');
            }

            // Update stored user data with new preferences
            await chrome.storage.local.set({
                [this.userKey]: data.user
            });

            return { success: true, user: data.user };
        } catch (error) {
            console.log('Update preferences error:', error);
            return { success: false, error: error.message };
        }
    }
}
