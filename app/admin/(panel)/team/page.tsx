import { asc } from "drizzle-orm";
import { db, schema } from "@/db";
import { createUser, resetUserPassword, toggleUserActive, updateUser } from "../../actions";
import { requirePerm } from "@/lib/auth";
import { getBusiness } from "@/lib/booking";
import { ROLE_DESCRIPTION, ROLE_LABEL, type Role } from "@/lib/permissions";
import { fmtDateTime } from "@/lib/time";

const ROLES: Role[] = ["STAFF", "MANAGER", "OWNER"];

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; created?: string; reset?: string; pw?: string; saved?: string; welcome?: string }>;
}) {
  const me = await requirePerm("team");
  const sp = await searchParams;
  const [biz, users, staff] = await Promise.all([
    getBusiness(),
    db.select().from(schema.users).orderBy(asc(schema.users.name)),
    db.select().from(schema.staff).orderBy(asc(schema.staff.name)),
  ]);
  const staffName = new Map(staff.map((s) => [s.id, s.name]));
  const linked = new Set(users.filter((u) => u.staffId).map((u) => u.staffId));

  return (
    <>
      <h1>Team accounts</h1>
      {sp.welcome && <div className="alert success">Welcome! Your owner account is ready. Now add an account for each barber and manager.</div>}
      {sp.error && <div className="alert error">{sp.error}</div>}
      {sp.saved && <div className="alert success">Saved.</div>}
      {(sp.created || sp.reset) && sp.pw && (
        <div className="alert success">
          {sp.created ? "Account created" : "Password reset"} for <strong>{sp.created ?? sp.reset}</strong>. Their password is{" "}
          <span className="secret">{sp.pw}</span>
          <div className="small" style={{ marginTop: 6 }}>
            Send it to them privately (e.g. WhatsApp). They can change it under 👤 My account after logging in. This is the only time it&apos;s shown.
          </div>
        </div>
      )}

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Add a team member</h2>
        <form action={createUser}>
          <div className="grid2">
            <div className="field"><label>Name</label><input name="name" required /></div>
            <div className="field"><label>Email (their login)</label><input name="email" type="email" required /></div>
            <div className="field">
              <label>Role</label>
              <select name="role" defaultValue="STAFF">
                {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Their calendar (staff member)</label>
              <select name="staffId" defaultValue="">
                <option value="">— none (managers who don&apos;t take clients) —</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}{linked.has(s.id) ? " (already has an account)" : ""}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="field" style={{ maxWidth: 360 }}>
            <label>Password (leave empty to generate one)</label>
            <input name="password" type="text" minLength={8} placeholder="auto-generated" autoComplete="off" />
          </div>
          <button className="btn">Create account</button>
        </form>
        <ul className="muted small" style={{ marginBottom: 0 }}>
          {ROLES.map((r) => <li key={r}><strong>{ROLE_LABEL[r]}:</strong> {ROLE_DESCRIPTION[r]}</li>)}
        </ul>
        <p className="muted small" style={{ marginBottom: 0 }}>
          New barber? Add them under 🕘 Staff &amp; hours first, so they have a calendar to link to.
        </p>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Person</th><th>Role &amp; calendar</th><th>Last login</th><th></th></tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} style={{ opacity: u.active ? 1 : 0.55 }}>
                  <td>
                    <strong>{u.name}</strong> {u.id === me.id && <span className="muted small">(you)</span>}
                    <div className="muted small">{u.email}</div>
                    {!u.active && <span className="badge CANCELLED">Deactivated</span>}
                  </td>
                  <td>
                    <form action={updateUser} className="row" style={{ gap: 6 }}>
                      <input type="hidden" name="id" value={u.id} />
                      <select name="role" defaultValue={u.role} style={{ width: "auto" }} aria-label="Role">
                        {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                      </select>
                      <select name="staffId" defaultValue={u.staffId ?? ""} style={{ width: "auto" }} aria-label="Calendar">
                        <option value="">— no calendar —</option>
                        {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                      <button className="btn sm secondary">Save</button>
                    </form>
                    {u.staffId && <div className="muted small">Calendar: {staffName.get(u.staffId)}</div>}
                  </td>
                  <td className="small muted">{u.lastLoginAt ? fmtDateTime(u.lastLoginAt, biz.timezone) : "Never"}</td>
                  <td>
                    <div className="actions">
                      <form action={resetUserPassword}>
                        <input type="hidden" name="id" value={u.id} />
                        <button className="btn sm secondary">Reset password</button>
                      </form>
                      {u.id !== me.id && (
                        <form action={toggleUserActive}>
                          <input type="hidden" name="id" value={u.id} />
                          <button className={`btn sm ${u.active ? "danger" : "secondary"}`}>{u.active ? "Deactivate" : "Reactivate"}</button>
                        </form>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
