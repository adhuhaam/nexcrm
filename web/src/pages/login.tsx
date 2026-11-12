import { useEffect, useState, type FormEvent } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { SubmitButton } from "@/components/ux";
import { TextField } from "@/components/field";
import { Banner } from "@/components/shell";
import { postJson } from "@/lib/api";
import "@/styles/admin.css";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [mode, setMode] = useState<"office" | "employee">("office");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    document.title = "Sign in · JACMS";
  }, []);

  function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const body = mode === "employee" ? { phone: email, password } : { email, password };
    void postJson("/login", body).catch((reason: unknown) => {
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
              <strong>JACMS</strong>
              <span>Admin</span>
            </div>
          </div>
          <h1>Sign in</h1>
          <p>
            {mode === "employee"
              ? "Staff self-service — phone number and password from HR."
              : "Open the agency workspace for people, clients, and payroll."}
          </p>
        </div>
        <form className="nx-login-form" onSubmit={submit}>
          <Banner message={error} error />
          <div className="flex gap-2 text-sm">
            <button type="button" className={mode === "office" ? "font-semibold" : "text-muted-foreground"} onClick={() => setMode("office")}>
              Office
            </button>
            <span className="text-muted-foreground">·</span>
            <button type="button" className={mode === "employee" ? "font-semibold" : "text-muted-foreground"} onClick={() => setMode("employee")}>
              Employee
            </button>
          </div>
          <TextField
            id="email"
            label={mode === "employee" ? "Phone number" : "Email"}
            value={email}
            onChange={setEmail}
          />
          <TextField id="password" label="Password" type="password" value={password} onChange={setPassword} />
          <SubmitButton pending={pending} className="w-full">
            Continue to workspace
          </SubmitButton>
        </form>
      </div>
    </main>
  );
}
