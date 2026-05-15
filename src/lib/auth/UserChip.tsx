import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AUTH_ENABLED } from "./index";
import { useAuth } from "./AuthProvider";

/**
 * Header chip — shows the user avatar + sign-out dropdown when signed in,
 * a Sign in button when signed out, and nothing when auth is disabled.
 */
export function UserChip() {
  if (!AUTH_ENABLED) return null;
  return <UserChipInner />;
}

function UserChipInner() {
  const { user, isLoaded, signIn, signOut } = useAuth();

  if (!isLoaded) {
    // Tiny placeholder so the header doesn't reflow when auth resolves.
    return <div className="size-7 rounded-full bg-muted/40" aria-hidden />;
  }

  if (!user) {
    return (
      <Button size="sm" variant="ghost" onClick={() => void signIn()}>
        Sign in
      </Button>
    );
  }

  const displayName =
    [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;
  const initials = computeInitials(user);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          aria-label={`Account menu for ${displayName}`}
        >
          <Avatar size="sm">
            {user.profilePictureUrl ? (
              <AvatarImage src={user.profilePictureUrl} alt="" />
            ) : null}
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="text-sm font-medium leading-tight">{displayName}</span>
          <span className="text-xs text-muted-foreground leading-tight">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void signOut()}>Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function computeInitials(user: { firstName: string | null; lastName: string | null; email: string }): string {
  const first = user.firstName?.[0];
  const last = user.lastName?.[0];
  if (first || last) return `${first ?? ""}${last ?? ""}`.toUpperCase();
  return user.email[0]?.toUpperCase() ?? "?";
}
