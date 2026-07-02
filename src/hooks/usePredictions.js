import { useCallback, useEffect, useRef, useState } from "react";
import { collection, doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { onAuthStateChanged, signInAnonymously } from "firebase/auth";
import { auth, db, NAME_KEY, PREDICTIONS_COLLECTION } from "../firebase";

const SAVE_DEBOUNCE_MS = 800;

function readStoredName() {
  try {
    return localStorage.getItem(NAME_KEY)?.trim() || "";
  } catch {
    return "";
  }
}

function writeStoredName(name) {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    /* ignore quota errors */
  }
}

function mapPredictionDoc(id, data) {
  return {
    uid: id,
    name: data.name || "Anonymous",
    winners: data.winners || {},
    locked: !!data.locked,
    updatedAt: data.updatedAt?.toMillis?.() ?? 0,
  };
}

export function usePredictions(winners, { enabled = true, onRemoteWinners } = {}) {
  const [uid, setUid] = useState(null);
  const [name, setName] = useState(readStoredName);
  const [needsName, setNeedsName] = useState(() => !readStoredName());
  const [authReady, setAuthReady] = useState(false);
  const [locked, setLocked] = useState(false);
  const [locking, setLocking] = useState(false);
  const [friends, setFriends] = useState([]);
  const [viewingFriendUid, setViewingFriendUid] = useState(null);

  const saveTimerRef = useRef(null);
  const loadedRemoteRef = useRef(false);
  const wasLockedRef = useRef(false);
  const pendingWriteRef = useRef(null);
  const isSavingRef = useRef(false);
  const winnersRef = useRef(winners);
  const uidRef = useRef(uid);
  const viewingFriendUidRef = useRef(viewingFriendUid);
  const onRemoteWinnersRef = useRef(onRemoteWinners);

  winnersRef.current = winners;
  uidRef.current = uid;
  viewingFriendUidRef.current = viewingFriendUid;
  onRemoteWinnersRef.current = onRemoteWinners;

  const viewingFriend = viewingFriendUid
    ? friends.find((f) => f.uid === viewingFriendUid) ?? null
    : null;

  // Always-on realtime listener for every prediction doc.
  useEffect(() => {
    if (!enabled) return;

    const unsub = onSnapshot(
      collection(db, PREDICTIONS_COLLECTION),
      (snap) => {
        const list = snap.docs
          .map((d) => mapPredictionDoc(d.id, d.data()))
          .filter((f) => f.name)
          .sort((a, b) => a.name.localeCompare(b.name));
        setFriends(list);

        const self = uidRef.current ? list.find((f) => f.uid === uidRef.current) : null;
        if (!self) {
          if (uidRef.current) loadedRemoteRef.current = true;
          return;
        }

        const isLocked = self.locked;
        setLocked(isLocked);

        if (self.name && self.name !== name) {
          setName(self.name);
          writeStoredName(self.name);
        }

        const remoteWinners = self.winners;
        const hasRemote = Object.keys(remoteWinners).length > 0;
        const remoteJson = JSON.stringify(remoteWinners);
        const isEcho = pendingWriteRef.current === remoteJson;

        if (isEcho) {
          pendingWriteRef.current = null;
          isSavingRef.current = false;
        }

        const shouldSyncSelf =
          !viewingFriendUidRef.current &&
          hasRemote &&
          !isEcho &&
          !isSavingRef.current &&
          (isLocked ||
            !loadedRemoteRef.current ||
            (wasLockedRef.current && !isLocked) ||
            remoteJson !== JSON.stringify(winnersRef.current));

        if (shouldSyncSelf) {
          const force =
            isLocked || (wasLockedRef.current && !isLocked) || loadedRemoteRef.current;
          onRemoteWinnersRef.current?.(remoteWinners, { force });
        }

        loadedRemoteRef.current = true;
        wasLockedRef.current = isLocked;
      },
      () => setFriends([])
    );

    return unsub;
  }, [enabled, name]);

  // Ensure a profile doc exists as soon as we have auth + name (not only after pick changes).
  useEffect(() => {
    if (!enabled || !uid || !name || viewingFriendUid) return;

    let cancelled = false;
    (async () => {
      try {
        await setDoc(
          doc(db, PREDICTIONS_COLLECTION, uid),
          {
            uid,
            name,
            winners: winnersRef.current,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      } catch (err) {
        if (!cancelled) console.error("[WC26] Failed to create/update prediction doc:", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, uid, name, viewingFriendUid]);

  // Debounced Firestore save when picks change.
  useEffect(() => {
    if (!enabled || !uid || !name || viewingFriendUid || locked) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    isSavingRef.current = true;

    saveTimerRef.current = setTimeout(async () => {
      const payload = winnersRef.current;
      pendingWriteRef.current = JSON.stringify(payload);
      try {
        await setDoc(
          doc(db, PREDICTIONS_COLLECTION, uid),
          {
            uid,
            name,
            winners: payload,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      } catch (err) {
        pendingWriteRef.current = null;
        isSavingRef.current = false;
        console.error("[WC26] Failed to save picks:", err);
      }
    }, SAVE_DEBOUNCE_MS);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [enabled, uid, name, winners, viewingFriendUid, locked]);

  const submitName = useCallback(async (rawName) => {
    const trimmed = rawName.trim();
    if (!trimmed) return false;

    try {
      writeStoredName(trimmed);
      setName(trimmed);
      setNeedsName(false);

      const credential = await signInAnonymously(auth);
      const userId = credential.user.uid;
      setUid(userId);
      loadedRemoteRef.current = true;

      const payload = winnersRef.current;
      pendingWriteRef.current = JSON.stringify(payload);
      await setDoc(
        doc(db, PREDICTIONS_COLLECTION, userId),
        {
          uid: userId,
          name: trimmed,
          winners: payload,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      return true;
    } catch (err) {
      console.error("[WC26] Failed to sign in or save profile:", err);
      throw err;
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setAuthReady(true);
      return;
    }

    const storedName = readStoredName();
    if (!storedName) {
      setAuthReady(true);
      return;
    }

    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUid(user.uid);
        setAuthReady(true);
        return;
      }

      try {
        const credential = await signInAnonymously(auth);
        setUid(credential.user.uid);
      } catch (err) {
        console.error("[WC26] Anonymous sign-in failed — enable it in Firebase Console → Authentication:", err);
      } finally {
        setAuthReady(true);
      }
    });

    return unsub;
  }, [enabled]);

  const viewFriend = useCallback((friend) => {
    setViewingFriendUid(friend.uid);
  }, []);

  const exitFriendView = useCallback(() => {
    setViewingFriendUid(null);
  }, []);

  const lockPredictions = useCallback(async () => {
    if (!uid || locked) return false;
    setLocking(true);
    try {
      const payload = winnersRef.current;
      pendingWriteRef.current = JSON.stringify(payload);
      await setDoc(
        doc(db, PREDICTIONS_COLLECTION, uid),
        {
          uid,
          name,
          locked: true,
          lockedAt: serverTimestamp(),
          winners: payload,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      setLocked(true);
      wasLockedRef.current = true;
      return true;
    } catch (err) {
      pendingWriteRef.current = null;
      console.error("[WC26] Failed to lock picks:", err);
      return false;
    } finally {
      setLocking(false);
    }
  }, [uid, locked, name]);

  return {
    uid,
    name,
    needsName,
    authReady,
    submitName,
    locked,
    locking,
    lockPredictions,
    friends,
    viewingFriend,
    viewFriend,
    exitFriendView,
    readOnly: !!viewingFriendUid || locked,
  };
}
