import FamilyPermission from "../models/FamilyPermission.js";
import User from "../models/User.js";
import Event from "../models/Event.js";

/**
 * @swagger
 * /family/share:
 *   post:
 *     summary: Give a family member access (owner only)
 *     tags: [Family]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - member_email
 *               - permission
 *             properties:
 *               member_email:
 *                 type: string
 *                 example: member@example.com
 *               permission:
 *                 type: string
 *                 enum: [read, write]
 *                 example: read
 *     responses:
 *       200:
 *         description: Family member access granted successfully
 *       400:
 *         description: Invalid input
 *       404:
 *         description: Member not found
 *       500:
 *         description: Server error
 */
export const giveFamilyAccess = async (req, res) => {
  try {
    const user = req.user; // owner
    const { member_email, permission } = req.body;

    if (!member_email || !permission)
      return res.status(400).json({ error: "member_email and permission are required" });

    // ✅ Allow 'owner' as valid permission
    if (!["read", "write", "owner"].includes(permission))
      return res.status(400).json({ error: "Invalid permission value" });

    // ✅ Prevent giving access to yourself
    if (member_email === user.email)
      return res.status(422).json({ error: "You cannot grant access to yourself" });

    const member = await User.findOne({ email: member_email });
    if (!member) return res.status(404).json({ error: "Member not found" });

    // ✅ If permission is 'owner', consider adding logic to transfer ownership (optional)
    if (permission === "owner") {
      // Example logic (optional):
      // await FamilyPermission.deleteMany({ owner_id: member._id });
      // Or just allow multiple owners — depends on your business rule
    }

    await FamilyPermission.findOneAndUpdate(
      { owner_id: user._id, member_id: member._id },
      { permission },
      { upsert: true, new: true }
    );

    res.json({ message: `Family member access (${permission}) granted successfully` });
  } catch (err) {
    console.error("Error in giveFamilyAccess:", err);
    res.status(500).json({ error: "Server error" });
  }
};


/**
 * @swagger
 * /family/permissions:
 *   get:
 *     summary: Fetch all family members and their permissions (owner only)
 *     tags: [Family]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of family permissions
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   member_id:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                         example: 67167a3a9b0c2b1a5d6e92c8
 *                       fullname:
 *                         type: string
 *                         example: John Doe
 *                       email:
 *                         type: string
 *                         example: john@example.com
 *                   permission:
 *                     type: string
 *                     example: read
 *       500:
 *         description: Server error
 */
export const fetchFamilyPermissions = async (req, res) => {
  try {
    const user = req.user;

    const permissions = await FamilyPermission.find({ owner_id: user._id })
      .populate("member_id", "fullname email")
      .select("member_id permission");

    res.json(permissions);
  } catch (err) {
    console.error("Error in fetchFamilyPermissions:", err);
    res.status(500).json({ error: "Server error" });
  }
};

/**
 * @swagger
 * /family/permissions/{id}:
 *   put:
 *     summary: Edit a family member’s permission (owner only)
 *     tags: [Family]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Family permission ID
 *         schema:
 *           type: string
 *           example: 67167a3a9b0c2b1a5d6e92c8
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - permission
 *             properties:
 *               permission:
 *                 type: string
 *                 enum: [read, write]
 *                 example: write
 *     responses:
 *       200:
 *         description: Family member permission updated successfully
 *       404:
 *         description: Permission not found
 *       500:
 *         description: Server error
 */
export const editFamilyPermission = async (req, res) => {
  try {
    const user = req.user;
    const { id } = req.params;
    const { permission } = req.body;

    // ✅ Allow read, write, and owner
    if (!["read", "write", "owner"].includes(permission))
      return res.status(400).json({ error: "Invalid permission" });

    // ✅ Ensure the logged-in user is the real owner of this permission record
    const perm = await FamilyPermission.findOne({
      _id: id,
      owner_id: user._id,
    });

    if (!perm)
      return res
        .status(404)
        .json({ error: "Family permission not found or not owned by you" });

    // ✅ Update permission
    perm.permission = permission;
    await perm.save();

    res.json({ message: `Family member permission updated to '${permission}' successfully` });
  } catch (err) {
    console.error("Error in editFamilyPermission:", err);
    res.status(500).json({ error: "Server error" });
  }
};


/**
 * @swagger
 * /events/search:
 *   get:
 *     summary: Search events accessible to the authenticated user (own + shared owners)
 *     tags: [Events]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         description: Search query for event title or note
 *         schema:
 *           type: string
 *           example: birthday
 *     responses:
 *       200:
 *         description: List of matched events
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   _id:
 *                     type: string
 *                     example: 67167a3a9b0c2b1a5d6e92c8
 *                   title:
 *                     type: string
 *                     example: Birthday Event
 *                   note:
 *                     type: string
 *                     example: Cake and decorations booked
 *                   user_id:
 *                     type: string
 *                     example: 67167a3a9b0c2b1a5d6e92c9
 *       422:
 *         description: Missing query parameter
 *       500:
 *         description: Server error
 */
export const searchEvent = async (req, res) => {
  try {
    const user = req.user;
    const query = req.query.q;

    if (!query)
      return res.status(422).json({ error: 'Query parameter "q" is required' });

    const sharedOwners = await FamilyPermission.find({
      member_id: user._id,
    }).distinct("owner_id");

    const ownerIds = [user._id, ...sharedOwners];

    const events = await Event.find({
      user_id: { $in: ownerIds },
      $or: [
        { title: { $regex: query, $options: "i" } },
        { note: { $regex: query, $options: "i" } },
      ],
    })
      .populate("transactions.addedBy")
      .sort({ createdAt: -1 });

    res.json(events);
  } catch (err) {
    console.error("Error in searchEvent:", err);
    res.status(500).json({ error: "Server error" });
  }
};
