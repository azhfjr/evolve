# Shared file storage options — checked 23 October 2026

**Current decision: keep Vercel Blob.** No storage provider, account permission, billing plan or quota was changed. Both rooms already use the same attachment table, private store and aggregate 1 GB application cap. Project/task records live in PostgreSQL; the file contents live in object storage. Increasing one does not increase the other.

| Option                 | Published free file capacity                                                                     | Fit for approximately 5 GB                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Vercel Blob Hobby      | 1 GB, with separate operation/transfer allowances                                                | Current working setup; insufficient capacity for the target                                                      |
| OneDrive personal      | 5 GB shared with other Microsoft cloud content                                                   | Possible through Microsoft Graph; very little headroom if the account already contains files                     |
| Google Drive personal  | Up to 15 GB shared with Gmail and Photos; check the actual account allowance and available space | Preferred consumer-drive option if an organization-controlled account has enough free space                      |
| Cloudflare R2 Standard | 10 GB-month free storage plus specified request allowances                                       | Suitable object-storage option; R2 subscription/billing setup and potential overage charges need review          |
| Backblaze B2           | First 10 GB free; separate download/API allowances                                               | Another object-storage option; official signup offers no-credit-card entry; verify account limits and operations |

## OneDrive and Google Drive are possible

Either can sit behind the current upload/download UI. Use one designated organization-controlled storage account for both rooms. Keep file identifiers in the existing database; continue checking membership and entity permissions on the server before reads, downloads and deletes. Do not make the storage folder public. A ChatGPT Drive/OneDrive connector is separate from an application runtime integration.

For Google Drive, enable Drive API and add an explicit admin storage-connection OAuth flow using the narrowly scoped `drive.file` permission for app-created files. Existing Google login does not grant Drive access. Store refresh credentials securely; account for consent-screen status, token expiry/revocation, API quotas and current billing rules. A service account does not provide an extra free personal storage allowance. Read the selected account’s actual available quota before choosing a 5 GB budget.

For OneDrive personal, register an application supporting personal Microsoft accounts, obtain delegated consent with `Files.ReadWrite.AppFolder` and `offline_access`, and use the app folder. Existing Google login remains the Evolve login. Use Graph upload sessions and authenticated download handling; Microsoft download/upload-session URLs are temporary credentials and must not be logged or published. Check the account’s available quota before using it.

Both options need an actual account connection; neither has been configured or tested against Evolve in production. The account owner can delete/revoke files externally, so the app must detect missing files and reset affected document validation. Keep existing Blob files readable during migration. Verify copied file bytes and metadata before any separately authorized deletion, and use the same global quota across both rooms. Do not combine throwaway accounts or multiple buckets to bypass provider quotas.

## Recommended next step

If moving later, choose a dedicated Google Drive account with at least 5 GB genuinely available. Build and test the storage adapter and admin connection in an isolated environment, then migrate with a reviewed manifest and rollback path. Retain Blob until verification succeeds. Free capacity does not mean unlimited transfer, requests or API usage.

## Primary references

- [Vercel Blob usage and pricing](https://vercel.com/docs/vercel-blob/usage-and-pricing)
- [Microsoft storage FAQ](https://support.microsoft.com/en-us/onedrive/microsoft-storage-faqs)
- [Microsoft Graph application folder](https://learn.microsoft.com/en-us/graph/onedrive-sharepoint-appfolder)
- [Google account storage](https://support.google.com/drive/answer/6374270)
- [Google Drive OAuth scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)
- [Drive API limits](https://developers.google.com/workspace/drive/api/guides/limits)
- [Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/)
- [Backblaze B2 pricing](https://www.backblaze.com/cloud-storage/pricing)
- [Backblaze B2 signup](https://www.backblaze.com/sign-up/cloud-storage)
