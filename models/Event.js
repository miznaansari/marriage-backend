import mongoose from "mongoose";

const eventSchema = new mongoose.Schema(
  {
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    event_name: { type: String, default: null },
    contact_mobile: { type: String, default: null },
    booking_total_value: { type: Number, default: null },
    advance_payment: { type: Number, default: 0 }, // can keep 0 as default
    payment_method: { type: String, default: null },
    notes: { type: String, default: null },

    // Reference to Category
    category_id: { type: mongoose.Schema.Types.ObjectId, ref: "Category", default: null },

    // Creator
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

    // Event status
    status: { type: Number, enum: [0, 1, 2], default: 1 }, // 0 = draft, 1 = active, 2 = completed

    // Priority level
    priority: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
    },

    // Soft delete fields
    is_deleted: { type: Boolean, default: false },
    deleted_at: { type: Date, default: null },
  },
  { timestamps: true }
);

// Automatically exclude deleted events from queries
eventSchema.pre(/^find/, function (next) {
  if (!this.getQuery().includeDeleted) {
    this.where({ is_deleted: false });
  }
  next();
});

export default mongoose.model("Event", eventSchema);
