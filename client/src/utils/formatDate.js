/**
 * Formats an ISO date string into a readable date/time string.
 * @param {string} isoString - ISO 8601 date string (e.g. createdAt)
 * @returns {string} Formatted date, e.g. "Aug 11, 2026, 3:45 PM"
 */
export function formatDate(isoString) {
  if (!isoString) return "";
  const date = new Date(isoString);
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
