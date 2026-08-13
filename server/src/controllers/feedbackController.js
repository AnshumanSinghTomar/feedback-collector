const feedbackService = require("../services/feedbackService");
const { validateFeedback, validateForm, validateResponse } = require("../utils/validation");

/**
 * POST /api/feedback
 * Creates a new feedback entry. Admin only (enforced by route middleware).
 */
async function submitFeedback(req, res) {
  const { valid, errors } = validateFeedback(req.body);

  if (!valid) {
    return res.status(400).json({ errors });
  }

  try {
    const feedback = await feedbackService.createFeedback(req.body, req.user);
    return res.status(201).json(feedback);
  } catch (err) {
    console.error("Error creating feedback:", err);
    return res.status(500).json({ error: "Failed to save feedback." });
  }
}

/**
 * GET /api/feedback?keyword=&date=&sort=&page=&pageSize=
 * Retrieves a page of feedback entries. Any authenticated user.
 */
async function listFeedback(req, res) {
  const { keyword, date, sort, page, pageSize } = req.query;

  try {
    const result = await feedbackService.getFeedback(
      { keyword, date, sort, page, pageSize },
      req.user
    );
    return res.status(200).json(result);
  } catch (err) {
    console.error("Error fetching feedback:", err);
    return res.status(500).json({ error: "Failed to fetch feedback." });
  }
}

/**
 * DELETE /api/feedback/:id
 * Deletes a feedback entry by id. Admin only (enforced by route middleware).
 */
async function removeFeedback(req, res) {
  const { id } = req.params;

  try {
    const deleted = await feedbackService.deleteFeedback(id, req.user);
    if (!deleted) {
      return res.status(404).json({ error: "Feedback not found." });
    }
    return res.status(200).json({ message: "Feedback deleted.", id });
  } catch (err) {
    console.error("Error deleting feedback:", err);
    return res.status(500).json({ error: "Failed to delete feedback." });
  }
}

/**
 * POST /api/feedback/forms
 * Creates a custom form. Admin only (enforced by route middleware).
 */
async function createForm(req, res) {
  const { valid, errors } = validateForm(req.body);

  if (!valid) {
    return res.status(400).json({ errors });
  }

  try {
    const form = await feedbackService.createForm(req.body, req.user);
    return res.status(201).json(form);
  } catch (err) {
    console.error("Error creating form:", err);
    return res.status(500).json({ error: "Failed to save form." });
  }
}

/**
 * GET /api/feedback/forms
 * Lists the forms the caller may see. Any authenticated user.
 */
async function listForms(req, res) {
  try {
    const forms = await feedbackService.getForms(req.user);
    return res.status(200).json(forms);
  } catch (err) {
    console.error("Error fetching forms:", err);
    return res.status(500).json({ error: "Failed to fetch forms." });
  }
}

/**
 * GET /api/feedback/forms/:id
 * Fetches a single form. Any authenticated user.
 */
async function getForm(req, res) {
  const { id } = req.params;

  try {
    const form = await feedbackService.getFormById(id);
    if (!form) {
      return res.status(404).json({ error: "Form not found." });
    }
    return res.status(200).json(form);
  } catch (err) {
    console.error("Error fetching form:", err);
    return res.status(500).json({ error: "Failed to fetch form." });
  }
}

/**
 * PUT /api/feedback/forms/:id
 * Replaces a form's definition. Admin only (enforced by route middleware).
 */
async function replaceForm(req, res) {
  const { valid, errors } = validateForm(req.body);

  if (!valid) {
    return res.status(400).json({ errors });
  }

  try {
    const form = await feedbackService.updateFormDefinition(req.params.id, req.body, req.user);
    if (!form) {
      return res.status(404).json({ error: "Form not found." });
    }
    return res.status(200).json(form);
  } catch (err) {
    console.error("Error updating form:", err);
    return res.status(500).json({ error: "Failed to update form." });
  }
}

/**
 * PATCH /api/feedback/forms/:id
 * Opens, closes or publishes a form. Admin only (enforced by route middleware).
 */
async function updateForm(req, res) {
  const { isOpen, isDraft } = req.body || {};

  if (typeof isOpen !== "boolean" && typeof isDraft !== "boolean") {
    return res.status(400).json({ errors: ["Provide isOpen or isDraft as a boolean."] });
  }

  try {
    const form = await feedbackService.setFormFlags(req.params.id, { isOpen, isDraft }, req.user);
    if (!form) {
      return res.status(404).json({ error: "Form not found." });
    }
    return res.status(200).json(form);
  } catch (err) {
    console.error("Error updating form:", err);
    return res.status(500).json({ error: "Failed to update form." });
  }
}

/**
 * DELETE /api/feedback/forms/:id
 * Deletes a form and its responses. Admin only (enforced by route middleware).
 */
async function removeForm(req, res) {
  const { id } = req.params;

  try {
    const deleted = await feedbackService.deleteForm(id, req.user);
    if (!deleted) {
      return res.status(404).json({ error: "Form not found." });
    }
    return res.status(200).json({ message: "Form deleted.", id });
  } catch (err) {
    console.error("Error deleting form:", err);
    return res.status(500).json({ error: "Failed to delete form." });
  }
}

/**
 * POST /api/feedback/forms/:id/responses
 * Submits or revises answers to a form. Any authenticated user in its audience.
 */
async function submitResponse(req, res) {
  const { id } = req.params;

  try {
    const form = await feedbackService.getFormById(id);
    if (!form) {
      return res.status(404).json({ error: "Form not found." });
    }

    const { valid, errors } = validateResponse(req.body, form.questions);
    if (!valid) {
      return res.status(400).json({ errors });
    }

    const { response, created } = await feedbackService.saveResponse(
      form,
      req.body.answers,
      req.user.id
    );

    return res.status(created ? 201 : 200).json(response);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error("Error submitting response:", err);
    return res.status(500).json({ error: "Failed to submit response." });
  }
}

/**
 * GET /api/feedback/forms/:id/responses?page=&pageSize=
 * Lists a page of responses, a summary over the full set, and who has not
 * answered yet. Admin only.
 */
async function listResponses(req, res) {
  const { id } = req.params;
  const { page, pageSize } = req.query;

  try {
    const form = await feedbackService.getFormById(id);
    if (!form) {
      return res.status(404).json({ error: "Form not found." });
    }

    const [paged, summary, pending] = await Promise.all([
      feedbackService.getResponses(form, { page, pageSize }),
      feedbackService.summarizeResponses(form),
      feedbackService.getPendingRespondents(form),
    ]);

    return res.status(200).json({ form, summary, pending, ...paged });
  } catch (err) {
    console.error("Error fetching responses:", err);
    return res.status(500).json({ error: "Failed to fetch responses." });
  }
}

/**
 * GET /api/feedback/forms/:id/responses/export
 * Streams every response to a form as CSV. Admin only.
 */
async function exportResponses(req, res) {
  const { id } = req.params;

  try {
    const form = await feedbackService.getFormById(id);
    if (!form) {
      return res.status(404).json({ error: "Form not found." });
    }

    const csv = await feedbackService.buildResponsesCsv(form);
    const filename = `${form.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-responses.csv`;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.status(200).send(csv);
  } catch (err) {
    console.error("Error exporting responses:", err);
    return res.status(500).json({ error: "Failed to export responses." });
  }
}

module.exports = {
  submitFeedback,
  listFeedback,
  removeFeedback,
  createForm,
  listForms,
  getForm,
  replaceForm,
  updateForm,
  removeForm,
  submitResponse,
  listResponses,
  exportResponses,
};
