import { connectFunctionsEmulator, getFunctions } from "firebase/functions";
import { firebaseApp } from "@/firebase/config";

const region = import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION?.trim() || "asia-northeast3";

export const functions = getFunctions(firebaseApp, region);

if (import.meta.env.VITE_FIREBASE_FUNCTIONS_EMULATOR === "true") {
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
}
