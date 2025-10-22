import mongoose from "mongoose";

const userTokenSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  token: { type: String, required: true },
}, { timestamps: true });

export default mongoose.model("UserToken", userTokenSchema);
