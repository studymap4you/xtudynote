/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
  readonly VITE_FIREBASE_MEASUREMENT_ID?: string;
  readonly VITE_EMAILJS_PUBLIC_KEY?: string;
  readonly VITE_EMAILJS_SERVICE_ID?: string;
  readonly VITE_EMAILJS_TEMPLATE_ID?: string;
  /** Google OAuth Web client ID (Drive Picker + GIS). */
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  readonly NEXT_PUBLIC_GOOGLE_CLIENT_ID?: string;
  /** Browser API key for Google Picker `setDeveloperKey`. */
  readonly VITE_GOOGLE_API_KEY?: string;
  readonly NEXT_PUBLIC_GOOGLE_API_KEY?: string;
  /** OpenAI — Signal Logic 분석 (클라이언트 키는 배포 시 서버 프록시 권장) */
  readonly VITE_OPENAI_API_KEY?: string;
  readonly VITE_OPENAI_MODEL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
