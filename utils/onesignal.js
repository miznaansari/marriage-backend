// oneSignalClient.js
import * as dotenv from "dotenv";
dotenv.config();

import OneSignalPkg from "@onesignal/node-onesignal";
const { createConfiguration, DefaultApi } = OneSignalPkg;

console.log("OneSignal App ID:", process.env.ONESIGNAL_APP_ID);
console.log("OneSignal API Key:", process.env.ONESIGNAL_APP_KEY);

// ✅ Ensure .env values exist
if (!process.env.ONESIGNAL_APP_ID || !process.env.ONESIGNAL_APP_KEY) {
  throw new Error("❌ Missing OneSignal environment variables in .env");
}

// ✅ Create OneSignal API client configuration
const configuration = createConfiguration({
  restApiKey: process.env.ONESIGNAL_APP_KEY,
});

// ✅ Create and export reusable OneSignal client
export const oneSignalClient = new DefaultApi(configuration);
export const ONE_SIGNAL_APP_ID = process.env.ONESIGNAL_APP_ID;
