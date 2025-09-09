const express = require('express');
const authMiddleware = require('../middleware/auth');
const ReportsController = require('../controllers/reportsController');

const router = express.Router();

// Save report
router.post('/save', authMiddleware, ReportsController.saveReport);

// Create report with first chunk
router.post('/create-chunk', authMiddleware, ReportsController.createReportChunk);

// Append subsequent chunks
router.post('/:id/append', authMiddleware, ReportsController.appendReportData);

// List reports for user
router.get('/list', authMiddleware, ReportsController.getReports);

// Get specific report
router.get('/:id', authMiddleware, ReportsController.getReport);

// Get small sample of report items
router.get('/:id/sample', authMiddleware, ReportsController.getReportSample);

// Get full report data for export
router.get('/:id/export', authMiddleware, ReportsController.getReportForExport);

// Update report name
router.put('/:id', authMiddleware, ReportsController.updateReport);

// Delete report
router.delete('/:id', authMiddleware, ReportsController.deleteReport);

// Bulk delete reports
router.delete('/bulk/delete', authMiddleware, ReportsController.bulkDeleteReports);

module.exports = router;
