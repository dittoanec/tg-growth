import { describe, it, expect } from "vitest";
import { attributeEvents } from "./attribution.js";

const mkPost = (id, dateStr, text = "") => ({
  id,
  date: dateStr,
  text: text || `post ${id}`,
  views: 100,
  forwards: 0,
  reactions: [],
  reaction_total: 0,
  media_type: "none",
});

describe("attributeEvents", () => {
  it("returns empty result for empty input", () => {
    const r = attributeEvents([], {}, 24);
    expect(r.attributedLeaves).toEqual([]);
    expect(r.attributedJoins).toEqual([]);
    expect(r.ambientLeaves).toBe(0);
    expect(r.ambientJoins).toBe(0);
    expect(r.trend).toEqual([]);
  });

  it("attributes same-day leaves to a post published that day", () => {
    const posts = [mkPost(1, "2026-04-10T10:00:00+00:00", "hot take")];
    const mc = { "2026-04-10": { joins: 2, leaves: 5, net: -3 } };
    const r = attributeEvents(posts, mc, 24);

    expect(r.attributedLeaves).toHaveLength(1);
    expect(r.attributedLeaves[0].postId).toBe(1);
    expect(r.attributedLeaves[0].leaves).toBe(5);
    expect(r.attributedJoins[0].joins).toBe(2);
    expect(r.ambientLeaves).toBe(0);
  });

  it("puts leaves in ambient bucket when no post is in window", () => {
    const posts = [mkPost(1, "2026-04-01T10:00:00+00:00")];
    const mc = { "2026-04-10": { joins: 0, leaves: 4, net: -4 } };
    const r = attributeEvents(posts, mc, 24);

    expect(r.attributedLeaves).toEqual([]);
    expect(r.ambientLeaves).toBe(4);
  });

  it("gives credit to the most recent post when multiple exist in window", () => {
    const posts = [
      mkPost(1, "2026-04-10T09:00:00+00:00", "morning"),
      mkPost(2, "2026-04-10T22:00:00+00:00", "evening"),
    ];
    const mc = { "2026-04-10": { joins: 0, leaves: 3, net: -3 } };
    const r = attributeEvents(posts, mc, 24);

    expect(r.attributedLeaves).toHaveLength(1);
    expect(r.attributedLeaves[0].postId).toBe(2);
    expect(r.attributedLeaves[0].leaves).toBe(3);
  });

  it("treats previous-day posts as in-window for a 24h window", () => {
    const posts = [mkPost(1, "2026-04-09T23:00:00+00:00", "late night")];
    const mc = { "2026-04-10": { joins: 1, leaves: 2, net: -1 } };
    const r = attributeEvents(posts, mc, 24);

    expect(r.attributedLeaves[0].postId).toBe(1);
    expect(r.attributedLeaves[0].leaves).toBe(2);
  });

  it("sorts trend ascending by date", () => {
    const mc = {
      "2026-04-12": { joins: 1, leaves: 1, net: 0 },
      "2026-04-10": { joins: 2, leaves: 0, net: 2 },
      "2026-04-11": { joins: 0, leaves: 3, net: -3 },
    };
    const r = attributeEvents([], mc, 24);
    expect(r.trend.map(d => d.date)).toEqual(["2026-04-10", "2026-04-11", "2026-04-12"]);
  });

  it("aggregates leaves/joins per post across days", () => {
    const posts = [mkPost(1, "2026-04-10T10:00:00+00:00")];
    const mc = {
      "2026-04-10": { joins: 1, leaves: 2, net: -1 },
      "2026-04-11": { joins: 0, leaves: 3, net: -3 },
    };
    const r = attributeEvents(posts, mc, 24);

    const p1 = r.attributedLeaves.find(x => x.postId === 1);
    expect(p1.leaves).toBe(5);
  });

  it("sorts attributedLeaves descending by leaves", () => {
    const posts = [
      mkPost(1, "2026-04-10T10:00:00+00:00"),
      mkPost(2, "2026-04-11T10:00:00+00:00"),
    ];
    const mc = {
      "2026-04-10": { joins: 0, leaves: 1, net: -1 },
      "2026-04-11": { joins: 0, leaves: 7, net: -7 },
    };
    const r = attributeEvents(posts, mc, 24);
    expect(r.attributedLeaves[0].postId).toBe(2);
    expect(r.attributedLeaves[0].leaves).toBe(7);
    expect(r.attributedLeaves[1].postId).toBe(1);
  });
});
