import React, { useCallback, useMemo, useState } from "react";
import ReactDOM from "react-dom/client";
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import App from "./App";

const ACCENT = "#6366f1";
const ACCENT_DARK = "#4338ca";
const ACCENT_ALT = "#8b5cf6";
const MODE_KEY = "feedbackCollectorMode";

const GRADIENT = `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT_ALT} 55%, #d946ef 100%)`;

const LIGHT_MESH = `
  radial-gradient(900px 520px at 8% -8%, rgba(99, 102, 241, 0.20) 0%, transparent 60%),
  radial-gradient(820px 480px at 100% -4%, rgba(236, 72, 153, 0.16) 0%, transparent 58%),
  radial-gradient(700px 700px at 88% 100%, rgba(14, 165, 233, 0.12) 0%, transparent 60%)
`;

const DARK_MESH = `
  radial-gradient(900px 520px at 8% -8%, rgba(79, 70, 229, 0.34) 0%, transparent 62%),
  radial-gradient(820px 480px at 100% -4%, rgba(157, 23, 77, 0.24) 0%, transparent 60%),
  radial-gradient(700px 700px at 88% 100%, rgba(3, 105, 161, 0.22) 0%, transparent 62%)
`;

/**
 * Builds the app theme for the given colour mode.
 * @param {"light"|"dark"} mode
 * @returns {Object} A MUI theme
 */
function buildTheme(mode) {
  const isDark = mode === "dark";
  const surface = isDark ? "rgba(23, 33, 56, 0.78)" : "rgba(255, 255, 255, 0.86)";
  const border = isDark ? "rgba(148, 163, 184, 0.16)" : "rgba(15, 23, 42, 0.07)";

  // Panels sit behind cards, so they stay a shade darker than the cards on dark
  const glass = {
    panel: isDark ? "rgba(15, 23, 42, 0.66)" : "rgba(255, 255, 255, 0.72)",
    card: surface,
    subtle: isDark ? "rgba(30, 41, 59, 0.38)" : "rgba(255, 255, 255, 0.5)",
    tint: isDark ? "rgba(129, 140, 248, 0.16)" : "rgba(99, 102, 241, 0.12)",
  };

  // Saturated brand gradient reads as glare on dark, and gradient text needs
  // light stops to stay legible against a near-black page
  // Deliberately not called `main`: MUI treats any palette entry with a `main`
  // key as a colour and runs alpha() on it, which cannot parse a gradient
  const gradient = {
    brand: GRADIENT,
    bar: isDark
      ? "linear-gradient(135deg, #312e81 0%, #5b21b6 55%, #86198f 100%)"
      : GRADIENT,
    text: isDark
      ? "linear-gradient(135deg, #a5b4fc 0%, #c4b5fd 45%, #f5d0fe 100%)"
      : GRADIENT,
  };

  return createTheme({
    palette: {
      mode,
      primary: { main: isDark ? "#a5b4fc" : ACCENT, dark: ACCENT_DARK, light: "#c7d2fe" },
      secondary: { main: isDark ? "#f9a8d4" : "#ec4899" },
      success: { main: isDark ? "#34d399" : "#10b981" },
      warning: { main: isDark ? "#fbbf24" : "#f59e0b" },
      error: { main: isDark ? "#fca5a5" : "#ef4444" },
      info: { main: isDark ? "#7dd3fc" : "#0ea5e9" },
      background: {
        default: isDark ? "#080d1a" : "#f6f7fb",
        paper: isDark ? "#131c31" : "#ffffff",
      },
      text: {
        primary: isDark ? "#eef2f8" : "#0f172a",
        secondary: isDark ? "#a3b1c6" : "#64748b",
        disabled: isDark ? "#6b7a90" : "rgba(15, 23, 42, 0.38)",
      },
      divider: border,
      glass,
      gradient,
    },
    shape: { borderRadius: 14 },
    typography: {
      fontFamily: '"Inter", "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      h3: { fontWeight: 800, letterSpacing: "-0.03em" },
      h4: { fontWeight: 800, letterSpacing: "-0.03em" },
      h5: { fontWeight: 700, letterSpacing: "-0.02em" },
      h6: { fontWeight: 700, letterSpacing: "-0.01em" },
      subtitle1: { fontWeight: 600 },
      subtitle2: { fontWeight: 600 },
      overline: { fontWeight: 700, letterSpacing: "0.14em" },
      button: { textTransform: "none", fontWeight: 600 },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          // Layered radial tints give the page a soft mesh instead of flat grey
          body: {
            minHeight: "100vh",
            backgroundColor: isDark ? "#080d1a" : "#f6f7fb",
            backgroundImage: isDark ? DARK_MESH : LIGHT_MESH,
            backgroundAttachment: "fixed",
          },
          "*::-webkit-scrollbar": { width: 10, height: 10 },
          "*::-webkit-scrollbar-thumb": {
            backgroundColor: isDark ? "rgba(148, 163, 184, 0.3)" : "rgba(15, 23, 42, 0.18)",
            borderRadius: 8,
          },
        },
      },
      MuiPaper: { styleOverrides: { root: { backgroundImage: "none" } } },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: {
            borderRadius: 10,
            transition: "transform 160ms ease, box-shadow 160ms ease, background-color 160ms ease",
            "&:active": { transform: "translateY(0) scale(0.99)" },
          },
          containedPrimary: {
            backgroundImage: GRADIENT,
            color: "#fff",
            boxShadow: isDark
              ? "0 8px 20px rgba(2, 6, 23, 0.6)"
              : "0 8px 18px rgba(99, 102, 241, 0.32)",
            "&:hover": {
              backgroundImage: GRADIENT,
              filter: "brightness(1.08)",
              transform: "translateY(-2px)",
              boxShadow: isDark
                ? "0 12px 28px rgba(2, 6, 23, 0.7)"
                : "0 12px 26px rgba(99, 102, 241, 0.42)",
            },
          },
          outlined: {
            borderColor: isDark ? "rgba(165, 180, 252, 0.4)" : "rgba(99, 102, 241, 0.35)",
            "&:hover": {
              transform: "translateY(-2px)",
              borderColor: isDark ? "#c7d2fe" : ACCENT,
              backgroundColor: isDark ? "rgba(165, 180, 252, 0.12)" : "rgba(99, 102, 241, 0.08)",
            },
          },
          text: { "&:hover": { transform: "translateY(-1px)" } },
        },
      },
      MuiCard: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: {
            border: `1px solid ${border}`,
            backgroundColor: surface,
            backdropFilter: "blur(8px)",
            transition: "transform 200ms ease, box-shadow 200ms ease, border-color 200ms ease",
            "&:hover": {
              transform: "translateY(-3px)",
              borderColor: isDark ? "rgba(165, 180, 252, 0.45)" : "rgba(99, 102, 241, 0.38)",
              boxShadow: isDark
                ? "0 16px 34px rgba(0, 0, 0, 0.55)"
                : "0 16px 34px rgba(15, 23, 42, 0.10)",
            },
          },
        },
      },
      MuiChip: {
        styleOverrides: { root: { fontWeight: 700, borderRadius: 8, letterSpacing: "0.01em" } },
      },
      MuiLinearProgress: {
        styleOverrides: {
          root: {
            height: 10,
            borderRadius: 999,
            backgroundColor: isDark ? "rgba(148, 163, 184, 0.18)" : "rgba(99, 102, 241, 0.14)",
          },
          bar: { borderRadius: 999, backgroundImage: GRADIENT },
        },
      },
      MuiTextField: { defaultProps: { size: "small", fullWidth: true } },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: 10,
            backgroundColor: isDark ? "rgba(15, 23, 42, 0.55)" : "rgba(255, 255, 255, 0.9)",
            transition: "box-shadow 160ms ease",
            "&.Mui-focused": { boxShadow: "0 0 0 4px rgba(99, 102, 241, 0.18)" },
          },
        },
      },
      MuiAlert: { styleOverrides: { root: { borderRadius: 12, fontWeight: 500 } } },
      MuiDialog: {
        styleOverrides: {
          paper: {
            borderRadius: 18,
            border: `1px solid ${border}`,
            boxShadow: "0 30px 70px rgba(2, 6, 23, 0.45)",
          },
        },
      },
      MuiTooltip: { defaultProps: { arrow: true } },
    },
  });
}

/**
 * Holds the colour mode so the theme can be swapped at runtime, and remembers
 * the choice across reloads.
 */
function Root() {
  const [mode, setMode] = useState(() => localStorage.getItem(MODE_KEY) || "light");

  /** Flips between light and dark, persisting the choice for the next visit. */
  const toggleMode = useCallback(() => {
    setMode((prev) => {
      const next = prev === "light" ? "dark" : "light";
      localStorage.setItem(MODE_KEY, next);
      return next;
    });
  }, []);

  /**
   * Applies a mode chosen elsewhere, e.g. the value stored on the user's account
   * when they sign in on a new device.
   * @param {"light"|"dark"} next
   */
  const applyMode = useCallback((next) => {
    if (next !== "light" && next !== "dark") return;
    localStorage.setItem(MODE_KEY, next);
    setMode(next);
  }, []);

  const theme = useMemo(() => buildTheme(mode), [mode]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App mode={mode} onToggleMode={toggleMode} onApplyMode={applyMode} />
    </ThemeProvider>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
