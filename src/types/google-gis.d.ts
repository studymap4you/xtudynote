/** Google Identity Services — token client (loaded from accounts.google.com/gsi/client). */
export {};

declare global {
  interface Window {
    gapi?: {
      load: (
        apiName: string,
        options: { callback: () => void; onerror?: (err: unknown) => void; timeout?: number; version?: string },
      ) => void;
    };
  }
}
