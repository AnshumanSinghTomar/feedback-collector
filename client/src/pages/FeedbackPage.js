import React, { useEffect, useState, useCallback } from "react";
import Alert from "@mui/material/Alert";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Container from "@mui/material/Container";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutlined";
import CampaignIcon from "@mui/icons-material/Campaign";
import ForumIcon from "@mui/icons-material/Forum";
import GroupIcon from "@mui/icons-material/Group";
import HistoryIcon from "@mui/icons-material/History";
import LockIcon from "@mui/icons-material/Lock";
import LockOpenIcon from "@mui/icons-material/LockOpen";
import QueryStatsIcon from "@mui/icons-material/QueryStats";
import TaskAltIcon from "@mui/icons-material/TaskAlt";
import FeedbackForm, { FormBuilder, FormFiller } from "../components/FeedbackForm";
import FeedbackList, {
  FormList,
  UserList,
  AuditList,
  Pagination,
} from "../components/FeedbackList";
import {
  ResponseItem,
  ResponseSummary,
  PendingRespondents,
} from "../components/FeedbackItem";
import ModalComponent from "../components/ModalComponent";
import {
  createFeedback,
  getFeedback,
  deleteFeedback,
  createForm,
  updateForm,
  getForms,
  updateFormFlags,
  deleteForm,
  submitResponse,
  getResponses,
  downloadResponsesCsv,
  getUsers,
  updateUserRole,
  updateUserStatus,
  getAuditLog,
} from "../services/feedbackService";

const PAGE_SIZE = 10;

const PRESETS = [
  {
    name: "NPS",
    title: "How likely are you to recommend us?",
    questions: [
      { label: "How likely are you to recommend us to a friend?", type: "rating", required: true, options: [] },
      { label: "What is the main reason for your score?", type: "textarea", required: false, options: [] },
    ],
  },
  {
    name: "Satisfaction",
    title: "Customer satisfaction",
    questions: [
      {
        label: "How satisfied are you overall?",
        type: "radio",
        required: true,
        options: ["Very satisfied", "Satisfied", "Neutral", "Unsatisfied", "Very unsatisfied"],
      },
      { label: "What could we do better?", type: "textarea", required: false, options: [] },
    ],
  },
  {
    name: "Retro",
    title: "Sprint retrospective",
    questions: [
      { label: "What went well?", type: "textarea", required: true, options: [] },
      { label: "What did not go well?", type: "textarea", required: true, options: [] },
      { label: "What should we try next?", type: "textarea", required: false, options: [] },
    ],
  },
];

/**
 * Turns a stored form into builder state: conditions come back as question ids,
 * but the builder works in positional indexes.
 * @param {Object} form - Stored form record
 * @param {Object} [overrides] - Fields to replace, e.g. a new title for a copy
 * @returns {Object} Builder template
 */
function toTemplate(form, overrides = {}) {
  const live = form.questions.filter((question) => !question.deleted);

  return {
    title: form.title,
    description: form.description || "",
    closesAt: form.closesAt ? form.closesAt.slice(0, 10) : "",
    isAnonymous: Boolean(form.isAnonymous),
    isDraft: Boolean(form.isDraft),
    assignedUserIds: form.assignedUserIds || [],
    questions: live.map((question) => {
      const parentIndex = question.condition
        ? live.findIndex((other) => other.id === question.condition.questionId)
        : -1;

      return {
        id: question.id,
        label: question.label,
        type: question.type,
        required: Boolean(question.required),
        options: question.options || [],
        conditionIndex: parentIndex >= 0 ? String(parentIndex) : "",
        conditionEquals: question.condition ? question.condition.equals : "",
      };
    }),
    ...overrides,
  };
}

/**
 * Section wrapper so every block on the page shares the same header treatment.
 * @param {Object} props
 * @param {string} props.title - Section heading
 * @param {React.ReactNode} props.icon - Icon shown in the tinted badge
 * @param {string} [props.subtitle] - Optional supporting line
 * @param {React.ReactNode} props.children
 */
function Section({ title, icon, subtitle, children }) {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: { xs: 2, sm: 2.5, md: 3 },
        borderColor: "divider",
        bgcolor: "glass.panel",
        backdropFilter: "blur(10px)",
      }}
    >
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2.5 }}>
        <Avatar
          variant="rounded"
          sx={{
            bgcolor: "glass.tint",
            color: "primary.main",
            width: 40,
            height: 40,
            flexShrink: 0,
          }}
        >
          {icon}
        </Avatar>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h6">{title}</Typography>
          {subtitle && (
            <Typography variant="caption" color="text.secondary">
              {subtitle}
            </Typography>
          )}
        </Box>
      </Stack>
      {children}
    </Paper>
  );
}

/**
 * Compact metric tile used in the dashboard row.
 * @param {Object} props
 * @param {string} props.label - Metric name
 * @param {number|string} props.value - Metric value
 * @param {React.ReactNode} props.icon - Leading icon
 */
function StatCard({ label, value, icon }) {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: { xs: 1.5, sm: 2 },
        borderColor: "divider",
        bgcolor: "glass.card",
        backdropFilter: "blur(10px)",
        transition: "transform 200ms ease, box-shadow 200ms ease",
        "&:hover": {
          transform: "translateY(-3px)",
          boxShadow: (theme) =>
            theme.palette.mode === "dark"
              ? "0 14px 30px rgba(0, 0, 0, 0.55)"
              : "0 14px 30px rgba(15, 23, 42, 0.10)",
        },
      }}
    >
      <Stack direction="row" spacing={1.5} alignItems="center">
        <Avatar
          variant="rounded"
          sx={{
            backgroundImage: (theme) => theme.palette.gradient.brand,
            width: 38,
            height: 38,
            color: "#fff",
            flexShrink: 0,
          }}
        >
          {icon}
        </Avatar>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h5">{value}</Typography>
          <Typography variant="caption" color="text.secondary" noWrap>
            {label}
          </Typography>
        </Box>
      </Stack>
    </Paper>
  );
}

/**
 * Top-level page for the Feedback Collector feature. Admins build forms, manage
 * users and read results; users fill in the forms that admins published.
 * @param {Object} props
 * @param {Object} props.user - Signed-in user { id, name, email, role }
 * @param {Function} props.onSessionExpired - Called when the API rejects the token
 */
function FeedbackPage({ user, onSessionExpired }) {
  const [forms, setForms] = useState([]);
  const [feedbackEntries, setFeedbackEntries] = useState([]);
  const [feedbackTotal, setFeedbackTotal] = useState(0);
  const [feedbackPage, setFeedbackPage] = useState(1);
  const [users, setUsers] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [date, setDate] = useState("");
  const [sort, setSort] = useState("newest");
  const [pendingDeleteId, setPendingDeleteId] = useState(null);
  const [pendingFormDeleteId, setPendingFormDeleteId] = useState(null);
  const [activeForm, setActiveForm] = useState(null);
  const [responsesView, setResponsesView] = useState(null);
  const [auditEvents, setAuditEvents] = useState([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditPage, setAuditPage] = useState(1);
  const [builder, setBuilder] = useState({ key: 0, template: null, editingId: null });
  const [errorMessage, setErrorMessage] = useState("");
  const [notice, setNotice] = useState("");

  const isAdmin = user.role === "ADMIN";

  /**
   * Shows an API failure. A 401 means the token is gone or expired, so control
   * goes back to the auth gate instead of showing an error the user cannot fix.
   * @param {Error} err - Error thrown by the API layer, carrying `status`
   */
  const handleError = useCallback(
    (err) => {
      if (err.status === 401) {
        onSessionExpired();
        return;
      }
      setErrorMessage(err.message);
    },
    [onSessionExpired]
  );

  /** Clears both banners so a new action starts from a clean slate. */
  const startAction = () => {
    setErrorMessage("");
    setNotice("");
  };

  /** Reloads every form the current user is allowed to see. */
  const loadForms = useCallback(async () => {
    try {
      setForms(await getForms());
    } catch (err) {
      handleError(err);
    }
  }, [handleError]);

  /** Reloads the announcements page for the current filters and sort order. */
  const loadFeedback = useCallback(async () => {
    try {
      const result = await getFeedback({
        keyword,
        date,
        sort,
        page: feedbackPage,
        pageSize: PAGE_SIZE,
      });
      setFeedbackEntries(result.entries);
      setFeedbackTotal(result.total);
    } catch (err) {
      handleError(err);
    }
  }, [keyword, date, sort, feedbackPage, handleError]);

  /** Reloads the user list. No-op for non-admins, whose token would be rejected. */
  const loadUsers = useCallback(async () => {
    if (!isAdmin) return;
    try {
      setUsers(await getUsers());
    } catch (err) {
      handleError(err);
    }
  }, [isAdmin, handleError]);

  /** Reloads the current page of the admin activity log. */
  const loadAudit = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const result = await getAuditLog({ page: auditPage, pageSize: PAGE_SIZE });
      setAuditEvents(result.events);
      setAuditTotal(result.total);
    } catch (err) {
      handleError(err);
    }
  }, [isAdmin, auditPage, handleError]);

  useEffect(() => {
    loadForms();
  }, [loadForms]);

  useEffect(() => {
    loadFeedback();
  }, [loadFeedback]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    loadAudit();
  }, [loadAudit]);

  // Changing a filter invalidates the current page number
  useEffect(() => {
    setFeedbackPage(1);
  }, [keyword, date, sort]);

  /**
   * Loads a template into the builder. The bumped key remounts FormBuilder, which
   * is what resets its internal state to the new values.
   * @param {Object} template - Builder values to start from
   * @param {string|null} [editingId] - Form id when editing, null when creating
   */
  const openBuilder = (template, editingId = null) => {
    startAction();
    setBuilder((prev) => ({ key: prev.key + 1, template, editingId }));
  };

  /** Returns the builder to a blank create form. */
  const resetBuilder = () => {
    setBuilder((prev) => ({ key: prev.key + 1, template: null, editingId: null }));
  };

  /**
   * Saves the builder's output, creating a new form or replacing the one being
   * edited, then refreshes the lists and audit trail.
   * @param {Object} formDefinition - Definition from the builder
   */
  const handleSaveForm = async (formDefinition) => {
    setIsSubmitting(true);
    startAction();
    try {
      if (builder.editingId) {
        await updateForm(builder.editingId, formDefinition);
        setNotice("Form updated.");
        resetBuilder();
      } else {
        await createForm(formDefinition);
        setNotice(formDefinition.isDraft ? "Draft saved." : "Form published.");
      }
      await Promise.all([loadForms(), loadAudit()]);
    } catch (err) {
      handleError(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * Flips a form's open or draft flag.
   * @param {Object} form - The form being changed
   * @param {Object} flags - { isOpen } or { isDraft }
   * @param {string} [message] - Confirmation to show on success
   */
  const handleFlagChange = async (form, flags, message) => {
    startAction();
    try {
      await updateFormFlags(form.id, flags);
      if (message) setNotice(message);
      await Promise.all([loadForms(), loadAudit()]);
    } catch (err) {
      handleError(err);
    }
  };

  /**
   * Downloads one form's responses as CSV.
   * @param {Object} form - The form to export
   */
  const handleExport = async (form) => {
    startAction();
    try {
      await downloadResponsesCsv(form);
    } catch (err) {
      handleError(err);
    }
  };

  /** Deletes the form awaiting confirmation, along with all of its responses. */
  const handleConfirmFormDelete = async () => {
    try {
      await deleteForm(pendingFormDeleteId);
      setForms((prev) => prev.filter((f) => f.id !== pendingFormDeleteId));
      if (builder.editingId === pendingFormDeleteId) resetBuilder();
      await loadAudit();
    } catch (err) {
      handleError(err);
    } finally {
      setPendingFormDeleteId(null);
    }
  };

  /**
   * Opens the results dialog for a form, or pages within it.
   * @param {Object} form - The form to inspect
   * @param {number} [page] - Page of responses to load
   */
  const handleViewResponses = async (form, page = 1) => {
    startAction();
    try {
      const data = await getResponses(form.id, { page, pageSize: PAGE_SIZE });
      setResponsesView(data);
    } catch (err) {
      handleError(err);
    }
  };

  /**
   * Submits the open form's answers, replacing an earlier response if there was
   * one, then refreshes the buckets so the form moves section.
   * @param {Object} answers - { [questionId]: value }
   */
  const handleSubmitResponse = async (answers) => {
    setIsSubmitting(true);
    startAction();
    try {
      await submitResponse(activeForm.id, answers);
      const wasRevision = Boolean(activeForm.myResponse);
      setActiveForm(null);
      setNotice(wasRevision ? "Your response was updated." : "Thanks, your response was recorded.");
      await loadForms();
    } catch (err) {
      handleError(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * Promotes or demotes a user. The server rejects demoting your own promoter.
   * @param {string} id - Target user id
   * @param {string} role - "ADMIN" or "USER"
   */
  const handleRoleChange = async (id, role) => {
    startAction();
    try {
      await updateUserRole(id, role);
      await Promise.all([loadUsers(), loadAudit()]);
    } catch (err) {
      handleError(err);
    }
  };

  /**
   * Activates or deactivates a user account.
   * @param {string} id - Target user id
   * @param {boolean} isActive - Desired state
   */
  const handleStatusChange = async (id, isActive) => {
    startAction();
    try {
      await updateUserStatus(id, isActive);
      await Promise.all([loadUsers(), loadAudit()]);
    } catch (err) {
      handleError(err);
    }
  };

  /**
   * Posts a new announcement to the board.
   * @param {Object} formData - { title, message }
   */
  const handleSubmit = async (formData) => {
    setIsSubmitting(true);
    startAction();
    try {
      await createFeedback(formData);
      await loadFeedback();
    } catch (err) {
      handleError(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * Opens the delete confirmation for an announcement.
   * @param {string} id - Feedback record id
   */
  const handleDeleteClick = (id) => {
    setPendingDeleteId(id);
  };

  /** Deletes the announcement awaiting confirmation. */
  const handleConfirmDelete = async () => {
    try {
      await deleteFeedback(pendingDeleteId);
      await Promise.all([loadFeedback(), loadAudit()]);
    } catch (err) {
      handleError(err);
    } finally {
      setPendingDeleteId(null);
    }
  };

  /** Dismisses the announcement delete confirmation. */
  const handleCancelDelete = () => {
    setPendingDeleteId(null);
  };

  const totalResponses = forms.reduce((sum, form) => sum + (form.responseCount || 0), 0);

  // Closed always wins, so a form you answered that later closed shows up under
  // Closed rather than Filled. Admins have no Filled bucket at all, so for them
  // the split is purely open vs closed.
  const closedForms = forms.filter((form) => !form.isAccepting);
  const filledForms = isAdmin
    ? []
    : forms.filter((form) => form.isAccepting && form.hasResponded);
  const activeForms = forms.filter(
    (form) => form.isAccepting && (isAdmin || !form.hasResponded)
  );

  const formListProps = {
    isAdmin,
    onFillClick: setActiveForm,
    onViewResponsesClick: handleViewResponses,
    onToggleOpenClick: (form) =>
      handleFlagChange(form, { isOpen: !form.isOpen }, form.isOpen ? "Form closed." : "Form reopened."),
    onPublishClick: (form) => handleFlagChange(form, { isDraft: false }, "Form published."),
    onEditClick: (form) => openBuilder(toTemplate(form), form.id),
    onDuplicateClick: (form) =>
      openBuilder(toTemplate(form, { title: `${form.title} (copy)`, isDraft: true })),
    onExportClick: handleExport,
    onDeleteClick: setPendingFormDeleteId,
  };

  // Sections are built as elements first, then dealt into two columns below
  const builderSection = (
    <Section
      key="builder"
      title={builder.editingId ? "Edit Form" : "Create a Form"}
      subtitle={
        builder.editingId
          ? "Changes apply to everyone who opens it next"
          : "Add questions, set a deadline, publish"
      }
      icon={<AddCircleOutlineIcon />}
    >
      {!builder.editingId && (
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2.5 }}>
          <Typography variant="caption" color="text.secondary" sx={{ alignSelf: "center" }}>
            Start from:
          </Typography>
          {PRESETS.map((preset) => (
            <Chip
              key={preset.name}
              label={preset.name}
              size="small"
              variant="outlined"
              onClick={() =>
                openBuilder({
                  title: preset.title,
                  questions: preset.questions.map((question) => ({
                    ...question,
                    conditionIndex: "",
                    conditionEquals: "",
                  })),
                })
              }
            />
          ))}
        </Stack>
      )}

      <FormBuilder
        key={builder.key}
        template={builder.template}
        users={users}
        isEditing={Boolean(builder.editingId)}
        onCancel={builder.editingId || builder.template ? resetBuilder : undefined}
        onSubmit={handleSaveForm}
        isSubmitting={isSubmitting}
      />
    </Section>
  );

  // Admin-only composer for the announcements board
  const composerSection = (
    <Section
      key="composer"
      title="Post an Announcement"
      subtitle="Appears in Announcements for everyone"
      icon={<CampaignIcon />}
    >
      <FeedbackForm onSubmit={handleSubmit} isSubmitting={isSubmitting} />
    </Section>
  );

  // Open forms: everything for admins, only the unanswered ones for users
  const activeSection = (
    <Section
      key="active"
      title="Active Feedbacks"
      subtitle={`${activeForms.length} open${isAdmin ? "" : " and waiting on you"}`}
      icon={<LockOpenIcon />}
    >
      <FormList
        forms={activeForms}
        {...formListProps}
        emptyMessage={isAdmin ? "No forms are currently open." : "Nothing to fill in right now."}
      />
    </Section>
  );

  // User-only: answered but still open, so the response can still be revised
  const filledSection = (
    <Section
      key="filled"
      title="Filled Feedbacks"
      subtitle={`${filledForms.length} answered and still open`}
      icon={<TaskAltIcon />}
    >
      <FormList
        forms={filledForms}
        {...formListProps}
        emptyMessage="You have not submitted any responses yet."
      />
    </Section>
  );

  // Closed takes priority over answered, so answered-then-closed lands here
  const closedSection = (
    <Section
      key="closed"
      title="Closed Feedbacks"
      subtitle={`${closedForms.length} no longer accepting responses`}
      icon={<LockIcon />}
    >
      <FormList forms={closedForms} {...formListProps} emptyMessage="Nothing closed yet." />
    </Section>
  );

  // Announcement board, with keyword/date filters, sorting and paging
  const announcementsSection = (
    <Section
      key="announcements"
      title="Announcements"
      subtitle={`${feedbackTotal} ${feedbackTotal === 1 ? "entry" : "entries"}`}
      icon={<ForumIcon />}
    >
      <FeedbackList
        feedbackEntries={feedbackEntries}
        onDeleteClick={handleDeleteClick}
        canDelete={isAdmin}
        keyword={keyword}
        onKeywordChange={setKeyword}
        date={date}
        onDateChange={setDate}
        sort={sort}
        onSortChange={setSort}
      />
      <Pagination
        page={feedbackPage}
        pageSize={PAGE_SIZE}
        total={feedbackTotal}
        onPageChange={setFeedbackPage}
      />
    </Section>
  );

  // Admin-only account management: promote, demote, deactivate
  const usersSection = (
    <Section key="users" title="Users" subtitle={`${users.length} accounts`} icon={<GroupIcon />}>
      <UserList
        users={users}
        currentUserId={user.id}
        currentUserPromotedById={user.promotedById}
        onRoleChange={handleRoleChange}
        onStatusChange={handleStatusChange}
      />
    </Section>
  );

  // Admin-only trail of who changed what
  const auditSection = (
    <Section
      key="audit"
      title="Activity Log"
      subtitle={`${auditTotal} recorded ${auditTotal === 1 ? "action" : "actions"}`}
      icon={<HistoryIcon />}
    >
      <AuditList events={auditEvents} />
      <Pagination
        page={auditPage}
        pageSize={PAGE_SIZE}
        total={auditTotal}
        onPageChange={setAuditPage}
      />
    </Section>
  );

  // Split into two balanced columns rather than one long strip on wide screens
  const leftColumn = isAdmin
    ? [builderSection, composerSection, usersSection]
    : [activeSection, filledSection];
  const rightColumn = isAdmin
    ? [activeSection, closedSection, announcementsSection, auditSection]
    : [closedSection, announcementsSection];

  return (
    <Container maxWidth="xl" sx={{ py: { xs: 2.5, sm: 4 }, px: { xs: 2, sm: 3, md: 4 } }}>
      <Box sx={{ mb: { xs: 3, sm: 4 } }}>
        <Chip
          size="small"
          label={isAdmin ? "Admin workspace" : "Your forms"}
          sx={{
            mb: 1.5,
            backgroundImage: (theme) => theme.palette.gradient.brand,
            color: "#fff",
          }}
        />
        <Typography
          variant="h3"
          sx={{
            fontSize: { xs: "1.9rem", sm: "2.4rem", md: "3rem" },
            backgroundImage: (theme) => theme.palette.gradient.text,
            backgroundClip: "text",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            mb: 1,
          }}
        >
          Feedback Collector
        </Typography>
        <Typography color="text.secondary" sx={{ maxWidth: 520 }}>
          {isAdmin
            ? "Build forms, watch the results roll in, and manage who has access."
            : "Share your thoughts on the forms your team published."}
        </Typography>
      </Box>

      <Box
        sx={{
          display: "grid",
          gap: { xs: 1.5, sm: 2 },
          mb: { xs: 3, sm: 4 },
          gridTemplateColumns: {
            xs: "repeat(2, minmax(0, 1fr))",
            sm: "repeat(auto-fill, minmax(180px, 1fr))",
          },
          maxWidth: { sm: 1000 },
        }}
      >
        <StatCard label="Active" value={activeForms.length} icon={<LockOpenIcon fontSize="small" />} />
        {!isAdmin && (
          <StatCard label="Filled" value={filledForms.length} icon={<TaskAltIcon fontSize="small" />} />
        )}
        <StatCard label="Closed" value={closedForms.length} icon={<LockIcon fontSize="small" />} />
        {isAdmin ? (
          <>
            <StatCard
              label="Responses"
              value={totalResponses}
              icon={<QueryStatsIcon fontSize="small" />}
            />
            <StatCard label="Users" value={users.length} icon={<GroupIcon fontSize="small" />} />
          </>
        ) : (
          <StatCard
            label="Announcements"
            value={feedbackTotal}
            icon={<CampaignIcon fontSize="small" />}
          />
        )}
      </Box>

      {(errorMessage || notice) && (
        <Stack spacing={2} sx={{ mb: 3 }}>
          {errorMessage && <Alert severity="error">{errorMessage}</Alert>}
          {notice && <Alert severity="success">{notice}</Alert>}
        </Stack>
      )}

      <Stack
        direction={{ xs: "column", lg: "row" }}
        spacing={{ xs: 2.5, sm: 3 }}
        alignItems="flex-start"
      >
        <Stack spacing={{ xs: 2.5, sm: 3 }} sx={{ flex: 1, width: "100%", minWidth: 0 }}>
          {leftColumn}
        </Stack>
        <Stack spacing={{ xs: 2.5, sm: 3 }} sx={{ flex: 1, width: "100%", minWidth: 0 }}>
          {rightColumn}
        </Stack>
      </Stack>

      <ModalComponent
        isOpen={activeForm !== null}
        title={activeForm ? activeForm.title : ""}
        onCancel={() => setActiveForm(null)}
        hideConfirm
        cancelLabel="Close"
        wide
      >
        {activeForm && (
          <>
            {activeForm.description && (
              <Typography color="text.secondary" sx={{ mb: 2 }}>
                {activeForm.description}
              </Typography>
            )}
            {activeForm.isAnonymous && (
              <Alert severity="info" sx={{ mb: 2 }}>
                Your name will not be shown with this response.
              </Alert>
            )}
            {activeForm.myResponse && (
              <Alert severity="info" sx={{ mb: 2 }}>
                You already answered this form. Submitting again replaces your previous answers.
              </Alert>
            )}
            <FormFiller
              form={activeForm}
              initialAnswers={activeForm.myResponse ? activeForm.myResponse.answers : undefined}
              onSubmit={handleSubmitResponse}
              isSubmitting={isSubmitting}
            />
          </>
        )}
      </ModalComponent>

      <ModalComponent
        isOpen={responsesView !== null}
        title={responsesView ? responsesView.form.title : ""}
        onCancel={() => setResponsesView(null)}
        hideConfirm
        cancelLabel="Close"
        wide
      >
        {responsesView && (
          <PendingRespondents pending={responsesView.pending} answered={responsesView.total} />
        )}
        {responsesView &&
          (responsesView.total === 0 ? (
            <Stack alignItems="center" sx={{ py: 4 }}>
              <QueryStatsIcon sx={{ fontSize: 40, color: "primary.light", mb: 1 }} />
              <Typography color="text.secondary">No responses yet.</Typography>
            </Stack>
          ) : (
            <>
              <ResponseSummary summary={responsesView.summary} total={responsesView.total} />
              {responsesView.responses.map((response, index) => (
                <ResponseItem
                  key={response.id}
                  response={response}
                  questions={responsesView.form.questions}
                  index={index}
                />
              ))}
              <Pagination
                page={responsesView.page}
                pageSize={responsesView.pageSize}
                total={responsesView.total}
                onPageChange={(page) => handleViewResponses(responsesView.form, page)}
              />
            </>
          ))}
      </ModalComponent>

      <ModalComponent
        isOpen={pendingFormDeleteId !== null}
        title="Delete Form"
        onConfirm={handleConfirmFormDelete}
        onCancel={() => setPendingFormDeleteId(null)}
      >
        Deleting this form also deletes every response submitted to it. This cannot be undone.
      </ModalComponent>

      <ModalComponent
        isOpen={pendingDeleteId !== null}
        title="Delete Feedback"
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
      >
        Are you sure you want to delete this feedback entry? This cannot be undone.
      </ModalComponent>
    </Container>
  );
}

export default FeedbackPage;
