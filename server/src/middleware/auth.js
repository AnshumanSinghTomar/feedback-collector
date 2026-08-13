const { verifyToken, getUserById, getSessionByToken } = require("../services/authService");

/**
 * Verifies the Authorization header's JWT and attaches the user to req.user.
 * Responds 401 if missing/invalid/expired, or if the session behind it was
 * revoked (logout, password change, or password reset on any device).
 */
async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No token provided." });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = verifyToken(token);

    // Checked in addition to the signature, since a revoked token still
    // verifies correctly right up until its natural expiry
    const session = await getSessionByToken(token);
    if (!session || session.revokedAt) {
      return res.status(401).json({ error: "Session has been signed out." });
    }

    const user = await getUserById(decoded.id);

    if (!user) {
      return res.status(401).json({ error: "User no longer exists." });
    }

    // Checked on every request, so a deactivation takes effect immediately
    if (!user.isActive) {
      return res.status(403).json({ error: "This account has been deactivated." });
    }

    req.user = user;
    req.token = token;
    req.sessionId = session.id;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token." });
  }
}

/**
 * Requires req.user to have role ADMIN. Must run after `authenticate`.
 */
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "ADMIN") {
    return res.status(403).json({ error: "Admin access required." });
  }
  next();
}

module.exports = { authenticate, requireAdmin };
