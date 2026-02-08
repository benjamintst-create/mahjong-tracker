import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCSgwoO16m8lEvnU6m4w2cPXhE2ABsN-q8",
  authDomain: "mahjongscore-db18e.firebaseapp.com",
  projectId: "mahjongscore-db18e",
  storageBucket: "mahjongscore-db18e.firebasestorage.app",
  messagingSenderId: "169309097235",
  appId: "1:169309097235:web:f51fdf44645f39fb2d5ee6",
  measurementId: "G-STYMGJM9VB"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
