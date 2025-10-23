import bcrypt from "bcrypt";
import User from "../models/User.js";
import AccountRecoveryOtp from "../models/AccountRecoveryOtp.js";
import UserToken from "../models/UserToken.js";
import { generateToken } from "../utils/jwt.js";
import nodemailer from "nodemailer";
import { sendEmail } from "../utils/email.js"; // your email utility
/**
 * @swagger
 * tags:
 *   name: Authentication
 *   description: User authentication and account security APIs
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     SignupRequest:
 *       type: object
 *       required:
 *         - fullname
 *         - email
 *         - password
 *       properties:
 *         fullname:
 *           type: string
 *           example: John Doe
 *         email:
 *           type: string
 *           example: johndoe@example.com
 *         password:
 *           type: string
 *           example: MyStrongPass123
 *         profile_url:
 *           type: string
 *           example: https://example.com/profile.jpg
 *         dob:
 *           type: string
 *           format: date
 *           example: 2000-05-15
 *         mobile:
 *           type: string
 *           example: "9876543210"
 *
 *     SignupResponse:
 *       type: object
 *       properties:
 *         status:
 *           type: boolean
 *           example: true
 *         message:
 *           type: string
 *           example: User registered successfully
 *         data:
 *           $ref: '#/components/schemas/User'
 *
 *     LoginRequest:
 *       type: object
 *       required:
 *         - email
 *         - password
 *       properties:
 *         email:
 *           type: string
 *           example: johndoe@example.com
 *         password:
 *           type: string
 *           example: MyStrongPass123
 *
 *     LoginResponse:
 *       type: object
 *       properties:
 *         status:
 *           type: boolean
 *           example: true
 *         token:
 *           type: string
 *           example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *         expires_in:
 *           type: integer
 *           example: 2592000
 *         2fa_required:
 *           type: boolean
 *           example: false
 *
 *     Verify2FARequest:
 *       type: object
 *       required:
 *         - email
 *         - otp
 *       properties:
 *         email:
 *           type: string
 *           example: johndoe@example.com
 *         otp:
 *           type: string
 *           example: "123456"
 *
 *     Verify2FAResponse:
 *       type: object
 *       properties:
 *         status:
 *           type: boolean
 *           example: true
 *         token:
 *           type: string
 *           example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *         expires_in:
 *           type: integer
 *           example: 2592000
 */

// Mail setup (like Laravel Mail::raw)
const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465, // use 465 for SSL or 587 for TLS
    secure: true, // true for port 465, false for port 587
    auth: {
        user: 'miznaansari@gmail.com', // your Gmail
        pass: 'evuowhmpromvmhhl', // your App Password
    },
});

// Helper: send OTP
const sendOtp = async (method, identifier, otp) => {
    if (method === "email") {
        await transporter.sendMail({
            from: `"Auth System" <${process.env.MAIL_USER}>`,
            to: identifier,
            subject: "Your OTP Code",
            text: `Your OTP is: ${otp}`,
        });
    } else {
        console.log(`📱 SMS to ${identifier}: ${otp}`); // integrate MSG91 here
    }
};

/**
 * @swagger
 * /api/signup:
 *   post:
 *     summary: Register a new user
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SignupRequest'
 *     responses:
 *       201:
 *         description: User registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SignupResponse'
 *       422:
 *         description: Validation error
 */
export const signup = async (req, res) => {
    try {
        const { fullname, email, password, profile_url, dob, mobile } = req.body;

        const hashed = await bcrypt.hash(password, 10);
        const user = await User.create({ fullname, email, password: hashed, profile_url, dob, mobile });

        res.status(201).json({ status: true, message: "User registered successfully", data: user });
    } catch (e) {
        res.status(422).json({ status: false, message: e.message });
    }
};

/**
 * @swagger
 * /api/login:
 *   post:
 *     summary: Login user and return JWT token
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *     responses:
 *       200:
 *         description: Login successful or 2FA required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LoginResponse'
 *       401:
 *         description: Invalid credentials
 *       403:
 *         description: Account locked
 */

import FamilyPermission from "../models/FamilyPermission.js";


export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // ✅ Find user
    const user = await User.findOne({ email });
    if (!user)
      return res.status(401).json({ status: false, message: "Invalid credentials" });

    // ✅ Check account lock
    if (user.isLocked()) {
      return res.status(403).json({
        status: false,
        message: `Account is locked. Try again after ${user.locked_until}`,
      });
    }

    // ✅ Check password
    const valid = await user.checkPassword(password);
    if (!valid) {
      await user.registerFailedLogin();
      return res.status(401).json({ status: false, message: "Invalid credentials" });
    }

    await user.resetFailedLogins();

    // ✅ Handle 2FA
    if (user.two_factor_enabled) {
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      await AccountRecoveryOtp.create({
        identifier: user.email,
        otp,
        method: "email",
        purpose: "2fa",
        expires_at: new Date(Date.now() + 10 * 60 * 1000), // 10 mins
      });
      await sendOtp("email", user.email, otp);

      return res.json({
        status: true,
        message: "Two-factor OTP sent",
        "2fa_required": true,
        user_id: user._id,
      });
    }

    // ✅ Generate JWT token
    const token = generateToken(user);
    await UserToken.create({ user_id: user._id, token });

    // ✅ Determine effective permission
    let permission = "read"; // default

    const ownerExists = await FamilyPermission.exists({ owner_id: user._id });
    if (ownerExists) {
      permission = "owner";
    } else {
      const memberPerm = await FamilyPermission.findOne({ member_id: user._id }).select("permission");
      if (memberPerm) permission = memberPerm.permission; // "write" or "read"
    }

    // ✅ Return response
    return res.json({
      status: true,
      token,
      user_id: user._id,
      expires_in: 2592000, // 30 days
      permission,          // "owner" | "write" | "read"
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};


/**
 * @swagger
 * /api/verify-2fa:
 *   post:
 *     summary: Verify 2FA OTP and issue JWT token
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Verify2FARequest'
 *     responses:
 *       200:
 *         description: OTP verified successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Verify2FAResponse'
 *       400:
 *         description: Invalid or expired OTP
 */
export const verify2FA = async (req, res) => {
    const { email, otp } = req.body;
    const record = await AccountRecoveryOtp.findOne({
        identifier: email, otp, purpose: "2fa", is_verified: false,
    }).sort({ createdAt: -1 });

    if (!record || record.isExpired())
        return res.status(400).json({ status: false, message: "Invalid or expired OTP" });

    record.is_verified = true;
    await record.save();

    const user = await User.findOne({ email });
    const token = generateToken(user);
    await UserToken.create({ user_id: user._id, token });

    res.json({ status: true, token, expires_in: 2592000 });
};

/**
 * @swagger
 * /api/signup/request:
 *   post:
 *     summary: Request signup OTP
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fullname:
 *                 type: string
 *               email:
 *                 type: string
 *               mobile:
 *                 type: string
 *               password:
 *                 type: string
 *               dob:
 *                 type: string
 *                 format: date
 *               profile_url:
 *                 type: string
 *     responses:
 *       200:
 *         description: OTP sent successfully
 */
export const signupRequest = async (req, res) => {
  try {
    const { fullname, email, mobile, password, dob, profile_url } = req.body;

    if (!fullname || !password)
      return res.status(422).json({ status: false, message: "Name & password required" });

    if (!email )
      return res.status(422).json({ status: false, message: "Either email or mobile required" });

    // 🔍 Check if email or mobile already exists
    const existingUser = await User.findOne({
      $or: [
        ...(email ? [{ email }] : []),
        ...(mobile ? [{ mobile }] : []),
      ],
    });

    if (existingUser) {
      return res.status(409).json({
        status: false,
        message: "User already registered with this email or mobile.",
      });
    }

    const otp = Math.floor(100000 + Math.random() * 900000);

    // hash password before storing in extra_data
    const hashedPassword = await bcrypt.hash(password, 10);

    await AccountRecoveryOtp.create({
      identifier: email ?? mobile,
      otp,
      method: email ? "email" : "mobile",
      purpose: "signup",
      expires_at: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
      extra_data: { fullname, password: hashedPassword, dob, profile_url },
    });

    if (email) {
      await transporter.verify();
      console.log("✅ Gmail SMTP ready to send mail");

      await transporter.sendMail({
        from: `"Auth System" <${process.env.MAIL_USER}>`,
        to: email,
        subject: "Signup OTP",
        text: `Your signup OTP is: ${otp}`,
      });
    } else {
      console.log(`📱 Send SMS OTP ${otp} to ${mobile}`);
    }

    res.json({ status: true, message: "OTP sent successfully." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: false, message: "Server error" });
  }
};



/**
 * @swagger
 * /api/signup/verify-otp:
 *   post:
 *     summary: Verify signup OTP
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               identifier:
 *                 type: string
 *               otp:
 *                 type: string
 *     responses:
 *       201:
 *         description: User created successfully
 */
export const signupVerifyOtp = async (req, res) => {
    try {
        const { identifier, otp } = req.body;
        if (!identifier || !otp)
            return res.status(422).json({ status: false, message: "Identifier & OTP required" });

        const otpRecord = await AccountRecoveryOtp.findOne({
            identifier,
            otp,
            purpose: "signup",
            is_verified: false,
        }).sort({ createdAt: -1 });

        if (!otpRecord || new Date(otpRecord.expires_at) < new Date()) {
            return res.status(400).json({ status: false, message: "Invalid or expired OTP" });
        }

        const data = otpRecord.extra_data;
        if (!data)
            return res.status(400).json({ status: false, message: "Invalid signup session data" });

        const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier);

        const user = await User.create({
            fullname: data.fullname,
            email: isEmail ? identifier : null,
            // mobile: !isEmail ? identifier : null,
            password: data.password,
            dob: data.dob ?? null,
            profile_url: data.profile_url ?? null,
            mobile_verified: !isEmail,
            email_verified_at: isEmail ? new Date() : null,
        });

        otpRecord.is_verified = true;
        await otpRecord.save();

        res.status(201).json({ status: true, message: "User registered successfully", data: user });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: false, message: "Server error" });
    }
};


/**
 * @swagger
 * /api/forget-password/request-otp:
 *   post:
 *     summary: Request OTP for password reset
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               identifier:
 *                 type: string
 *               method:
 *                 type: string
 *                 enum: [email, mobile]
 *     responses:
 *       200:
 *         description: OTP sent successfully
 */
export const forgetPasswordRequestOtp = async (req, res) => {
  try {
    const { identifier, method } = req.body;
    if (!identifier || !["email", "mobile"].includes(method)) {
      return res.status(400).json({ status: false, message: "Invalid input" });
    }

    const user = await User.findOne(
      method === "email" ? { email: identifier } : { mobile: identifier }
    );

    if (!user) {
      return res.status(404).json({ status: false, message: "User not found" });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    await AccountRecoveryOtp.create({
      identifier,
      otp,
      method,
      purpose: "forget_password",
      expires_at: new Date(Date.now() + 10 * 60 * 1000),
    });

    if (method === "email") {
      await sendEmail(identifier, "Forget Password OTP", `Your OTP is ${otp}`);
    } else {
      await sendMsg91Otp(identifier, otp);
    }

    return res.json({ status: true, message: "OTP sent successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: false, message: "Server error" });
  }
};

/**
 * @swagger
 * /api/forget-password/reset:
 *   post:
 *     summary: Reset password with OTP
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               identifier:
 *                 type: string
 *               otp:
 *                 type: string
 *               method:
 *                 type: string
 *                 enum: [email, mobile]
 *               password:
 *                 type: string
 *               confirm_password:
 *                 type: string
 */
export const forgetPasswordReset = async (req, res) => {
  try {
    const { identifier, otp, method, password, password_confirmation } = req.body;
console.log( req.body)
    if (!identifier || !otp || !password || !password_confirmation) {
      return res.status(400).json({ status: false, message: "All fields required11" });
    }

    if (password !== password_confirmation) {
      return res.status(400).json({ status: false, message: "Passwords do not match" });
    }

    const otpRecord = await AccountRecoveryOtp.findOne({
      identifier,
      otp,
      method,
      purpose: "forget_password",
      is_verified: false,
    }).sort({ createdAt: -1 });

    if (!otpRecord || otpRecord.isExpired()) {
      return res.status(400).json({ status: false, message: "Invalid or expired OTP" });
    }

    const user = await User.findOne(
      method === "email" ? { email: identifier } : { mobile: identifier }
    );

    if (!user) {
      return res.status(404).json({ status: false, message: "User not found" });
    }

    const hashed = await bcrypt.hash(password, 10);
    user.password = hashed;
    await user.save();

    otpRecord.is_verified = true;
    await otpRecord.save();

    return res.json({ status: true, message: "Password reset successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: false, message: "Server error" });
  }
};