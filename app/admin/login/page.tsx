import { redirect } from "next/navigation";
import { login, setupOwner } from "../actions";
import { getCurrentUser, hasAnyUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getCurrentUser()) redirect("/admin");
  const { error } = await searchParams;
  const firstRun = !(await hasAnyUser());

  return (
    <main className="container" style={{ maxWidth: 420, paddingTop: 70 }}>
      <div className="card">
        {firstRun ? (
          <>
            <h1 style={{ marginTop: 0 }}>Create the owner account</h1>
            <p className="muted small">
              First-time setup: this page only appears until the first account exists. You&apos;ll add your barbers and managers afterwards.
            </p>
            {error && <div className="alert error">{error}</div>}
            <form action={setupOwner}>
              <div className="field"><label htmlFor="name">Your name</label><input id="name" name="name" required /></div>
              <div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" required /></div>
              <div className="field"><label htmlFor="password">Choose a password (min 8 characters)</label><input id="password" name="password" type="password" minLength={8} required /></div>
              <button className="btn block">Create owner account</button>
            </form>
          </>
        ) : (
          <>
            <h1 style={{ marginTop: 0 }}>Staff login</h1>
            {error && <div className="alert error">{error}</div>}
            <form action={login}>
              <div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" required autoFocus autoComplete="username" /></div>
              <div className="field"><label htmlFor="password">Password</label><input id="password" name="password" type="password" required autoComplete="current-password" /></div>
              <button className="btn block">Log in</button>
            </form>
            <p className="muted small" style={{ marginBottom: 0 }}>Forgot your password? Ask the owner to reset it.</p>
          </>
        )}
      </div>
    </main>
  );
}
