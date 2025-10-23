import Event from "../models/Event.js";
import Transaction from "../models/Transaction.js";
import FamilyPermission from "../models/FamilyPermission.js";
import Category from "../models/Category.js";
import OneSignalPkg from "@onesignal/node-onesignal";
import { oneSignalClient } from "../utils/onesignal.js";
import NotificationModel from "../models/Notification.js";
const { Notification } = OneSignalPkg;
/**
 * @swagger
 * tags:
 *   name: Events
 *   description: Manage events and payments
 */

/**
 * @swagger
 * components:
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 *   schemas:
 *     Event:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         event_name:
 *           type: string
 *         contact_mobile:
 *           type: string
 *         booking_total_value:
 *           type: number
 *         advance_payment:
 *           type: number
 *         payment_method:
 *           type: string
 *         notes:
 *           type: string
 *         user_id:
 *           type: object
 *           properties:
 *             _id:
 *               type: string
 *             fullname:
 *               type: string
 *             email:
 *               type: string
 *     Transaction:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         event_id:
 *           type: string
 *         added_by:
 *           type: string
 *         amount:
 *           type: number
 *         payment_method:
 *           type: string
 *         reference:
 *           type: string
 *         note:
 *           type: string
 */

// ✅ Helper: check access
async function checkAccess(memberId, ownerId, required) {
  // ✅ Direct owner always has full access
  if (memberId.equals(ownerId)) return true;

  const perm = await FamilyPermission.findOne({ owner_id: ownerId, member_id: memberId });
  if (!perm) return false;

  // ✅ Treat 'owner' permission as full access (read + write)
  if (perm.permission === "owner") return true;

  // ✅ Handle normal permissions
  if (required === "read" && ["read", "write"].includes(perm.permission)) return true;
  if (required === "write" && perm.permission === "write") return true;

  return false;
}

/**
 * @swagger
 * /api/events:
 *   get:
 *     summary: Get all accessible events (own + shared)
 *     tags: [Events]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of accessible events
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Event'
 */
export const getEvents = async (req, res) => {
  try {
    const user = req.user;

    // ✅ Get all permissions where user is a member
    const familyPerms = await FamilyPermission.find({ member_id: user._id }).lean();

    // Separate accessible owners
    const ownerIdsWithAccess = familyPerms.map((p) => p.owner_id.toString());
    const ownerIdsWithFullAccess = familyPerms
      .filter((p) => p.permission === "owner") // 👑 treat as owner
      .map((p) => p.owner_id.toString());

    // ✅ Fetch all events (owned or shared)
    const events = await Event.find({
      user_id: { $in: [user._id, ...ownerIdsWithAccess] },
      is_deleted: false,
    })
      .populate("user_id", "fullname email")
      .populate("category_id", "name status")
      .sort({ createdAt: -1 })
      .lean();

    const eventIds = events.map((e) => e._id);

    // ✅ Determine if user is full owner (main or treated)
    const isMainOwner = !familyPerms.length; // if no permission record → main owner
    const hasOwnerPermission =
      isMainOwner ||
      familyPerms.some((p) => p.permission === "owner") ||
      ownerIdsWithFullAccess.length > 0;

    // ✅ Fetch transactions
    let transactionsQuery = {
      event_id: { $in: eventIds },
      deleted_at: null,
    };

    // 👁️ If user has only read/write permission → restrict to their own transactions
    if (!hasOwnerPermission) {
      transactionsQuery.added_by = user._id;
    }

    const transactions = await Transaction.find(transactionsQuery)
      .populate("added_by", "fullname email")
      .sort({ createdAt: 1 })
      .lean();

    // ✅ Attach transactions properly
    const eventsWithTransactions = events.map((event) => {
      const eventOwnerId = event.user_id._id.toString();
      const isEventOwner =
        eventOwnerId === user._id.toString() ||
        ownerIdsWithFullAccess.includes(eventOwnerId);

      const eventTransactions = hasOwnerPermission
        ? transactions.filter((t) => t.event_id.toString() === event._id.toString())
        : transactions.filter(
          (t) =>
            t.event_id.toString() === event._id.toString() &&
            t.added_by._id.toString() === user._id.toString()
        );

      return {
        ...event,
        category_name: event.category_id?.name || null,
        category_status: event.category_id?.status ?? null,
        transactions: eventTransactions,
      };
    });

    res.json(eventsWithTransactions);
  } catch (err) {
    console.error("Error in getEvents:", err);
    res.status(500).json({ error: err.message });
  }
};


/**
 * @swagger
 * /api/events:
 *   post:
 *     summary: Create a new event (with category auto-create)
 *     tags: [Events]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - event_name
 *               - category_name
 *             properties:
 *               event_name:
 *                 type: string
 *               contact_mobile:
 *                 type: string
 *               booking_total_value:
 *                 type: number
 *               advance_payment:
 *                 type: number
 *               payment_method:
 *                 type: string
 *               notes:
 *                 type: string
 *               category_name:
 *                 type: string
 *                 description: Name of the category (e.g. "Home Care")
 *               priority:
 *                 type: string
 *                 enum: [low, medium, high]
 *                 description: Priority level of the event
 *     responses:
 *       201:
 *         description: Event created successfully
 *       400:
 *         description: Validation error
 */

export const createEvent = async (req, res) => {
  try {
    const user = req.user;
    const {
      event_name,
      contact_mobile,
      booking_total_value,
      advance_payment = 0,
      payment_method = null,
      notes = null,
      category_name,
      priority = "medium", // ✅ added
    } = req.body;

    // ✅ Validation
    if (!event_name || typeof event_name !== "string" || event_name.length > 255) {
      return res
        .status(422)
        .json({ error: "event_name is required and must be a string (max 255)" });
    }

    if (!contact_mobile || typeof contact_mobile !== "string" || contact_mobile.length > 20) {
      return res
        .status(422)
        .json({ error: "contact_mobile is required and must be a string (max 20)" });
    }

    if (
      booking_total_value === undefined ||
      isNaN(booking_total_value) ||
      Number(booking_total_value) < 0
    ) {
      return res
        .status(422)
        .json({ error: "booking_total_value is required and must be >= 0" });
    }

    if (advance_payment && (isNaN(advance_payment) || Number(advance_payment) < 0)) {
      return res.status(422).json({ error: "advance_payment must be >= 0" });
    }

    if (payment_method && typeof payment_method !== "string") {
      return res.status(422).json({ error: "payment_method must be a string" });
    }

    if (notes && typeof notes !== "string") {
      return res.status(422).json({ error: "notes must be a string" });
    }

    if (!category_name || typeof category_name !== "string") {
      return res
        .status(422)
        .json({ error: "category_name is required and must be a string" });
    }

    // ✅ Validate priority
    const validPriorities = ["low", "medium", "high"];
    if (!validPriorities.includes(priority)) {
      return res.status(422).json({ error: "priority must be one of: low, medium, high" });
    }

    // ✅ Determine event owner (if member, use owner's ID)
    let ownerId = user._id;
    const familyPermission = await FamilyPermission.findOne({ member_id: user._id });
    if (familyPermission) {
      ownerId = familyPermission.owner_id;
    }

    // ✅ Access check
    const hasWriteAccess = await checkAccess(user._id, ownerId, "write");
    if (!hasWriteAccess) {
      return res
        .status(403)
        .json({ error: "You do not have permission to create an event (read-only access)" });
    }

    // ✅ Find or Create Category
    let category = await Category.findOne({
      name: category_name.trim(),
      is_deleted: false,
    });

    if (!category) {
      category = await Category.create({
        name: category_name.trim(),
        status: 1,
        is_deleted: false,
      });
    }

    // ✅ Create Event with priority
    const event = await Event.create({
      user_id: ownerId,
      event_name,
      contact_mobile,
      booking_total_value,
      advance_payment,
      payment_method,
      notes,
      category_id: category._id,
      created_by: user._id,
      priority, // ✅ added
    });

    // ✅ Create Transaction if advance_payment > 0
    if (advance_payment > 0) {
      await Transaction.create({
        event_id: event._id,
        amount: advance_payment,
        payment_method,
        note: "Advance payment (initial)",
        added_by: user._id,
      });
    }

    res.status(201).json({
      message: "Event created successfully",
      event,
      category: category.name,
    });
  } catch (err) {
    console.error("Error creating event:", err);
    res.status(500).json({ error: "Server error" });
  }
};
/**
 * @swagger
 * /api/events/{id}/update:
 *   put:
 *     summary: Update status or priority (or both) of an event
 *     tags: [Events]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Event ID
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: number
 *                 enum: [0, 1, 2]
 *                 description: "0 = pending, 1 = active, 2 = completed"
 *               priority:
 *                 type: string
 *                 enum: [low, medium, high]
 *     responses:
 *       200:
 *         description: Event updated successfully
 *       400:
 *         description: Nothing to update
 *       403:
 *         description: Access denied
 *       404:
 *         description: Event not found
 */export const updateEventStatusPriority = async (req, res) => {
  try {
    const user = req.user;
    const { id } = req.params;
    const { status, priority } = req.body;

    // ✅ Ensure at least one field is provided
    if (status === undefined && priority === undefined) {
      return res.status(400).json({
        error: "Please provide at least one field to update: status or priority",
      });
    }

    // ✅ Validate inputs
    const validStatus = [0, 1, 2];
    const validPriorities = ["low", "medium", "high"];

    if (status !== undefined && !validStatus.includes(Number(status))) {
      return res.status(422).json({ error: "Invalid status (must be 0, 1, or 2)" });
    }

    if (priority !== undefined && !validPriorities.includes(priority)) {
      return res.status(422).json({ error: "Invalid priority (must be low, medium, or high)" });
    }

    // ✅ Determine event owner (handle family access)
    let ownerId = user._id;
    const familyPermission = await FamilyPermission.findOne({ member_id: user._id });
    if (familyPermission) {
      ownerId = familyPermission.owner_id;
    }

    // ✅ Access check
    const hasWriteAccess = await checkAccess(user._id, ownerId, "write");
    if (!hasWriteAccess) {
      return res
        .status(403)
        .json({ error: "You do not have permission to update this event (read-only access)" });
    }

    // ✅ Find event and ensure ownership
    const event = await Event.findOne({ _id: id, user_id: ownerId });
    if (!event) {
      return res.status(404).json({ error: "Event not found or access denied" });
    }

    // ✅ Update only provided fields
    if (status !== undefined) event.status = status;
    if (priority !== undefined) event.priority = priority;

    event.updated_by = user._id; // optional audit
    await event.save();

    // -------------------------------
    // 🔔 OneSignal Notification Setup
    // -------------------------------
 const messageParts = [];

// Map numeric status to text
const statusMap = {
  0: "inactive",
  1: "pending",
  2: "completed",
};

// Add status part
if (status !== undefined) {
  const statusText = statusMap[status] || status;
  if (status === 2) {
    messageParts.push(`completed the event`);
  } else if (status === 1) {
    messageParts.push(`marked as pending`);
  } else if (status === 0) {
    messageParts.push(`set to inactive`);
  } else {
    messageParts.push(`status updated to ${statusText}`);
  }
}

// Add priority part
if (priority !== undefined) {
  messageParts.push(`priority set to ${priority}`);
}

// Final message
const message = `${user.fullname} ${event.event_name}: ${messageParts.join(", ")}.`;
    // Find all users who should get the notification
    const familyMembers = await FamilyPermission.find({
      owner_id: event.user_id,
      permission: { $in: ["owner", "write"] },
    }).select("member_id");

    // Combine owner + permitted members
    const userIdsToNotify = [
      event.user_id.toString(),
      ...familyMembers.map((f) => f.member_id.toString()),
    ];

    // Remove duplicates AND exclude the current user
    const uniqueUserIds = [...new Set(userIdsToNotify)].filter(
      (uid) => uid !== user._id.toString()
    );

    console.log("Users to notify (excluding sender):", uniqueUserIds);

    // Store notifications in DB
    await NotificationModel.insertMany(
      uniqueUserIds.map((uid) => ({
        user_id: uid,
        title: "Event Updated",
        message,
      }))
    );

    // Send OneSignal notification
    try {

      const notification = new Notification();
      notification.app_id = process.env.ONESIGNAL_APP_ID;
      notification.headings = { en: "Event Status Changes" };
      notification.contents = { en: message };
      notification.include_aliases = {
        external_id: uniqueUserIds  // array of user IDs
      };
      notification.target_channel = "push";  // REQUIRED when using include_aliases

      try {
        const response = await oneSignalClient.createNotification(notification);

        console.log("✅ Notification ID:", response.id);
        console.log("📊 Recipients:", response.recipients || 0);

        // If you have errors in the response
        if (response.errors) {
          console.log("❌ Errors:", response.errors);
        }

        // To get detailed delivery stats, use View Message API
        // Wait a few seconds for processing, then:
        // GET https://onesignal.com/api/v1/notifications/{response.id}?app_id={YOUR_APP_ID}

      } catch (error) {
        console.error("❌ Failed to send:", error);
      }

      return res.status(201).json({
        transaction,
        notified_users: uniqueUserIds,
        message: `Payment added & notifications sent successfully.`,
      });
    } catch (err) {
      console.error("❌ OneSignal error:", err.response?.body || err.message);
      return res.status(201).json({
        event,
        notified_users: uniqueUserIds,
        message: `Payment added but OneSignal notification failed.`,
      });
    }

    // -------------------------------
    res.status(200).json({
      message: "Event updated successfully & notifications sent",
      event,
      notified_users: uniqueUserIds,
    });
  } catch (error) {
    console.error("Error updating event:", error);
    res.status(500).json({ error: "Server error" });
  }
};

/**
 * @swagger
 * /api/events/{id}:
 *   get:
 *     summary: Get a single event with transactions
 *     tags: [Events]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: Event ID
 *     responses:
 *       200:
 *         description: Event details with transactions
 *       403:
 *         description: Permission denied
 *       404:
 *         description: Event not found
 */
export const getEventById = async (req, res) => {
  try {
    const user = req.user;
    const event = await Event.findById(req.params.id).populate("user_id");
    if (!event) return res.status(404).json({ error: "Event not found" });

    const canAccess = await checkAccess(user._id, event.user_id._id, "read");
    if (!canAccess) return res.status(403).json({ error: "Permission denied" });

    const transactions = await Transaction.find({ event_id: event._id, deleted_at: null });
    res.json({ ...event.toObject(), transactions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * @swagger
 * /api/events/{id}:
 *   put:
 *     summary: Update an event
 *     tags: [Events]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: Event ID
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               event_name:
 *                 type: string
 *               contact_mobile:
 *                 type: string
 *               booking_total_value:
 *                 type: number
 *               advance_payment:
 *                 type: number
 *               payment_method:
 *                 type: string
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Event updated
 *       403:
 *         description: Permission denied
 *       404:
 *         description: Event not found
 */
export const updateEvent = async (req, res) => {
  try {
    const user = req.user;
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ error: "Event not found" });

    const canEdit = await checkAccess(user._id, event.user_id, "write");
    if (!canEdit) return res.status(403).json({ error: "Permission denied" });

    Object.assign(event, req.body);
    await event.save();

    res.json({ message: "Event updated", event });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

/**
 * @swagger
 * /api/events/{id}:
 *   delete:
 *     summary: Delete an event
 *     tags: [Events]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: Event ID
 *     responses:
 *       200:
 *         description: Event deleted
 *       403:
 *         description: Permission denied
 *       404:
 *         description: Event not found
 */
export const deleteEvent = async (req, res) => {
  try {
    const user = req.user;
    const event = await Event.findById(req.params.id);

    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }

    // ✅ Check permission
    const canDelete = await checkAccess(user._id, event.user_id, "write");
    if (!canDelete) {
      return res.status(403).json({ error: "Permission denied" });
    }

    // ✅ Soft delete instead of actual delete
    if (event.is_deleted) {
      return res.status(400).json({ error: "Event already deleted" });
    }

    event.is_deleted = true;
    event.deleted_at = new Date();
    await event.save();

    res.json({ message: "Event soft deleted successfully" });
  } catch (err) {
    console.error("Error deleting event:", err);
    res.status(500).json({ error: err.message });
  }
};



/**
 * @swagger
 * /api/categories:
 *   get:
 *     summary: Get list of all categories
 *     tags: [Categories]
 *     security:
 *       - bearerAuth: []
 *     description: Retrieve all active (non-deleted) categories sorted by creation date (newest first).
 *     responses:
 *       200:
 *         description: List of categories retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 count:
 *                   type: number
 *                   example: 2
 *                 categories:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                         example: "6719e3b21a8c2e0b6c9b12f5"
 *                       name:
 *                         type: string
 *                         example: "Home Care"
 *                       icon:
 *                         type: string
 *                         nullable: true
 *                         example: "https://cdn.example.com/icons/home.png"
 *                       status:
 *                         type: number
 *                         description: 0 = inactive, 1 = active, 2 = archived
 *                         example: 1
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                         example: "2025-10-23T05:45:00.000Z"
 *       500:
 *         description: Server error
 */

export const getCategories = async (req, res) => {
  try {
    // ✅ Fetch all non-deleted categories (default filter already applies from schema)
    const categories = await Category.find()
      .sort({ createdAt: -1 }) // newest first
      .lean(); // plain JS objects

    res.json({
      success: true,
      count: categories.length,
      categories: categories.map((cat) => ({
        _id: cat._id,
        name: cat.name,
        icon: cat.icon,
        status: cat.status,
        createdAt: cat.createdAt,
      })),
    });
  } catch (err) {
    console.error("Error fetching categories:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
};

/**
 * @swagger
 * /api/search-categories:
 *   get:
 *     summary: Get list of categories with optional filters
 *     tags: [Categories]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search categories by name (case-insensitive, partial match)
 *       - in: query
 *         name: status
 *         schema:
 *           type: integer
 *           enum: [0, 1, 2]
 *         description: Filter by category status (0=inactive,1=active,2=archived)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Maximum number of categories to return
 *     responses:
 *       200:
 *         description: List of categories retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 count:
 *                   type: integer
 *                   example: 10
 *                 categories:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                         example: "6719e3b21a8c2e0b6c9b12f5"
 *                       name:
 *                         type: string
 *                         example: "Home Care"
 *                       icon:
 *                         type: string
 *                         nullable: true
 *                         example: "https://cdn.example.com/icons/home.png"
 *                       status:
 *                         type: integer
 *                         description: 0=inactive,1=active,2=archived
 *                         example: 1
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                         example: "2025-10-23T05:45:00.000Z"
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "Server error"
 */

export const getSearcCategories = async (req, res) => {
  try {
    const { search = "", status, limit = 20 } = req.query;

    const query = { is_deleted: false };

    // Filter by status if provided
    if (status !== undefined) {
      query.status = Number(status);
    }

    // Search by name (case-insensitive, partial match)
    if (search) {
      query.name = { $regex: search, $options: "i" };
    }

    // Fetch categories with limit & newest first
    const categories = await Category.find(query)
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .lean();

    res.json({
      success: true,
      count: categories.length,
      categories
    });
  } catch (err) {
    console.error("Error fetching categories:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
};

/**
 * @swagger
 * /api/events/{id}/payments:
 *   post:
 *     summary: Add a payment to an event
 *     tags: [Events]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: Event ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               amount:
 *                 type: number
 *               payment_method:
 *                 type: string
 *               reference:
 *                 type: string
 *               note:
 *                 type: string
 *     responses:
 *       201:
 *         description: Payment added successfully
 *       403:
 *         description: Permission denied
 *       404:
 *         description: Event not found
 */


// export const addPayment = async (req, res) => {
//   try {
//     const user = req.user;
//     const { amount, payment_method, reference, note } = req.body;

//     // 1️⃣ Fetch event
//     const event = await Event.findById(req.params.id);
//     if (!event) return res.status(404).json({ error: "Event not found" });

//     // 2️⃣ Permission check
//     const canAdd = await checkAccess(user._id, event.user_id, "write");
//     if (!canAdd) return res.status(403).json({ error: "Permission denied" });

//     // 3️⃣ Create transaction
//     const transaction = await Transaction.create({
//       event_id: event._id,
//       added_by: user._id,
//       amount,
//       payment_method,
//       reference,
//       note,
//     });

//     // 4️⃣ Create notification message
//     const message = `${user.fullname} added a payment of ₹${amount} for ${event.event_name}.`;

//     // 5️⃣ Save DB notifications (optional for future external_id logic)
//     await NotificationModel.create({
//       user_id: event.user_id,
//       title: "New Payment Added",
//       message,
//     });

//     // 6️⃣ Send OneSignal notification to all users (temporary)
//     try {
//       const notification = new Notification();
//       notification.app_id = process.env.ONESIGNAL_APP_ID;
//       notification.headings = { en: "New Payment Added" };
//       notification.contents = { en: message };

//       // 👇 For now, send to everyone
//       notification.included_segments = ["All"];

//       const response = await oneSignalClient.createNotification(notification);

//       console.log("✅ OneSignal sent:", response?.id || "Success");

//       return res.status(201).json({
//         transaction,
//         message: `Payment added. OneSignal notification sent successfully.`,
//       });
//     } catch (err) {
//       console.error("❌ OneSignal error:", err.response?.body || err.message);
//       return res.status(201).json({
//         transaction,
//         message: `Payment added. OneSignal notification failed.`,
//       });
//     }
//   } catch (err) {
//     console.error("❌ addPayment Error:", err);
//     return res.status(400).json({ error: err.message });
//   }
// };



export const addPayment = async (req, res) => {
  try {
    const user = req.user;
    const { amount, payment_method, reference, note } = req.body;

    // 1️⃣ Fetch event
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ error: "Event not found" });

    // 2️⃣ Permission check
    const canAdd = await checkAccess(user._id, event.user_id, "write");
    if (!canAdd) return res.status(403).json({ error: "Permission denied" });

    // 3️⃣ Create transaction
    const transaction = await Transaction.create({
      event_id: event._id,
      added_by: user._id,
      amount,
      payment_method,
      reference,
      note,
    });

    // 4️⃣ Create notification message
    const message = `${user.fullname} added a payment of ₹${amount} for ${event.event_name}.`;

    // 5️⃣ Find all users who should get the notification
    const familyMembers = await FamilyPermission.find({
      owner_id: event.user_id,
      permission: { $in: ["owner", "write"] }, // 👈 send to all co-owners/writers
    }).select("member_id");

    // Combine owner + permitted members (unique)
    // Combine owner + permitted members
    const userIdsToNotify = [
      event.user_id.toString(),
      ...familyMembers.map((f) => f.member_id.toString()),
    ];

    // Remove duplicates AND exclude the current user
    const uniqueUserIds = [...new Set(userIdsToNotify)].filter(
      (uid) => uid !== user._id.toString()
    );

    console.log("Users to notify (excluding sender):", uniqueUserIds);


    // 6️⃣ Store in DB notifications
    await NotificationModel.insertMany(
      uniqueUserIds.map((uid) => ({
        user_id: uid,
        title: "New Payment Added",
        message,
      }))
    );

    // 7️⃣ Send OneSignal notification
    try {

      const notification = new Notification();
      notification.app_id = process.env.ONESIGNAL_APP_ID;
      notification.headings = { en: "New Payment Added" };
      notification.contents = { en: message };
      notification.include_aliases = {
        external_id: uniqueUserIds  // array of user IDs
      };
      notification.target_channel = "push";  // REQUIRED when using include_aliases

      try {
        const response = await oneSignalClient.createNotification(notification);

        console.log("✅ Notification ID:", response.id);
        console.log("📊 Recipients:", response.recipients || 0);

        // If you have errors in the response
        if (response.errors) {
          console.log("❌ Errors:", response.errors);
        }

        // To get detailed delivery stats, use View Message API
        // Wait a few seconds for processing, then:
        // GET https://onesignal.com/api/v1/notifications/{response.id}?app_id={YOUR_APP_ID}

      } catch (error) {
        console.error("❌ Failed to send:", error);
      }

      return res.status(201).json({
        transaction,
        notified_users: uniqueUserIds,
        message: `Payment added & notifications sent successfully.`,
      });
    } catch (err) {
      console.error("❌ OneSignal error:", err.response?.body || err.message);
      return res.status(201).json({
        transaction,
        notified_users: uniqueUserIds,
        message: `Payment added but OneSignal notification failed.`,
      });
    }
  } catch (err) {
    console.error("❌ addPayment Error:", err);
    return res.status(400).json({ error: err.message });
  }
};

/**
 * @swagger
 * /api/events/{id}/payments/{paymentId}:
 *   put:
 *     summary: Update a transaction (soft delete old + create new)
 *     tags:
 *       - Events
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: Event ID
 *       - in: path
 *         name: paymentId
 *         schema:
 *           type: string
 *         required: true
 *         description: Payment (transaction) ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               amount:
 *                 type: number
 *                 format: float
 *                 description: Updated payment amount
 *               payment_method:
 *                 type: string
 *                 description: Updated payment method
 *               reference:
 *                 type: string
 *                 description: Updated reference note
 *               note:
 *                 type: string
 *                 description: Updated note
 *             example:
 *               amount: 1200.50
 *               payment_method: "UPI"
 *               reference: "Payment corrected"
 *               note: "Updated payment after verification"
 *     responses:
 *       200:
 *         description: Old transaction soft deleted and new transaction created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 new_transaction:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                     event_id:
 *                       type: string
 *                     added_by:
 *                       type: string
 *                     amount:
 *                       type: number
 *                     payment_method:
 *                       type: string
 *                     reference:
 *                       type: string
 *                     note:
 *                       type: string
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       403:
 *         description: Permission denied
 *       404:
 *         description: Event or Transaction not found
 *       400:
 *         description: Bad request / validation error
 */

export const updatePayment = async (req, res) => {
  try {
    const user = req.user; // from auth middleware
    const { amount, payment_method, reference, note } = req.body;
    const { id: eventId, paymentId } = req.params;

    // ✅ Fetch event
    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ error: "Event not found" });

    // ✅ Check write permission
    const canUpdate = await checkAccess(user._id, event.user_id, "write");
    if (!canUpdate) return res.status(403).json({ error: "Permission denied" });

    // ✅ Find existing transaction
    const transaction = await Transaction.findOne({
      _id: paymentId,
      event_id: eventId,
    });
    if (!transaction) return res.status(404).json({ error: "Transaction not found" });

    // ✅ Soft delete old transaction by setting deleted_at
    transaction.deleted_at = new Date();
    const deleteReason = `Soft deleted because user requested update at ${transaction.deleted_at.toLocaleString()}`;
    transaction.reference = transaction.reference
      ? `${transaction.reference} | ${deleteReason}`
      : deleteReason;
    await transaction.save();

    // ✅ Create new transaction and link old transaction
    const newTransaction = await Transaction.create({
      event_id: eventId,
      added_by: user._id,
      amount: amount ?? transaction.amount,
      payment_method: payment_method ?? transaction.payment_method,
      note: note ?? transaction.note,
      reference: reference
        ? `${reference} | Soft deleted transaction id: ${transaction._id}`
        : `Soft deleted transaction id: ${transaction._id}`,
      old_transaction_id: transaction._id, // Optional: keep track of the original transaction
    });

    return res.status(200).json({
      message: "Transaction updated: old transaction soft deleted, new one created.",
      new_transaction: newTransaction,
    });
  } catch (err) {
    console.error(err);
    return res.status(400).json({ error: err.message });
  }
};

/**
 * @swagger
 * /api/events/{id}/payments/{paymentId}:
 *   delete:
 *     summary: Soft delete a transaction
 *     tags:
 *       - Events
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: Event ID
 *       - in: path
 *         name: paymentId
 *         schema:
 *           type: string
 *         required: true
 *         description: Payment (transaction) ID
 *     responses:
 *       200:
 *         description: Transaction soft deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 deleted_transaction:
 *                   type: object
 *       403:
 *         description: Permission denied
 *       404:
 *         description: Event or Transaction not found
 *       400:
 *         description: Bad request
 */

export const deletePayment = async (req, res) => {
  try {
    const user = req.user; // from auth middleware
    const { id: eventId, paymentId } = req.params;

    // 1️⃣ Fetch event
    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ error: "Event not found" });

    // 2️⃣ Check write permission
    const canDelete = await checkAccess(user._id, event.user_id, "write");
    if (!canDelete) return res.status(403).json({ error: "Permission denied" });

    // 3️⃣ Find transaction
    const transaction = await Transaction.findOne({
      _id: paymentId,
      event_id: eventId,
    });
    if (!transaction) return res.status(404).json({ error: "Transaction not found" });

    // 4️⃣ Soft delete by setting deleted_at and updating reference
    transaction.deleted_at = new Date();
    const deleteReason = `Soft deleted by user at ${transaction.deleted_at.toLocaleString()}`;
    transaction.reference = transaction.reference
      ? `${transaction.reference} | ${deleteReason}`
      : deleteReason;

    await transaction.save();

    return res.status(200).json({
      message: "Transaction soft deleted successfully.",
      deleted_transaction: transaction,
    });
  } catch (err) {
    console.error("❌ deletePayment Error:", err);
    return res.status(400).json({ error: err.message });
  }
};

