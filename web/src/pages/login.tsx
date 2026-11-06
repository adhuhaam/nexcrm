import { useEffect, useState, type FormEvent } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { SubmitButton } from "@/components/ux";
import { TextField } from "@/components/field";
import { Banner } from "@/components/shell";
import { postJson } from "@/lib/api";
import "@/styles/admin.css";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    document.title = "Sign in · NEXCRM";
  }, []);

  function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    void postJson("/login", { email, password }).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : "Sign-in failed.");
      setPending(false);
    });
  }

  return (
    <main className="nx-login">
      <div className="nx-login-glow" aria-hidden />
      <div className="nx-login-theme">
        <ThemeToggle />
      </div>
      <div className="nx-login-card">
        <div className="nx-login-head">
          <div className="nx-login-brand">
            <span className="nx-brand-mark">NX</span>
            <div>
              <strong>NEXCRM</strong>
              <span>Admin</span>
            </div>
          </div>
          <h1>Sign in</h1>
          <p>Open the agency workspace for people, clients, and payroll.</p>
        </div>
        <form className="nx-login-form" onSubmit={submit}>
          <Banner message={error} error />
          <TextField id="email" label="Email" value={email} onChange={setEmail} />
          <TextField id="password" label="Password" type="password" value={password} onChange={setPassword} />
          <SubmitButton pending={pending} className="w-full">
            Continue to workspace
          </SubmitButton>
        </form>
      </div>
    </main>
  );
}
