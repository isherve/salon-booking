import { setBookingStatus } from "@/app/admin/actions";

type Status = "CONFIRMED" | "CANCELLED" | "COMPLETED" | "NO_SHOW";

/** Status buttons for one booking (server-rendered forms, no JS needed). */
export default function BookingActions({
  id,
  status,
  isPast,
  returnTo,
}: {
  id: string;
  status: Status;
  isPast: boolean;
  returnTo: string;
}) {
  const btn = (to: Status, label: string, cls = "secondary", notify = false) => (
    <form action={setBookingStatus} className="inline-form" key={to}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={to} />
      <input type="hidden" name="returnTo" value={returnTo} />
      {notify && <input type="hidden" name="notify" value="on" />}
      <button className={`btn sm ${cls}`}>{label}</button>
    </form>
  );

  return (
    <div className="actions">
      {status === "CONFIRMED" && (
        <>
          {btn("COMPLETED", "✓ Done")}
          {isPast && btn("NO_SHOW", "No-show")}
          {btn("CANCELLED", "Cancel", "danger", !isPast)}
        </>
      )}
      {status !== "CONFIRMED" && !isPast && btn("CONFIRMED", "Restore")}
      {status !== "CONFIRMED" && isPast && status !== "CANCELLED" && btn("CONFIRMED", "Undo")}
    </div>
  );
}
