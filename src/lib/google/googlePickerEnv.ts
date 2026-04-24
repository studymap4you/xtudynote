/** OAuth Web client ID (Vite: VITE_ or NEXT_PUBLIC_ prefix). */
export function readGoogleOAuthClientId(): string {
  const v =
    import.meta.env.VITE_GOOGLE_CLIENT_ID ?? import.meta.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
  return String(v).trim();
}

/** Browser API key — Picker `setDeveloperKey` (restrict by HTTP referrer in Cloud Console). */
export function readGooglePickerDeveloperKey(): string {
  const v =
    import.meta.env.VITE_GOOGLE_API_KEY ?? import.meta.env.NEXT_PUBLIC_GOOGLE_API_KEY ?? "";
  return String(v).trim();
}
