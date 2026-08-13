const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const QUESTION_TYPES = ["text", "textarea", "rating", "radio", "select", "checkbox"];
const CHOICE_TYPES = ["radio", "select", "checkbox"];
const ROLES = ["ADMIN", "USER"];

/**
 * Decides whether a conditional question applies, given the answers so far.
 * Questions without a condition always apply.
 * @param {Object} question - Question with an optional `condition`
 * @param {Object} answers - { [questionId]: value }
 * @returns {boolean}
 */
function isQuestionVisible(question, answers) {
  const condition = question.condition;
  if (!condition || !condition.questionId) return true;

  const value = answers ? answers[condition.questionId] : undefined;
  if (Array.isArray(value)) return value.includes(condition.equals);
  return String(value ?? "") === String(condition.equals);
}

/**
 * Filters a question list down to the ones that apply and are not tombstoned.
 * @param {Object[]} questions - The form's stored questions
 * @param {Object} answers - { [questionId]: value }
 * @returns {Object[]}
 */
function visibleQuestions(questions, answers) {
  return questions.filter(
    (question) => !question.deleted && isQuestionVisible(question, answers)
  );
}

/**
 * Validates incoming feedback payload (admin-authored content).
 * @param {Object} data - { title, message }
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateFeedback(data) {
  const errors = [];
  const { message } = data || {};

  if (!message || typeof message !== "string" || message.trim().length === 0) {
    errors.push("Message is required.");
  } else if (message.trim().length > 1000) {
    errors.push("Message must be under 1000 characters.");
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates registration payload.
 * @param {Object} data - { name, email, password, role }
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateRegister(data) {
  const errors = [];
  const { name, email, password, role } = data || {};

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    errors.push("Name is required.");
  }

  if (!email || typeof email !== "string" || !EMAIL_REGEX.test(email.trim())) {
    errors.push("A valid email is required.");
  }

  if (!password || typeof password !== "string" || password.length < 6) {
    errors.push("Password must be at least 6 characters.");
  }

  if (role !== undefined && !ROLES.includes(role)) {
    errors.push("Role must be ADMIN or USER.");
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates login payload.
 * @param {Object} data - { email, password }
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateLogin(data) {
  const errors = [];
  const { email, password } = data || {};

  if (!email || typeof email !== "string" || !EMAIL_REGEX.test(email.trim())) {
    errors.push("A valid email is required.");
  }

  if (!password || typeof password !== "string") {
    errors.push("Password is required.");
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates a password change request from a signed-in user.
 * @param {Object} data - { currentPassword, newPassword }
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateChangePassword(data) {
  const errors = [];
  const { currentPassword, newPassword } = data || {};

  if (!currentPassword || typeof currentPassword !== "string") {
    errors.push("Current password is required.");
  }

  if (!newPassword || typeof newPassword !== "string" || newPassword.length < 6) {
    errors.push("New password must be at least 6 characters.");
  } else if (newPassword === currentPassword) {
    errors.push("New password must differ from the current one.");
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates a password reset submission.
 * @param {Object} data - { token, password }
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateResetPassword(data) {
  const errors = [];
  const { token, password } = data || {};

  if (!token || typeof token !== "string" || token.trim().length === 0) {
    errors.push("Reset token is required.");
  }

  if (!password || typeof password !== "string" || password.length < 6) {
    errors.push("Password must be at least 6 characters.");
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates a custom form definition built by an admin.
 * @param {Object} data - { title, description, questions, closesAt, isAnonymous,
 *   isDraft, assignedUserIds }
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateForm(data) {
  const errors = [];
  const { title, description, questions, closesAt, assignedUserIds } = data || {};

  if (!title || typeof title !== "string" || title.trim().length === 0) {
    errors.push("Form title is required.");
  } else if (title.trim().length > 120) {
    errors.push("Form title must be under 120 characters.");
  }

  if (description !== undefined && description !== null && typeof description !== "string") {
    errors.push("Description must be text.");
  }

  if (closesAt !== undefined && closesAt !== null && closesAt !== "") {
    if (Number.isNaN(new Date(closesAt).getTime())) {
      errors.push("Closing date is not a valid date.");
    }
  }

  if (assignedUserIds !== undefined && assignedUserIds !== null) {
    if (!Array.isArray(assignedUserIds) || assignedUserIds.some((id) => typeof id !== "string")) {
      errors.push("Recipients must be a list of user ids.");
    }
  }

  if (!Array.isArray(questions) || questions.length === 0) {
    errors.push("At least one question is required.");
    return { valid: false, errors };
  }

  if (questions.length > 20) {
    errors.push("A form can have at most 20 questions.");
  }

  questions.forEach((question, index) => {
    const position = index + 1;
    const { label, type, options, conditionIndex, conditionEquals } = question || {};

    if (!label || typeof label !== "string" || label.trim().length === 0) {
      errors.push(`Question ${position}: label is required.`);
    } else if (label.trim().length > 200) {
      errors.push(`Question ${position}: label must be under 200 characters.`);
    }

    if (!QUESTION_TYPES.includes(type)) {
      errors.push(`Question ${position}: type must be one of ${QUESTION_TYPES.join(", ")}.`);
      return;
    }

    // A condition may only depend on an earlier question, so the chain cannot loop
    if (conditionIndex !== undefined && conditionIndex !== null && conditionIndex !== "") {
      const dependsOn = Number(conditionIndex);
      if (!Number.isInteger(dependsOn) || dependsOn < 0 || dependsOn >= index) {
        errors.push(`Question ${position}: can only depend on an earlier question.`);
      } else if (!conditionEquals || String(conditionEquals).trim().length === 0) {
        errors.push(`Question ${position}: pick the answer that reveals it.`);
      }
    }

    if (!CHOICE_TYPES.includes(type)) return;

    const cleaned = Array.isArray(options)
      ? options.filter((option) => typeof option === "string" && option.trim().length > 0)
      : [];

    if (cleaned.length < 2) {
      errors.push(`Question ${position}: choice questions need at least 2 options.`);
    } else if (cleaned.length > 20) {
      errors.push(`Question ${position}: at most 20 options are allowed.`);
    } else if (new Set(cleaned.map((option) => option.trim())).size !== cleaned.length) {
      errors.push(`Question ${position}: options must be unique.`);
    }
  });

  return { valid: errors.length === 0, errors };
}

/**
 * Validates a submitted answer set against the form's questions. Questions
 * hidden by an unmet condition are skipped, so a hidden "required" question
 * cannot block a submission.
 * @param {Object} data - { answers } keyed by question id
 * @param {Object[]} questions - The form's stored questions
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateResponse(data, questions) {
  const errors = [];
  const { answers } = data || {};

  if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
    errors.push("Answers are required.");
    return { valid: false, errors };
  }

  visibleQuestions(questions, answers).forEach((question) => {
    const value = answers[question.id];
    const isEmpty =
      value === undefined ||
      value === null ||
      (typeof value === "string" && value.trim().length === 0) ||
      (Array.isArray(value) && value.length === 0);

    if (isEmpty) {
      if (question.required) {
        errors.push(`"${question.label}" is required.`);
      }
      return;
    }

    if (question.type === "rating") {
      const rating = Number(value);
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        errors.push(`"${question.label}" must be a rating from 1 to 5.`);
      }
      return;
    }

    if (question.type === "checkbox") {
      if (!Array.isArray(value)) {
        errors.push(`"${question.label}" must be a list of choices.`);
      } else if (value.some((choice) => !question.options.includes(choice))) {
        errors.push(`"${question.label}" contains an option that is not on the form.`);
      }
      return;
    }

    if (question.type === "radio" || question.type === "select") {
      if (!question.options.includes(value)) {
        errors.push(`"${question.label}" must be one of the listed options.`);
      }
      return;
    }

    if (typeof value !== "string") {
      errors.push(`"${question.label}" must be text.`);
    } else if (value.trim().length > 1000) {
      errors.push(`"${question.label}" must be under 1000 characters.`);
    }
  });

  return { valid: errors.length === 0, errors };
}

/**
 * Validates an admin's change to another user's role.
 * @param {Object} data - { role }
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateRoleChange(data) {
  const errors = [];
  const { role } = data || {};

  if (!ROLES.includes(role)) {
    errors.push("Role must be ADMIN or USER.");
  }

  return { valid: errors.length === 0, errors };
}

module.exports = {
  validateFeedback,
  validateRegister,
  validateLogin,
  validateChangePassword,
  validateResetPassword,
  validateForm,
  validateResponse,
  validateRoleChange,
  isQuestionVisible,
  visibleQuestions,
  QUESTION_TYPES,
  CHOICE_TYPES,
};
