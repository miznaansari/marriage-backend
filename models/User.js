import mongoose from "mongoose";
import bcrypt from "bcrypt";

const userSchema = new mongoose.Schema({
  fullname: { type: String, required: true },
  email: { type: String, unique: true, sparse: true },
  mobile: { type: String, unique: true, sparse: true },
  password: { type: String, required: true },
  profile_url: { type: String },
  dob: { type: Date },
  two_factor_enabled: { type: Boolean, default: false },
  email_verified_at: { type: Date },
  mobile_verified: { type: Boolean, default: false },
  login_count: { type: Number, default: 0 },
  last_login_at: { type: Date },
  failed_login_attempts: { type: Number, default: 0 },
  locked_until: { type: Date, default: null },
  deleted_at: { type: Date, default: null },
}, { timestamps: true });

userSchema.methods.isLocked = function() {
  return this.locked_until && this.locked_until > new Date();
};

userSchema.methods.checkPassword = function(password) {
  return bcrypt.compare(password, this.password);
};

userSchema.methods.registerFailedLogin = function() {
  this.failed_login_attempts += 1;
  if (this.failed_login_attempts >= 5) {
    this.locked_until = new Date(Date.now() + 15 * 60 * 1000);
  }
  return this.save();
};

userSchema.methods.resetFailedLogins = function() {
  this.failed_login_attempts = 0;
  this.locked_until = null;
  return this.save();
};

export default mongoose.model("User", userSchema);
