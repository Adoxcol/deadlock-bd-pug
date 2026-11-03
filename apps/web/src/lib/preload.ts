const started = new Set<string>();

/** Fetches images ahead of time so they appear instantly later. Each URL is only requested once. */
export function preloadImages(urls: (string | null | undefined)[]) {
  for (const url of urls) {
    if (!url || started.has(url)) continue;
    started.add(url);
    new Image().src = url;
  }
}
