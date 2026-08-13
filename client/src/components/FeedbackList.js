import React from "react";
import Box from "@mui/material/Box";
import InputAdornment from "@mui/material/InputAdornment";
import MenuItem from "@mui/material/MenuItem";
import MuiPagination from "@mui/material/Pagination";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import InboxIcon from "@mui/icons-material/Inbox";
import SearchIcon from "@mui/icons-material/Search";
import SortIcon from "@mui/icons-material/Sort";
import FeedbackItem, { AuditItem, FormItem, UserRow } from "./FeedbackItem";

const SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
];

/**
 * Placeholder shown when a list has nothing to display.
 * @param {Object} props
 * @param {React.ReactNode} props.children - Message text
 */
function EmptyState({ children }) {
  return (
    <Paper
      variant="outlined"
      sx={{
        py: 5,
        px: 3,
        textAlign: "center",
        borderStyle: "dashed",
        borderColor: "divider",
        bgcolor: "glass.subtle",
      }}
    >
      <InboxIcon sx={{ fontSize: 40, color: "primary.light", mb: 1 }} />
      <Typography color="text.secondary">{children}</Typography>
    </Paper>
  );
}

/**
 * Renders filter controls and the list of feedback entries.
 * @param {Object} props
 * @param {Object[]} props.feedbackEntries - Array of feedback records
 * @param {Function} props.onDeleteClick - Passed down to each FeedbackItem
 * @param {boolean} [props.canDelete] - Passed down to each FeedbackItem
 * @param {string} props.keyword - Current keyword filter value
 * @param {Function} props.onKeywordChange - Called with new keyword value
 * @param {string} props.date - Current date filter value (YYYY-MM-DD)
 * @param {Function} props.onDateChange - Called with new date value
 * @param {string} props.sort - Current sort value ("newest" or "oldest")
 * @param {Function} props.onSortChange - Called with new sort value
 */
function FeedbackList({
  feedbackEntries,
  onDeleteClick,
  canDelete,
  keyword,
  onKeywordChange,
  date,
  onDateChange,
  sort,
  onSortChange,
}) {
  return (
    <Box>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mb: 2.5 }}>
        <TextField
          placeholder="Search feedback..."
          value={keyword}
          onChange={(e) => onKeywordChange(e.target.value)}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" color="action" />
                </InputAdornment>
              ),
            },
          }}
        />
        <TextField
          label="Date"
          type="date"
          value={date}
          onChange={(e) => onDateChange(e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <TextField
          select
          value={sort}
          onChange={(e) => onSortChange(e.target.value)}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SortIcon fontSize="small" color="action" />
                </InputAdornment>
              ),
            },
          }}
        >
          {SORT_OPTIONS.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              {option.label}
            </MenuItem>
          ))}
        </TextField>
      </Stack>

      {feedbackEntries.length === 0 ? (
        <EmptyState>No feedback entries found.</EmptyState>
      ) : (
        feedbackEntries.map((entry, index) => (
          <FeedbackItem
            key={entry.id}
            feedback={entry}
            onDeleteClick={onDeleteClick}
            canDelete={canDelete}
            index={index}
          />
        ))
      )}
    </Box>
  );
}

/**
 * Renders the list of custom forms.
 * @param {Object} props
 * @param {Object[]} props.forms - Array of form records
 * @param {string} [props.emptyMessage] - Shown when there are no forms
 * @param {Object} props.itemProps - Remaining props are forwarded to each FormItem
 */
export function FormList({ forms, emptyMessage = "No forms yet.", ...itemProps }) {
  if (forms.length === 0) {
    return <EmptyState>{emptyMessage}</EmptyState>;
  }

  return (
    <Box>
      {forms.map((form, index) => (
        <FormItem key={form.id} form={form} index={index} {...itemProps} />
      ))}
    </Box>
  );
}

/**
 * Renders the admin audit trail.
 * @param {Object} props
 * @param {Object[]} props.events - Audit events, newest first
 */
export function AuditList({ events }) {
  if (events.length === 0) {
    return <EmptyState>No admin activity recorded yet.</EmptyState>;
  }

  return (
    <Box>
      {events.map((event, index) => (
        <AuditItem key={event.id} event={event} index={index} />
      ))}
    </Box>
  );
}

/**
 * Renders the admin user management list.
 * @param {Object} props
 * @param {Object[]} props.users - Array of user records with counts
 * @param {string} props.currentUserId - The signed-in admin's id
 * @param {Function} props.onRoleChange - Passed down to each UserRow
 * @param {Function} props.onStatusChange - Passed down to each UserRow
 * @param {string} [props.currentUserPromotedById] - Id of the admin who promoted the viewer
 */
export function UserList({
  users,
  currentUserId,
  onRoleChange,
  onStatusChange,
  currentUserPromotedById,
}) {
  if (users.length === 0) {
    return <EmptyState>No users found.</EmptyState>;
  }

  return (
    <Box>
      {users.map((user, index) => (
        <UserRow
          key={user.id}
          user={user}
          isSelf={user.id === currentUserId}
          onRoleChange={onRoleChange}
          onStatusChange={onStatusChange}
          currentUserId={currentUserId}
          currentUserPromotedById={currentUserPromotedById}
          index={index}
        />
      ))}
    </Box>
  );
}

/**
 * Page controls for a paged list. Renders nothing for a single page.
 * @param {Object} props
 * @param {number} props.page - Current page (1-based)
 * @param {number} props.pageSize - Items per page
 * @param {number} props.total - Total items across all pages
 * @param {Function} props.onPageChange - Called with the new page number
 */
export function Pagination({ page, pageSize, total, onPageChange }) {
  const lastPage = Math.max(1, Math.ceil(total / pageSize));

  if (total === 0 || lastPage === 1) return null;

  return (
    <Stack
      direction="row"
      alignItems="center"
      justifyContent="space-between"
      spacing={2}
      sx={{ mt: 2.5 }}
    >
      <MuiPagination
        page={page}
        count={lastPage}
        onChange={(event, value) => onPageChange(value)}
        color="primary"
        shape="rounded"
        size="small"
      />
      <Typography variant="caption" color="text.secondary">
        {total} total
      </Typography>
    </Stack>
  );
}

export default FeedbackList;
