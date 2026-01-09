const mongoose = require('mongoose');
const { Schema } = mongoose;

const auditLogSchema = new Schema({
    action: { type: String, required: true },
    actor: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    targetUser: { type: Schema.Types.ObjectId, ref: 'User' },
    metadata: { type: Schema.Types.Mixed, default: {} },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('AuditLog', auditLogSchema);
