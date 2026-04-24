const SCRIPT_GSI = "https://accounts.google.com/gsi/client";
const SCRIPT_GAPI = "https://apis.google.com/js/api.js";

/**
 * Load order: **gapi → Picker → GIS**.  
 * If GIS loads before `gapi`, `api.js` can replace `window.google` and break `google.accounts.oauth2`.
 */
function injectScriptOnce(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing?.dataset.loaded === "1") {
      resolve();
      return;
    }
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)), {
        once: true,
      });
      return;
    }
    const el = document.createElement("script");
    el.src = src;
    el.async = true;
    el.onload = () => {
      el.dataset.loaded = "1";
      resolve();
    };
    el.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(el);
  });
}

let pickerLoadPromise: Promise<void> | null = null;

async function ensurePickerApiLoaded(): Promise<void> {
  if (!window.gapi?.load) {
    throw new Error("Google API (gapi) did not initialize.");
  }
  if (!pickerLoadPromise) {
    pickerLoadPromise = new Promise<void>((resolve, reject) => {
      window.gapi!.load("picker", {
        callback: () => resolve(),
        onerror: () => reject(new Error("Failed to load Google Picker API.")),
      });
    });
  }
  try {
    await pickerLoadPromise;
  } catch (e) {
    pickerLoadPromise = null;
    throw e;
  }
}

/**
 * Loads **gapi + Picker + GIS** (OAuth token client). Safe to call multiple times.
 */
export async function loadGooglePickerDeps(): Promise<void> {
  await injectScriptOnce(SCRIPT_GAPI);
  await ensurePickerApiLoaded();
  await injectScriptOnce(SCRIPT_GSI);
}
