class ReportService {
    constructor(authService) {
        this.authService = authService;
        this.baseURL = 'http://localhost:3000';
    }

    async saveReport(reportData) {
        try {
            const response = await this.authService.makeAuthenticatedRequest(
                `${this.baseURL}/reports/save`,
                {
                    method: 'POST',
                    body: JSON.stringify(reportData)
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Failed to save report');
            }

            return { success: true, report: data.report };
        } catch (error) {
            console.log('Save report error:', error);
            return { success: false, error: error.message };
        }
    }

    async createReportChunk(initialData) {
        try {
            const response = await this.authService.makeAuthenticatedRequest(
                `${this.baseURL}/reports/create-chunk`,
                {
                    method: 'POST',
                    body: JSON.stringify(initialData)
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Failed to create report');
            }

            return { success: true, report: data.report };
        } catch (error) {
            console.log('Create report chunk error:', error);
            return { success: false, error: error.message };
        }
    }

    async appendReportChunk(reportId, dataChunk) {
        try {
            const response = await this.authService.makeAuthenticatedRequest(
                `${this.baseURL}/reports/${reportId}/append`,
                {
                    method: 'POST',
                    body: JSON.stringify({ data: dataChunk })
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Failed to append report data');
            }

            return { success: true, report: data.report };
        } catch (error) {
            console.log('Append report chunk error:', error);
            return { success: false, error: error.message };
        }
    }

    async getReports() {
        try {
            const response = await this.authService.makeAuthenticatedRequest(
                `${this.baseURL}/reports/list`
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Failed to fetch reports');
            }

            return { success: true, reports: data.reports };
        } catch (error) {
            console.log('Get reports error:', error);
            return { success: false, error: error.message };
        }
    }

    async getReport(reportId) {
        try {
            const response = await this.authService.makeAuthenticatedRequest(
                `${this.baseURL}/reports/${reportId}`
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Failed to fetch report');
            }

            return { success: true, report: data.report };
        } catch (error) {
            console.log('Get report error:', error);
            return { success: false, error: error.message };
        }
    }

    async getReportSample(reportId, limit = 5) {
        try {
            const response = await this.authService.makeAuthenticatedRequest(
                `${this.baseURL}/reports/${reportId}/sample?limit=${encodeURIComponent(limit)}`
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Failed to fetch report sample');
            }

            return { success: true, sample: data.sample };
        } catch (error) {
            console.log('Get report sample error:', error);
            return { success: false, error: error.message };
        }
    }

    async getReportForExport(reportId) {
        try {
            const response = await this.authService.makeAuthenticatedRequest(
                `${this.baseURL}/reports/${reportId}/export`
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Failed to fetch report data for export');
            }

            return { success: true, report: data.report };
        } catch (error) {
            console.log('Get report for export error:', error);
            return { success: false, error: error.message };
        }
    }

    async updateReport(reportId, updateData) {
        try {
            const response = await this.authService.makeAuthenticatedRequest(
                `${this.baseURL}/reports/${reportId}`,
                {
                    method: 'PUT',
                    body: JSON.stringify(updateData)
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Failed to update report');
            }

            return { success: true, report: data.report };
        } catch (error) {
            console.log('Update report error:', error);
            return { success: false, error: error.message };
        }
    }

    async deleteReport(reportId) {
        try {
            const response = await this.authService.makeAuthenticatedRequest(
                `${this.baseURL}/reports/${reportId}`,
                {
                    method: 'DELETE'
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Failed to delete report');
            }

            return { success: true };
        } catch (error) {
            console.log('Delete report error:', error);
            return { success: false, error: error.message };
        }
    }

    // Bulk delete reports
    async bulkDeleteReports(reportIds) {
        try {
            const response = await this.authService.makeAuthenticatedRequest(
                `${this.baseURL}/reports/bulk/delete`,
                {
                    method: 'DELETE',
                    body: JSON.stringify({ reportIds })
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Failed to delete reports');
            }

            return { success: true, deletedCount: data.deletedCount };
        } catch (error) {
            console.log('Bulk delete reports error:', error);
            return { success: false, error: error.message };
        }
    }
}
