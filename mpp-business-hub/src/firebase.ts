import { initializeApp } from 'firebase/app';
import { browserLocalPersistence, getAuth, setPersistence } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

if (Object.values(firebaseConfig).some((value) => !value)) {
  throw new Error('Firebase web configuration is missing. Copy .env.example to .env.local and add the Business Hub web-app values.');
}

export const OWNER_EMAIL = 'dalia.abdalla@gmail.com';
export const auth = getAuth(initializeApp(firebaseConfig));
export const authReady = setPersistence(auth, browserLocalPersistence);
