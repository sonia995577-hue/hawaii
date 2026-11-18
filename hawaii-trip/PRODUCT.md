# 大岛星火手帐 — Product

## What it is
A private trip companion for two people (🐱 and her partner 🐷) for one trip: Big Island + Oahu, 2026-11-26 → 12-04. Phone-first web app (claude.ai artifact, added to home screen). Not a product for strangers.

## Users and roles
- 🐱 mainly reads the itinerary and plans; she is the design owner and judges craft hard.
- 🐷 makes the bookings; to-dos and booking status are mostly his.

## When it is opened (from interview, 2026-11-17)
- Before departure: check that every day is planned ("心里有数") and occasionally what is still missing.
- During the trip: every morning to see today's plan and route; on the road to find the next stop, navigate, and read the day's cautions.

## Core jobs, in priority order
1. See each day's plan with real information (where, when, how long the drive, what is booked) — a list of day titles alone is useless.
2. Next stop + one-tap navigation during the trip.
3. The day's key cautions (gear, rules, timing), short.
4. Booking facts in context (confirmation numbers, check-in times, addresses) — shown on the day they belong to.
5. Secondary: packing/to-dos (🐷), tips, wishes, Claude assistant, hand-drawn map.

## Information hierarchy rules
- Rank by importance: show the important, de-emphasize the secondary, fold the rest. Never equal-weight lists; never only one item.
- To-do lists do not belong on the home screen.
- Content follows time: before the trip all days are equal; during the trip today leads.

## Brand / aesthetic commitments (user-pinned)
- References: premium iOS app concept shots (light grey canvas, crisp white surfaces, black pill controls, a single lime accent, glass over full-bleed imagery, big confident numerals, tactile controls). Airbnb app's 3D-ish illustrated icons and smooth shared-element motion.
- Rejected: the cat/pig volcano cover illustration; storybook/paper style; Airbnb pink theme; emoji-as-icons; anything that "looks AI-made" or beginner-simple.
- Copy: plain Chinese, unambiguous, no poetic filler.

## Constraints
- Single HTML file, runs inside claude.ai artifact viewer; must work signed-out (local storage) and offline via a downloadable handbook.
- Content facts (flights, bookings) come from the user's Gmail; never invent bookings.
