import mongoose from "mongoose";

const transactionSchema = new mongoose.Schema({
  event_id: { type: mongoose.Schema.Types.ObjectId, ref: "Event", required: true },
  added_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  amount: { type: Number, required: true },
  payment_method: { type: String },
  reference: { type: String },
  note: { type: String },
  deleted_at: { type: Date, default: null },
}, { timestamps: true });

export default mongoose.model("Transaction", transactionSchema);
