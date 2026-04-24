import { loadGooglePickerDeps } from "@/lib/google/loadGooglePickerDeps";

const DRIVE_READONLY = "https://www.googleapis.com/auth/drive.readonly";

type Cached = { token: string; expiresAtMs: number };

let cached: Cached | null = null;

function windowGoogleAccounts():
  | {
      oauth2: {
        initTokenClient: (config: {
          client_id: string;
          scope: string;
          callback: (r: { access_token?: string; expires_in?: number; error?: string }) => void;
        }) => { requestAccessToken: (o?: { prompt?: string }) => void };
      };
    }
  | undefined {
  return (window as unknown as { google?: { accounts?: unknown } }).google?.accounts as
    | undefined
    | {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (r: { access_token?: string; expires_in?: number; error?: string }) => void;
          }) => { requestAccessToken: (o?: { prompt?: string }) => void };
        };
      };
}

/**
 * Returns a Drive-scoped access token (GIS token client). Caches until ~1 min before expiry.
 */
export async function getDriveReadonlyAccessToken(clientId: string, forceConsent = false): Promise<string> {
  if (!clientId) {
    throw new Error("Google OAuth Client ID is not configured.");
  }
  await loadGooglePickerDeps();
  const now = Date.now();
  if (!forceConsent && cached && now < cached.expiresAtMs - 60_000) {
    return cached.token;
  }
  const accounts = windowGoogleAccounts();
  if (!accounts?.oauth2?.initTokenClient) {
    throw new Error("Google Identity Services not available. Check the network and script load order.");
  }
  return new Promise((resolve, reject) => {
    const client = accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_READONLY,
      callback: (resp) => {
        if (resp.error) {
          const friendly: Record<string, string> = {
            popup_closed_by_user: "로그인 창이 닫혔습니다.",
            access_denied: "Google Drive 읽기 권한이 필요합니다.",
            user_denied: "권한 요청이 취소되었습니다.",
          };
          reject(new Error(friendly[resp.error] ?? resp.error));
          return;
        }
        const token = resp.access_token;
        if (!token) {
          reject(new Error("Google sign-in did not return an access token."));
          return;
        }
        const ttlSec = resp.expires_in ?? 3600;
        cached = { token, expiresAtMs: Date.now() + ttlSec * 1000 };
        resolve(token);
      },
    });
    client.requestAccessToken(forceConsent ? { prompt: "consent" } : {});
  });
}
