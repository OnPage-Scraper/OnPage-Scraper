const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  idempotencyKey: {
    type: String,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  url: {
    type: String,
    required: true
  },
  selectors: [{
    name: String,
    selector: String
  }],
  // Legacy field: kept for backward compatibility for small reports
  data: [mongoose.Schema.Types.Mixed],
  totalItems: {
    type: Number,
    default: 0
  },
  chunkCount: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt field before saving
reportSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Ensure uniqueness for idempotent requests per user when key provided
reportSchema.index({ userId: 1, idempotencyKey: 1 }, { unique: true, sparse: true });

// Helpful indexes for common queries
reportSchema.index({ userId: 1, createdAt: -1 });
reportSchema.index({ userId: 1, url: 1, createdAt: -1 });

module.exports = mongoose.model('Report', reportSchema);
