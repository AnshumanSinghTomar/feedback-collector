const crypto = require("crypto");
const { PrismaClient } = require("@prisma/client");
const { CHOICE_TYPES, visibleQuestions } = require("../utils/validation");
const { recordAudit, notifyUser, notifyUsers } = require("./authService");

const prisma = new PrismaClient();

const AUTHOR_SELECT = {
  select: { id: true, name: true, email: true },
};

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;

/**
 * Clamps incoming paging values so a bad query cannot ask for everything.
 * @param {Object} paging - { page, pageSize }
 * @returns {{ page: number, pageSize: number, skip: number, take: number }}
 */
function normalizePaging({ page, pageSize } = {}) {
  const safePage = Math.max(1, Number.parseInt(page, 10) || 1);
  const requestedSize = Number.parseInt(pageSize, 10) || DEFAULT_PAGE_SIZE;
  const safeSize = Math.min(MAX_PAGE_SIZE, Math.max(1, requestedSize));

  return { page: safePage, pageSize: safeSize, skip: (safePage - 1) * safeSize, take: safeSize };
}

/**
 * Reports whether a form still takes responses, accounting for draft state and
 * its deadline.
 * @param {Object} form - Form record with `isOpen`, `isDraft` and `closesAt`
 * @returns {boolean}
 */
function isAcceptingResponses(form) {
  if (form.isDraft || !form.isOpen) return false;
  if (form.closesAt && new Date(form.closesAt) <= new Date()) return false;
  return true;
}

/**
 * Normalises builder questions into stored form, generating ids for new ones and
 * resolving each condition's question index into the id it points at.
 * @param {Object[]} incoming - Questions from the builder
 * @param {Object[]} [existing] - Previously stored questions, when editing
 * @returns {Object[]} Questions ready to persist
 */
function buildQuestions(incoming, existing = []) {
  const byId = new Map(existing.map((question) => [question.id, question]));

  const prepared = incoming.map((question) => {
    const keepId = question.id && byId.has(question.id) ? question.id : crypto.randomUUID();

    return {
      id: keepId,
      label: question.label.trim(),
      type: question.type,
      required: Boolean(question.required),
      options: CHOICE_TYPES.includes(question.type)
        ? question.options.map((option) => option.trim()).filter(Boolean)
        : [],
      conditionIndex: question.conditionIndex,
      conditionEquals: question.conditionEquals,
    };
  });

  const resolved = prepared.map(({ conditionIndex, conditionEquals, ...question }) => {
    const dependsOn =
      conditionIndex === undefined || conditionIndex === null || conditionIndex === ""
        ? null
        : prepared[Number(conditionIndex)];

    return {
      ...question,
      condition: dependsOn ? { questionId: dependsOn.id, equals: String(conditionEquals) } : null,
    };
  });

  // Questions dropped while responses exist are tombstoned, not deleted, so
  // previously submitted answers still have a label to render against
  const keptIds = new Set(resolved.map((question) => question.id));
  const tombstoned = existing
    .filter((question) => !keptIds.has(question.id))
    .map((question) => ({ ...question, deleted: true }));

  return [...resolved, ...tombstoned];
}

/**
 * Creates a new feedback entry authored by an admin.
 * @param {Object} data - { title, message }
 * @param {Object} actor - The admin creating the entry
 * @returns {Promise<Object>} The created feedback record, with author info
 */
async function createFeedback(data, actor) {
  return prisma.feedback.create({
    data: {
      title: data.title ? data.title.trim() : null,
      message: data.message.trim(),
      authorId: actor.id,
    },
    include: { author: AUTHOR_SELECT },
  });
}

/**
 * Retrieves a page of feedback entries, optionally filtered and re-sorted.
 * @param {Object} filters - { keyword, date, sort, page, pageSize }
 * @returns {Promise<Object>} { entries, total, page, pageSize }
 */
async function getFeedback(filters = {}, viewer) {
  const { keyword, date, sort } = filters;
  const { page, pageSize, skip, take } = normalizePaging(filters);
  // Same workspace split as forms: demo announcements stay inside the demo side
  const where = { author: { isDemo: Boolean(viewer?.isDemo) } };

  if (keyword) {
    where.OR = [
      { title: { contains: keyword, mode: "insensitive" } },
      { message: { contains: keyword, mode: "insensitive" } },
    ];
  }

  if (date) {
    const start = new Date(`${date}T00:00:00.000Z`);
    const end = new Date(`${date}T23:59:59.999Z`);
    where.createdAt = { gte: start, lte: end };
  }

  const [entries, total] = await Promise.all([
    prisma.feedback.findMany({
      where,
      orderBy: { createdAt: sort === "oldest" ? "asc" : "desc" },
      include: { author: AUTHOR_SELECT },
      skip,
      take,
    }),
    prisma.feedback.count({ where }),
  ]);

  return { entries, total, page, pageSize };
}

/**
 * Deletes a feedback entry by id. Admin only (enforced at the route level).
 * @param {string} id - Feedback record id
 * @param {Object} actor - The admin performing the delete
 * @returns {Promise<Object|null>} The deleted record, or null if not found
 */
async function deleteFeedback(id, actor) {
  const existing = await prisma.feedback.findUnique({ where: { id } });
  if (!existing) return null;

  const deleted = await prisma.feedback.delete({ where: { id } });
  await recordAudit({
    action: "announcement.deleted",
    actor,
    targetType: "feedback",
    targetId: id,
    detail: existing.title || existing.message.slice(0, 60),
  });

  return deleted;
}

/**
 * Creates a custom feedback form. Admin only (enforced at the route level).
 * @param {Object} data - Form definition from the builder
 * @param {Object} actor - The admin creating the form
 * @returns {Promise<Object>} The created form, with author info
 */
async function createForm(data, actor) {
  const assignedUserIds = [...new Set(data.assignedUserIds || [])];

  const form = await prisma.form.create({
    data: {
      title: data.title.trim(),
      description: data.description ? data.description.trim() : null,
      questions: buildQuestions(data.questions),
      closesAt: data.closesAt ? new Date(data.closesAt) : null,
      isAnonymous: Boolean(data.isAnonymous),
      isDraft: Boolean(data.isDraft),
      authorId: actor.id,
      assignments: { create: assignedUserIds.map((userId) => ({ userId })) },
    },
    include: { author: AUTHOR_SELECT },
  });

  await recordAudit({
    action: form.isDraft ? "form.drafted" : "form.published",
    actor,
    targetType: "form",
    targetId: form.id,
    detail: form.title,
  });

  if (!form.isDraft) {
    await notifyFormAudience(form, assignedUserIds);
  }

  return decorateForm(form);
}

/**
 * Notifies a form's audience that it is ready to fill in: the assigned users
 * when the form is targeted, or every active USER when it is open to everyone.
 * @param {Object} form - The newly published form
 * @param {string[]} assignedUserIds - Explicit recipients, if any
 * @returns {Promise<void>}
 */
async function notifyFormAudience(form, assignedUserIds) {
  const author = await prisma.user.findUnique({
    where: { id: form.authorId },
    select: { isDemo: true },
  });

  const userIds = assignedUserIds.length
    ? assignedUserIds
    : (
        await prisma.user.findMany({
          // Never notify across the demo boundary
          where: { role: "USER", isActive: true, isDemo: Boolean(author?.isDemo) },
          select: { id: true },
        })
      ).map((u) => u.id);

  await notifyUsers(userIds, {
    type: "form.published",
    message: `New form to fill in: "${form.title}"`,
    targetType: "form",
    targetId: form.id,
  });
}

/**
 * Replaces a form's definition. Questions that already have responses keep their
 * ids so existing answers stay attached.
 * @param {string} id - Form record id
 * @param {Object} data - Form definition from the builder
 * @param {Object} actor - The admin editing the form
 * @returns {Promise<Object|null>} The updated form, or null if not found
 */
async function updateFormDefinition(id, data, actor) {
  const existing = await prisma.form.findUnique({ where: { id } });
  if (!existing) return null;

  const assignedUserIds = [...new Set(data.assignedUserIds || [])];

  const form = await prisma.form.update({
    where: { id },
    data: {
      title: data.title.trim(),
      description: data.description ? data.description.trim() : null,
      questions: buildQuestions(data.questions, existing.questions),
      closesAt: data.closesAt ? new Date(data.closesAt) : null,
      isAnonymous: Boolean(data.isAnonymous),
      isDraft: Boolean(data.isDraft),
      assignments: {
        deleteMany: {},
        create: assignedUserIds.map((userId) => ({ userId })),
      },
    },
    include: { author: AUTHOR_SELECT },
  });

  await recordAudit({
    action: "form.edited",
    actor,
    targetType: "form",
    targetId: id,
    detail: form.title,
  });

  // Editing a draft into a published form notifies its audience, same as a
  // fresh publish would
  if (existing.isDraft && !form.isDraft) {
    await notifyFormAudience(form, assignedUserIds);
  }

  return decorateForm(form);
}

/**
 * Lists forms the given user is allowed to see. Admins see everything including
 * drafts; users see published forms that are either unassigned or assigned to
 * them, and get their own previous answers back for editing.
 * @param {Object} viewer - The signed-in user
 * @returns {Promise<Object[]>}
 */
async function getForms(viewer) {
  const isAdmin = viewer.role === "ADMIN";

  // Demo and real accounts are separate workspaces: a form is only visible to
  // viewers on the same side of the isDemo line as its author
  const cohort = { author: { isDemo: Boolean(viewer.isDemo) } };

  const where = isAdmin
    ? cohort
    : {
        ...cohort,
        isDraft: false,
        OR: [{ assignments: { none: {} } }, { assignments: { some: { userId: viewer.id } } }],
      };

  const forms = await prisma.form.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      author: AUTHOR_SELECT,
      _count: { select: { responses: true, assignments: true } },
      responses: {
        where: { respondentId: viewer.id },
        select: { id: true, answers: true, updatedAt: true },
      },
      assignments: isAdmin ? { select: { userId: true } } : false,
    },
  });

  return forms.map(({ _count, responses, assignments, ...form }) => ({
    ...decorateForm(form),
    responseCount: _count.responses,
    assignmentCount: _count.assignments,
    assignedUserIds: assignments ? assignments.map((a) => a.userId) : undefined,
    hasResponded: responses.length > 0,
    myResponse: responses[0] || null,
  }));
}

/**
 * Fetches a single form by id.
 * @param {string} id - Form record id
 * @returns {Promise<Object|null>}
 */
async function getFormById(id) {
  const form = await prisma.form.findUnique({
    where: { id },
    include: { author: AUTHOR_SELECT, assignments: { select: { userId: true } } },
  });

  if (!form) return null;

  return {
    ...decorateForm(form),
    assignedUserIds: form.assignments.map((a) => a.userId),
  };
}

/**
 * Opens, closes or publishes a form. Admin only.
 * @param {string} id - Form record id
 * @param {Object} flags - { isOpen, isDraft }
 * @param {Object} actor - The admin making the change
 * @returns {Promise<Object|null>} The updated form, or null if not found
 */
async function setFormFlags(id, flags, actor) {
  const existing = await prisma.form.findUnique({
    where: { id },
    include: { assignments: { select: { userId: true } } },
  });
  if (!existing) return null;

  const data = {};
  if (typeof flags.isOpen === "boolean") data.isOpen = flags.isOpen;
  if (typeof flags.isDraft === "boolean") data.isDraft = flags.isDraft;

  const form = await prisma.form.update({
    where: { id },
    data,
    include: { author: AUTHOR_SELECT },
  });

  const justPublished = existing.isDraft && form.isDraft === false;
  const action = justPublished
    ? "form.published"
    : data.isOpen === false
    ? "form.closed"
    : data.isOpen === true
    ? "form.reopened"
    : "form.edited";

  await recordAudit({ action, actor, targetType: "form", targetId: id, detail: form.title });

  if (justPublished) {
    await notifyFormAudience(form, existing.assignments.map((a) => a.userId));
  }

  return decorateForm(form);
}

/**
 * Deletes a form and its responses. Admin only (enforced at the route level).
 * @param {string} id - Form record id
 * @param {Object} actor - The admin performing the delete
 * @returns {Promise<Object|null>} The deleted form, or null if not found
 */
async function deleteForm(id, actor) {
  const existing = await prisma.form.findUnique({ where: { id } });
  if (!existing) return null;

  const deleted = await prisma.form.delete({ where: { id } });
  await recordAudit({
    action: "form.deleted",
    actor,
    targetType: "form",
    targetId: id,
    detail: existing.title,
  });

  return deleted;
}

/**
 * Records or replaces a user's answers. One response per user per form, editable
 * while the form is still accepting them.
 * @param {Object} form - The target form record
 * @param {Object} answers - { [questionId]: value }
 * @param {string} respondentId - The id of the responding user
 * @returns {Promise<Object>} { response, created }
 */
async function saveResponse(form, answers, respondentId) {
  if (!isAcceptingResponses(form)) {
    const err = new Error("This form is closed for new responses.");
    err.status = 403;
    throw err;
  }

  if (form.assignedUserIds?.length && !form.assignedUserIds.includes(respondentId)) {
    const err = new Error("This form was not shared with you.");
    err.status = 403;
    throw err;
  }

  // Guards the direct endpoint too, not just the list query, so a form id from
  // the other workspace cannot be answered by guessing it
  const [author, respondent] = await Promise.all([
    prisma.user.findUnique({ where: { id: form.authorId }, select: { isDemo: true } }),
    prisma.user.findUnique({ where: { id: respondentId }, select: { isDemo: true } }),
  ]);

  if (Boolean(author?.isDemo) !== Boolean(respondent?.isDemo)) {
    const err = new Error("This form is not part of your workspace.");
    err.status = 403;
    throw err;
  }

  // Drop answers to questions hidden by an unmet condition so stale values from
  // a changed mind are not stored
  const visibleIds = new Set(visibleQuestions(form.questions, answers).map((q) => q.id));
  const cleaned = Object.fromEntries(
    Object.entries(answers).filter(([questionId]) => visibleIds.has(questionId))
  );

  const existing = await prisma.formResponse.findUnique({
    where: { formId_respondentId: { formId: form.id, respondentId } },
  });

  if (existing) {
    const response = await prisma.formResponse.update({
      where: { id: existing.id },
      data: { answers: cleaned },
      include: { respondent: AUTHOR_SELECT },
    });
    return { response, created: false };
  }

  const response = await prisma.formResponse.create({
    data: { formId: form.id, answers: cleaned, respondentId },
    include: { respondent: AUTHOR_SELECT },
  });

  // Only on the first response, not on a revision, so the admin is not paged
  // every time someone tweaks an earlier answer
  await notifyUser({
    userId: form.authorId,
    type: "response.received",
    message: `New response on "${form.title}"`,
    targetType: "form",
    targetId: form.id,
  });

  return { response, created: true };
}

/**
 * Lists a page of responses for a form, newest first. Respondent details are
 * omitted when the form was published as anonymous.
 * @param {Object} form - The target form record
 * @param {Object} paging - { page, pageSize }
 * @returns {Promise<Object>} { responses, total, page, pageSize }
 */
async function getResponses(form, paging = {}) {
  const { page, pageSize, skip, take } = normalizePaging(paging);

  const [responses, total] = await Promise.all([
    prisma.formResponse.findMany({
      where: { formId: form.id },
      orderBy: { createdAt: "desc" },
      include: form.isAnonymous ? undefined : { respondent: AUTHOR_SELECT },
      skip,
      take,
    }),
    prisma.formResponse.count({ where: { formId: form.id } }),
  ]);

  return { responses, total, page, pageSize };
}

/**
 * Lists the active users who can see a form but have not answered it. Returns an
 * empty list for anonymous forms, where naming non-respondents would leak who
 * did answer by elimination.
 * @param {Object} form - The target form record
 * @returns {Promise<Object[]>} Users still owing a response
 */
async function getPendingRespondents(form) {
  if (form.isAnonymous) return [];

  const author = await prisma.user.findUnique({
    where: { id: form.authorId },
    select: { isDemo: true },
  });

  const audience = form.assignedUserIds?.length
    ? { id: { in: form.assignedUserIds } }
    : { role: "USER", isDemo: Boolean(author?.isDemo) };

  return prisma.user.findMany({
    where: {
      isActive: true,
      ...audience,
      responses: { none: { formId: form.id } },
    },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });
}

/**
 * Aggregates every response to a form into per-question statistics. Runs over
 * the whole set rather than the current page so the numbers stay accurate.
 * @param {Object} form - The target form record
 * @returns {Promise<Object[]>} One summary entry per live question
 */
async function summarizeResponses(form) {
  const responses = await prisma.formResponse.findMany({
    where: { formId: form.id },
    select: { answers: true },
  });

  return form.questions
    .filter((question) => !question.deleted)
    .map((question) => {
      const values = responses
        .map((response) => response.answers[question.id])
        .filter((value) => value !== undefined && value !== null && value !== "");

      const summary = {
        questionId: question.id,
        label: question.label,
        type: question.type,
        answered: values.length,
      };

      if (question.type === "rating") {
        const ratings = values.map(Number).filter(Number.isFinite);
        return {
          ...summary,
          average: ratings.length
            ? Number((ratings.reduce((sum, value) => sum + value, 0) / ratings.length).toFixed(2))
            : null,
          distribution: [1, 2, 3, 4, 5].map((rating) => ({
            label: String(rating),
            count: ratings.filter((value) => value === rating).length,
          })),
        };
      }

      if (CHOICE_TYPES.includes(question.type)) {
        const flattened = values.flatMap((value) => (Array.isArray(value) ? value : [value]));
        return {
          ...summary,
          distribution: question.options.map((option) => ({
            label: option,
            count: flattened.filter((value) => value === option).length,
          })),
        };
      }

      return summary;
    });
}

/**
 * Renders every response to a form as CSV, one row per response.
 * @param {Object} form - The target form record
 * @returns {Promise<string>} CSV text including a header row
 */
async function buildResponsesCsv(form) {
  const responses = await prisma.formResponse.findMany({
    where: { formId: form.id },
    orderBy: { createdAt: "desc" },
    include: form.isAnonymous ? undefined : { respondent: AUTHOR_SELECT },
  });

  const questions = form.questions.filter((question) => !question.deleted);
  const header = ["Submitted At"];
  if (!form.isAnonymous) header.push("Name", "Email");
  questions.forEach((question) => header.push(question.label));

  const rows = responses.map((response) => {
    const row = [response.createdAt.toISOString()];

    if (!form.isAnonymous) {
      row.push(
        response.respondent ? response.respondent.name : "",
        response.respondent ? response.respondent.email : ""
      );
    }

    questions.forEach((question) => {
      const value = response.answers[question.id];
      if (value === undefined || value === null) {
        row.push("");
      } else {
        row.push(Array.isArray(value) ? value.join("; ") : String(value));
      }
    });

    return row;
  });

  return [header, ...rows].map((row) => row.map(escapeCsvCell).join(",")).join("\r\n");
}

/**
 * Adds the derived `isAccepting` flag so clients do not have to re-check draft
 * state and deadlines themselves.
 * @param {Object} form - Form record
 * @returns {Object} The form plus `isAccepting`
 */
function decorateForm(form) {
  return { ...form, isAccepting: isAcceptingResponses(form) };
}

/**
 * Escapes one CSV cell, wrapping it in quotes when it contains a comma, quote or
 * newline and doubling any inner quotes.
 * @param {*} value - Raw cell value
 * @returns {string} A CSV-safe cell
 */
function escapeCsvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

module.exports = {
  createFeedback,
  getFeedback,
  deleteFeedback,
  createForm,
  updateFormDefinition,
  getForms,
  getFormById,
  setFormFlags,
  deleteForm,
  saveResponse,
  getResponses,
  getPendingRespondents,
  summarizeResponses,
  buildResponsesCsv,
  isAcceptingResponses,
};
