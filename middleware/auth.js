const jwt = require('jsonwebtoken');
const User = require('../models/User');

const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      console.log(`[AUTH] ❌ No token found for ${req.method} ${req.originalUrl}`);
      return res.status(401).json({ error: 'No token, authorization denied' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-password');

    if (!user) {
      console.log(`[AUTH] ❌ User not found for ID: ${decoded.userId}`);
      return res.status(401).json({ error: 'Token is not valid' });
    }

    req.user = user;
    next();
  } catch (err) {
    console.log(`[AUTH] ❌ Auth error: ${err.message} for ${req.method} ${req.originalUrl}`);
    res.status(401).json({ error: 'Token is not valid' });
  }
};

module.exports = auth;
