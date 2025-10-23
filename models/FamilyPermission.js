import mongoose from "mongoose";

const familyPermissionSchema = new mongoose.Schema(
  {
    owner_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    member_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    permission: {
      type: String,
      enum: ["read", "write", "owner"], // 👈 added 'owner'
      required: true,
    },
  },
  { timestamps: true }
);

export default mongoose.model("FamilyPermission", familyPermissionSchema);
