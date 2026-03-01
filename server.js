// Forced restart to refresh node_modules for pdf-parse 
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const chatRoutes = require('./routes/chat');
const trainingRoutes = require('./routes/training');
const submoduleRoutes = require('./routes/submodule');

const app = express();

// Middleware
app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://anonymous-thinker.vercel.app'
  ],
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.error('❌ MongoDB Error:', err));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/training', trainingRoutes);
app.use('/api/submodule', submoduleRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    env: process.env.NODE_ENV,
    dbConnected: mongoose.connection.readyState === 1,
    version: '1.0.5'
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
