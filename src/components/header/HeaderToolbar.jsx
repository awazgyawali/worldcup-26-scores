import { useEffect, useRef, useState } from "react";
import { IconBracket, IconChevronDown, IconLock, IconMatchday, IconReset, IconSignOut, IconStandings } from "../common/icons";
import { ProviderIcon } from "../common/ProviderIcon";
import { SignOutConfirmModal } from "../modals/SignOutConfirmModal";

// ----------------------------------------------------------------------------
// HEADER TOOLBAR
// ----------------------------------------------------------------------------
export function ViewingAsPicker({ name, isSelf = true, onClick, disabled = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "viewing-as-picker disabled:cursor-not-allowed disabled:opacity-50",
        !isSelf && "viewing-as-picker--other",
      ].filter(Boolean).join(" ")}
      title="Tap to switch whose bracket you are viewing"
    >
      <span className="viewing-as-picker__label">Viewing</span>
      <span className="viewing-as-picker__name">{isSelf ? "You" : name}</span>
      <IconChevronDown className="viewing-as-picker__chevron" />
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

const ALL_TABS = [
  { id: "matchday", label: "Matchday", icon: IconMatchday },
  { id: "bracket", label: "Bracket", icon: IconBracket },
  { id: "standings", label: "Standings", icon: IconStandings },
];

export function TabNav({ active, onChange, variant = "top", className = "" }) {
  const isBottom = variant === "bottom";
  const tabs = ALL_TABS;
  return (
    <nav
      className={["tab-nav", isBottom && "tab-nav--bottom", className].filter(Boolean).join(" ")}
      aria-label="Sections"
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={[
              "tab-nav__item",
              isBottom && "tab-nav__item--bottom",
              active === tab.id && "tab-nav__item--active",
            ].filter(Boolean).join(" ")}
            aria-current={active === tab.id ? "true" : undefined}
          >
            {isBottom && <Icon className="tab-nav__icon" />}
            <span>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

export function ComparePill({ compareFriend, agreement, onOpen, onClear }) {
  if (!compareFriend) {
    return (
      <button type="button" onClick={onOpen} className="compare-pill compare-pill--empty">
        Compare with a rival
      </button>
    );
  }
  return (
    <div className="compare-pill">
      <span className="compare-pill__label">Comparing with</span>
      <button type="button" onClick={onOpen} className="compare-pill__name">
        {compareFriend.name}
        {agreement.total > 0 && (
          <span className="compare-pill__agreement">{agreement.agree}/{agreement.total}</span>
        )}
      </button>
      <button type="button" onClick={onClear} className="compare-pill__clear" aria-label="Stop comparing">
        ✕
      </button>
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
