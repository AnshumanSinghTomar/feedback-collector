const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000/api";
const TOKEN_KEY = "feedbackCollectorToken";

/**
 * Reads the stored JWT.
 * @returns {string|null}
 */
export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

/**
 * Persists the JWT for later requests.
 * @param {string} token
 */
export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

/**
 * Removes the stored JWT (used on logout or an expired session).
 */
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

/**
 * Builds the Authorization header, or an empty object when signed out.
 * @returns {Object} Headers to spread into a fetch call
 */
function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Headers for a JSON request body, including auth.
 * @returns {Object} Headers to spread into a fetch call
 */
function jsonHeaders() {
  return { "Content-Type": "application/json", ...authHeaders() };
}

/**
 * Turns a failed response into an Error, preferring the server's own message and
 * attaching the status so callers can react to 401 and 403 specifically.
 * @param {Response} res - The failed fetch response
 * @param {string} fallback - Message to use when the body carries none
 * @returns {Promise<Error>} An Error with a `status` property
 */
async function toError(res, fallback) {
  const body = await res.json().catch(() => ({}));
  const error = new Error(body.errors?.join(", ") || body.error || fallback);
  error.status = res.status;
  return error;
}

/**
 * Performs a fetch against the API and returns the parsed JSON, throwing a
 * status-carrying Error on any non-2xx response.
 * @param {string} path - Path below the API base, e.g. "/feedback/forms"
 * @param {Object} [options] - Fetch options
 * @param {string} [fallback] - Error message used when the body carries none
 * @returns {Promise<*>} The parsed response body
 */
async function request(path, options = {}, fallback = "Request failed.") {
  const res = await fetch(`${API_URL}${path}`, options);

  if (!res.ok) {
    throw await toError(res, fallback);
  }

  return res.json();
}

/**
 * Registers a new user. Choosing role ADMIN also requires a valid adminCode.
 * @param {Object} formData - { name, email, password, role, adminCode }
 * @returns {Promise<Object>} { user, token }
 */
export async function register(formData) {
  return request(
    "/auth/register",
    { method: "POST", headers: jsonHeaders(), body: JSON.stringify(formData) },
    "Failed to register."
  );
}

/**
 * Authenticates a user and returns their record plus a JWT.
 * @param {Object} formData - { email, password }
 * @returns {Promise<Object>} { user, token }
 */
export async function login(formData) {
  return request(
    "/auth/login",
    { method: "POST", headers: jsonHeaders(), body: JSON.stringify(formData) },
    "Failed to log in."
  );
}

/**
 * Signs in to a shared demo account with no credentials. Demo accounts are
 * sandboxed and only ever see each other's forms, announcements and users.
 * @param {"ADMIN"|"USER"} role - Which demo account to use
 * @returns {Promise<Object>} { user, token }
 */
export async function demoLogin(role) {
  return request(
    "/auth/demo",
    { method: "POST", headers: jsonHeaders(), body: JSON.stringify({ role }) },
    "Failed to start the demo."
  );
}

/**
 * Fetches the user matching the stored token.
 * @returns {Promise<Object>} { user }
 */
export async function getCurrentUser() {
  return request("/auth/me", { headers: authHeaders() }, "Failed to load session.");
}

/**
 * Revokes the session behind the current token on the server. Call before
 * clearing the local token so sign-out actually ends the session, not just the
 * client's memory of it.
 * @returns {Promise<Object>} Confirmation payload
 */
export async function logout() {
  return request(
    "/auth/logout",
    { method: "POST", headers: authHeaders() },
    "Failed to sign out."
  );
}

/**
 * Saves the signed-in user's UI preferences server-side, so they carry across
 * devices rather than living only in this browser.
 * @param {Object} preferences - { themeMode }
 * @returns {Promise<Object>} The updated user
 */
export async function updatePreferences(preferences) {
  return request(
    "/auth/preferences",
    { method: "PATCH", headers: jsonHeaders(), body: JSON.stringify(preferences) },
    "Failed to save preferences."
  );
}

/**
 * Lists the signed-in user's active sessions (other devices/browsers signed in
 * as them), so they can spot and end ones they do not recognize.
 * @returns {Promise<Object[]>}
 */
export async function getSessions() {
  return request("/auth/sessions", { headers: authHeaders() }, "Failed to fetch sessions.");
}

/**
 * Lists the signed-in user's notifications.
 * @param {Object} [paging] - { page, pageSize }
 * @returns {Promise<Object>} { notifications, total, unreadCount, page, pageSize }
 */
export async function getNotifications(paging = {}) {
  const params = new URLSearchParams();
  if (paging.page) params.append("page", paging.page);
  if (paging.pageSize) params.append("pageSize", paging.pageSize);

  const query = params.toString();
  return request(
    `/auth/notifications${query ? `?${query}` : ""}`,
    { headers: authHeaders() },
    "Failed to fetch notifications."
  );
}

/**
 * Marks one notification read.
 * @param {string} id - Notification id
 * @returns {Promise<Object>} The updated notification
 */
export async function markNotificationRead(id) {
  return request(
    `/auth/notifications/${id}/read`,
    { method: "PATCH", headers: authHeaders() },
    "Failed to update notification."
  );
}

/**
 * Marks every notification read.
 * @returns {Promise<Object>} { updated }
 */
export async function markAllNotificationsRead() {
  return request(
    "/auth/notifications/read-all",
    { method: "PATCH", headers: authHeaders() },
    "Failed to update notifications."
  );
}

/**
 * Changes the signed-in user's password.
 * @param {Object} formData - { currentPassword, newPassword }
 * @returns {Promise<Object>} Confirmation payload
 */
export async function changePassword(formData) {
  return request(
    "/auth/change-password",
    { method: "POST", headers: jsonHeaders(), body: JSON.stringify(formData) },
    "Failed to change password."
  );
}

/**
 * Requests a password reset token for an email address.
 * @param {string} email
 * @returns {Promise<Object>} Confirmation payload
 */
export async function forgotPassword(email) {
  return request(
    "/auth/forgot-password",
    { method: "POST", headers: jsonHeaders(), body: JSON.stringify({ email }) },
    "Failed to start password reset."
  );
}

/**
 * Consumes a reset token and sets a new password.
 * @param {Object} formData - { token, password }
 * @returns {Promise<Object>} Confirmation payload
 */
export async function resetPassword(formData) {
  return request(
    "/auth/reset-password",
    { method: "POST", headers: jsonHeaders(), body: JSON.stringify(formData) },
    "Failed to reset password."
  );
}

/**
 * Lists every user with their activity counts. Admin only.
 * @returns {Promise<Object[]>}
 */
export async function getUsers() {
  return request("/auth/users", { headers: authHeaders() }, "Failed to fetch users.");
}

/**
 * Lists a page of recorded admin actions. Admin only.
 * @param {Object} [paging] - { page, pageSize }
 * @returns {Promise<Object>} { events, total, page, pageSize }
 */
export async function getAuditLog(paging = {}) {
  const params = new URLSearchParams();
  if (paging.page) params.append("page", paging.page);
  if (paging.pageSize) params.append("pageSize", paging.pageSize);

  const query = params.toString();
  return request(
    `/auth/audit${query ? `?${query}` : ""}`,
    { headers: authHeaders() },
    "Failed to fetch the audit log."
  );
}

/**
 * Promotes or demotes a user. Admin only.
 * @param {string} id - Target user id
 * @param {string} role - "ADMIN" or "USER"
 * @returns {Promise<Object>} The updated user
 */
export async function updateUserRole(id, role) {
  return request(
    `/auth/users/${id}/role`,
    { method: "PATCH", headers: jsonHeaders(), body: JSON.stringify({ role }) },
    "Failed to update role."
  );
}

/**
 * Activates or deactivates a user. Admin only.
 * @param {string} id - Target user id
 * @param {boolean} isActive - Desired state
 * @returns {Promise<Object>} The updated user
 */
export async function updateUserStatus(id, isActive) {
  return request(
    `/auth/users/${id}/status`,
    { method: "PATCH", headers: jsonHeaders(), body: JSON.stringify({ isActive }) },
    "Failed to update account status."
  );
}

/**
 * Submits a new feedback entry to the server. Admin only.
 * @param {Object} formData - { title, message }
 * @returns {Promise<Object>} The created feedback record
 */
export async function createFeedback(formData) {
  return request(
    "/feedback",
    { method: "POST", headers: jsonHeaders(), body: JSON.stringify(formData) },
    "Failed to submit feedback."
  );
}

/**
 * Fetches a page of feedback entries, optionally filtered and sorted.
 * @param {Object} [filters] - { keyword, date, sort, page, pageSize }
 * @returns {Promise<Object>} { entries, total, page, pageSize }
 */
export async function getFeedback(filters = {}) {
  const params = new URLSearchParams();
  if (filters.keyword) params.append("keyword", filters.keyword);
  if (filters.date) params.append("date", filters.date);
  if (filters.sort) params.append("sort", filters.sort);
  if (filters.page) params.append("page", filters.page);
  if (filters.pageSize) params.append("pageSize", filters.pageSize);

  const query = params.toString();
  return request(
    query ? `/feedback?${query}` : "/feedback",
    { headers: authHeaders() },
    "Failed to fetch feedback."
  );
}

/**
 * Deletes a feedback entry by id. Admin only.
 * @param {string} id - Feedback record id
 * @returns {Promise<Object>} Confirmation payload from the server
 */
export async function deleteFeedback(id) {
  return request(
    `/feedback/${id}`,
    { method: "DELETE", headers: authHeaders() },
    "Failed to delete feedback."
  );
}

/**
 * Creates a custom feedback form. Admin only.
 * @param {Object} formDefinition - { title, description, questions, closesAt, isAnonymous }
 * @returns {Promise<Object>} The created form
 */
export async function createForm(formDefinition) {
  return request(
    "/feedback/forms",
    { method: "POST", headers: jsonHeaders(), body: JSON.stringify(formDefinition) },
    "Failed to save form."
  );
}

/**
 * Lists all forms with response counts and whether they still accept answers.
 * @returns {Promise<Object[]>}
 */
export async function getForms() {
  return request("/feedback/forms", { headers: authHeaders() }, "Failed to fetch forms.");
}

/**
 * Replaces a form's definition. Admin only.
 * @param {string} id - Form record id
 * @param {Object} formDefinition - The full definition from the builder
 * @returns {Promise<Object>} The updated form
 */
export async function updateForm(id, formDefinition) {
  return request(
    `/feedback/forms/${id}`,
    { method: "PUT", headers: jsonHeaders(), body: JSON.stringify(formDefinition) },
    "Failed to update form."
  );
}

/**
 * Flips a form's open or draft flag. Admin only.
 * @param {string} id - Form record id
 * @param {Object} flags - { isOpen } or { isDraft }
 * @returns {Promise<Object>} The updated form
 */
export async function updateFormFlags(id, flags) {
  return request(
    `/feedback/forms/${id}`,
    { method: "PATCH", headers: jsonHeaders(), body: JSON.stringify(flags) },
    "Failed to update form."
  );
}

/**
 * Deletes a form and its responses. Admin only.
 * @param {string} id - Form record id
 * @returns {Promise<Object>} Confirmation payload from the server
 */
export async function deleteForm(id) {
  return request(
    `/feedback/forms/${id}`,
    { method: "DELETE", headers: authHeaders() },
    "Failed to delete form."
  );
}

/**
 * Submits answers to a form. One response per user per form.
 * @param {string} formId - Form record id
 * @param {Object} answers - { [questionId]: value }
 * @returns {Promise<Object>} The created response
 */
export async function submitResponse(formId, answers) {
  return request(
    `/feedback/forms/${formId}/responses`,
    { method: "POST", headers: jsonHeaders(), body: JSON.stringify({ answers }) },
    "Failed to submit response."
  );
}

/**
 * Fetches a page of responses plus a summary over the whole set. Admin only.
 * @param {string} formId - Form record id
 * @param {Object} [paging] - { page, pageSize }
 * @returns {Promise<Object>} { form, summary, responses, total, page, pageSize }
 */
export async function getResponses(formId, paging = {}) {
  const params = new URLSearchParams();
  if (paging.page) params.append("page", paging.page);
  if (paging.pageSize) params.append("pageSize", paging.pageSize);

  const query = params.toString();
  const path = `/feedback/forms/${formId}/responses${query ? `?${query}` : ""}`;
  return request(path, { headers: authHeaders() }, "Failed to fetch responses.");
}

/**
 * Downloads a form's responses as a CSV file. Admin only. Goes through fetch so
 * the Authorization header is sent, then hands the blob to the browser.
 * @param {Object} form - The form being exported, used for the filename
 * @returns {Promise<void>}
 */
export async function downloadResponsesCsv(form) {
  const res = await fetch(`${API_URL}/feedback/forms/${form.id}/responses/export`, {
    headers: authHeaders(),
  });

  if (!res.ok) {
    throw await toError(res, "Failed to export responses.");
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `${form.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-responses.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
