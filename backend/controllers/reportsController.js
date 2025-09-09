const Report = require('../models/Report');
const ReportChunk = require('../models/ReportChunk');

class ReportsController {
    // Create report with initial chunk
    static async createReportChunk(req, res) {
        try {
            const { name, url, selectors, data, idempotencyKey } = req.body;

            if (!name || !url || !selectors || !Array.isArray(data) || data.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Missing required fields: name, url, selectors, and non-empty data array are required'
                });
            }

            // Enforce first-chunk size sanity
            if (data.length > 5000) {
                return res.status(413).json({
                    success: false,
                    message: 'Chunk too large. Please send smaller chunks (≤5000 items).'
                });
            }

            // Idempotency: ensure only one report per key per user
            if (idempotencyKey) {
                const existing = await Report.findOne({ userId: req.user._id, idempotencyKey });
                if (existing) {
                    return res.status(200).json({
                        success: true,
                        message: 'Report already created for this request',
                        report: { id: existing._id, name: existing.name, url: existing.url, createdAt: existing.createdAt }
                    });
                }
            }

            const report = new Report({
                userId: req.user._id,
                idempotencyKey,
                name,
                url,
                selectors,
                data: [],
                totalItems: 0,
                chunkCount: 0
            });

            await report.save();

            // Store first chunk as chunk index 0
            await ReportChunk.create({
                reportId: report._id,
                userId: req.user._id,
                index: 0,
                data
            });

            // Update counts
            report.totalItems = data.length;
            report.chunkCount = 1;
            await report.save();

            res.status(201).json({
                success: true,
                message: 'Report created with initial chunk',
                report: { id: report._id, name: report.name, url: report.url, totalItems: report.totalItems, chunkCount: report.chunkCount, createdAt: report.createdAt }
            });
        } catch (error) {
            console.error('Create report chunk error:', error);
            if (error && error.code === 11000) {
                // Unique index (idempotency) race
                const existing = await Report.findOne({ userId: req.user._id, idempotencyKey: req.body.idempotencyKey });
                if (existing) {
                    return res.status(200).json({
                        success: true,
                        message: 'Report already created for this request',
                        report: { id: existing._id, name: existing.name, url: existing.url, totalItems: existing.totalItems, chunkCount: existing.chunkCount, createdAt: existing.createdAt }
                    });
                }
            }
            res.status(500).json({ success: false, message: 'Server error while creating report' });
        }
    }

    // Append data chunk to existing report
    static async appendReportData(req, res) {
        try {
            const { id } = req.params;
            const { data } = req.body;

            if (!Array.isArray(data) || data.length === 0) {
                return res.status(400).json({ success: false, message: 'Data must be a non-empty array' });
            }

            if (data.length > 5000) {
                return res.status(413).json({ success: false, message: 'Chunk too large. Please send smaller chunks (≤5000 items).' });
            }

            // Atomically claim next chunk index and increment counters
            const claimed = await Report.findOneAndUpdate(
                { _id: id, userId: req.user._id },
                { $inc: { chunkCount: 1, totalItems: data.length }, $set: { updatedAt: new Date() } },
                { new: true, select: '_id userId chunkCount totalItems updatedAt' }
            );

            if (!claimed) {
                return res.status(404).json({ success: false, message: 'Report not found' });
            }

            const chunkIndex = claimed.chunkCount - 1; // index claimed for this chunk

            try {
                await ReportChunk.create({
                    reportId: claimed._id,
                    userId: req.user._id,
                    index: chunkIndex,
                    data
                });
            } catch (chunkErr) {
                // Rollback counters if chunk write failed for a non-duplicate reason
                console.error('Chunk insert failed, attempting rollback:', chunkErr);
                // Best-effort rollback: decrement what we incremented
                await Report.updateOne({ _id: claimed._id }, { $inc: { chunkCount: -1, totalItems: -data.length }, $set: { updatedAt: new Date() } });
                if (chunkErr && chunkErr.code === 11000) {
                    return res.status(409).json({ success: false, message: 'Duplicate chunk index detected. Please retry.' });
                }
                return res.status(500).json({ success: false, message: 'Failed to persist data chunk' });
            }

            res.json({ success: true, message: 'Chunk appended successfully', report: { id: claimed._id, updatedAt: claimed.updatedAt, totalItems: claimed.totalItems, chunkCount: claimed.chunkCount } });
        } catch (error) {
            console.error('Append report data error:', error);
            res.status(500).json({ success: false, message: 'Server error while appending data' });
        }
    }
    // Save a new report
    static async saveReport(req, res) {
        try {
            const { name, url, selectors, data, idempotencyKey } = req.body;

            // Validate required fields
            if (!name || !url || !selectors || !data) {
                return res.status(400).json({
                    success: false,
                    message: 'Missing required fields: name, url, selectors, and data are required'
                });
            }

            // Check data size (optional warning for very large datasets)
            const dataSize = JSON.stringify(data).length;
            if (dataSize > 5 * 1024 * 1024) { // 5MB warning
            }

            // Idempotency: if an idempotencyKey is provided and a matching report exists, return it
            if (idempotencyKey) {
                const existingByKey = await Report.findOne({
                    userId: req.user._id,
                    idempotencyKey: idempotencyKey
                });
                if (existingByKey) {
                    return res.status(200).json({
                        success: true,
                        message: 'Report already created for this request',
                        report: {
                            id: existingByKey._id,
                            name: existingByKey.name,
                            url: existingByKey.url,
                            createdAt: existingByKey.createdAt
                        }
                    });
                }
            }

            // Previous heuristic duplicate check: only enforce when no idempotencyKey is present
            if (!idempotencyKey) {
                const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
                const existingReport = await Report.findOne({
                    userId: req.user._id,
                    name: name,
                    url: url,
                    createdAt: { $gte: fiveMinutesAgo }
                });

                if (existingReport) {
                    return res.status(409).json({
                        success: false,
                        message: 'Duplicate report detected. A report with the same name and URL was created recently.',
                        report: {
                            id: existingReport._id,
                            name: existingReport.name,
                            url: existingReport.url,
                            createdAt: existingReport.createdAt
                        }
                    });
                }
            }

            const report = new Report({
                userId: req.user._id,
                idempotencyKey: idempotencyKey,
                name,
                url,
                selectors,
                data
            });

            try {
                await report.save();
            } catch (err) {
                // Handle race condition on idempotency unique index
                if (err && err.code === 11000 && idempotencyKey) {
                    const existingByKey = await Report.findOne({
                        userId: req.user._id,
                        idempotencyKey: idempotencyKey
                    });
                    if (existingByKey) {
                        return res.status(200).json({
                            success: true,
                            message: 'Report already created for this request',
                            report: {
                                id: existingByKey._id,
                                name: existingByKey.name,
                                url: existingByKey.url,
                                createdAt: existingByKey.createdAt
                            }
                        });
                    }
                }
                throw err;
            }

            res.status(201).json({
                success: true,
                message: 'Report saved successfully',
                report: {
                    id: report._id,
                    name: report.name,
                    url: report.url,
                    totalItems: report.totalItems,
                    chunkCount: report.chunkCount,
                    createdAt: report.createdAt
                }
            });
        } catch (error) {
            console.error('Save report error:', error);
            res.status(500).json({
                success: false,
                message: 'Server error while saving report'
            });
        }
    }

    // Get all reports for a user
    static async getReports(req, res) {
        try {
            const reports = await Report.find({ userId: req.user._id })
                .select('name url selectors totalItems chunkCount createdAt updatedAt')
                .sort({ createdAt: -1 });

            res.json({
                success: true,
                reports
            });
        } catch (error) {
            console.error('Get reports error:', error);
            res.status(500).json({
                success: false,
                message: 'Server error while fetching reports'
            });
        }
    }

    // Get a specific report
    static async getReport(req, res) {
        try {
            const report = await Report.findOne({
                _id: req.params.id,
                userId: req.user._id
            });

            if (!report) {
                return res.status(404).json({
                    success: false,
                    message: 'Report not found'
                });
            }

            // Do not return full data by default to avoid large payloads; include summary fields
            res.json({
                success: true,
                report: {
                    id: report._id,
                    name: report.name,
                    url: report.url,
                    selectors: report.selectors,
                    totalItems: report.totalItems,
                    chunkCount: report.chunkCount,
                    createdAt: report.createdAt,
                    updatedAt: report.updatedAt
                }
            });
        } catch (error) {
            console.error('Get report error:', error);
            res.status(500).json({
                success: false,
                message: 'Server error while fetching report'
            });
        }
    }

    // Get a small sample of items from a report (assembled from chunks)
    static async getReportSample(req, res) {
        try {
            const { id } = req.params;
            const limit = Math.min(parseInt(req.query.limit || '5', 10), 50);

            const report = await Report.findOne({ _id: id, userId: req.user._id }).select('_id userId');
            if (!report) {
                return res.status(404).json({ success: false, message: 'Report not found' });
            }

            // Fetch chunks in order until we collect 'limit' items
            const chunks = await ReportChunk.find({ reportId: report._id, userId: req.user._id })
                .sort({ index: 1 })
                .limit(10); // limit chunks scanned for efficiency

            const sample = [];
            for (const chunk of chunks) {
                for (const item of chunk.data) {
                    sample.push(item);
                    if (sample.length >= limit) break;
                }
                if (sample.length >= limit) break;
            }

            return res.json({ success: true, sample });
        } catch (error) {
            console.error('Get report sample error:', error);
            return res.status(500).json({ success: false, message: 'Server error while fetching report sample' });
        }
    }

    // Get full report data for export (assembles all chunks)
    static async getReportForExport(req, res) {
        try {
            const ReportChunk = require('../models/ReportChunk');
            
            const report = await Report.findOne({
                _id: req.params.id,
                userId: req.user._id
            });

            if (!report) {
                return res.status(404).json({
                    success: false,
                    message: 'Report not found'
                });
            }

            let allData = [];

            if (report.chunkCount > 0) {
                // Get all chunks for this report, sorted by index
                const chunks = await ReportChunk.find({
                    reportId: report._id,
                    userId: req.user._id
                }).sort({ index: 1 });

                // Combine all chunk data
                for (const chunk of chunks) {
                    if (chunk.data && Array.isArray(chunk.data)) {
                        allData = allData.concat(chunk.data);
                    }
                }
            } else if (report.data && Array.isArray(report.data)) {
                // Fallback to legacy data field for small reports
                allData = report.data;
            }

            res.json({
                success: true,
                report: {
                    id: report._id,
                    name: report.name,
                    url: report.url,
                    selectors: report.selectors,
                    totalItems: report.totalItems,
                    chunkCount: report.chunkCount,
                    createdAt: report.createdAt,
                    updatedAt: report.updatedAt,
                    data: allData
                }
            });
        } catch (error) {
            console.error('Get report for export error:', error);
            res.status(500).json({
                success: false,
                message: 'Server error while fetching report data for export'
            });
        }
    }

    // Update a report
    static async updateReport(req, res) {
        try {
            const { name } = req.body;

            if (!name) {
                return res.status(400).json({
                    success: false,
                    message: 'Report name is required'
                });
            }

            const report = await Report.findOneAndUpdate(
                { _id: req.params.id, userId: req.user._id },
                { name },
                { new: true, select: 'name url createdAt updatedAt' }
            );

            if (!report) {
                return res.status(404).json({
                    success: false,
                    message: 'Report not found'
                });
            }

            res.json({
                success: true,
                message: 'Report updated successfully',
                report
            });
        } catch (error) {
            console.error('Update report error:', error);
            res.status(500).json({
                success: false,
                message: 'Server error while updating report'
            });
        }
    }

    // Delete a report
    static async deleteReport(req, res) {
        try {
            const report = await Report.findOneAndDelete({
                _id: req.params.id,
                userId: req.user._id
            });

            if (!report) {
                return res.status(404).json({
                    success: false,
                    message: 'Report not found'
                });
            }

            // Cascade delete chunks
            await ReportChunk.deleteMany({ reportId: report._id, userId: req.user._id });

            res.json({
                success: true,
                message: 'Report deleted successfully'
            });
        } catch (error) {
            console.error('Delete report error:', error);
            res.status(500).json({
                success: false,
                message: 'Server error while deleting report'
            });
        }
    }

    // Bulk delete reports
    static async bulkDeleteReports(req, res) {
        try {
            const { reportIds } = req.body;

            if (!reportIds || !Array.isArray(reportIds) || reportIds.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Report IDs array is required'
                });
            }

            const result = await Report.deleteMany({
                _id: { $in: reportIds },
                userId: req.user._id
            });

            // Cascade delete chunks for those reports
            await ReportChunk.deleteMany({ reportId: { $in: reportIds }, userId: req.user._id });

            res.json({
                success: true,
                message: `${result.deletedCount} report(s) deleted successfully`,
                deletedCount: result.deletedCount
            });
        } catch (error) {
            console.error('Bulk delete reports error:', error);
            res.status(500).json({
                success: false,
                message: 'Server error while deleting reports'
            });
        }
    }
}

module.exports = ReportsController;
