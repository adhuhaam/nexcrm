import { FileTextIcon, IdCardIcon, UserPlusIcon, UserRoundPenIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export function QuickCreateMenu({
  companyId,
  className,
  triggerClassName,
  label = "Quick Create",
  variant = "default",
  size = "default",
}: {
  companyId?: string;
  className?: string;
  triggerClassName?: string;
  label?: string;
  variant?: "default" | "outline" | "secondary";
  size?: "default" | "sm" | "lg" | "icon";
}) {
  const onboardHref = companyId ? `/employees/onboard?companyId=${companyId}` : "/employees/onboard";
  const manualHref = companyId ? `/employees?new=1&companyId=${companyId}` : "/employees?new=1";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant={variant} size={size} className={cn(triggerClassName, className)}>
          <UserPlusIcon />
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>Add an employee</DropdownMenuLabel>
        <DropdownMenuItem
          onClick={() => {
            window.location.assign(onboardHref);
          }}
        >
          <IdCardIcon />
          <div className="grid gap-0.5">
            <span className="font-medium">Quick onboard</span>
            <span className="text-xs text-muted-foreground">Passport OCR → place → allocate</span>
          </div>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            window.location.assign(manualHref);
          }}
        >
          <UserRoundPenIcon />
          <div className="grid gap-0.5">
            <span className="font-medium">Add manually</span>
            <span className="text-xs text-muted-foreground">Fill the employee form yourself</span>
          </div>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            window.location.assign("/loas/new");
          }}
        >
          <FileTextIcon />
          <div className="grid gap-0.5">
            <span className="font-medium">New LOA</span>
            <span className="text-xs text-muted-foreground">Appointment letter editor</span>
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
