import { useEffect, useState } from "react";
import { DownloadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    const onInstalled = () => {
      setDeferred(null);
      setHidden(true);
    };
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!deferred || hidden) return null;

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="hidden sm:inline-flex"
      onClick={() => {
        void (async () => {
          await deferred.prompt();
          await deferred.userChoice;
          setDeferred(null);
        })();
      }}
    >
      <DownloadIcon />
      Install app
    </Button>
  );
}

export function MobileInstallBanner() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem("nexcrm-install-dismissed") === "1");

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (!deferred || dismissed) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t bg-background p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-sm md:hidden">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
        <div className="min-w-0 text-sm">
          <p className="font-medium">Install NEXCRM</p>
          <p className="text-xs text-muted-foreground">Add to your home screen for quick access.</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              sessionStorage.setItem("nexcrm-install-dismissed", "1");
              setDismissed(true);
            }}
          >
            Not now
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              void (async () => {
                await deferred.prompt();
                await deferred.userChoice;
                setDeferred(null);
              })();
            }}
          >
            Install
          </Button>
        </div>
      </div>
    </div>
  );
}
