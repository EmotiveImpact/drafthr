import { UserButton, SignedIn, SignedOut, SignInButton } from "@clerk/clerk-react";
import { Button } from "@/components/ui/button";
import { AUTH_ENABLED } from "./index";

/**
 * Renders the user button in the header when auth is on; nothing when off.
 */
export function UserChip() {
  if (!AUTH_ENABLED) return null;
  return (
    <>
      <SignedIn>
        <UserButton afterSignOutUrl="/" appearance={{ elements: { avatarBox: "size-7" } }} />
      </SignedIn>
      <SignedOut>
        <SignInButton mode="modal">
          <Button size="sm" variant="ghost">Sign in</Button>
        </SignInButton>
      </SignedOut>
    </>
  );
}
