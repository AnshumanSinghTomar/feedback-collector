const express = require("express");
const {
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
} = require("../controllers/feedbackController");
const { authenticate, requireAdmin } = require("../middleware/auth");

const router = express.Router();

// Custom forms are declared before "/:id" so they are not read as feedback ids
router.post("/forms", authenticate, requireAdmin, createForm);
router.get("/forms", authenticate, listForms);
router.get("/forms/:id", authenticate, getForm);
router.put("/forms/:id", authenticate, requireAdmin, replaceForm);
router.patch("/forms/:id", authenticate, requireAdmin, updateForm);
router.delete("/forms/:id", authenticate, requireAdmin, removeForm);
router.post("/forms/:id/responses", authenticate, submitResponse);
router.get("/forms/:id/responses/export", authenticate, requireAdmin, exportResponses);
router.get("/forms/:id/responses", authenticate, requireAdmin, listResponses);

router.post("/", authenticate, requireAdmin, submitFeedback);
router.get("/", authenticate, listFeedback);
router.delete("/:id", authenticate, requireAdmin, removeFeedback);

module.exports = router;
