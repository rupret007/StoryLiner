/** Same-app navigation only; never put editable facts or a receipt in a URL. */
export function campaignStudioHref(bandId: string, campaignId: string): string {
  return `/content-studio?${new URLSearchParams({ bandId, campaignId }).toString()}`;
}

export function standaloneStudioHref(bandId?: string): string {
  return bandId
    ? `/content-studio?${new URLSearchParams({ bandId }).toString()}`
    : "/content-studio";
}
