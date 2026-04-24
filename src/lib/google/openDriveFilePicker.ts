/// <reference types="google.picker" />

import { loadGooglePickerDeps } from "@/lib/google/loadGooglePickerDeps";

export type PickedDriveFile = {
  id: string;
  name: string;
  mimeType: string;
};

/**
 * Opens the Google Picker (Docs + PDF views). Resolves when the user picks a file or cancels.
 */
export async function openDriveFilePicker(
  accessToken: string,
  developerKey: string,
): Promise<PickedDriveFile | null> {
  if (!developerKey) {
    throw new Error("Google API key is not configured (VITE_GOOGLE_API_KEY).");
  }
  await loadGooglePickerDeps();

  return new Promise((resolve, reject) => {
    const picker = new google.picker.PickerBuilder()
      .setOAuthToken(accessToken)
      .setDeveloperKey(developerKey)
      .setLocale("ko")
      .setTitle("Google Drive에서 파일 선택")
      .addView(
        new google.picker.DocsView(google.picker.ViewId.DOCUMENTS)
          .setIncludeFolders(false)
          .setMode(google.picker.DocsViewMode.LIST)
          .setMimeTypes("application/vnd.google-apps.document"),
      )
      .addView(
        new google.picker.DocsView(google.picker.ViewId.PDFS)
          .setIncludeFolders(false)
          .setMode(google.picker.DocsViewMode.LIST),
      )
      .setCallback((data: google.picker.ResponseObject) => {
        const action = data[google.picker.Response.ACTION];
        if (action === google.picker.Action.ERROR) {
          reject(new Error("Google Picker에서 오류가 발생했습니다."));
          return;
        }
        if (action === google.picker.Action.CANCEL) {
          resolve(null);
          return;
        }
        if (action !== google.picker.Action.PICKED) {
          resolve(null);
          return;
        }
        const docs = data[google.picker.Response.DOCUMENTS];
        const doc = docs?.[0];
        if (!doc) {
          resolve(null);
          return;
        }
        const id = doc[google.picker.Document.ID];
        const name = doc[google.picker.Document.NAME] ?? "";
        const mimeType = doc[google.picker.Document.MIME_TYPE] ?? "";
        resolve({ id, name, mimeType });
      })
      .build();
    picker.setVisible(true);
  });
}
