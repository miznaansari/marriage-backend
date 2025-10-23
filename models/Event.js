import mongoose from "mongoose";

const eventSchema = new mongoose.Schema(
  {
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    event_name: { type: String, required: true },
    contact_mobile: { type: String, required: true },
    booking_total_value: { type: Number, required: true },
    advance_payment: { type: Number, default: 0 },
    payment_method: { type: String },
    notes: { type: String },

    // ✅ Reference to Category
    category_id: { type: mongoose.Schema.Types.ObjectId, ref: "Category", required: true },

    // ✅ Creator
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    // ✅ Event status
    status: { type: Number, enum: [0, 1, 2], default: 1 }, // 0 = draft, 1 = active, 2 = completed

    // ✅ Priority level
    priority: {
      type: String,
      enum: ["low", "medium", "high"], // fixed allowed values
      default: "medium",
    },

    // ✅ Soft delete fields
    is_deleted: { type: Boolean, default: false },
    deleted_at: { type: Date, default: null },
  },
  { timestamps: true }
);

// ✅ Automatically exclude deleted events from queries
eventSchema.pre(/^find/, function (next) {
  if (!this.getQuery().includeDeleted) {
    this.where({ is_deleted: false });
  }
  next();
});

export default mongoose.model("Event", eventSchema);
