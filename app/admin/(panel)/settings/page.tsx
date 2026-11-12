import { saveSettings } from "../../actions";
import { getBusiness } from "@/lib/booking";
import { requirePerm } from "@/lib/auth";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  await requirePerm("settings");
  const { saved } = await searchParams;
  const biz = await getBusiness();

  return (
    <>
      <h1>Settings</h1>
      {saved && <div className="alert success">Settings saved.</div>}
      <form action={saveSettings} className="card" style={{ maxWidth: 640 }}>
        <div className="field">
          <label>Business name</label>
          <input name="name" defaultValue={biz.name} required />
        </div>
        <div className="grid2">
          <div className="field">
            <label>Phone</label>
            <input name="phone" defaultValue={biz.phone ?? ""} />
          </div>
          <div className="field">
            <label>Address</label>
            <input name="address" defaultValue={biz.address ?? ""} />
          </div>
        </div>
        <h3>Booking rules</h3>
        <div className="grid2">
          <div className="field">
            <label>Minimum notice (minutes)</label>
            <input name="minNoticeMin" type="number" min={0} step={15} defaultValue={biz.minNoticeMin} />
          </div>
          <div className="field">
            <label>Book up to (days ahead)</label>
            <input name="maxDaysAhead" type="number" min={1} max={365} defaultValue={biz.maxDaysAhead} />
          </div>
          <div className="field">
            <label>Time slot interval</label>
            <select name="slotStepMin" defaultValue={biz.slotStepMin}>
              {[5, 10, 15, 20, 30, 60].map((n) => <option key={n} value={n}>Every {n} minutes</option>)}
            </select>
          </div>
          <div className="field">
            <label>Time zone</label>
            <input value={biz.timezone} disabled />
          </div>
        </div>
        <button className="btn">Save settings</button>
      </form>
    </>
  );
}
