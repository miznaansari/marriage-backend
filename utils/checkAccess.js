import FamilyPermission from "../models/FamilyPermission.js";

/**
 * Check if a user (memberId) has permission ('read' or 'write') for a resource owned by ownerId
 * @param {String|ObjectId} memberId - Current user id
 * @param {String|ObjectId} ownerId - Resource owner id
 * @param {"read"|"write"} required - Required access type
 * @returns {Promise<Boolean>}
 */
export const checkAccess = async (memberId, ownerId, required) => {
  // Owner always has full access
  if (memberId.toString() === ownerId.toString()) return true;

  // Find permission in FamilyPermission collection
  const perm = await FamilyPermission.findOne({
    owner_id: ownerId,
    member_id: memberId,
  });

  if (!perm) return false;

  if (required === "read" && ["read", "write"].includes(perm.permission)) return true;
  if (required === "write" && perm.permission === "write") return true;

  return false;
};
