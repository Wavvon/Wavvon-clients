import React from "react";
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EventCard } from "../events/EventCard";
import type { HubEvent } from "../../types";

const base: HubEvent = {
  id: "e1",
  title: "Raid",
  description: null,
  location: null,
  starts_at: 2_000_000_000,
  ends_at: null,
  created_at: 1,
  rsvp_counts: { going: 1, maybe: 0, not_going: 0 },
  slots: [],
  reminder_minutes: null,
  reminder_sent_at: null,
  hub_wide: false,
  propagate_to_children: false,
};

function render(event: HubEvent) {
  return renderToStaticMarkup(
    <EventCard event={event} myPubkey="me" isAdmin={false} onRsvp={async () => {}} onUpdate={() => {}} onDelete={() => {}} />,
  );
}

const pressed = (html: string) =>
  [...html.matchAll(/<button class="btn-primary"[^>]*>([^<]*)</g)].map((m) => m[1]);

describe("EventCard RSVP seed", () => {
  it("highlights the button for my_rsvp", () => {
    expect(pressed(render({ ...base, my_rsvp: "maybe" }))).toEqual(["events.rsvp.maybe"]);
    expect(pressed(render({ ...base, my_rsvp: "going" }))).toEqual(["events.rsvp.going"]);
  });
  it("highlights nothing when absent", () => {
    expect(pressed(render(base))).toEqual([]);
  });
});
