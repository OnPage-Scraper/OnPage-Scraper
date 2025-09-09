const mongoose = require('mongoose');

const reportChunkSchema = new mongoose.Schema({
  reportId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Report',
    required: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  index: {
    type: Number,
    required: true
  },
  data: [mongoose.Schema.Types.Mixed],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

reportChunkSchema.index({ reportId: 1, index: 1 }, { unique: true });

module.exports = mongoose.model('ReportChunk', reportChunkSchema);


