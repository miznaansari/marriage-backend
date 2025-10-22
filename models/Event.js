import mongoose from "mongoose";

const eventSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  event_name: { type: String, required: true },
  contact_mobile: { type: String, required: true },
  booking_total_value: { type: Number, required: true },
  advance_payment: { type: Number, default: 0 },
  payment_method: { type: String },
  notes: { type: String },
}, { timestamps: true });

export default mongoose.model("Event", eventSchema);
