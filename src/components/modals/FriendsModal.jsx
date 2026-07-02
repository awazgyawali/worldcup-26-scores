import { Drawer } from "../common/Modal";

// ----------------------------------------------------------------------------
// FRIENDS / LEADERBOARD DRAWER
// ----------------------------------------------------------------------------
function ViewerDrawerRankedRow({ friend, rank, isMe, isActive, onSelect }) {
  const hasGraded = friend.total > 0;
  const rankClass =
    rank === 1 ? "viewer-drawer-row__rank--1" : rank <= 3 ? `viewer-drawer-row__rank--${rank}` : "";

  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(friend)}
        className={["viewer-drawer-row", isActive && "viewer-drawer-row--active"].filter(Boolean).join(" ")}
        aria-current={isActive ? "true" : undefined}
      >
        <span className={["viewer-drawer-row__rank", rankClass].filter(Boolean).join(" ")}>{rank}</span>
        <span className="viewer-drawer-row__main">
          <span className="viewer-drawer-row__name-line">
            <span className="viewer-drawer-row__name">{friend.name}</span>
            {isMe && <span className="viewer-drawer-row__tag">you</span>}
          </span>
          <span className="viewer-drawer-row__stat">
            {hasGraded ? `${friend.correct}/${friend.total} correct` : "No graded picks"}
          </span>
        </span>
        <span className="viewer-drawer-row__score">
          <span className="viewer-drawer-row__pts">{friend.points}</span>
        </span>
      </button>
    </li>
  );
}

function ViewerDrawerOpenRow({ friend, isMe, isActive, onSelect }) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(friend)}
        className={["viewer-drawer-row viewer-drawer-row--open", isActive && "viewer-drawer-row--active"].filter(Boolean).join(" ")}
        aria-current={isActive ? "true" : undefined}
      >
        <span className="viewer-drawer-row__main">
          <span className="viewer-drawer-row__name-line">
            <span className="viewer-drawer-row__name">{friend.name}</span>
            {isMe && <span className="viewer-drawer-row__tag">you</span>}
          </span>
        </span>
        <span className="viewer-drawer-row__open-badge">Open</span>
      </button>
    </li>
  );
}

export function FriendsModal({ open, onClose, friends, currentUid, activeUid, onSelect }) {
  const lockedFriends = friends.filter((f) => f.locked);
  const openFriends = friends.filter((f) => !f.locked);

  return (
    <Drawer open={open} onClose={onClose} width="max-w-[300px]">
      <div className="flex h-full min-h-0 flex-col">
        <div className="viewer-drawer-header">
          <div>
            <h2 className="viewer-drawer-header__title">Switch viewer</h2>
            <p className="viewer-drawer-header__meta">
              {friends.length > 0
                ? `${lockedFriends.length} locked · ${openFriends.length} still editing`
                : "Pick a bracket to view"}
            </p>
          </div>
          <button type="button" onClick={onClose} className="btn-ghost grid h-8 w-8 shrink-0 place-items-center rounded-lg text-sm" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="viewer-drawer-body">
          {friends.length === 0 ? (
            <p className="viewer-drawer-empty">No predictions yet — be the first!</p>
          ) : (
            <>
              {lockedFriends.length > 0 && (
                <section className="viewer-drawer-section">
                  <p className="viewer-drawer-section__label">Leaderboard</p>
                  <div className="viewer-drawer-columns" aria-hidden="true">
                    <span>#</span>
                    <span>Player</span>
                    <span className="viewer-drawer-columns__pts">Pts</span>
                  </div>
                  <ul className="viewer-drawer-list">
                    {lockedFriends.map((friend, idx) => (
                      <ViewerDrawerRankedRow
                        key={friend.uid}
                        friend={friend}
                        rank={idx + 1}
                        isMe={friend.uid === currentUid}
                        isActive={friend.uid === activeUid}
                        onSelect={onSelect}
                      />
                    ))}
                  </ul>
                </section>
              )}

              {openFriends.length > 0 && (
                <section className="viewer-drawer-section">
                  <p className="viewer-drawer-section__label">Still editing · {openFriends.length}</p>
                  <ul className="viewer-drawer-list">
                    {openFriends.map((friend) => (
                      <ViewerDrawerOpenRow
                        key={friend.uid}
                        friend={friend}
                        isMe={friend.uid === currentUid}
                        isActive={friend.uid === activeUid}
                        onSelect={onSelect}
                      />
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </Drawer>
  );
}
