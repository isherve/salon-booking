"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CancelButton({ token }: { token: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cancel() {
    if (!confirm("Cancel this booking?")) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/bookings/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel" }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data.error || "Could not cancel");
    router.replace(`/booking/${token}`);
    router.refresh();
  }

  return (
    <>
      <button className="btn danger" onClick={cancel} disabled={busy}>
        {busy ? "Cancelling…" : "Cancel booking"}
      </button>
      {error && <div className="alert error" style={{ width: "100%" }}>{error}</div>}
    </>
  );
}
