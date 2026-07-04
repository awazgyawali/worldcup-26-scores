import { useEffect, useRef, useState } from "react";
import { IconChevronDown, IconLock, IconReset, IconSignOut } from "../common/icons";
import { ProviderIcon } from "../common/ProviderIcon";
import { SignOutConfirmModal } from "../modals/SignOutConfirmModal";

// ----------------------------------------------------------------------------
// HEADER TOOLBAR
// ----------------------------------------------------------------------------
export function ViewingAsPicker({ name, onClick, disabled = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="viewing-as-picker disabled:cursor-not-allowed disabled:opacity-50"
      title="Tap to switch whose bracket you are viewing"
    >
      <span className="viewing-as-picker__label">Viewing as</span>
      <span className="viewing-as-picker__row">
        <span className="viewing-as-picker__name">{name}</span>
        <IconChevronDown className="viewing-as-picker__chevron" />
      </span>
    </button>
  );
}

// Account icon with a popover (email + sign out) and a confirm-before-sign-out dialog.
// The trigger shows the Google/email provider icon whenever the account has one —
// the plain anonymous icon only appears if the user truly has no other login method.
export function AccountMenu({ email, authProvider, onSignOut }) {
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDocClick);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!email) return null;

  const handleConfirmSignOut = async () => {
    setSigningOut(true);
    try {
      const result = await onSignOut();
      return result?.success !== false;
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <div className="account-menu" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="account-menu__trigger"
        title={`Signed in as ${email}`}
        aria-haspopup="true"
        aria-expanded={open}
      >
        <ProviderIcon provider={authProvider} className="account-menu__trigger-icon" />
      </button>
      {open && (
        <div className="account-menu__popover" role="menu">
          <p className="account-menu__email" title={email}>
            <ProviderIcon provider={authProvider} />
            <span>{email}</span>
          </p>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setConfirmOpen(true);
            }}
            className="account-menu__signout"
          >
            <IconSignOut />
            Sign out
          </button>
        </div>
      )}
      <SignOutConfirmModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleConfirmSignOut}
        signingOut={signingOut}
      />
    </div>
  );
}

export function HeaderToolbar({ isViewingSelf, locked, canLock, lockTooltip, onOpenLock, onReset }) {
  return (
    <div className="header-toolbar">
      {locked ? (
        <span className="header-locked" title={isViewingSelf ? "Your picks are locked" : "This bracket is locked"}>
          <IconLock />
          <span className="hidden sm:inline">Locked</span>
        </span>
      ) : isViewingSelf ? (
        <button
          type="button"
          onClick={onOpenLock}
          disabled={!canLock}
          className="header-action header-action--lock w-8 px-0 sm:w-auto sm:px-3 disabled:cursor-not-allowed disabled:opacity-45"
          title={lockTooltip}
        >
          <IconLock />
          <span className="hidden sm:inline">Lock</span>
        </button>
      ) : (
        <span className="header-open" title="This bracket is still open for picks">
          <IconLock />
          <span className="hidden sm:inline">Open</span>
        </span>
      )}
      {isViewingSelf && !locked && (
        <button
          type="button"
          onClick={onReset}
          className="header-action header-action--reset w-8 px-0 sm:w-auto sm:px-3"
          title="Clear all predictions"
        >
          <IconReset />
          <span className="hidden sm:inline">Reset</span>
        </button>
      )}
    </div>
  );
}
