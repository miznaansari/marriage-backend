import mongoose from "mongoose";

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },

    // ✅ icon instead of description (can be null or omitted)
    icon: { type: String, default: null },

    status: { type: Number, enum: [0, 1, 2], default: 1 }, // 0 = inactive, 1 = active, 2 = archived

    // ✅ Soft delete fields
    is_deleted: { type: Boolean, default: false },
    deleted_at: { type: Date, default: null },
  },
  { timestamps: true }
);

// ✅ Automatically exclude deleted categories from `find` queries
categorySchema.pre(/^find/, function (next) {
  if (!this.getQuery().includeDeleted) {
    this.where({ is_deleted: false });
  }
  next();
});

export default mongoose.model("Category", categorySchema);
