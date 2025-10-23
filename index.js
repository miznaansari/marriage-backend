import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors"; // ✅ import cors
import { swaggerDocs } from "./swagger.js";
import * as AuthController from "./controllers/authController.js";
import eventRoutes from "./routes/eventRoutes.js";

dotenv.config();

const app = express();
app.use(express.json());

// ✅ Enable CORS for all origins
app.use(cors({
  origin: "*", // or specify your frontend URL e.g. "http://localhost:3000"
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

mongoose.connect(process.env.MONGO_URI, { dbName: "auth_demo" })
  .then(() => console.log("✅ MongoDB connected"))
  .catch(console.error);

// ✅ Swagger route
app.use("/api-docs", ...swaggerDocs);

// ✅ Routes
app.post("/api/signup", AuthController.signup);
app.post("/api/login", AuthController.login);
app.post("/api/verify-2fa", AuthController.verify2FA);
app.post("/api/signup/request", AuthController.signupRequest);
app.post("/api/signup/verify-otp", AuthController.signupVerifyOtp);
app.post("/api/forget-password/reset", AuthController.forgetPasswordReset);
app.post("/api/forget-password/request-otp", AuthController.forgetPasswordRequestOtp);
app.use("/api", eventRoutes);




app.listen(4000, () => console.log("🚀 Server running on http://localhost:4000"));
