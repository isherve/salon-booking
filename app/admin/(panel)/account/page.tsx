import { changeMyPassword } from "../../actions";
import { requireUser } from "@/lib/auth";
import { ROLE_DESCRIPTION, ROLE_LABEL } from "@/lib/permissions";

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;

  return (
    <>
      <h1>My account</h1>
      <div className="card" style={{ maxWidth: 520 }}>
        <p style={{ marginTop: 0 }}>
          <strong>{user.name}</strong> · {user.email}
          <br />
          <span className={`role-badge ${user.role}`}>{ROLE_LABEL[user.role]}</span>{" "}
          <span className="muted small">{ROLE_DESCRIPTION[user.role]}</span>
        </p>
      </div>

      <div className="card" style={{ maxWidth: 520 }}>
        <h2 style={{ marginTop: 0 }}>Change password</h2>
        {sp.saved && <div className="alert success">Password changed. Other devices have been logged out.</div>}
        {sp.error && <div className="alert error">{sp.error}</div>}
        <form action={changeMyPassword}>
          <div className="field"><label>Current password</label><input name="current" type="password" required autoComplete="current-password" /></div>
          <div className="field"><label>New password (min 8 characters)</label><input name="next" type="password" minLength={8} required autoComplete="new-password" /></div>
          <div className="field"><label>Repeat new password</label><input name="confirm" type="password" minLength={8} required autoComplete="new-password" /></div>
          <button className="btn">Change password</button>
        </form>
      </div>
    </>
  );
}
