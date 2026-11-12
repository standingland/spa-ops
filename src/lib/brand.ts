// Brand name and tagline from env-like input (callers pass process.env); blank values fall back to defaults.
const DEFAULT_NAME = 'BANYAN';
const DEFAULT_TAGLINE = "Men's Spa · Thailand";

export function getBrand(source: Record<string, string | undefined>): { name: string; tagline: string } {
  return {
    name: source.BRAND_NAME?.trim() || DEFAULT_NAME,
    tagline: source.BRAND_TAGLINE?.trim() || DEFAULT_TAGLINE,
  };
}
