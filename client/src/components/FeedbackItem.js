import React from "react";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardActions from "@mui/material/CardActions";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Grow from "@mui/material/Grow";
import LinearProgress from "@mui/material/LinearProgress";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import BlockIcon from "@mui/icons-material/Block";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import DownloadIcon from "@mui/icons-material/Download";
import EditNoteIcon from "@mui/icons-material/EditNote";
import EventBusyIcon from "@mui/icons-material/EventBusy";
import GroupIcon from "@mui/icons-material/Group";
import HistoryIcon from "@mui/icons-material/History";
import LockIcon from "@mui/icons-material/Lock";
import PublishIcon from "@mui/icons-material/Publish";
import LockOpenIcon from "@mui/icons-material/LockOpen";
import PersonIcon from "@mui/icons-material/Person";
import QueryStatsIcon from "@mui/icons-material/QueryStats";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import { formatDate } from "../utils/formatDate";

// sx callback rather than a constant, so the accent follows the colour mode
const gradientMain = (theme) => theme.palette.gradient.brand;

const TYPE_LABELS = {
  text: "Short answer",
  textarea: "Long answer",
  rating: "Rating",
  radio: "Multiple choice",
  select: "Dropdown",
  checkbox: "Checkboxes",
};

// Deterministic tint per name so avatars stay stable between renders
const AVATAR_COLORS = ["#6366f1", "#ec4899", "#0ea5e9", "#10b981", "#f59e0b", "#8b5cf6"];

/**
 * Reduces a name to at most two initials for an avatar.
 * @param {string} name - Person's full name
 * @returns {string} One or two uppercase letters, or "?" when unknown
 */
function initials(name) {
  if (!name) return "?";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}

/**
 * Picks an avatar tint from the name's character codes, so the same person keeps
 * the same colour between renders and sessions.
 * @param {string} name - Person's full name
 * @returns {string} A hex colour from AVATAR_COLORS
 */
function avatarColor(name) {
  // Summing char codes keeps the pick stable for a given name
  const seed = (name || "").split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return AVATAR_COLORS[seed % AVATAR_COLORS.length];
}

/**
 * Small circular avatar showing a person's initials.
 * @param {Object} props
 * @param {string} [props.name] - Person's name, or omitted when anonymous
 */
function PersonAvatar({ name }) {
  if (!name) {
    return (
      <Avatar sx={{ width: 36, height: 36, bgcolor: "grey.300", color: "grey.700" }}>
        <PersonIcon fontSize="small" />
      </Avatar>
    );
  }

  return (
    <Avatar
      sx={{
        width: 36,
        height: 36,
        fontSize: 14,
        fontWeight: 700,
        bgcolor: avatarColor(name),
      }}
    >
      {initials(name)}
    </Avatar>
  );
}

/**
 * Wraps a card in a staggered grow/fade so list updates animate in.
 * @param {Object} props
 * @param {number} [props.index] - Position in the list, used to stagger the delay
 * @param {boolean} [props.accent] - Paints a gradient strip down the left edge
 * @param {React.ReactNode} props.children
 */
function AnimatedCard({ index = 0, accent, children }) {
  return (
    <Grow in timeout={300} style={{ transitionDelay: `${Math.min(index, 8) * 50}ms` }}>
      <Card
        sx={{
          mb: 2,
          overflow: "hidden",
          position: "relative",
          ...(accent && {
            "&::before": {
              content: '""',
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: 4,
              backgroundImage: gradientMain,
            },
          }),
        }}
      >
        {children}
      </Card>
    </Grow>
  );
}

/**
 * Displays a single feedback entry, with a delete button for admins.
 * @param {Object} props
 * @param {Object} props.feedback - { id, title, message, createdAt, author }
 * @param {Function} props.onDeleteClick - Called with the feedback id when delete is clicked
 * @param {boolean} [props.canDelete] - Shows the delete button while true
 * @param {number} [props.index] - Position in the list, for the entry animation
 */
function FeedbackItem({ feedback, onDeleteClick, canDelete, index }) {
  const { id, title, message, createdAt, author } = feedback;

  return (
    <AnimatedCard index={index} accent>
      <CardContent sx={{ pl: 3 }}>
        <Stack direction="row" spacing={1.5} alignItems="flex-start">
          <PersonAvatar name={author?.name} />

          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Stack
              direction={{ xs: "column", sm: "row" }}
              justifyContent="space-between"
              alignItems={{ xs: "flex-start", sm: "baseline" }}
              spacing={{ xs: 0, sm: 1 }}
            >
              <Typography variant="subtitle1">{title || "Untitled"}</Typography>
              <Typography variant="caption" color="text.secondary" noWrap>
                {formatDate(createdAt)}
              </Typography>
            </Stack>

            {author && (
              <Typography variant="caption" color="text.secondary">
                {author.name} &middot; {author.email}
              </Typography>
            )}

            <Typography sx={{ mt: 1.25 }}>{message}</Typography>
          </Box>
        </Stack>
      </CardContent>

      {canDelete && (
        <CardActions sx={{ pt: 0, pl: 3 }}>
          <Button
            size="small"
            color="error"
            startIcon={<DeleteOutlineIcon />}
            onClick={() => onDeleteClick(id)}
          >
            Delete
          </Button>
        </CardActions>
      )}
    </AnimatedCard>
  );
}

/**
 * Displays a custom form as a card. Admins get response counts plus open/close,
 * export, view and delete actions; users get a button to fill it in.
 * @param {Object} props
 * @param {Object} props.form - Form record
 * @param {boolean} props.isAdmin - Switches between the admin and user actions
 * @param {Function} props.onFillClick - Called with the form when a user opens it
 * @param {Function} props.onViewResponsesClick - Called with the form (admin)
 * @param {Function} props.onToggleOpenClick - Called with the form (admin)
 * @param {Function} props.onExportClick - Called with the form (admin)
 * @param {Function} props.onDeleteClick - Called with the form id (admin)
 * @param {number} [props.index] - Position in the list, for the entry animation
 */
export function FormItem({
  form,
  isAdmin,
  onFillClick,
  onViewResponsesClick,
  onToggleOpenClick,
  onExportClick,
  onDeleteClick,
  onEditClick,
  onDuplicateClick,
  onPublishClick,
  index,
}) {
  const {
    id,
    title,
    description,
    questions,
    createdAt,
    closesAt,
    isOpen,
    isDraft,
    isAnonymous,
    isAccepting,
    responseCount,
    assignmentCount,
    hasResponded,
  } = form;

  const liveQuestions = questions.filter((question) => !question.deleted);

  return (
    <AnimatedCard index={index}>
      <Box sx={{ height: 5, backgroundImage: gradientMain, opacity: isAccepting ? 1 : 0.35 }} />

      <CardContent>
        <Stack direction="row" spacing={1.5} alignItems="flex-start">
          <Avatar
            variant="rounded"
            sx={{ bgcolor: "glass.tint", color: "primary.main", width: 44, height: 44, flexShrink: 0 }}
          >
            <EditNoteIcon />
          </Avatar>

          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Stack
              direction={{ xs: "column", sm: "row" }}
              justifyContent="space-between"
              alignItems={{ xs: "flex-start", sm: "baseline" }}
              spacing={{ xs: 0, sm: 1 }}
            >
              <Typography variant="h6" sx={{ fontSize: { xs: "1.05rem", sm: "1.25rem" } }}>
                {title}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap>
                {formatDate(createdAt)}
              </Typography>
            </Stack>

            <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
              {isDraft ? (
                <Chip size="small" icon={<EditNoteIcon />} label="Draft" color="warning" />
              ) : (
                <Chip
                  size="small"
                  icon={isAccepting ? <LockOpenIcon /> : <LockIcon />}
                  label={isAccepting ? "Open" : isOpen ? "Deadline passed" : "Closed"}
                  color={isAccepting ? "success" : "default"}
                  variant={isAccepting ? "filled" : "outlined"}
                />
              )}
              {isAdmin && assignmentCount > 0 && (
                <Chip
                  size="small"
                  icon={<GroupIcon />}
                  label={`${assignmentCount} recipient${assignmentCount === 1 ? "" : "s"}`}
                  variant="outlined"
                />
              )}
              {isAnonymous && (
                <Chip
                  size="small"
                  icon={<VisibilityOffIcon />}
                  label="Anonymous"
                  color="secondary"
                  variant="outlined"
                />
              )}
              {closesAt && (
                <Chip
                  size="small"
                  icon={<EventBusyIcon />}
                  label={`Closes ${formatDate(closesAt)}`}
                  variant="outlined"
                />
              )}
              <Chip
                size="small"
                label={`${liveQuestions.length} question${liveQuestions.length === 1 ? "" : "s"}`}
                variant="outlined"
              />
              {isAdmin && (
                <Chip
                  size="small"
                  icon={<QueryStatsIcon />}
                  label={`${responseCount} response${responseCount === 1 ? "" : "s"}`}
                  color="primary"
                  variant="outlined"
                />
              )}
            </Stack>

            {description && (
              <Typography sx={{ mt: 1.5 }} color="text.secondary">
                {description}
              </Typography>
            )}
          </Box>
        </Stack>
      </CardContent>

      <Divider />

      <CardActions sx={{ flexWrap: "wrap", gap: 0.75, px: 2, py: 1.5 }}>
        {isAdmin ? (
          <>
            <Button
              size="small"
              variant="contained"
              startIcon={<QueryStatsIcon />}
              onClick={() => onViewResponsesClick(form)}
            >
              Responses
            </Button>
            {isDraft && (
              <Button
                size="small"
                color="success"
                startIcon={<PublishIcon />}
                onClick={() => onPublishClick(form)}
              >
                Publish
              </Button>
            )}
            <Button size="small" startIcon={<EditNoteIcon />} onClick={() => onEditClick(form)}>
              Edit
            </Button>
            <Tooltip title="Start a new form from this one">
              <Button
                size="small"
                startIcon={<ContentCopyIcon />}
                onClick={() => onDuplicateClick(form)}
              >
                Duplicate
              </Button>
            </Tooltip>
            <Button size="small" startIcon={<DownloadIcon />} onClick={() => onExportClick(form)}>
              CSV
            </Button>
            {!isDraft && (
              <Tooltip title={isOpen ? "Stop accepting responses" : "Accept responses again"}>
                <Button
                  size="small"
                  color="inherit"
                  startIcon={isOpen ? <LockIcon /> : <LockOpenIcon />}
                  onClick={() => onToggleOpenClick(form)}
                >
                  {isOpen ? "Close" : "Reopen"}
                </Button>
              </Tooltip>
            )}
            <Box sx={{ flexGrow: 1 }} />
            <Button
              size="small"
              color="error"
              startIcon={<DeleteOutlineIcon />}
              onClick={() => onDeleteClick(id)}
            >
              Delete
            </Button>
          </>
        ) : hasResponded ? (
          <>
            <Chip
              size="small"
              icon={<CheckCircleIcon />}
              color="success"
              variant="outlined"
              label="Response submitted"
            />
            {isAccepting && (
              <Button
                size="small"
                startIcon={<EditNoteIcon />}
                onClick={() => onFillClick(form)}
              >
                Edit Response
              </Button>
            )}
          </>
        ) : isAccepting ? (
          <Button
            size="small"
            variant="contained"
            startIcon={<EditNoteIcon />}
            onClick={() => onFillClick(form)}
          >
            Fill Out
          </Button>
        ) : (
          <Chip size="small" icon={<LockIcon />} variant="outlined" label="No longer accepting responses" />
        )}
      </CardActions>
    </AnimatedCard>
  );
}

/**
 * Displays one submitted response, pairing each question with its answer.
 * @param {Object} props
 * @param {Object} props.response - { answers, createdAt, respondent }
 * @param {Object[]} props.questions - The form's questions
 * @param {number} [props.index] - Position in the list, for the entry animation
 */
export function ResponseItem({ response, questions, index }) {
  const { answers, createdAt, respondent } = response;

  return (
    <AnimatedCard index={index}>
      <CardContent>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <PersonAvatar name={respondent?.name} />
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Typography variant="subtitle2">
              {respondent ? respondent.name : "Anonymous"}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {respondent ? `${respondent.email} \u00b7 ` : ""}
              {formatDate(createdAt)}
            </Typography>
          </Box>
        </Stack>

        <Divider sx={{ my: 2 }} />

        <Stack spacing={1.75}>
          {questions.map((question) => {
            const value = answers[question.id];
            const isEmpty =
              value === undefined ||
              value === null ||
              value === "" ||
              (Array.isArray(value) && value.length === 0);

            return (
              <Box
                key={question.id}
                sx={{
                  pl: 1.5,
                  borderLeft: "3px solid",
                  borderColor: isEmpty ? "divider" : "primary.light",
                }}
              >
                <Typography variant="overline" color="text.secondary" display="block" fontSize={10}>
                  {TYPE_LABELS[question.type]}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {question.label}
                </Typography>
                <Typography
                  variant="body1"
                  fontWeight={isEmpty ? 400 : 600}
                  fontStyle={isEmpty ? "italic" : "normal"}
                  color={isEmpty ? "text.disabled" : "text.primary"}
                >
                  {isEmpty ? "No answer" : Array.isArray(value) ? value.join(", ") : String(value)}
                </Typography>
              </Box>
            );
          })}
        </Stack>
      </CardContent>
    </AnimatedCard>
  );
}

/**
 * Aggregated view of a form's answers: averages for ratings and a bar per
 * option for choice questions.
 * @param {Object} props
 * @param {Object[]} props.summary - Per-question stats from the API
 * @param {number} props.total - Total responses received
 */
export function ResponseSummary({ summary, total }) {
  return (
    <Card sx={{ mb: 2.5, "&:hover": { transform: "none" } }}>
      <Box sx={{ height: 5, backgroundImage: gradientMain }} />
      <CardContent>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
          <QueryStatsIcon color="primary" />
          <Typography variant="h6">Summary</Typography>
          <Chip size="small" label={`${total} response${total === 1 ? "" : "s"}`} color="primary" />
        </Stack>

        <Stack spacing={2.5}>
          {summary.map((entry) => {
            const highest = entry.distribution
              ? Math.max(...entry.distribution.map((bucket) => bucket.count), 1)
              : 1;

            return (
              <Box key={entry.questionId}>
                <Stack direction="row" justifyContent="space-between" alignItems="baseline" spacing={1}>
                  <Typography variant="subtitle2">{entry.label}</Typography>
                  {entry.average !== undefined && entry.average !== null && (
                    <Chip size="small" label={`avg ${entry.average}`} color="secondary" variant="outlined" />
                  )}
                </Stack>
                <Typography variant="caption" color="text.secondary">
                  {entry.answered} of {total} answered
                </Typography>

                {entry.distribution ? (
                  <Stack spacing={1} sx={{ mt: 1.25 }}>
                    {entry.distribution.map((bucket) => (
                      <Stack key={bucket.label} direction="row" spacing={1.5} alignItems="center">
                        <Typography variant="body2" sx={{ minWidth: 100 }} noWrap title={bucket.label}>
                          {bucket.label}
                        </Typography>
                        <LinearProgress
                          variant="determinate"
                          value={Math.round((bucket.count / highest) * 100)}
                          sx={{ flex: 1 }}
                        />
                        <Typography variant="body2" fontWeight={700} sx={{ minWidth: 26, textAlign: "right" }}>
                          {bucket.count}
                        </Typography>
                      </Stack>
                    ))}
                  </Stack>
                ) : (
                  <Typography variant="caption" color="text.disabled" display="block" sx={{ mt: 0.5 }}>
                    Free text, see individual responses below
                  </Typography>
                )}
              </Box>
            );
          })}
        </Stack>
      </CardContent>
    </Card>
  );
}

/**
 * Lists the people who can see a form but have not answered it yet.
 * @param {Object} props
 * @param {Object[]} props.pending - Users still owing a response
 * @param {number} props.answered - How many have responded
 */
export function PendingRespondents({ pending, answered }) {
  const total = answered + pending.length;

  return (
    <Card sx={{ mb: 2.5, "&:hover": { transform: "none" } }}>
      <CardContent>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <GroupIcon color="primary" />
          <Typography variant="subtitle2">Still waiting on</Typography>
          <Chip
            size="small"
            color={pending.length === 0 ? "success" : "warning"}
            label={`${answered} of ${total} answered`}
          />
        </Stack>

        {pending.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
            Everyone in the audience has responded.
          </Typography>
        ) : (
          <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mt: 1.5 }}>
            {pending.map((person) => (
              <Chip
                key={person.id}
                size="small"
                variant="outlined"
                avatar={<PersonAvatar name={person.name} />}
                label={person.name}
                title={person.email}
              />
            ))}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * One entry in the admin audit trail.
 * @param {Object} props
 * @param {Object} props.event - { action, actorName, detail, createdAt }
 * @param {number} [props.index] - Position in the list, for the entry animation
 */
export function AuditItem({ event, index }) {
  const { action, actorName, detail, createdAt } = event;
  const isDestructive = action.endsWith(".deleted") || action.endsWith(".deactivated");

  return (
    <AnimatedCard index={index}>
      <CardContent sx={{ py: 1.75 }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Avatar
            variant="rounded"
            sx={{
              width: 34,
              height: 34,
              flexShrink: 0,
              bgcolor: isDestructive
                ? (theme) => (theme.palette.mode === "dark" ? "rgba(248, 113, 113, 0.18)" : "rgba(239, 68, 68, 0.12)")
                : "glass.tint",
              color: isDestructive ? "error.main" : "primary.main",
            }}
          >
            <HistoryIcon fontSize="small" />
          </Avatar>

          <Box sx={{ minWidth: 0, flexGrow: 1 }}>
            <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
              <Chip size="small" label={action} variant="outlined" />
              <Typography variant="body2" color="text.secondary">
                by {actorName}
              </Typography>
            </Stack>
            {detail && (
              <Typography variant="body2" sx={{ mt: 0.25 }}>
                {detail}
              </Typography>
            )}
            <Typography variant="caption" color="text.secondary">
              {formatDate(createdAt)}
            </Typography>
          </Box>
        </Stack>
      </CardContent>
    </AnimatedCard>
  );
}

/**
 * One row of the admin user list, with promote/demote and activate controls.
 * @param {Object} props
 * @param {Object} props.user - User record with counts
 * @param {boolean} props.isSelf - True when the row is the signed-in admin
 * @param {Function} props.onRoleChange - Called with (id, nextRole)
 * @param {Function} props.onStatusChange - Called with (id, nextIsActive)
 * @param {string} props.currentUserId - The signed-in admin's id
 * @param {string} [props.currentUserPromotedById] - Id of the admin who promoted the viewer
 * @param {number} [props.index] - Position in the list, for the entry animation
 */
export function UserRow({
  user,
  isSelf,
  onRoleChange,
  onStatusChange,
  currentUserId,
  currentUserPromotedById,
  index,
}) {
  const { id, name, email, role, isActive, promotedById, responseCount, formCount } = user;

  const promotedByMe = role === "ADMIN" && promotedById === currentUserId;
  // You may not take the role back from the admin who granted you yours
  const isMyPromoter = role === "ADMIN" && currentUserPromotedById === id;

  return (
    <AnimatedCard index={index}>
      <CardContent>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <PersonAvatar name={name} />

          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
              <Typography variant="subtitle2">{name}</Typography>
              {isSelf && <Chip size="small" label="You" variant="outlined" />}
              <Chip
                size="small"
                icon={role === "ADMIN" ? <AdminPanelSettingsIcon /> : <PersonIcon />}
                label={role}
                color={role === "ADMIN" ? "primary" : "default"}
                variant={role === "ADMIN" ? "filled" : "outlined"}
              />
              {!isActive && (
                <Chip size="small" icon={<BlockIcon />} label="Deactivated" color="error" variant="outlined" />
              )}
              {promotedByMe && (
                <Chip size="small" label="Promoted by you" color="secondary" variant="outlined" />
              )}
              {isMyPromoter && (
                <Chip size="small" label="Promoted you" color="primary" variant="outlined" />
              )}
            </Stack>

            <Typography variant="caption" color="text.secondary" display="block">
              {email}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {formCount} form{formCount === 1 ? "" : "s"} &middot; {responseCount} response
              {responseCount === 1 ? "" : "s"}
            </Typography>
          </Box>
        </Stack>
      </CardContent>

      {!isSelf && (
        <>
          <Divider />
          <CardActions sx={{ flexWrap: "wrap", gap: 0.75, px: 2, py: 1.25 }}>
            {isMyPromoter ? (
              <Tooltip title="This admin promoted you, so you cannot demote them">
                <span>
                  <Button size="small" startIcon={<PersonIcon />} disabled>
                    Demote to User
                  </Button>
                </span>
              </Tooltip>
            ) : (
              <Button
                size="small"
                startIcon={role === "ADMIN" ? <PersonIcon /> : <AdminPanelSettingsIcon />}
                onClick={() => onRoleChange(id, role === "ADMIN" ? "USER" : "ADMIN")}
              >
                {role === "ADMIN" ? "Demote to User" : "Promote to Admin"}
              </Button>
            )}
            <Box sx={{ flexGrow: 1 }} />
            <Button
              size="small"
              color={isActive ? "error" : "success"}
              startIcon={isActive ? <BlockIcon /> : <CheckCircleIcon />}
              onClick={() => onStatusChange(id, !isActive)}
            >
              {isActive ? "Deactivate" : "Reactivate"}
            </Button>
          </CardActions>
        </>
      )}
    </AnimatedCard>
  );
}

export default FeedbackItem;
