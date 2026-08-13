import React, { useCallback, useEffect, useState } from "react";
import Alert from "@mui/material/Alert";
import AppBar from "@mui/material/AppBar";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Container from "@mui/material/Container";
import Badge from "@mui/material/Badge";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import Link from "@mui/material/Link";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Toolbar from "@mui/material/Toolbar";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import DevicesIcon from "@mui/icons-material/Devices";
import DoneAllIcon from "@mui/icons-material/DoneAll";
import ForumIcon from "@mui/icons-material/Forum";
import LightModeIcon from "@mui/icons-material/LightMode";
import LockResetIcon from "@mui/icons-material/LockReset";
import LoginIcon from "@mui/icons-material/Login";
import LogoutIcon from "@mui/icons-material/Logout";
import NotificationsIcon from "@mui/icons-material/Notifications";
import PersonAddIcon from "@mui/icons-material/PersonAdd";
import PersonIcon from "@mui/icons-material/Person";
import SettingsIcon from "@mui/icons-material/Settings";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import { formatDate } from "./utils/formatDate";
import FeedbackPage from "./pages/FeedbackPage";
import { ChangePasswordForm } from "./components/FeedbackForm";
import ModalComponent from "./components/ModalComponent";
import {
  validateLoginForm,
  validateRegisterForm,
  validateResetPasswordForm,
  isValidEmail,
} from "./utils/validation";
import {
  register,
  login,
  demoLogin,
  logout,
  getCurrentUser,
  getSessions,
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  changePassword,
  updatePreferences,
  forgotPassword,
  resetPassword,
  getToken,
  setToken,
  clearToken,
} from "./services/feedbackService";

// sx callbacks rather than constants, so both gradients follow the colour mode.
// `brand` is the vivid version for buttons and avatars; `bar` is muted on dark.
const gradientMain = (theme) => theme.palette.gradient.brand;
const gradientBar = (theme) => theme.palette.gradient.bar;

/**
 * Builds the trailing reveal toggle for a password field.
 * @param {Object} config - { visible, onToggle, label }
 * @param {boolean} config.visible - Whether the value is currently shown
 * @param {Function} config.onToggle - Flips the visibility
 * @param {string} config.label - Accessible name for the toggle button
 * @returns {Object} slotProps to spread onto a MUI TextField
 */
function revealToggle({ visible, onToggle, label }) {
  return {
    input: {
      endAdornment: (
        <InputAdornment position="end">
          <Tooltip title={visible ? "Hide" : "Show"}>
            <IconButton
              onClick={onToggle}
              edge="end"
              size="small"
              aria-label={label}
              aria-pressed={visible}
            >
              {visible ? (
                <VisibilityOffIcon fontSize="small" />
              ) : (
                <VisibilityIcon fontSize="small" />
              )}
            </IconButton>
          </Tooltip>
        </InputAdornment>
      ),
    },
  };
}

/**
 * Auth gate for the app. Restores an existing session on load, then renders
 * either the sign-in screen or the feedback page.
 */
const NOTIFICATION_POLL_MS = 30000;

function App({ mode, onToggleMode, onApplyMode }) {
  const [user, setUser] = useState(null);
  const [isRestoring, setIsRestoring] = useState(Boolean(getToken()));
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [accountNotice, setAccountNotice] = useState("");
  const [accountError, setAccountError] = useState("");
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationAnchor, setNotificationAnchor] = useState(null);

  /** Refreshes the notification bell's list and unread count. */
  const loadNotifications = useCallback(async () => {
    try {
      const result = await getNotifications({ pageSize: 10 });
      setNotifications(result.notifications);
      setUnreadCount(result.unreadCount);
    } catch (err) {
      // Silent: a failed poll should not interrupt whatever the user is doing
    }
  }, []);

  /**
   * Revalidates a stored token against the API. A rejected token is discarded so
   * the sign-in screen shows instead of a half-loaded session.
   */
  const restoreSession = useCallback(async () => {
    if (!getToken()) return;

    try {
      const { user: currentUser } = await getCurrentUser();
      setUser(currentUser);
    } catch (err) {
      clearToken();
    } finally {
      setIsRestoring(false);
    }
  }, []);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  // Polls rather than pushing, since there is no websocket/SSE channel here
  useEffect(() => {
    if (!user) return;
    loadNotifications();
    const timer = setInterval(loadNotifications, NOTIFICATION_POLL_MS);
    return () => clearInterval(timer);
  }, [user, loadNotifications]);

  // Adopt the mode saved on the account, so the choice carries to a new device
  useEffect(() => {
    if (user?.themeMode) onApplyMode(user.themeMode);
  }, [user, onApplyMode]);

  /**
   * Flips the colour mode and saves it to the account, so it is not stranded in
   * this browser's localStorage.
   */
  const handleToggleMode = useCallback(() => {
    const next = mode === "light" ? "dark" : "light";
    onToggleMode();

    if (user) {
      setUser((prev) => (prev ? { ...prev, themeMode: next } : prev));
      updatePreferences({ themeMode: next }).catch(() => {
        // Local toggle already applied; the next sign-in will re-sync
      });
    }
  }, [mode, onToggleMode, user]);

  /**
   * Ends the session on the server, then drops the local token regardless of
   * whether that call succeeds, so the user is never stuck signed in visually
   * but rejected by the API.
   */
  const handleSignOut = useCallback(async () => {
    try {
      await logout();
    } catch (err) {
      // The token is being discarded either way
    }
    clearToken();
    setUser(null);
    setIsAccountOpen(false);
    setNotifications([]);
    setUnreadCount(0);
  }, []);

  /** Opens the account dialog and loads the user's active sessions. */
  const handleOpenAccount = useCallback(async () => {
    setIsAccountOpen(true);
    try {
      setSessions(await getSessions());
    } catch (err) {
      setAccountError(err.message);
    }
  }, []);

  /**
   * Marks one notification read locally and on the server, so the badge count
   * updates immediately rather than waiting for the next poll.
   * @param {Object} notification
   */
  const handleNotificationClick = async (notification) => {
    if (notification.isRead) return;
    setNotifications((prev) =>
      prev.map((n) => (n.id === notification.id ? { ...n, isRead: true } : n))
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
    try {
      await markNotificationRead(notification.id);
    } catch (err) {
      // Leave the optimistic update in place; the next poll reconciles it
    }
  };

  /** Marks every notification read. */
  const handleMarkAllRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
    try {
      await markAllNotificationsRead();
    } catch (err) {
      // Next poll reconciles state if this failed
    }
  };

  /**
   * Sends a password change for the signed-in user.
   * @param {Object} formData - { currentPassword, newPassword }
   */
  const handleChangePassword = async (formData) => {
    setIsSavingPassword(true);
    setAccountError("");
    setAccountNotice("");

    try {
      await changePassword(formData);
      setAccountNotice("Password updated.");
    } catch (err) {
      setAccountError(err.message);
    } finally {
      setIsSavingPassword(false);
    }
  };

  if (isRestoring) {
    return (
      <Stack alignItems="center" justifyContent="center" sx={{ minHeight: "100vh" }}>
        <CircularProgress />
      </Stack>
    );
  }

  if (!user) {
    return <AuthForm onAuthenticated={setUser} mode={mode} onToggleMode={onToggleMode} />;
  }

  const isAdmin = user.role === "ADMIN";

  return (
    <Box sx={{ minHeight: "100vh" }}>
      <AppBar
        position="sticky"
        elevation={0}
        sx={{
          backgroundImage: gradientBar,
          borderBottom: "1px solid rgba(255, 255, 255, 0.16)",
        }}
      >
        <Toolbar sx={{ gap: { xs: 0.75, sm: 1.5 }, px: { xs: 1.5, sm: 3, md: 4 } }}>
          <Avatar
            variant="rounded"
            sx={{ bgcolor: "rgba(255, 255, 255, 0.2)", width: 34, height: 34, flexShrink: 0 }}
          >
            <ForumIcon fontSize="small" />
          </Avatar>
          <Typography
            variant="subtitle1"
            noWrap
            sx={{ flexGrow: 1, color: "#fff", display: { xs: "none", sm: "block" } }}
          >
            Feedback Collector
          </Typography>
          <Box sx={{ flexGrow: 1, display: { sm: "none" } }} />

          <Chip
            size="small"
            icon={isAdmin ? <AdminPanelSettingsIcon /> : <PersonIcon />}
            label={user.role}
            sx={{
              bgcolor: "rgba(255, 255, 255, 0.22)",
              color: "#fff",
              border: "1px solid rgba(255, 255, 255, 0.35)",
              "& .MuiChip-icon": { color: "#fff" },
            }}
          />
          <Typography
            variant="body2"
            noWrap
            sx={{
              color: "rgba(255, 255, 255, 0.9)",
              display: { xs: "none", md: "block" },
              maxWidth: 180,
            }}
          >
            {user.name}
          </Typography>

          <Tooltip title={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"}>
            <IconButton
              onClick={handleToggleMode}
              size="small"
              sx={{ color: "#fff" }}
              aria-label="Toggle colour mode"
            >
              {mode === "dark" ? (
                <LightModeIcon fontSize="small" />
              ) : (
                <DarkModeIcon fontSize="small" />
              )}
            </IconButton>
          </Tooltip>

          {/* Labels collapse to icon-only buttons on phones to stop the bar wrapping */}
          <Tooltip title="Notifications">
            <IconButton
              onClick={(e) => setNotificationAnchor(e.currentTarget)}
              size="small"
              sx={{ color: "#fff" }}
              aria-label="Notifications"
            >
              <Badge badgeContent={unreadCount} color="error" max={9}>
                <NotificationsIcon fontSize="small" />
              </Badge>
            </IconButton>
          </Tooltip>

          <Tooltip title="Account settings">
            <IconButton
              onClick={handleOpenAccount}
              size="small"
              sx={{ color: "#fff", display: { sm: "none" } }}
              aria-label="Account settings"
            >
              <SettingsIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Button
            size="small"
            onClick={handleOpenAccount}
            startIcon={<SettingsIcon />}
            sx={{ color: "#fff", display: { xs: "none", sm: "inline-flex" } }}
          >
            Account
          </Button>

          <Tooltip title="Sign out">
            <IconButton
              onClick={handleSignOut}
              size="small"
              sx={{ color: "#fff", display: { sm: "none" } }}
              aria-label="Sign out"
            >
              <LogoutIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Button
            size="small"
            onClick={handleSignOut}
            startIcon={<LogoutIcon />}
            sx={{
              color: "#fff",
              display: { xs: "none", sm: "inline-flex" },
              border: "1px solid rgba(255, 255, 255, 0.5)",
              "&:hover": { borderColor: "#fff", bgcolor: "rgba(255, 255, 255, 0.12)" },
            }}
          >
            Sign Out
          </Button>
        </Toolbar>
      </AppBar>

      <FeedbackPage user={user} onSessionExpired={handleSignOut} />

      <Menu
        anchorEl={notificationAnchor}
        open={Boolean(notificationAnchor)}
        onClose={() => setNotificationAnchor(null)}
        slotProps={{ paper: { sx: { width: 340, maxHeight: 420 } } }}
      >
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ px: 2, py: 1 }}>
          <Typography variant="subtitle2">Notifications</Typography>
          {unreadCount > 0 && (
            <Button size="small" startIcon={<DoneAllIcon />} onClick={handleMarkAllRead}>
              Mark all read
            </Button>
          )}
        </Stack>
        <Divider />
        {notifications.length === 0 ? (
          <MenuItem disabled>
            <Typography variant="body2" color="text.secondary">
              Nothing yet.
            </Typography>
          </MenuItem>
        ) : (
          notifications.map((notification) => (
            <MenuItem
              key={notification.id}
              onClick={() => handleNotificationClick(notification)}
              sx={{
                alignItems: "flex-start",
                bgcolor: notification.isRead ? "transparent" : "glass.tint",
                whiteSpace: "normal",
              }}
            >
              <Stack spacing={0.25} sx={{ width: "100%" }}>
                <Typography variant="body2">{notification.message}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {formatDate(notification.createdAt)}
                </Typography>
              </Stack>
            </MenuItem>
          ))
        )}
      </Menu>

      <ModalComponent
        isOpen={isAccountOpen}
        title="Account"
        onCancel={() => {
          setIsAccountOpen(false);
          setAccountNotice("");
          setAccountError("");
        }}
        hideConfirm
        cancelLabel="Close"
        wide
      >
        <Stack spacing={2}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Avatar sx={{ backgroundImage: gradientMain, width: 44, height: 44, color: "#fff" }}>
              {user.name ? user.name.trim()[0].toUpperCase() : "?"}
            </Avatar>
            <Box>
              <Typography variant="subtitle2">{user.name}</Typography>
              <Typography variant="caption" color="text.secondary">
                {user.email} &middot; {user.role}
              </Typography>
            </Box>
          </Stack>

          <Divider />

          {accountError && <Alert severity="error">{accountError}</Alert>}
          {accountNotice && <Alert severity="success">{accountNotice}</Alert>}
          <ChangePasswordForm onSubmit={handleChangePassword} isSubmitting={isSavingPassword} />

          <Divider />

          <Stack direction="row" spacing={1} alignItems="center">
            <DevicesIcon fontSize="small" color="action" />
            <Typography variant="subtitle2">Active Sessions</Typography>
          </Stack>
          {sessions.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No other active sessions.
            </Typography>
          ) : (
            <Stack spacing={1}>
              {sessions.map((session) => (
                <Stack
                  key={session.id}
                  direction="row"
                  justifyContent="space-between"
                  alignItems="center"
                  sx={{ p: 1, border: "1px solid", borderColor: "divider", borderRadius: 1 }}
                >
                  <Box>
                    <Typography variant="body2">
                      {session.userAgent ? session.userAgent.slice(0, 60) : "Unknown device"}
                      {session.isCurrent && (
                        <Chip size="small" label="This device" sx={{ ml: 1 }} />
                      )}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Signed in {formatDate(session.createdAt)}
                    </Typography>
                  </Box>
                </Stack>
              ))}
            </Stack>
          )}
          <Typography variant="caption" color="text.secondary">
            Changing your password signs every other session out automatically.
          </Typography>
        </Stack>
      </ModalComponent>
    </Box>
  );
}

/**
 * Sign-in, sign-up and password recovery screen, laid out as a centred card
 * with a gradient header panel.
 * @param {Object} props
 * @param {Function} props.onAuthenticated - Called with the user record on success
 */
function AuthForm({ onAuthenticated, mode: colorMode, onToggleMode }) {
  const [mode, setMode] = useState("login");
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    role: "USER",
    adminCode: "",
    token: "",
  });
  const [errors, setErrors] = useState({});
  const [errorMessage, setErrorMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showAdminCode, setShowAdminCode] = useState(false);
  const [demoRole, setDemoRole] = useState(null);

  const isRegistering = mode === "register";
  const isForgot = mode === "forgot";
  const isReset = mode === "reset";

  /**
   * Keeps a single form field in state.
   * @param {Object} e - Change event from an input
   */
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  /**
   * Picks the account type being registered.
   * @param {string} role - "USER" or "ADMIN"
   */
  const handleRoleChange = (role) => {
    setFormData((prev) => ({ ...prev, role }));
    setErrors({});
    setErrorMessage("");
  };

  /**
   * Switches between the sign-in, sign-up and recovery screens, clearing any
   * messages left over from the previous one.
   * @param {"login"|"register"|"forgot"|"reset"} next - Screen to show
   */
  const switchMode = (next) => {
    setMode(next);
    setErrors({});
    setErrorMessage("");
    setNotice("");
    // Re-mask on navigation so a revealed value is not left on screen
    setShowPassword(false);
    setShowAdminCode(false);
  };

  /**
   * Signs in to a shared demo account without credentials.
   * @param {"ADMIN"|"USER"} role - Which demo account to use
   */
  const handleDemoLogin = async (role) => {
    setDemoRole(role);
    setErrorMessage("");
    setNotice("");

    try {
      const data = await demoLogin(role);
      setToken(data.token);
      onAuthenticated(data.user);
    } catch (err) {
      setErrorMessage(err.message);
    } finally {
      setDemoRole(null);
    }
  };

  /**
   * Validates and submits whichever screen is currently active.
   * @param {Object} e - Form submit event
   */
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (isForgot) {
      if (!isValidEmail(formData.email)) {
        setErrors({ email: "Please enter a valid email." });
        return;
      }
    } else {
      const { valid, errors: validationErrors } = isRegistering
        ? validateRegisterForm(formData)
        : isReset
        ? validateResetPasswordForm(formData)
        : validateLoginForm(formData);

      if (!valid) {
        setErrors(validationErrors);
        return;
      }
    }

    setErrors({});
    setErrorMessage("");
    setNotice("");
    setIsSubmitting(true);

    try {
      if (isForgot) {
        const result = await forgotPassword(formData.email);
        setMode("reset");
        setNotice(`${result.message} Check the server console for the token.`);
      } else if (isReset) {
        const result = await resetPassword({
          token: formData.token,
          password: formData.password,
        });
        setMode("login");
        setFormData((prev) => ({ ...prev, password: "", token: "" }));
        setNotice(result.message);
      } else {
        const data = isRegistering ? await register(formData) : await login(formData);
        setToken(data.token);
        onAuthenticated(data.user);
      }
    } catch (err) {
      setErrorMessage(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const heading = isRegistering
    ? "Create your account"
    : isForgot
    ? "Forgot password"
    : isReset
    ? "Reset password"
    : "Welcome back";

  const blurb = isRegistering
    ? "Pick how you will use the app, then set up your details."
    : isForgot
    ? "We will generate a single-use reset token for your account."
    : isReset
    ? "Paste the token you were given and choose a new password."
    : "Sign in to publish forms or answer the ones shared with you.";

  const submitLabel = isRegistering
    ? "Create Account"
    : isForgot
    ? "Send Reset Token"
    : isReset
    ? "Set New Password"
    : "Sign In";

  const submitIcon = isRegistering ? (
    <PersonAddIcon />
  ) : isForgot || isReset ? (
    <LockResetIcon />
  ) : (
    <LoginIcon />
  );

  return (
    <Container
      maxWidth="sm"
      sx={{ minHeight: "100vh", display: "flex", alignItems: "center", py: 6 }}
    >
      <Card sx={{ width: "100%", overflow: "hidden", "&:hover": { transform: "none" } }}>
        <Box sx={{ backgroundImage: gradientBar, px: { xs: 3, sm: 4 }, py: 4, color: "#fff" }}>
          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
            <Avatar variant="rounded" sx={{ bgcolor: "rgba(255, 255, 255, 0.22)" }}>
              <ForumIcon />
            </Avatar>
            <Typography variant="overline" sx={{ opacity: 0.9, flexGrow: 1 }}>
              Feedback Collector
            </Typography>
            <Tooltip title={colorMode === "dark" ? "Switch to light mode" : "Switch to dark mode"}>
              <IconButton
                onClick={onToggleMode}
                size="small"
                sx={{ color: "#fff" }}
                aria-label="Toggle colour mode"
              >
                {colorMode === "dark" ? (
                  <LightModeIcon fontSize="small" />
                ) : (
                  <DarkModeIcon fontSize="small" />
                )}
              </IconButton>
            </Tooltip>
          </Stack>
          <Typography variant="h4" sx={{ mb: 0.75 }}>
            {heading}
          </Typography>
          <Typography variant="body2" sx={{ opacity: 0.92, maxWidth: 420 }}>
            {blurb}
          </Typography>
        </Box>

        <CardContent sx={{ px: { xs: 3, sm: 4 }, py: 3.5 }}>
          <Box component="form" onSubmit={handleSubmit}>
            <Stack spacing={2.25}>
              {errorMessage && <Alert severity="error">{errorMessage}</Alert>}
              {notice && <Alert severity="success">{notice}</Alert>}

              {isRegistering && (
                <>
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                    {[
                      {
                        role: "USER",
                        title: "Normal User",
                        hint: "Fills in published forms",
                        icon: <PersonIcon />,
                      },
                      {
                        role: "ADMIN",
                        title: "Admin",
                        hint: "Creates forms, reads responses",
                        icon: <AdminPanelSettingsIcon />,
                      },
                    ].map((option) => {
                      const selected = formData.role === option.role;
                      return (
                        <Paper
                          key={option.role}
                          variant="outlined"
                          onClick={() => handleRoleChange(option.role)}
                          role="button"
                          aria-pressed={selected}
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              handleRoleChange(option.role);
                            }
                          }}
                          sx={{
                            flex: 1,
                            p: 2,
                            cursor: "pointer",
                            borderWidth: 2,
                            borderColor: selected ? "primary.main" : "divider",
                            bgcolor: selected ? "glass.tint" : "glass.subtle",
                            transition: "all 180ms ease",
                            "&:hover": { borderColor: "primary.light", transform: "translateY(-2px)" },
                          }}
                        >
                          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                            <Avatar
                              sx={{
                                width: 28,
                                height: 28,
                                bgcolor: selected ? "primary.main" : "action.hover",
                                color: selected ? "#fff" : "text.secondary",
                              }}
                            >
                              {option.icon}
                            </Avatar>
                            <Typography
                              variant="subtitle2"
                              color={selected ? "primary.main" : "text.primary"}
                            >
                              {option.title}
                            </Typography>
                          </Stack>
                          <Typography variant="caption" color="text.secondary">
                            {option.hint}
                          </Typography>
                        </Paper>
                      );
                    })}
                  </Stack>

                  <TextField
                    label="Name"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    error={Boolean(errors.name)}
                    helperText={errors.name}
                  />
                </>
              )}

              {isReset && (
                <TextField
                  label="Reset Token"
                  name="token"
                  value={formData.token}
                  onChange={handleChange}
                  error={Boolean(errors.token)}
                  helperText={errors.token}
                />
              )}

              {!isReset && (
                <TextField
                  label="Email"
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleChange}
                  error={Boolean(errors.email)}
                  helperText={errors.email}
                />
              )}

              {!isForgot && (
                <TextField
                  label={isReset ? "New Password" : "Password"}
                  name="password"
                  type={showPassword ? "text" : "password"}
                  value={formData.password}
                  onChange={handleChange}
                  error={Boolean(errors.password)}
                  helperText={errors.password}
                  slotProps={revealToggle({
                    visible: showPassword,
                    onToggle: () => setShowPassword((prev) => !prev),
                    label: showPassword ? "Hide password" : "Show password",
                  })}
                />
              )}

              {isRegistering && formData.role === "ADMIN" && (
                <TextField
                  label="Admin Code"
                  name="adminCode"
                  type={showAdminCode ? "text" : "password"}
                  value={formData.adminCode}
                  onChange={handleChange}
                  error={Boolean(errors.adminCode)}
                  helperText={
                    errors.adminCode ||
                    "Set as ADMIN_SIGNUP_CODE in the server .env, so admin accounts cannot be self-issued."
                  }
                  slotProps={revealToggle({
                    visible: showAdminCode,
                    onToggle: () => setShowAdminCode((prev) => !prev),
                    label: showAdminCode ? "Hide admin code" : "Show admin code",
                  })}
                />
              )}

              <Button
                type="submit"
                variant="contained"
                size="large"
                disabled={isSubmitting}
                startIcon={submitIcon}
                fullWidth
              >
                {isSubmitting ? "Please wait..." : submitLabel}
              </Button>

              {mode === "login" && (
                <>
                  <Divider sx={{ pt: 0.5 }}>
                    <Typography variant="caption" color="text.secondary">
                      or try it without an account
                    </Typography>
                  </Divider>

                  <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                    <Button
                      fullWidth
                      variant="outlined"
                      startIcon={<AdminPanelSettingsIcon />}
                      disabled={Boolean(demoRole)}
                      onClick={() => handleDemoLogin("ADMIN")}
                    >
                      {demoRole === "ADMIN" ? "Starting..." : "Demo Admin"}
                    </Button>
                    <Button
                      fullWidth
                      variant="outlined"
                      startIcon={<PersonIcon />}
                      disabled={Boolean(demoRole)}
                      onClick={() => handleDemoLogin("USER")}
                    >
                      {demoRole === "USER" ? "Starting..." : "Demo User"}
                    </Button>
                  </Stack>
                  <Typography variant="caption" color="text.secondary" textAlign="center">
                    Demo accounts share a private workspace — forms created by the demo admin are
                    only visible to the demo user.
                  </Typography>
                </>
              )}

              <Divider sx={{ pt: 0.5 }} />

              <Stack direction="row" spacing={2} justifyContent="center" flexWrap="wrap" useFlexGap>
                {mode === "login" && (
                  <>
                    <Link
                      component="button"
                      type="button"
                      variant="body2"
                      underline="hover"
                      onClick={() => switchMode("register")}
                    >
                      Need an account? Sign up
                    </Link>
                    <Link
                      component="button"
                      type="button"
                      variant="body2"
                      underline="hover"
                      onClick={() => switchMode("forgot")}
                    >
                      Forgot your password?
                    </Link>
                  </>
                )}
                {mode !== "login" && (
                  <Link
                    component="button"
                    type="button"
                    variant="body2"
                    underline="hover"
                    onClick={() => switchMode("login")}
                  >
                    Back to sign in
                  </Link>
                )}
              </Stack>
            </Stack>
          </Box>
        </CardContent>
      </Card>
    </Container>
  );
}

export default App;
