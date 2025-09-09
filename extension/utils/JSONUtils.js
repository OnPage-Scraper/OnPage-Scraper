class JSONUtils {
    static convertToJSON(data, pretty = true) {
        try {
            if (pretty) {
                return JSON.stringify(data, null, 2);
            } else {
                return JSON.stringify(data);
            }
        } catch (error) {
            console.log('JSON conversion error:', error);
            throw new Error('Failed to convert data to JSON: ' + error.message);
        }
    }

    static downloadJSON(jsonContent, filename = 'scraped-data.json') {
        try {
            const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
            const link = document.createElement('a');
            
            if (link.download !== undefined) {
                const url = URL.createObjectURL(blob);
                link.setAttribute('href', url);
                link.setAttribute('download', filename);
                link.style.visibility = 'hidden';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
            } else {
                // Fallback for older browsers
                window.open('data:application/json;charset=utf-8,' + encodeURIComponent(jsonContent));
            }
            
            return { success: true };
        } catch (error) {
            console.log('JSON download error:', error);
            return { success: false, error: error.message };
        }
    }

    static generateFilename(reportName = 'scraped-data', timestamp = true) {
        const sanitizedName = reportName.replace(/[^a-zA-Z0-9-_]/g, '-');
        const dateStr = timestamp ? `-${new Date().toISOString().split('T')[0]}` : '';
        return `${sanitizedName}${dateStr}.json`;
    }

    static validateJSONData(data) {
        if (!Array.isArray(data)) {
            return { valid: false, error: 'Data must be an array' };
        }

        if (data.length === 0) {
            return { valid: false, error: 'Data array is empty' };
        }

        // Check if all items are objects
        for (let i = 0; i < data.length; i++) {
            if (typeof data[i] !== 'object' || data[i] === null) {
                return { valid: false, error: `Item at index ${i} is not an object` };
            }
        }

        return { valid: true };
    }

    static previewJSON(data, maxRows = 5) {
        const validation = this.validateJSONData(data);
        if (!validation.valid) {
            return { success: false, error: validation.error };
        }

        const previewData = data.slice(0, maxRows);
        const jsonContent = this.convertToJSON(previewData, true);
        
        return {
            success: true,
            preview: jsonContent,
            totalRows: data.length,
            previewRows: previewData.length
        };
    }

    static parseJSON(jsonString) {
        try {
            return JSON.parse(jsonString);
        } catch (error) {
            console.log('JSON parse error:', error);
            throw new Error('Invalid JSON format: ' + error.message);
        }
    }

    static sanitizeForJSON(data) {
        if (data === null || data === undefined) {
            return null;
        }

        if (typeof data === 'string') {
            // Remove or replace problematic characters
            return data
                .replace(/\u0000/g, '') // Remove null characters
                .replace(/\u2028/g, '\\u2028') // Line separator
                .replace(/\u2029/g, '\\u2029'); // Paragraph separator
        }

        if (Array.isArray(data)) {
            return data.map(item => this.sanitizeForJSON(item));
        }

        if (typeof data === 'object') {
            const sanitized = {};
            for (const [key, value] of Object.entries(data)) {
                sanitized[key] = this.sanitizeForJSON(value);
            }
            return sanitized;
        }

        return data;
    }

    static getFileSize(jsonContent) {
        const bytes = new Blob([jsonContent]).size;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        
        if (bytes === 0) return '0 Bytes';
        
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
    }
}
