const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CHOICE_TYPES = ["radio", "select", "checkbox"];

/**
 * Checks whether a string is a valid email address.
 * @param {string} email - The email to validate
 * @returns {boolean}
 */
export function isValidEmail(email) {
  return typeof email === "string" && EMAIL_REGEX.test(email.trim());
}

/**
 * Checks whether a question type needs a list of options.
 * @param {string} type - Question type
 * @returns {boolean}
 */
export function isChoiceType(type) {
  return CHOICE_TYPES.includes(type);
}

/**
 * Decides whether a conditional question applies, given the answers so far.
 * Mirrors the same check on the server.
 * @param {Object} question - Question with an optional `condition`
 * @param {Object} answers - { [questionId]: value }
 * @returns {boolean}
 */
export function isQuestionVisible(question, answers) {
  const condition = question.condition;
  if (!condition || !condition.questionId) return true;

  const value = answers ? answers[condition.questionId] : undefined;
  if (Array.isArray(value)) return value.includes(condition.equals);
  return String(value ?? "") === String(condition.equals);
}

/**
 * Filters a question list down to the ones to render right now.
 * @param {Object[]} questions - The form's questions
 * @param {Object} answers - { [questionId]: value }
 * @returns {Object[]}
 */
export function visibleQuestions(questions, answers) {
  return questions.filter(
    (question) => !question.deleted && isQuestionVisible(question, answers)
  );
}

/**
 * Validates the feedback form fields (author comes from the session).
 * @param {Object} formData - { title, message }
 * @returns {{ valid: boolean, errors: Object }} errors keyed by field name
 */
export function validateFeedbackForm(formData) {
  const errors = {};
  const { title, message } = formData;

  if (title && title.trim().length > 120) {
    errors.title = "Title must be under 120 characters.";
  }

  if (!message || !message.trim()) {
    errors.message = "Message is required.";
  } else if (message.trim().length > 1000) {
    errors.message = "Message must be under 1000 characters.";
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

/**
 * Validates the login form fields.
 * @param {Object} formData - { email, password }
 * @returns {{ valid: boolean, errors: Object }} errors keyed by field name
 */
export function validateLoginForm(formData) {
  const errors = {};
  const { email, password } = formData;

  if (!email || !isValidEmail(email)) {
    errors.email = "Please enter a valid email.";
  }

  if (!password) {
    errors.password = "Password is required.";
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

/**
 * Validates the registration form fields.
 * @param {Object} formData - { name, email, password, role, adminCode }
 * @returns {{ valid: boolean, errors: Object }} errors keyed by field name
 */
export function validateRegisterForm(formData) {
  const errors = {};
  const { name, email, password, role, adminCode } = formData;

  if (!name || !name.trim()) {
    errors.name = "Name is required.";
  }

  if (!email || !isValidEmail(email)) {
    errors.email = "Please enter a valid email.";
  }

  if (!password || password.length < 6) {
    errors.password = "Password must be at least 6 characters.";
  }

  if (role === "ADMIN" && (!adminCode || !adminCode.trim())) {
    errors.adminCode = "An admin code is required to create an admin account.";
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

/**
 * Validates the change-password form fields.
 * @param {Object} formData - { currentPassword, newPassword }
 * @returns {{ valid: boolean, errors: Object }} errors keyed by field name
 */
export function validateChangePasswordForm(formData) {
  const errors = {};
  const { currentPassword, newPassword } = formData;

  if (!currentPassword) {
    errors.currentPassword = "Current password is required.";
  }

  if (!newPassword || newPassword.length < 6) {
    errors.newPassword = "New password must be at least 6 characters.";
  } else if (newPassword === currentPassword) {
    errors.newPassword = "New password must differ from the current one.";
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

/**
 * Validates the reset-password form fields.
 * @param {Object} formData - { token, password }
 * @returns {{ valid: boolean, errors: Object }} errors keyed by field name
 */
export function validateResetPasswordForm(formData) {
  const errors = {};
  const { token, password } = formData;

  if (!token || !token.trim()) {
    errors.token = "Paste the reset token you were given.";
  }

  if (!password || password.length < 6) {
    errors.password = "Password must be at least 6 characters.";
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

/**
 * Validates a form definition built in the form builder.
 * @param {Object} formDefinition - { title, questions }
 * @returns {{ valid: boolean, errors: Object }} errors keyed by field name,
 *   plus `questionErrors` keyed by question index
 */
export function validateFormBuilder(formDefinition) {
  const errors = {};
  const questionErrors = {};
  const { title, questions } = formDefinition;

  if (!title || !title.trim()) {
    errors.title = "Form title is required.";
  } else if (title.trim().length > 120) {
    errors.title = "Form title must be under 120 characters.";
  }

  if (!questions || questions.length === 0) {
    errors.questions = "Add at least one question.";
  } else {
    questions.forEach((question, index) => {
      if (!question.label || !question.label.trim()) {
        questionErrors[index] = "Question text is required.";
        return;
      }

      if (question.label.trim().length > 200) {
        questionErrors[index] = "Question must be under 200 characters.";
        return;
      }

      const { conditionIndex, conditionEquals } = question;
      if (conditionIndex !== undefined && conditionIndex !== null && conditionIndex !== "") {
        if (Number(conditionIndex) >= index) {
          questionErrors[index] = "A question can only depend on an earlier one.";
          return;
        }
        if (!conditionEquals || !String(conditionEquals).trim()) {
          questionErrors[index] = "Pick the answer that reveals this question.";
          return;
        }
      }

      if (!isChoiceType(question.type)) return;

      // Blank rows in the builder do not count towards the two-option minimum
      const filled = (question.options || []).filter((option) => option && option.trim());
      if (filled.length < 2) {
        questionErrors[index] = "Choice questions need at least 2 options.";
      } else if (new Set(filled.map((option) => option.trim())).size !== filled.length) {
        questionErrors[index] = "Options must be unique.";
      }
    });
  }

  if (Object.keys(questionErrors).length > 0) {
    errors.questionErrors = questionErrors;
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

/**
 * Validates a set of answers against a form's questions.
 * @param {Object} answers - { [questionId]: value }
 * @param {Object[]} questions - The form's questions
 * @returns {{ valid: boolean, errors: Object }} errors keyed by question id
 */
export function validateFormResponse(answers, questions) {
  const errors = {};

  visibleQuestions(questions, answers).forEach((question) => {
    const value = answers[question.id];
    const isEmpty =
      value === undefined ||
      value === null ||
      (Array.isArray(value) ? value.length === 0 : String(value).trim() === "");

    if (isEmpty) {
      if (question.required) {
        errors[question.id] = "This question is required.";
      }
      return;
    }

    if (question.type === "checkbox" || question.type === "rating") return;

    if (!isChoiceType(question.type) && String(value).trim().length > 1000) {
      errors[question.id] = "Answer must be under 1000 characters.";
    }
  });

  return { valid: Object.keys(errors).length === 0, errors };
}
