import { describe, it, expect } from "vitest";
import {
  buildSearchRequest,
  isEmptyResultStatus,
  LOCATIONIQ_DEFAULT_URL,
  resolveGeocoder,
} from "../server/nexora/geocoder";
import { geocoderSchema } from "../shared/nexora/provider";

describe("geocoder configuration", () => {
  it("is unconfigured by default", () =>
    expect(resolveGeocoder({})).toBeNull());
  it("refuses public Nominatim even when configured", () =>
    expect(
      resolveGeocoder({
        NEXORA_GEOCODER_URL: "https://nominatim.openstreetmap.org/search",
      }),
    ).toBeNull());
  it("refuses LocationIQ without an access token", () =>
    expect(resolveGeocoder({ NEXORA_GEOCODER_PROVIDER: "locationiq" })).toBeNull());
  it("refuses sending a key over plain HTTP", () =>
    expect(
      resolveGeocoder({
        NEXORA_GEOCODER_URL: "http://geo.example/search",
        NEXORA_GEOCODER_KEY: "k",
      }),
    ).toBeNull());
  it("defaults LocationIQ to the EU endpoint with attribution", () => {
    const g = resolveGeocoder({
      NEXORA_GEOCODER_PROVIDER: "locationiq",
      NEXORA_GEOCODER_KEY: "pk.test",
    });
    expect(g?.provider).toBe("locationiq");
    expect(g?.base.toString()).toBe(LOCATIONIQ_DEFAULT_URL);
    expect(g?.attribution).toContain("Search by LocationIQ.com");
  });
  it("detects LocationIQ from its hostname", () =>
    expect(
      resolveGeocoder({
        NEXORA_GEOCODER_URL: "https://us1.locationiq.com/v1/search",
        NEXORA_GEOCODER_KEY: "pk.test",
      })?.provider,
    ).toBe("locationiq"));
});

describe("geocoder requests", () => {
  it("sends the LocationIQ key as a query parameter, GB only", () => {
    const g = resolveGeocoder({
      NEXORA_GEOCODER_PROVIDER: "locationiq",
      NEXORA_GEOCODER_KEY: "pk.test",
    })!;
    const { url, headers } = buildSearchRequest(g, "SE1 9TG");
    const u = new URL(url);
    expect(u.searchParams.get("key")).toBe("pk.test");
    expect(u.searchParams.get("q")).toBe("SE1 9TG");
    expect(u.searchParams.get("countrycodes")).toBe("gb");
    expect(u.searchParams.get("format")).toBe("json");
    expect(headers.Authorization).toBeUndefined();
  });
  it("sends a generic Nominatim-compatible key as a Bearer header", () => {
    const g = resolveGeocoder({
      NEXORA_GEOCODER_URL: "https://geo.example/search",
      NEXORA_GEOCODER_KEY: "secret",
    })!;
    const { url, headers } = buildSearchRequest(g, "Tate Modern");
    expect(new URL(url).searchParams.get("key")).toBeNull();
    expect(headers.Authorization).toBe("Bearer secret");
  });
  it("treats LocationIQ 404 as an empty result, not a failure", () => {
    const g = resolveGeocoder({
      NEXORA_GEOCODER_PROVIDER: "locationiq",
      NEXORA_GEOCODER_KEY: "pk.test",
    })!;
    expect(isEmptyResultStatus(g, 404)).toBe(true);
    expect(isEmptyResultStatus(g, 500)).toBe(false);
  });
  it("parses a LocationIQ-shaped response", () => {
    const parsed = geocoderSchema.parse([
      {
        place_id: "331887563",
        licence: "https://locationiq.com/attribution",
        osm_type: "way",
        osm_id: "41293467",
        lat: "51.5075953",
        lon: "-0.0993489",
        display_name: "Tate Modern, Bankside, London, SE1 9TG, United Kingdom",
        class: "tourism",
        type: "museum",
        importance: 0.6,
      },
    ]);
    expect(parsed[0].lat).toBeCloseTo(51.5076);
  });
});
