import { IconGoogle, IconMail, IconUser } from "./icons";

// ----------------------------------------------------------------------------
// PROVIDER ICON — shows how someone signed in (Google / email).
// Shared by FriendsModal's rows and the header AccountMenu trigger so both
// surfaces stay in sync: only show the plain person icon when there truly is
// no Google/email credential on the account.
// ----------------------------------------------------------------------------
export function ProviderIcon({ provider, className = "" }) {
  const cls = ["provider-icon", className].filter(Boolean).join(" ");

  if (provider === "google") {
    return (
      <span className={cls} title="Signed in with Google">
        <IconGoogle />
      </span>
    );
  }
  if (provider === "email") {
    return (
      <span className={[cls, "provider-icon--email"].join(" ")} title="Signed in with email">
        <IconMail />
      </span>
    );
  }
  return (
    <span className={[cls, "provider-icon--anon"].join(" ")} title="Signed in">
      <IconUser />
    </span>
  );
}
