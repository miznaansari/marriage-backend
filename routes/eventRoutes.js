import express from "express";
import {
  getEvents,
  createEvent,
  getEventById,
  updateEvent,
  deleteEvent,
  addPayment,
  updatePayment,
  getCategories,
  getSearcCategories,
  updateEventStatusPriority
} from "../controllers/EventController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import {
  giveFamilyAccess,
  fetchFamilyPermissions,
  editFamilyPermission,
} from "../controllers/familyController.js";

const router = express.Router();

// 🔹 Events
router.get("/events", authMiddleware, getEvents);
router.get("/categories", authMiddleware, getCategories);
router.get("/search-categories", authMiddleware, getSearcCategories);
router.put("/events/:id/update", authMiddleware, updateEventStatusPriority);
router.post("/events", authMiddleware, createEvent);
router.get("/events/:id", authMiddleware, getEventById);
router.put("/events/:id", authMiddleware, updateEvent);
router.delete("/events/:id", authMiddleware, deleteEvent);

// 🔹 Payments
router.post("/events/:id/payments", authMiddleware, addPayment);

// 🔹 Family routes
router.post("/family/share", authMiddleware, giveFamilyAccess);
router.get("/family", authMiddleware, fetchFamilyPermissions);
router.put("/family/permissions/:id", authMiddleware, editFamilyPermission);
// router.get("/events/:id/payments", payments); // if you create a `payments` method later
router.put("/events/:id/payments/:paymentId", authMiddleware, updatePayment);
export default router;
