import { fetchVenue } from "../mlb/client";
import { cacheJson } from "../cache/redis";
import { k } from "../cache/keys";

export type VenueInfo = {
  id: number;
  name: string;
  city: string | null;
  state: string | null;
};

export async function loadVenue(venueId: number): Promise<VenueInfo> {
  return cacheJson(k.venue(venueId), 60 * 60 * 24 * 30, async () => {
    const r = await fetchVenue(venueId);
    const v = r.venues[0];
    return {
      id: v.id,
      name: v.name,
      city: v.location?.city ?? null,
      state: v.location?.state ?? null,
    };
  });
}
