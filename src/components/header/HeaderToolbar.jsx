import { IconChevronDown, IconGoogle, IconLock, IconReset } from "../common/icons";

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

export function HeaderToolbar({ isViewingSelf, locked, canLock, lockTooltip, onOpenLock, onReset, isAnonymous, linkingGoogle, onConnectGoogle }) {
  return (
    <div className="header-toolbar">
      {isViewingSelf && isAnonymous && (
        <button
          type="button"
          onClick={onConnectGoogle}
          disabled={linkingGoogle}
          className="header-action header-action--google w-8 px-0 sm:w-auto sm:px-3 disabled:cursor-not-allowed disabled:opacity-45"
          title="Connect Google account"
        >
          <IconGoogle className="h-4 w-4" />
          <span className="hidden sm:inline">{linkingGoogle ? "Connecting…" : "Connect"}</span>
        </button>
      )}
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
