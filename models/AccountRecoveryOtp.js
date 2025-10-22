import mongoose from "mongoose";

const otpSchema = new mongoose.Schema({
  identifier: { type: String, required: true },
  otp: { type: String, required: true },
  method: { type: String, enum: ["email", "mobile"], required: true },
  purpose: { type: String, enum: ["recovery", "forget_password", "2fa", "signup"], required: true },
  is_verified: { type: Boolean, default: false },
  extra_data: { type: Object },
  expires_at: { type: Date, required: true },
}, { timestamps: true });

otpSchema.methods.isExpired = function() {
  return new Date() > this.expires_at;
};

export default mongoose.model("AccountRecoveryOtp", otpSchema);
