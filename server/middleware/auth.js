const jwt = require('jsonwebtoken');

function read(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7) : null;
}

// auth() = any signed-in user, auth('admin') = admins only, auth('faculty','admin') = either role
exports.auth = (...roles) => (req, res, next) => {
  const token = read(req);
  if (!token) return res.status(401).json({ error: 'Please sign in first' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Session expired, please sign in again' });
  }
  if (roles.length && !roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'You do not have access to this feature' });
  }
  next();
};

// Used by the chatbot so visitors who are not signed in can still ask general questions
exports.optionalAuth = (req, res, next) => {
  const token = read(req);
  if (token) {
    try { req.user = jwt.verify(token, process.env.JWT_SECRET); } catch { /* ignore */ }
  }
  next();
};
