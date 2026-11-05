import { useEffect, useState, type FormEvent } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { SubmitButton } from "@/components/ux";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TextField } from "@/components/field";
import { Banner } from "@/components/shell";
import { postJson } from "@/lib/api";

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
    <main className="relative grid min-h-svh place-items-center bg-[radial-gradient(circle_at_top,color-mix(in_oklch,var(--muted)_70%,transparent),var(--background)_55%)] px-4 py-10 pt-[max(2.5rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))]">
      <div className="absolute top-[max(1rem,env(safe-area-inset-top))] right-[max(1rem,env(safe-area-inset-right))]">
        <ThemeToggle />
      </div>
      <Card className="w-full max-w-sm shadow-sm">
        <CardHeader>
          <CardTitle>NEXCRM</CardTitle>
          <CardDescription>Sign in to open the office workspace.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={submit}>
            <Banner message={error} error />
            <TextField id="email" label="Email" value={email} onChange={setEmail} />
            <TextField id="password" label="Password" type="password" value={password} onChange={setPassword} />
            <SubmitButton pending={pending} className="w-full">
              Sign in
            </SubmitButton>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
