import * as dotenv from 'dotenv';
dotenv.config();

import OneSignalPkg from '@onesignal/node-onesignal';
const { createConfiguration, DefaultApi, Notification } = OneSignalPkg;

const configuration = createConfiguration({
  restApiKey: process.env.ONESIGNAL_APP_KEY,
});

const client = new DefaultApi(configuration);

async function sendTestNotification() {
  try {
    const notification = new Notification();
    notification.app_id = process.env.ONESIGNAL_APP_ID;
    notification.included_segments = ['All'];
    notification.headings = { en: 'Test Notification' };
    notification.contents = { en: 'Hello World!' };

    const response = await client.createNotification(notification);
    console.log('✅ Notification sent:', response);
  } catch (err) {
    console.error('❌ OneSignal error:', err.response?.body || err.message);
  }
}

sendTestNotification();
