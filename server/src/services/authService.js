const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET;
// Short-lived by design: there is no refresh flow or revocation list, so a
// stolen token stays valid until it expires
const JWT_EXPIRES_IN = "12h";
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

/**
 * Creates a new user. Signing up as ADMIN requires the shared admin code,
 * so the role field alone can never grant elevated access.
 * @param {Object} data - { name, email, password, role, adminCode }
 * @returns {Promise<Object>} The created user (without password)
 */
async function registerUser({ name, email, password, role, adminCode }) {
  const requestedRole = role === "ADMIN" ? "ADMIN" : "USER";

  if (requestedRole === "ADMIN") {
    const expectedCode = process.env.ADMIN_SIGNUP_CODE;
    if (!expectedCode || adminCode !== expectedCode) {
      const err = new Error("Invalid admin code.");
      err.status = 403;
      throw err;
    }
  }

  const existing = await prisma.user.findUnique({ where: { email: email.trim() } });
  if (existing) {
    const err = new Error("Email already registered.");
    err.status = 409;
    throw err;
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      name: name.trim(),
      email: email.trim(),
      password: hashedPassword,
      role: requestedRole,
    },
  });

  return sanitizeUser(user);
}

/**
 * Verifies email/password and returns the user if valid and still active.
 * @param {Object} data - { email, password }
 * @returns {Promise<Object>} The authenticated user (without password)
 */
async function loginUser({ email, password }) {
  const user = await prisma.user.findUnique({ where: { email: email.trim() } });
  if (!user) {
    const err = new Error("Invalid email or password.");
    err.status = 401;
    throw err;
  }

  const passwordMatches = await bcrypt.compare(password, user.password);
  if (!passwordMatches) {
    const err = new Error("Invalid email or password.");
    err.status = 401;
    throw err;
  }

  if (!user.isActive) {
    const err = new Error("This account has been deactivated.");
    err.status = 403;
    throw err;
  }

  return sanitizeUser(user);
}

const DEMO_ACCOUNTS = {
  ADMIN: { email: "demo.admin@example.com", name: "Demo Admin" },
  USER: { email: "demo.user@example.com", name: "Demo User" },
};

/**
 * Signs in to a shared demo account, creating it on first use. No credentials
 * are required, which is safe only because demo accounts are sandboxed: they
 * see each other's data and nothing from real accounts.
 * @param {"ADMIN"|"USER"} role - Which demo account to use
 * @returns {Promise<Object>} The demo user (without password)
 */
async function loginDemoUser(role) {
  const config = DEMO_ACCOUNTS[role];
  if (!config) {
    const err = new Error("Demo role must be ADMIN or USER.");
    err.status = 400;
    throw err;
  }

  const existing = await prisma.user.findUnique({ where: { email: config.email } });
  if (existing) {
    // Force the flags back in case the row was edited by hand
    const user = existing.isDemo && existing.isActive
      ? existing
      : await prisma.user.update({
          where: { id: existing.id },
          data: { isDemo: true, isActive: true },
        });
    return sanitizeUser(user);
  }

  // Password is random and never shown: the only way in is the demo button
  const user = await prisma.user.create({
    data: {
      name: config.name,
      email: config.email,
      password: await bcrypt.hash(crypto.randomBytes(24).toString("hex"), 10),
      role,
      isDemo: true,
    },
  });

  return sanitizeUser(user);
}

/**
 * Generates a signed JWT and records it as a Session row, so it can be revoked
 * before it expires (logout, or invalidating other devices on password change).
 * @param {Object} user - User record (id, role required)
 * @param {string} [userAgent] - Caller's User-Agent header, stored for display
 * @returns {Promise<string>} Signed JWT
 */
async function generateToken(user, userAgent) {
  // A random jti guarantees two tokens issued in the same second for the same
  // user are still distinct strings, so their Session rows never collide
  const token = jwt.sign(
    { id: user.id, role: user.role, jti: crypto.randomBytes(8).toString("hex") },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );

  const { exp } = jwt.decode(token);

  await prisma.session.create({
    data: {
      tokenHash: hashToken(token),
      userAgent: userAgent ? userAgent.slice(0, 255) : null,
      expiresAt: new Date(exp * 1000),
      userId: user.id,
    },
  });

  return token;
}

/**
 * Verifies a JWT's signature and expiry. Callers must separately check
 * `isSessionActive` to honour revocation, since a signature check alone cannot
 * see a logout that happened before the token's natural expiry.
 * @param {string} token
 * @returns {Object} Decoded payload { id, role, iat, exp }
 */
function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

/**
 * Looks up the session behind a token, so the caller can check revocation and
 * also learn the session's id without a second query.
 * @param {string} token - The raw bearer token
 * @returns {Promise<Object|null>} The session row, or null if none exists
 */
async function getSessionByToken(token) {
  return prisma.session.findUnique({ where: { tokenHash: hashToken(token) } });
}

/**
 * Revokes the session behind a single token. Used on sign-out.
 * @param {string} token - The raw bearer token
 * @returns {Promise<void>}
 */
async function revokeSession(token) {
  await prisma.session.updateMany({
    where: { tokenHash: hashToken(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/**
 * Revokes every active session for a user. Used when the password changes, so
 * a stolen token stops working even though JWTs cannot normally be recalled.
 * @param {string} userId
 * @param {string} [exceptToken] - A token to leave active, e.g. the caller's own
 * @returns {Promise<void>}
 */
async function revokeAllSessions(userId, exceptToken) {
  await prisma.session.updateMany({
    where: {
      userId,
      revokedAt: null,
      ...(exceptToken ? { tokenHash: { not: hashToken(exceptToken) } } : {}),
    },
    data: { revokedAt: new Date() },
  });
}

/**
 * Lists a user's active (unrevoked, unexpired) sessions, newest first.
 * @param {string} userId
 * @returns {Promise<Object[]>}
 */
async function listSessions(userId) {
  return prisma.session.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    select: { id: true, userAgent: true, createdAt: true, expiresAt: true },
  });
}

/**
 * Fetches a user by id (without password).
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
async function getUserById(id) {
  const user = await prisma.user.findUnique({ where: { id } });
  return user ? sanitizeUser(user) : null;
}

/**
 * Replaces a user's password after checking the current one.
 * @param {string} id - The signed-in user's id
 * @param {Object} data - { currentPassword, newPassword }
 * @returns {Promise<Object>} The updated user (without password)
 */
async function changePassword(id, { currentPassword, newPassword }, currentToken) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    const err = new Error("User no longer exists.");
    err.status = 404;
    throw err;
  }

  const passwordMatches = await bcrypt.compare(currentPassword, user.password);
  if (!passwordMatches) {
    const err = new Error("Current password is incorrect.");
    err.status = 401;
    throw err;
  }

  const updated = await prisma.user.update({
    where: { id },
    data: { password: await bcrypt.hash(newPassword, 10) },
  });

  // Every other signed-in device loses access; the one making the change stays in
  await revokeAllSessions(id, currentToken);

  return sanitizeUser(updated);
}

/**
 * Saves a user's UI preferences so they persist across devices and browsers.
 * @param {string} id - User id
 * @param {Object} preferences - { themeMode }
 * @returns {Promise<Object>} The updated user (without password)
 */
async function updatePreferences(id, { themeMode }) {
  const data = {};
  if (themeMode === "light" || themeMode === "dark") data.themeMode = themeMode;

  if (Object.keys(data).length === 0) {
    const err = new Error("No valid preference supplied.");
    err.status = 400;
    throw err;
  }

  const user = await prisma.user.update({ where: { id }, data });
  return sanitizeUser(user);
}

/**
 * Lists every user with their response counts. Admin only.
 * @returns {Promise<Object[]>} Users without passwords, newest last
 */
async function listUsers(actor) {
  const users = await prisma.user.findMany({
    // Demo admins only ever manage demo accounts, and vice versa
    where: { isDemo: Boolean(actor?.isDemo) },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      isDemo: true,
      promotedById: true,
      createdAt: true,
      _count: { select: { responses: true, forms: true } },
    },
  });

  return users.map(({ _count, ...user }) => ({
    ...user,
    responseCount: _count.responses,
    formCount: _count.forms,
  }));
}

/**
 * Promotes or demotes a user. Admins cannot change their own role, cannot demote
 * the admin who promoted them, and the last remaining active admin cannot be
 * demoted. An admin may demote someone they promoted themselves.
 * @param {string} id - Target user id
 * @param {string} role - "ADMIN" or "USER"
 * @param {string} actingUserId - The admin making the change
 * @returns {Promise<Object>} The updated user (without password)
 */
async function updateUserRole(id, role, actingUserId) {
  if (id === actingUserId) {
    const err = new Error("You cannot change your own role.");
    err.status = 400;
    throw err;
  }

  const target = await requireUser(id);
  await assertSameCohort(target, actingUserId);

  if (target.role === "ADMIN" && role === "USER") {
    const actingUser = await requireUser(actingUserId);

    if (actingUser.promotedById === id) {
      const err = new Error("This admin promoted you, so you cannot demote them.");
      err.status = 403;
      throw err;
    }

    await assertNotLastAdmin(id);
  }

  const updated = await prisma.user.update({
    where: { id },
    // Record the promoter on the way up, clear it on the way down so a later
    // promotion is attributed to whoever grants it next
    data: { role, promotedById: role === "ADMIN" ? actingUserId : null },
  });

  await recordAudit({
    action: role === "ADMIN" ? "user.promoted" : "user.demoted",
    actor: await requireUser(actingUserId),
    targetType: "user",
    targetId: id,
    detail: `${updated.name} (${updated.email})`,
  });

  return sanitizeUser(updated);
}

/**
 * Activates or deactivates a user. Admins cannot deactivate themselves, and the
 * last remaining active admin cannot be deactivated.
 * @param {string} id - Target user id
 * @param {boolean} isActive - Desired state
 * @param {string} actingUserId - The admin making the change
 * @returns {Promise<Object>} The updated user (without password)
 */
async function updateUserStatus(id, isActive, actingUserId) {
  if (id === actingUserId) {
    const err = new Error("You cannot deactivate your own account.");
    err.status = 400;
    throw err;
  }

  const target = await requireUser(id);
  await assertSameCohort(target, actingUserId);

  if (target.role === "ADMIN" && !isActive) {
    await assertNotLastAdmin(id);
  }

  const updated = await prisma.user.update({ where: { id }, data: { isActive } });

  await recordAudit({
    action: isActive ? "user.reactivated" : "user.deactivated",
    actor: await requireUser(actingUserId),
    targetType: "user",
    targetId: id,
    detail: `${updated.name} (${updated.email})`,
  });

  return sanitizeUser(updated);
}

/**
 * Issues a single-use password reset token for the given email. Returns null
 * when no active account matches, so callers cannot probe for addresses.
 * @param {string} email
 * @returns {Promise<Object|null>} { user, token } with the raw token
 */
async function createPasswordResetToken(email) {
  const user = await prisma.user.findUnique({ where: { email: email.trim() } });
  if (!user || !user.isActive) return null;

  const token = crypto.randomBytes(32).toString("hex");

  await prisma.$transaction([
    prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } }),
    prisma.passwordResetToken.create({
      data: {
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
        userId: user.id,
      },
    }),
  ]);

  return { user: sanitizeUser(user), token };
}

/**
 * Consumes a reset token and sets a new password.
 * @param {string} token - The raw token from the reset link
 * @param {string} password - The new password
 * @returns {Promise<Object>} The updated user (without password)
 */
async function resetPassword(token, password) {
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });

  if (!record || record.usedAt || record.expiresAt < new Date()) {
    const err = new Error("This reset link is invalid or has expired.");
    err.status = 400;
    throw err;
  }

  const [updated] = await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { password: await bcrypt.hash(password, 10) },
    }),
    prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
  ]);

  // A reset implies the old password may be compromised, so every existing
  // session is cut, including any that were active before the reset
  await revokeAllSessions(record.userId);

  return sanitizeUser(updated);
}

/**
 * Appends an entry to the admin audit trail. Never throws, so a logging
 * failure cannot roll back the action that was already performed.
 * @param {Object} event - { action, actor, targetType, targetId, detail }
 * @returns {Promise<void>}
 */
async function recordAudit({ action, actor, targetType, targetId, detail }) {
  try {
    await prisma.auditEvent.create({
      data: {
        action,
        actorId: actor.id,
        actorName: actor.name,
        targetType: targetType || null,
        targetId: targetId || null,
        detail: detail || null,
      },
    });
  } catch (err) {
    console.error("Failed to write audit event:", err.message);
  }
}

/**
 * Lists a page of audit events, newest first. Admin only.
 * @param {Object} paging - { page, pageSize }
 * @returns {Promise<Object>} { events, total, page, pageSize }
 */
async function listAuditEvents({ page, pageSize } = {}, actor) {
  const safePage = Math.max(1, Number.parseInt(page, 10) || 1);
  const safeSize = Math.min(100, Math.max(1, Number.parseInt(pageSize, 10) || 10));

  // Only actions taken by admins in the caller's own cohort
  const cohort = await prisma.user.findMany({
    where: { isDemo: Boolean(actor?.isDemo) },
    select: { id: true },
  });
  const where = { actorId: { in: cohort.map((u) => u.id) } };

  const [events, total] = await Promise.all([
    prisma.auditEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (safePage - 1) * safeSize,
      take: safeSize,
    }),
    prisma.auditEvent.count({ where }),
  ]);

  return { events, total, page: safePage, pageSize: safeSize };
}

/**
 * Loads a user or throws a 404, so callers can assume the record exists.
 * @param {string} id - User id
 * @returns {Promise<Object>} The raw user record, password included
 */
async function requireUser(id) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    const err = new Error("User not found.");
    err.status = 404;
    throw err;
  }
  return user;
}

/**
 * Blocks an admin from acting on a user outside their own cohort, so a demo
 * admin cannot touch real accounts and a real admin cannot touch demo ones.
 * @param {Object} target - The user being changed
 * @param {string} actingUserId - The admin making the change
 * @returns {Promise<void>}
 */
async function assertSameCohort(target, actingUserId) {
  const actor = await requireUser(actingUserId);
  if (Boolean(actor.isDemo) !== Boolean(target.isDemo)) {
    const err = new Error("That account is outside your workspace.");
    err.status = 403;
    throw err;
  }
}

/**
 * Throws if demoting or deactivating this user would leave no active admin,
 * which would lock everyone out of the admin-only features.
 * @param {string} id - The user about to lose admin access
 * @returns {Promise<void>}
 */
async function assertNotLastAdmin(id) {
  const remaining = await prisma.user.count({
    where: { role: "ADMIN", isActive: true, id: { not: id } },
  });

  if (remaining === 0) {
    const err = new Error("At least one active admin must remain.");
    err.status = 409;
    throw err;
  }
}

/**
 * Hashes a reset token so the database never holds the usable value.
 * @param {string} token - The raw token handed to the user
 * @returns {string} Hex-encoded SHA-256 digest
 */
function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Creates an in-app notification for one user. Never throws, so a notification
 * failure cannot roll back the action that triggered it.
 * @param {Object} data - { userId, type, message, targetType, targetId }
 * @returns {Promise<void>}
 */
async function notifyUser({ userId, type, message, targetType, targetId }) {
  try {
    await prisma.notification.create({
      data: { userId, type, message, targetType: targetType || null, targetId: targetId || null },
    });
  } catch (err) {
    console.error("Failed to create notification:", err.message);
  }
}

/**
 * Creates the same notification for many users at once, e.g. every recipient of
 * a newly published form.
 * @param {string[]} userIds
 * @param {Object} data - { type, message, targetType, targetId }
 * @returns {Promise<void>}
 */
async function notifyUsers(userIds, data) {
  await Promise.all(userIds.map((userId) => notifyUser({ userId, ...data })));
}

/**
 * Lists a user's notifications, newest first, with the unread count.
 * @param {string} userId
 * @param {Object} [paging] - { page, pageSize }
 * @returns {Promise<Object>} { notifications, total, unreadCount, page, pageSize }
 */
async function listNotifications(userId, { page, pageSize } = {}) {
  const safePage = Math.max(1, Number.parseInt(page, 10) || 1);
  const safeSize = Math.min(100, Math.max(1, Number.parseInt(pageSize, 10) || 10));

  const [notifications, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      skip: (safePage - 1) * safeSize,
      take: safeSize,
    }),
    prisma.notification.count({ where: { userId } }),
    prisma.notification.count({ where: { userId, isRead: false } }),
  ]);

  return { notifications, total, unreadCount, page: safePage, pageSize: safeSize };
}

/**
 * Marks one notification read. Scoped to the owner so one user cannot mark
 * another's notification.
 * @param {string} id - Notification id
 * @param {string} userId - The owner, taken from the authenticated request
 * @returns {Promise<Object|null>} The updated row, or null if not found/not owned
 */
async function markNotificationRead(id, userId) {
  const existing = await prisma.notification.findFirst({ where: { id, userId } });
  if (!existing) return null;
  return prisma.notification.update({ where: { id }, data: { isRead: true } });
}

/**
 * Marks every one of a user's notifications read.
 * @param {string} userId
 * @returns {Promise<number>} How many were updated
 */
async function markAllNotificationsRead(userId) {
  const { count } = await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true },
  });
  return count;
}

/**
 * Strips the password hash before a user record leaves this service.
 * @param {Object} user - Raw user record
 * @returns {Object} The same record without `password`
 */
function sanitizeUser(user) {
  const { password, ...safeUser } = user;
  return safeUser;
}

module.exports = {
  registerUser,
  loginUser,
  loginDemoUser,
  generateToken,
  verifyToken,
  getUserById,
  changePassword,
  updatePreferences,
  listUsers,
  updateUserRole,
  updateUserStatus,
  createPasswordResetToken,
  resetPassword,
  recordAudit,
  listAuditEvents,
  getSessionByToken,
  revokeSession,
  revokeAllSessions,
  listSessions,
  notifyUser,
  notifyUsers,
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
};
