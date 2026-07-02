import { useCallback, useEffect, useRef, useState } from "react";
import { collection, doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { onAuthStateChanged, signInAnonymously } from "firebase/auth";
import { auth, db, PREDICTIONS_COLLECTION } from "../firebase";

const SAVE_DEBOUNCE_MS = 3000;

function mapPredictionDoc(id, data) {
  const trimmedName = data.name?.trim() || "";
  return {
    uid: id,
    name: trimmedName,
    winners: data.winners || {},
    locked: !!data.locked,
    updatedAt: data.updatedAt?.toMillis?.() ?? 0,
  };
}

function formatSyncError(err, context = "save") {
  const code = err?.code || "";
  const message = err?.message || String(err);
  const host = typeof window !== "undefined" ? window.location.hostname : "";

  if (code === "auth/unauthorized-domain" || message.includes("unauthorized-domain")) {
    return `Firebase Auth blocked this site. Add "${host}" to Firebase Console → Authentication → Settings → Authorized domains.`;
  }
  if (code === "permission-denied") {
    return "Firestore denied the save. Check that you're signed in and rules allow writes to your own predictions doc.";
  }
  if (context === "auth") {
    return `Sign-in failed. Enable Anonymous auth in Firebase and add "${host}" to Authorized domains.`;
  }
  return message || "Failed to sync predictions.";
}

function winnersJson(winners) {
  return JSON.stringify(winners ?? {});
}

export function usePredictions(winners, { enabled = true, onRemoteWinners } = {}) {
  const [uid, setUid] = useState(null);
  const [name, setName] = useState("");
  const [needsName, setNeedsName] = useState(true);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [syncError, setSyncError] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [locked, setLocked] = useState(false);
  const [locking, setLocking] = useState(false);
  const [friends, setFriends] = useState([]);
  const [viewingFriendUid, setViewingFriendUid] = useState(null);

  const saveTimerRef = useRef(null);
  const loadedRemoteRef = useRef(false);
  const wasLockedRef = useRef(false);
  const pendingWriteRef = useRef(null);
  const isSavingRef = useRef(false);
  const lastPersistedJsonRef = useRef(null);
  const lockingRef = useRef(false);
  const lockedRef = useRef(false);
  const winnersRef = useRef(winners);
  const uidRef = useRef(uid);
  const nameRef = useRef(name);
  const viewingFriendUidRef = useRef(viewingFriendUid);
  const onRemoteWinnersRef = useRef(onRemoteWinners);

  winnersRef.current = winners;
  uidRef.current = uid;
  nameRef.current = name;
  viewingFriendUidRef.current = viewingFriendUid;
  onRemoteWinnersRef.current = onRemoteWinners;

  const viewingFriend = viewingFriendUid
    ? friends.find((f) => f.uid === viewingFriendUid) ?? null
    : null;

  const persistWinners = useCallback(async (payload = winnersRef.current, { force = false } = {}) => {
    if (!enabled) {
      setSyncError("Cloud sync is disabled.");
      return false;
    }

    const userId = uidRef.current;
    const userName = nameRef.current;
    if (!userId) {
      setSyncError(formatSyncError({ code: "auth/unauthorized-domain" }, "auth"));
      return false;
    }
    if (!userName) {
      setSyncError("Enter your name before saving predictions.");
      return false;
    }

    const payloadJson = winnersJson(payload);
    if (!force && payloadJson === lastPersistedJsonRef.current) {
      return true;
    }

    setSyncing(true);
    try {
      pendingWriteRef.current = payloadJson;
      isSavingRef.current = true;
      await setDoc(
        doc(db, PREDICTIONS_COLLECTION, userId),
        {
          uid: userId,
          name: userName,
          winners: payload,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      lastPersistedJsonRef.current = payloadJson;
      setSyncError(null);
      return true;
    } catch (err) {
      pendingWriteRef.current = null;
      isSavingRef.current = false;
      console.error("[WC26] Failed to save predictions:", err);
      setSyncError(formatSyncError(err));
      return false;
    } finally {
      setSyncing(false);
    }
  }, [enabled]);

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

        if (!uidRef.current) return;

        setProfileLoaded(true);

        if (!self) {
          loadedRemoteRef.current = true;
          setName("");
          setNeedsName(true);
          return;
        }

        setName(self.name);
        setNeedsName(false);

        const isLocked = self.locked;
        if (isLocked) {
          lockedRef.current = true;
          setLocked(true);
        } else if (!lockingRef.current) {
          lockedRef.current = false;
          setLocked(false);
        }

        const remoteWinners = self.winners;
        const hasRemote = Object.keys(remoteWinners).length > 0;
        const remoteJson = winnersJson(remoteWinners);
        const isEcho = pendingWriteRef.current === remoteJson;

        if (isEcho) {
          pendingWriteRef.current = null;
          isSavingRef.current = false;
          lastPersistedJsonRef.current = remoteJson;
        }

        const shouldSyncSelf =
          !viewingFriendUidRef.current &&
          hasRemote &&
          !isEcho &&
          !isSavingRef.current &&
          (isLocked ||
            lockedRef.current ||
            !loadedRemoteRef.current ||
            (wasLockedRef.current && !isLocked) ||
            remoteJson !== winnersJson(winnersRef.current));

        if (shouldSyncSelf) {
          lastPersistedJsonRef.current = remoteJson;
          const force =
            isLocked ||
            lockedRef.current ||
            (wasLockedRef.current && !isLocked) ||
            !loadedRemoteRef.current;
          onRemoteWinnersRef.current?.(remoteWinners, { force });
        } else if (hasRemote && !isEcho) {
          // Remote is current — treat as persisted even if local state already matches.
          lastPersistedJsonRef.current = remoteJson;
        }

        loadedRemoteRef.current = true;
        wasLockedRef.current = isLocked || lockedRef.current;
      },
      (err) => {
        console.error("[WC26] Firestore listener error:", err);
        setSyncError(formatSyncError(err, "listen"));
        setFriends([]);
      }
    );

    return unsub;
  }, [enabled]);

  // Debounced save only when local picks actually differ from last persisted snapshot.
  useEffect(() => {
    if (!enabled || !uid || !name || !loadedRemoteRef.current) return;

    const payloadJson = winnersJson(winners);
    if (payloadJson === lastPersistedJsonRef.current) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void persistWinners(winnersRef.current);
    }, SAVE_DEBOUNCE_MS);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [enabled, uid, name, winners, persistWinners]);

  const submitName = useCallback(async (rawName) => {
    const trimmed = rawName.trim();
    if (!trimmed) return false;

    try {
      let userId = uidRef.current;
      if (!userId) {
        const credential = await signInAnonymously(auth);
        userId = credential.user.uid;
        setUid(userId);
        setAuthError(null);
      }

      setName(trimmed);
      setNeedsName(false);
      loadedRemoteRef.current = true;

      const payload = winnersRef.current;
      const ok = await persistWinners(payload, { force: true });
      if (!ok) return false;
      return true;
    } catch (err) {
      console.error("[WC26] Failed to sign in or save profile:", err);
      setAuthError(formatSyncError(err, "auth"));
      throw err;
    }
  }, [persistWinners]);

  useEffect(() => {
    if (!enabled) {
      setAuthReady(true);
      return;
    }

    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUid(user.uid);
        setAuthError(null);
        setAuthReady(true);
        return;
      }

      try {
        const credential = await signInAnonymously(auth);
        setUid(credential.user.uid);
        setAuthError(null);
      } catch (err) {
        console.error("[WC26] Anonymous sign-in failed — enable it in Firebase Console → Authentication:", err);
        setAuthError(formatSyncError(err, "auth"));
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
    if (!uid || locked || lockedRef.current) return false;
    lockingRef.current = true;
    lockedRef.current = true;
    setLocked(true);
    setLocking(true);
    try {
      const payload = winnersRef.current;
      const payloadJson = winnersJson(payload);
      pendingWriteRef.current = payloadJson;
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
      lastPersistedJsonRef.current = payloadJson;
      wasLockedRef.current = true;
      setSyncError(null);
      return true;
    } catch (err) {
      pendingWriteRef.current = null;
      lockingRef.current = false;
      lockedRef.current = false;
      setLocked(false);
      console.error("[WC26] Failed to lock picks:", err);
      setSyncError(formatSyncError(err));
      return false;
    } finally {
      lockingRef.current = false;
      setLocking(false);
    }
  }, [uid, locked, name]);

  const clearSyncError = useCallback(() => {
    setSyncError(null);
    setAuthError(null);
  }, []);

  useEffect(() => {
    setProfileLoaded(false);
    loadedRemoteRef.current = false;
    lastPersistedJsonRef.current = null;
  }, [uid]);

  return {
    uid,
    name,
    needsName,
    profileLoaded,
    authReady,
    authError,
    syncError,
    syncing,
    clearSyncError,
    persistWinners,
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
