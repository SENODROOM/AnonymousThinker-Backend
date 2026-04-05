// Forced restart to refresh node_modules for pdf-parse
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const chatRoutes = require('./routes/chat');
const trainingRoutes = require('./routes/training');
const submoduleRoutes = require('./routes/submodule');
const settingsRoutes = require('./routes/settings');

const User = require('./models/User');
const Knowledge = require('./models/Knowledge');
const { syncAllBooks } = require('./config/bookSyncService');

const app = express();

// Middleware
app.use(cors({
  origin: [
    '*',
    'http://localhost:3000',
    'https://anonymous-thinker.vercel.app'
  ],
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));

let dbError = null;

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('✅ MongoDB Connected');
    dbError = null;

    // ============================================================
    // STARTUP SYNC (NON-BLOCKING)
    // ============================================================
    setImmediate(async () => {
      try {
        const knowledgeCount = await Knowledge.countDocuments();

        if (knowledgeCount === 0) {
          console.log('📚 Knowledge base empty, running startup sync...');
          const admin = await User.findOne({ role: 'admin' });

          if (admin) {
            const result = await syncAllBooks(admin._id);
            console.log(`✅ Startup sync complete: ${result.summary.added} books, ${result.summary.totalChunksIndexed} chunks`);
          } else {
            console.warn('⚠️ No admin user found, skipping startup sync');
          }
        } else {
          console.log(`✅ Knowledge base already initialized (${knowledgeCount} documents found)`);
        }
      } catch (err) {
        console.error('❌ Startup sync failed:', err.message);
      }
    });

    // ============================================================
    // SCHEDULED SYNC (OPTIONAL)
    // ============================================================
    if (process.env.ENABLE_SCHEDULED_SYNC === 'true') {
      try {
        const cron = require('node-cron');

        cron.schedule('0 * * * *', async () => {
          console.log('⏰ Running scheduled book sync...');
          try {
            const admin = await User.findOne({ role: 'admin' });

            if (admin) {
              const result = await syncAllBooks(admin._id);
              console.log(`✅ [SYNC] Added: ${result.summary.added}, Updated: ${result.summary.updated}, Deleted: ${result.summary.deleted}`);
            }
          } catch (err) {
            console.error('❌ Scheduled sync failed:', err.message);
          }
        });

        console.log('⏰ Scheduled book sync ENABLED (hourly at :00)');
      } catch (err) {
        console.error('❌ Failed to setup scheduled sync:', err.message);
      }
    } else {
      console.log('ℹ️  Scheduled book sync disabled (set ENABLE_SCHEDULED_SYNC=true to enable)');
    }
  })
  .catch(err => {
    console.error('❌ MongoDB Error:', err);
    dbError = err.message;
  });

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/training', trainingRoutes);
app.use('/api/submodule', submoduleRoutes);
app.use('/api/settings', settingsRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    env: process.env.NODE_ENV,
    dbConnected: mongoose.connection.readyState === 1,
    dbError: dbError,
    version: '1.0.6'
  });
});

// Handle Preflight
app.options('*', cors());

// Root route for Vercel
app.get('/', (req, res) => {
  res.json({ message: 'AnonymousThinker API is live' });
});

const PORT = process.env.PORT || 5000;
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`🚀 AnonymousThinker server v1.0.4 running on port ${PORT}`);
  });
}

module.exports = app;
