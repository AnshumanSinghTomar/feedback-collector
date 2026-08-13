import React, { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormHelperText from "@mui/material/FormHelperText";
import FormLabel from "@mui/material/FormLabel";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import OutlinedInput from "@mui/material/OutlinedInput";
import Paper from "@mui/material/Paper";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import Rating from "@mui/material/Rating";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import AddIcon from "@mui/icons-material/Add";
import CampaignIcon from "@mui/icons-material/Campaign";
import CloseIcon from "@mui/icons-material/Close";
import LockResetIcon from "@mui/icons-material/LockReset";
import PublishIcon from "@mui/icons-material/Publish";
import SendIcon from "@mui/icons-material/Send";
import {
  validateFeedbackForm,
  validateFormBuilder,
  validateFormResponse,
  validateChangePasswordForm,
  isChoiceType,
  visibleQuestions,
} from "../utils/validation";

const QUESTION_TYPES = [
  { value: "text", label: "Short answer" },
  { value: "textarea", label: "Long answer" },
  { value: "rating", label: "Rating (1-5)" },
  { value: "radio", label: "Multiple choice" },
  { value: "select", label: "Dropdown" },
  { value: "checkbox", label: "Checkboxes" },
];

/**
 * Builds a blank question row for the builder.
 * @returns {Object} An unsaved question in its default state
 */
const emptyQuestion = () => ({
  label: "",
  type: "text",
  required: true,
  options: [],
  conditionIndex: "",
  conditionEquals: "",
});

const blankTemplate = {
  title: "",
  description: "",
  closesAt: "",
  isAnonymous: false,
  isDraft: false,
  assignedUserIds: [],
  questions: [emptyQuestion()],
};

/**
 * Controlled form for posting new feedback. Admin only.
 * @param {Object} props
 * @param {Function} props.onSubmit - Called with valid form data on submit
 * @param {boolean} [props.isSubmitting] - Disables the submit button while true
 */
function FeedbackForm({ onSubmit, isSubmitting }) {
  const [formData, setFormData] = useState({ title: "", message: "" });
  const [errors, setErrors] = useState({});

  /**
   * Keeps a single field in state.
   * @param {Object} e - Change event from an input
   */
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  /**
   * Validates the announcement and hands it up, then clears the form.
   * @param {Object} e - Form submit event
   */
  const handleSubmit = (e) => {
    e.preventDefault();
    const { valid, errors: validationErrors } = validateFeedbackForm(formData);

    if (!valid) {
      setErrors(validationErrors);
      return;
    }

    setErrors({});
    onSubmit(formData);
    setFormData({ title: "", message: "" });
  };

  return (
    <Box component="form" onSubmit={handleSubmit} sx={{ width: "100%" }}>
      <Stack spacing={2}>
        <TextField
          label="Title (optional)"
          name="title"
          value={formData.title}
          onChange={handleChange}
          error={Boolean(errors.title)}
          helperText={errors.title}
        />

        <TextField
          label="Message"
          name="message"
          multiline
          rows={4}
          value={formData.message}
          onChange={handleChange}
          error={Boolean(errors.message)}
          helperText={errors.message}
        />

        <Button
          type="submit"
          variant="contained"
          disabled={isSubmitting}
          startIcon={<CampaignIcon />}
          sx={{ alignSelf: "flex-start" }}
        >
          {isSubmitting ? "Submitting..." : "Submit Feedback"}
        </Button>
      </Stack>
    </Box>
  );
}

/**
 * Builder that lets an admin assemble or edit a custom feedback form: question
 * types, choice options, reveal conditions, recipients, deadline, anonymity and
 * draft state.
 * @param {Object} props
 * @param {Function} props.onSubmit - Called with the form definition
 * @param {boolean} [props.isSubmitting] - Disables the submit button while true
 * @param {Object} [props.template] - Initial values, for duplicating or editing
 * @param {Object[]} [props.users] - Candidate recipients
 * @param {boolean} [props.isEditing] - Switches the copy to edit mode
 * @param {Function} [props.onCancel] - Shows a cancel button when provided
 */
export function FormBuilder({
  onSubmit,
  isSubmitting,
  template,
  users = [],
  isEditing,
  onCancel,
}) {
  const initial = { ...blankTemplate, ...(template || {}) };

  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description || "");
  const [closesAt, setClosesAt] = useState(initial.closesAt || "");
  const [isAnonymous, setIsAnonymous] = useState(Boolean(initial.isAnonymous));
  const [isDraft, setIsDraft] = useState(Boolean(initial.isDraft));
  const [assignedUserIds, setAssignedUserIds] = useState(initial.assignedUserIds || []);
  const [questions, setQuestions] = useState(
    initial.questions?.length ? initial.questions : [emptyQuestion()]
  );
  const [errors, setErrors] = useState({});

  /**
   * Merges changes into one question row.
   * @param {number} index - Position of the question
   * @param {Object} changes - Fields to overwrite
   */
  const updateQuestion = (index, changes) => {
    setQuestions((prev) =>
      prev.map((question, i) => (i === index ? { ...question, ...changes } : question))
    );
  };

  /**
   * Changes a question's type, seeding two blank options when it becomes a choice
   * question so there is something to fill in.
   * @param {number} index - Position of the question
   * @param {string} type - New question type
   */
  const changeType = (index, type) => {
    const question = questions[index];
    const options =
      isChoiceType(type) && question.options.length < 2 ? ["", ""] : question.options;
    updateQuestion(index, { type, options });
  };

  /**
   * Edits one option of a choice question.
   * @param {number} index - Position of the question
   * @param {number} optionIndex - Position of the option
   * @param {string} value - New option text
   */
  const updateOption = (index, optionIndex, value) => {
    const options = questions[index].options.map((option, i) =>
      i === optionIndex ? value : option
    );
    updateQuestion(index, { options });
  };

  /**
   * Appends a blank option to a choice question.
   * @param {number} index - Position of the question
   */
  const addOption = (index) => {
    updateQuestion(index, { options: [...questions[index].options, ""] });
  };

  /**
   * Removes one option from a choice question.
   * @param {number} index - Position of the question
   * @param {number} optionIndex - Position of the option to drop
   */
  const removeOption = (index, optionIndex) => {
    updateQuestion(index, {
      options: questions[index].options.filter((_, i) => i !== optionIndex),
    });
  };

  /** Appends a blank question to the form. */
  const addQuestion = () => {
    setQuestions((prev) => [...prev, emptyQuestion()]);
  };

  /**
   * Drops a question from the form.
   * @param {number} index - Position of the question to remove
   */
  const removeQuestion = (index) => {
    setQuestions((prev) => prev.filter((_, i) => i !== index));
  };

  /**
   * Validates the definition, strips options from non-choice questions and hands
   * it up. Only resets the fields when creating, so an edit stays on screen.
   * @param {Object} e - Form submit event
   */
  const handleSubmit = (e) => {
    e.preventDefault();
    const { valid, errors: validationErrors } = validateFormBuilder({ title, questions });

    if (!valid) {
      setErrors(validationErrors);
      return;
    }

    setErrors({});
    onSubmit({
      title,
      description,
      closesAt: closesAt || null,
      isAnonymous,
      isDraft,
      assignedUserIds,
      questions: questions.map((question) => ({
        ...question,
        options: isChoiceType(question.type)
          ? question.options.filter((option) => option && option.trim())
          : [],
      })),
    });

    if (isEditing) return;

    setTitle("");
    setDescription("");
    setClosesAt("");
    setIsAnonymous(false);
    setIsDraft(false);
    setAssignedUserIds([]);
    setQuestions([emptyQuestion()]);
  };

  return (
    <Box component="form" onSubmit={handleSubmit} sx={{ width: "100%" }}>
      <Stack spacing={2}>
        <TextField
          label="Form Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          error={Boolean(errors.title)}
          helperText={errors.title}
        />

        <TextField
          label="Description (optional)"
          multiline
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <TextField
          label="Closes On (optional)"
          type="date"
          value={closesAt}
          onChange={(e) => setClosesAt(e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
          helperText="After this date the form stops accepting responses."
        />

        <FormControl fullWidth size="small">
          <InputLabel id="recipients-label">Recipients</InputLabel>
          <Select
            labelId="recipients-label"
            multiple
            value={assignedUserIds}
            onChange={(e) => setAssignedUserIds(e.target.value)}
            input={<OutlinedInput label="Recipients" />}
            renderValue={(selected) => (
              <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                {selected.map((id) => {
                  const match = users.find((user) => user.id === id);
                  return <Chip key={id} size="small" label={match ? match.name : id} />;
                })}
              </Stack>
            )}
          >
            {users.map((user) => (
              <MenuItem key={user.id} value={user.id}>
                <Checkbox checked={assignedUserIds.includes(user.id)} size="small" />
                {user.name} ({user.role})
              </MenuItem>
            ))}
          </Select>
          <FormHelperText>Leave empty to share with everyone.</FormHelperText>
        </FormControl>

        <Stack spacing={0.5}>
          <FormControlLabel
            control={
              <Checkbox
                checked={isAnonymous}
                onChange={(e) => setIsAnonymous(e.target.checked)}
              />
            }
            label="Hide respondent names in the results"
          />
          <FormControlLabel
            control={<Switch checked={isDraft} onChange={(e) => setIsDraft(e.target.checked)} />}
            label="Keep as draft (only admins can see it)"
          />
        </Stack>

        <Divider />

        <Box>
          <Typography variant="subtitle2" gutterBottom>
            Questions
          </Typography>
          {errors.questions && (
            <FormHelperText error sx={{ mb: 1 }}>
              {errors.questions}
            </FormHelperText>
          )}

          <Stack spacing={1.5}>
            {questions.map((question, index) => (
              <Paper key={index} variant="outlined" sx={{ p: 2 }}>
                <Stack spacing={1.5}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography variant="caption" color="text.secondary">
                      Question {index + 1}
                    </Typography>
                    {questions.length > 1 && (
                      <Button
                        size="small"
                        color="error"
                        startIcon={<CloseIcon />}
                        onClick={() => removeQuestion(index)}
                      >
                        Remove
                      </Button>
                    )}
                  </Stack>

                  <TextField
                    label="Question text"
                    value={question.label}
                    onChange={(e) => updateQuestion(index, { label: e.target.value })}
                    error={Boolean(errors.questionErrors?.[index])}
                    helperText={errors.questionErrors?.[index]}
                  />

                  <Stack
                    direction={{ xs: "column", sm: "row" }}
                    spacing={{ xs: 1, sm: 2 }}
                    alignItems={{ xs: "flex-start", sm: "center" }}
                  >
                    <TextField
                      select
                      label="Type"
                      value={question.type}
                      onChange={(e) => changeType(index, e.target.value)}
                      sx={{ maxWidth: { sm: 220 } }}
                    >
                      {QUESTION_TYPES.map((type) => (
                        <MenuItem key={type.value} value={type.value}>
                          {type.label}
                        </MenuItem>
                      ))}
                    </TextField>

                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={question.required}
                          onChange={(e) => updateQuestion(index, { required: e.target.checked })}
                        />
                      }
                      label="Required"
                    />
                  </Stack>

                  {isChoiceType(question.type) && (
                    <Stack spacing={1} sx={{ pl: { sm: 2 } }}>
                      {question.options.map((option, optionIndex) => (
                        <Stack key={optionIndex} direction="row" spacing={1} alignItems="center">
                          <TextField
                            label={`Option ${optionIndex + 1}`}
                            value={option}
                            onChange={(e) => updateOption(index, optionIndex, e.target.value)}
                          />
                          {question.options.length > 2 && (
                            <Button
                              size="small"
                              color="error"
                              onClick={() => removeOption(index, optionIndex)}
                            >
                              Remove
                            </Button>
                          )}
                        </Stack>
                      ))}
                      <Button
                        size="small"
                        startIcon={<AddIcon />}
                        onClick={() => addOption(index)}
                        sx={{ alignSelf: "flex-start" }}
                      >
                        Add Option
                      </Button>
                    </Stack>
                  )}

                  {/* A question may only depend on one that comes before it */}
                  {index > 0 && (
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                      <TextField
                        select
                        label="Show only if"
                        value={question.conditionIndex ?? ""}
                        onChange={(e) =>
                          updateQuestion(index, {
                            conditionIndex: e.target.value,
                            conditionEquals: "",
                          })
                        }
                      >
                        <MenuItem value="">Always show</MenuItem>
                        {questions.slice(0, index).map((earlier, earlierIndex) => (
                          <MenuItem key={earlierIndex} value={String(earlierIndex)}>
                            Q{earlierIndex + 1}: {earlier.label || "(untitled)"}
                          </MenuItem>
                        ))}
                      </TextField>

                      {question.conditionIndex !== "" &&
                        question.conditionIndex !== undefined &&
                        question.conditionIndex !== null &&
                        (() => {
                          const parent = questions[Number(question.conditionIndex)];
                          const parentOptions = parent && isChoiceType(parent.type)
                            ? parent.options.filter(Boolean)
                            : null;

                          return parentOptions?.length ? (
                            <TextField
                              select
                              label="Answer equals"
                              value={question.conditionEquals || ""}
                              onChange={(e) =>
                                updateQuestion(index, { conditionEquals: e.target.value })
                              }
                            >
                              {parentOptions.map((option) => (
                                <MenuItem key={option} value={option}>
                                  {option}
                                </MenuItem>
                              ))}
                            </TextField>
                          ) : (
                            <TextField
                              label="Answer equals"
                              value={question.conditionEquals || ""}
                              onChange={(e) =>
                                updateQuestion(index, { conditionEquals: e.target.value })
                              }
                            />
                          );
                        })()}
                    </Stack>
                  )}
                </Stack>
              </Paper>
            ))}
          </Stack>

          <Button
            onClick={addQuestion}
            startIcon={<AddIcon />}
            variant="outlined"
            sx={{ mt: 1.5, borderStyle: "dashed" }}
          >
            Add Question
          </Button>
        </Box>

        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Button
            type="submit"
            variant="contained"
            size="large"
            disabled={isSubmitting}
            startIcon={<PublishIcon />}
          >
            {isSubmitting
              ? "Saving..."
              : isEditing
              ? "Save Changes"
              : isDraft
              ? "Save Draft"
              : "Publish Form"}
          </Button>
          {onCancel && (
            <Button size="large" color="inherit" onClick={onCancel}>
              Cancel
            </Button>
          )}
        </Stack>
      </Stack>
    </Box>
  );
}

/**
 * Renders a published form's questions so a user can answer them. Questions with
 * an unmet condition stay hidden until the answer they depend on is given.
 * @param {Object} props
 * @param {Object} props.form - The form to answer, including `questions`
 * @param {Function} props.onSubmit - Called with an answers map keyed by question id
 * @param {boolean} [props.isSubmitting] - Disables the submit button while true
 * @param {Object} [props.initialAnswers] - Existing answers, when revising
 */
export function FormFiller({ form, onSubmit, isSubmitting, initialAnswers }) {
  const [answers, setAnswers] = useState(initialAnswers || {});
  const [errors, setErrors] = useState({});

  /**
   * Records the answer to one question.
   * @param {string} questionId - Question the answer belongs to
   * @param {*} value - Answer value: string, number or array of choices
   */
  const setAnswer = (questionId, value) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  /**
   * Adds or removes one choice from a checkbox answer.
   * @param {string} questionId - Question the choice belongs to
   * @param {string} option - The option being toggled
   */
  const toggleChoice = (questionId, option) => {
    const current = answers[questionId] || [];
    setAnswer(
      questionId,
      current.includes(option)
        ? current.filter((choice) => choice !== option)
        : [...current, option]
    );
  };

  /**
   * Validates the visible questions and submits the answer set.
   * @param {Object} e - Form submit event
   */
  const handleSubmit = (e) => {
    e.preventDefault();
    const { valid, errors: validationErrors } = validateFormResponse(answers, form.questions);

    if (!valid) {
      setErrors(validationErrors);
      return;
    }

    setErrors({});
    onSubmit(answers);
  };

  const shown = visibleQuestions(form.questions, answers);

  return (
    <Box component="form" onSubmit={handleSubmit}>
      <Stack spacing={2.5}>
        {shown.map((question) => (
          <FormControl key={question.id} error={Boolean(errors[question.id])} fullWidth>
            {question.type === "text" && (
              <TextField
                label={question.label}
                required={question.required}
                value={answers[question.id] || ""}
                onChange={(e) => setAnswer(question.id, e.target.value)}
                error={Boolean(errors[question.id])}
                helperText={errors[question.id]}
              />
            )}

            {question.type === "textarea" && (
              <TextField
                label={question.label}
                required={question.required}
                multiline
                rows={3}
                value={answers[question.id] || ""}
                onChange={(e) => setAnswer(question.id, e.target.value)}
                error={Boolean(errors[question.id])}
                helperText={errors[question.id]}
              />
            )}

            {question.type === "select" && (
              <TextField
                select
                label={question.label}
                required={question.required}
                value={answers[question.id] || ""}
                onChange={(e) => setAnswer(question.id, e.target.value)}
                error={Boolean(errors[question.id])}
                helperText={errors[question.id]}
              >
                {question.options.map((option) => (
                  <MenuItem key={option} value={option}>
                    {option}
                  </MenuItem>
                ))}
              </TextField>
            )}

            {question.type === "radio" && (
              <>
                <FormLabel required={question.required}>{question.label}</FormLabel>
                <RadioGroup
                  value={answers[question.id] || ""}
                  onChange={(e) => setAnswer(question.id, e.target.value)}
                >
                  {question.options.map((option) => (
                    <FormControlLabel
                      key={option}
                      value={option}
                      control={<Radio />}
                      label={option}
                    />
                  ))}
                </RadioGroup>
                {errors[question.id] && <FormHelperText>{errors[question.id]}</FormHelperText>}
              </>
            )}

            {question.type === "checkbox" && (
              <>
                <FormLabel required={question.required}>{question.label}</FormLabel>
                {question.options.map((option) => (
                  <FormControlLabel
                    key={option}
                    control={
                      <Checkbox
                        checked={(answers[question.id] || []).includes(option)}
                        onChange={() => toggleChoice(question.id, option)}
                      />
                    }
                    label={option}
                  />
                ))}
                {errors[question.id] && <FormHelperText>{errors[question.id]}</FormHelperText>}
              </>
            )}

            {question.type === "rating" && (
              <>
                <FormLabel required={question.required}>{question.label}</FormLabel>
                <Rating
                  value={Number(answers[question.id]) || null}
                  onChange={(event, value) => setAnswer(question.id, value)}
                  max={5}
                  sx={{ mt: 0.5 }}
                />
                {errors[question.id] && <FormHelperText>{errors[question.id]}</FormHelperText>}
              </>
            )}
          </FormControl>
        ))}

        <Button
          type="submit"
          variant="contained"
          size="large"
          disabled={isSubmitting}
          startIcon={<SendIcon />}
          sx={{ alignSelf: "flex-start" }}
        >
          {isSubmitting ? "Submitting..." : initialAnswers ? "Update Response" : "Submit Response"}
        </Button>
      </Stack>
    </Box>
  );
}

/**
 * Lets a signed-in user replace their own password.
 * @param {Object} props
 * @param {Function} props.onSubmit - Called with { currentPassword, newPassword }
 * @param {boolean} [props.isSubmitting] - Disables the submit button while true
 */
export function ChangePasswordForm({ onSubmit, isSubmitting }) {
  const [formData, setFormData] = useState({ currentPassword: "", newPassword: "" });
  const [errors, setErrors] = useState({});

  /**
   * Keeps a single password field in state.
   * @param {Object} e - Change event from an input
   */
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  /**
   * Validates both passwords and submits the change, then clears the fields so
   * the values do not linger in state.
   * @param {Object} e - Form submit event
   */
  const handleSubmit = (e) => {
    e.preventDefault();
    const { valid, errors: validationErrors } = validateChangePasswordForm(formData);

    if (!valid) {
      setErrors(validationErrors);
      return;
    }

    setErrors({});
    onSubmit(formData);
    setFormData({ currentPassword: "", newPassword: "" });
  };

  return (
    <Box component="form" onSubmit={handleSubmit}>
      <Stack spacing={2}>
        <TextField
          label="Current Password"
          name="currentPassword"
          type="password"
          value={formData.currentPassword}
          onChange={handleChange}
          error={Boolean(errors.currentPassword)}
          helperText={errors.currentPassword}
        />

        <TextField
          label="New Password"
          name="newPassword"
          type="password"
          value={formData.newPassword}
          onChange={handleChange}
          error={Boolean(errors.newPassword)}
          helperText={errors.newPassword}
        />

        <Button
          type="submit"
          variant="contained"
          disabled={isSubmitting}
          startIcon={<LockResetIcon />}
          sx={{ alignSelf: "flex-start" }}
        >
          {isSubmitting ? "Saving..." : "Change Password"}
        </Button>
      </Stack>
    </Box>
  );
}

export default FeedbackForm;
