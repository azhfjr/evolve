export function r2Origin(accountId: string | undefined) {
  return accountId && /^[a-f0-9]{32}$/.test(accountId)
    ? `https://${accountId}.r2.cloudflarestorage.com`
    : undefined;
}
