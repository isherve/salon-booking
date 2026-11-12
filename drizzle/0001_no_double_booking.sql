-- Let Postgres itself guarantee that one staff member can never have two
-- CONFIRMED bookings whose time ranges overlap. This protects against race
-- conditions where two customers click the same slot at the same moment.
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
ALTER TABLE "bookings"
  ADD CONSTRAINT "no_overlapping_bookings"
  EXCLUDE USING gist (
    "staff_id" WITH =,
    tstzrange("starts_at", "ends_at", '[)') WITH &&
  ) WHERE ("status" = 'CONFIRMED');
--> statement-breakpoint
ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_valid_range" CHECK ("ends_at" > "starts_at");
--> statement-breakpoint
ALTER TABLE "working_hours"
  ADD CONSTRAINT "working_hours_valid" CHECK ("weekday" BETWEEN 0 AND 6 AND "start_min" >= 0 AND "end_min" <= 1440 AND "end_min" > "start_min");
