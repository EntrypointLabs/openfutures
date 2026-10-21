/** Only explicitly configured HTTP origins can send cookie-setting API requests. */
export function parseAllowedOrigins(primary: string, additional = ""): string[] {
  const origins = [primary, ...additional.split(",")]
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => {
      const url = new URL(value);
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.hostname.includes("*") ||
        url.pathname !== "/" ||
        url.search ||
        url.hash
      )
        throw new Error(
          "Waitlist origins must be exact HTTP or HTTPS origins without paths or wildcards.",
        );
      return url.origin;
    });
  return [...new Set(origins)];
}
