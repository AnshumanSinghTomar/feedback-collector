const authService = require("../services/authService");
const {
  validateRegister,
  validateLogin,
  validateChangePassword,
  validateResetPassword,
  validateRoleChange,
} = require("../utils/validation");

/**
 * POST /api/auth/register
 * Registers a new user. ADMIN requires the shared admin code.
 */
async function register(req, res) {
  const { valid, errors } = validateRegister(req.body);
  if (!valid) {
    return res.status(400).json({ errors });
  }

  try {
    const user = await authService.registerUser(req.body);
    const token = await authService.generateToken(user, req.headers["user-agent"]);
    return res.status(201).json({ user, token });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
}

/**
 * POST /api/auth/login
 * Authenticates a user and returns a JWT.
 */
async function login(req, res) {
  const { valid, errors } = validateLogin(req.body);
  if (!valid) {
    return res.status(400).json({ errors });
  }

  try {
    const user = await authService.loginUser(req.body);
    const token = await authService.generateToken(user, req.headers["user-agent"]);
    return res.status(200).json({ user, token });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
}

/**
 * POST /api/auth/demo
 * Signs in to a shared demo account with no credentials. Safe because demo
 * accounts are sandboxed away from real data.
 */
async function demoLogin(req, res) {
  const { role } = req.body || {};

  try {
    const user = await authService.loginDemoUser(role === "ADMIN" ? "ADMIN" : "USER");
    const token = await authService.generateToken(user, req.headers["user-agent"]);
    return res.status(200).json({ user, token });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
}

/**
 * GET /api/auth/me
 * Returns the currently authenticated user.
 */
async function me(req, res) {
  return res.status(200).json({ user: req.user });
}

/**
 * POST /api/auth/logout
 * Revokes the session behind the caller's current token.
 */
async function logout(req, res) {
  try {
    await authService.revokeSession(req.token);
    return res.status(200).json({ message: "Signed out." });
  } catch (err) {
    console.error("Error signing out:", err);
    return res.status(500).json({ error: "Failed to sign out." });
  }
}

/**
 * GET /api/auth/sessions
 * Lists the caller's other active sessions, so they can spot and end ones they
 * do not recognize.
 */
async function listSessions(req, res) {
  try {
    const sessions = await authService.listSessions(req.user.id);
    return res.status(200).json(
      sessions.map((session) => ({ ...session, isCurrent: session.id === req.sessionId }))
    );
  } catch (err) {
    console.error("Error fetching sessions:", err);
    return res.status(500).json({ error: "Failed to fetch sessions." });
  }
}

/**
 * POST /api/auth/change-password
 * Replaces the signed-in user's password and signs out every other session.
 */
async function changePassword(req, res) {
  const { valid, errors } = validateChangePassword(req.body);
  if (!valid) {
    return res.status(400).json({ errors });
  }

  try {
    await authService.changePassword(req.user.id, req.body, req.token);
    return res.status(200).json({ message: "Password updated. Other devices were signed out." });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
}

/**
 * PATCH /api/auth/preferences
 * Saves the caller's UI preferences, e.g. their light/dark choice.
 */
async function updatePreferences(req, res) {
  try {
    const user = await authService.updatePreferences(req.user.id, req.body || {});
    return res.status(200).json(user);
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
}

/**
 * POST /api/auth/forgot-password
 * Issues a reset token. Always answers the same way so the endpoint cannot be
 * used to discover which addresses have accounts.
 */
async function forgotPassword(req, res) {
  const { email } = req.body || {};

  if (!email || typeof email !== "string") {
    return res.status(400).json({ errors: ["An email is required."] });
  }

  try {
    const result = await authService.createPasswordResetToken(email);

    // No mailer is wired up, so the token is logged for the operator to pass on
    if (result) {
      console.log(`Password reset token for ${result.user.email}: ${result.token}`);
    }

    return res.status(200).json({
      message: "If that email has an account, a reset token has been generated.",
    });
  } catch (err) {
    console.error("Error creating reset token:", err);
    return res.status(500).json({ error: "Failed to start password reset." });
  }
}

/**
 * POST /api/auth/reset-password
 * Consumes a reset token and sets a new password.
 */
async function resetPassword(req, res) {
  const { valid, errors } = validateResetPassword(req.body);
  if (!valid) {
    return res.status(400).json({ errors });
  }

  try {
    await authService.resetPassword(req.body.token, req.body.password);
    return res.status(200).json({ message: "Password reset. You can sign in now." });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
}

/**
 * GET /api/auth/audit?page=&pageSize=
 * Lists admin actions, newest first. Admin only (enforced by route middleware).
 */
async function listAudit(req, res) {
  try {
    const result = await authService.listAuditEvents(req.query, req.user);
    return res.status(200).json(result);
  } catch (err) {
    console.error("Error fetching audit log:", err);
    return res.status(500).json({ error: "Failed to fetch audit log." });
  }
}

/**
 * GET /api/auth/users
 * Lists every user. Admin only (enforced by route middleware).
 */
async function listUsers(req, res) {
  try {
    const users = await authService.listUsers(req.user);
    return res.status(200).json(users);
  } catch (err) {
    console.error("Error fetching users:", err);
    return res.status(500).json({ error: "Failed to fetch users." });
  }
}

/**
 * PATCH /api/auth/users/:id/role
 * Promotes or demotes a user. Admin only (enforced by route middleware).
 */
async function updateUserRole(req, res) {
  const { valid, errors } = validateRoleChange(req.body);
  if (!valid) {
    return res.status(400).json({ errors });
  }

  try {
    const user = await authService.updateUserRole(req.params.id, req.body.role, req.user.id);
    return res.status(200).json(user);
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
}

/**
 * GET /api/auth/notifications?page=&pageSize=
 * Lists the caller's own notifications, newest first.
 */
async function listNotifications(req, res) {
  try {
    const result = await authService.listNotifications(req.user.id, req.query);
    return res.status(200).json(result);
  } catch (err) {
    console.error("Error fetching notifications:", err);
    return res.status(500).json({ error: "Failed to fetch notifications." });
  }
}

/**
 * PATCH /api/auth/notifications/:id/read
 * Marks one of the caller's own notifications read.
 */
async function markNotificationRead(req, res) {
  try {
    const notification = await authService.markNotificationRead(req.params.id, req.user.id);
    if (!notification) {
      return res.status(404).json({ error: "Notification not found." });
    }
    return res.status(200).json(notification);
  } catch (err) {
    console.error("Error updating notification:", err);
    return res.status(500).json({ error: "Failed to update notification." });
  }
}

/**
 * PATCH /api/auth/notifications/read-all
 * Marks every one of the caller's notifications read.
 */
async function markAllNotificationsRead(req, res) {
  try {
    const count = await authService.markAllNotificationsRead(req.user.id);
    return res.status(200).json({ updated: count });
  } catch (err) {
    console.error("Error updating notifications:", err);
    return res.status(500).json({ error: "Failed to update notifications." });
  }
}

/**
 * PATCH /api/auth/users/:id/status
 * Activates or deactivates a user. Admin only (enforced by route middleware).
 */
async function updateUserStatus(req, res) {
  const { isActive } = req.body || {};

  if (typeof isActive !== "boolean") {
    return res.status(400).json({ errors: ["isActive must be true or false."] });
  }

  try {
    const user = await authService.updateUserStatus(req.params.id, isActive, req.user.id);
    return res.status(200).json(user);
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
}

module.exports = {
  register,
  login,
  demoLogin,
  me,
  changePassword,
  forgotPassword,
  resetPassword,
  logout,
  listSessions,
  updatePreferences,
  listAudit,
  listUsers,
  updateUserRole,
  updateUserStatus,
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
};
