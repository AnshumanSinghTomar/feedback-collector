const express = require("express");
const cors = require("cors");
const feedbackRoutes = require("./routes/feedbackRoutes");
const {
  register,
  login,
  demoLogin,
  me,
  logout,
  listSessions,
  updatePreferences,
  changePassword,
  forgotPassword,
  resetPassword,
  listAudit,
  listUsers,
  updateUserRole,
  updateUserStatus,
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} = require("./controllers/authController");
const { authenticate, requireAdmin } = require("./middleware/auth");

const app = express();

app.use(cors());
app.use(express.json());

const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const attempts = new Map();

/**
 * Throttles repeated credential guesses per IP and email. In-memory, so it
 * resets on restart and does not span multiple server instances; a shared store
 * such as Redis would be needed for that.
 */
function rateLimitCredentials(req, res, next) {
  const key = `${req.ip}|${String(req.body?.email || "").toLowerCase()}`;
  const now = Date.now();
  const record = attempts.get(key);

  if (record && now - record.first > ATTEMPT_WINDOW_MS) {
    attempts.delete(key);
  }

  const current = attempts.get(key);
  if (current && current.count >= MAX_ATTEMPTS) {
    const retryAfter = Math.ceil((ATTEMPT_WINDOW_MS - (now - current.first)) / 1000);
    res.setHeader("Retry-After", retryAfter);
    return res.status(429).json({ error: "Too many attempts. Try again later." });
  }

  // Count only the failures, so a correct password does not burn the budget
  res.on("finish", () => {
    if (res.statusCode < 400) {
      attempts.delete(key);
      return;
    }

    const existing = attempts.get(key);
    attempts.set(key, {
      count: (existing?.count || 0) + 1,
      first: existing?.first || now,
    });
  });

  next();
}

// Auth router is declared inline (no routes/authRoutes.js in this project)
const authRoutes = express.Router();
authRoutes.post("/register", register);
authRoutes.post("/login", rateLimitCredentials, login);
authRoutes.post("/demo", demoLogin);
authRoutes.get("/me", authenticate, me);
authRoutes.post("/logout", authenticate, logout);
authRoutes.get("/sessions", authenticate, listSessions);
authRoutes.patch("/preferences", authenticate, updatePreferences);
authRoutes.post("/change-password", authenticate, changePassword);
authRoutes.post("/forgot-password", rateLimitCredentials, forgotPassword);
authRoutes.post("/reset-password", resetPassword);
authRoutes.get("/notifications", authenticate, listNotifications);
authRoutes.patch("/notifications/read-all", authenticate, markAllNotificationsRead);
authRoutes.patch("/notifications/:id/read", authenticate, markNotificationRead);
authRoutes.get("/audit", authenticate, requireAdmin, listAudit);
authRoutes.get("/users", authenticate, requireAdmin, listUsers);
authRoutes.patch("/users/:id/role", authenticate, requireAdmin, updateUserRole);
authRoutes.patch("/users/:id/status", authenticate, requireAdmin, updateUserStatus);

app.use("/api/auth", authRoutes);
app.use("/api/feedback", feedbackRoutes);

// Health check
app.get("/", (req, res) => {
  res.send("Feedback Collector API is running.");
});

// Fallback error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Something went wrong." });
});

module.exports = app;
