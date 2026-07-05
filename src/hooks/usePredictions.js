import { useCallback, useEffect, useRef, useState } from "react";
import { collection, doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
} from "firebase/auth";
import { auth, db, googleProvider, PREDICTIONS_COLLECTION } from "../firebase";

const SAVE_DEBOUNCE_MS = 3000;

function mapPredictionDoc(id, data) {
  const trimmedName = data.name?.trim() || "";
  return {
    uid: id,
    name: trimmedName,
    winners: data.winners || {},
    locked: !!data.locked,
    lockedAt: data.lockedAt?.toMillis?.() ?? null,
    abandoned: !!data.abandoned,
    updatedAt: data.updatedAt?.toMillis?.() ?? 0,
    authProvider: data.authProvider || "email",
    // Manually set to true in Firestore when a player pays into the pot.
    paid: !!data.paid,
  };
}

// "google" | "email" — persisted on the doc so the friends list can
// show how someone signed in without a second read against Firebase Auth.
function getAuthProviderTag(user) {
  if (!user) return null;
  const providerId = user.providerData?.[0]?.providerId;
  if (providerId === "google.com") return "google";
  if (providerId === "password") return "email";
  return "email";
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
  if (code === "auth/credential-already-in-use") {
    return "Could not connect Google account. Try again.";
  }
  if (code === "auth/popup-closed-by-user") {
    return "";
  }
  if (context === "auth") {
    return `Sign-in failed. Enable Google and Email/Password auth in Firebase and add "${host}" to Authorized domains.`;
  }
  return message || "Failed to sync predictions.";
}

function formatEmailAuthError(err) {
  const code = err?.code || "";
  switch (code) {
    case "auth/email-already-in-use":
      return "That email is already registered — try signing in instead.";
    case "auth/invalid-email":
      return "Enter a valid email address.";
    case "auth/weak-password":
      return "Password must be at least 6 characters.";
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Incorrect email or password.";
    case "auth/user-not-found":
      return "No account found with that email.";
    case "auth/too-many-requests":
      return "Too many attempts — try again in a few minutes.";
    case "auth/credential-already-in-use":
      return "That email is already registered — try signing in instead.";
    default:
      return err?.message || "Something went wrong — try again.";
  }
}

function winnersJson(winners) {
  return JSON.stringify(winners ?? {});
}

function mergeWinners(existing = {}, incoming = {}) {
  return { ...existing, ...incoming };
}

export function usePredictions(winners, { enabled = true, onRemoteWinners } = {}) {
  const [uid, setUid] = useState(null);
  const [name, setName] = useState("");
  const [userEmail, setUserEmail] = useState(null);
  const [authProvider, setAuthProvider] = useState(null);
  const [needsName, setNeedsName] = useState(true);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [syncError, setSyncError] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [locked, setLocked] = useState(false);
  const [lockedAt, setLockedAt] = useState(null);
  const [locking, setLocking] = useState(false);
  const [friends, setFriends] = useState([]);
  const [friendsReady, setFriendsReady] = useState(false);
  const [viewingFriendUid, setViewingFriendUid] = useState(null);
  const [linkingGoogle, setLinkingGoogle] = useState(false);

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
  const prevProfileUidRef = useRef(null);

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
          authProvider: getAuthProviderTag(auth.currentUser),
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
    if (!enabled) {
      setFriendsReady(true);
      return;
    }

    const unsub = onSnapshot(
      collection(db, PREDICTIONS_COLLECTION),
      (snap) => {
        const list = snap.docs
          .map((d) => mapPredictionDoc(d.id, d.data()))
          .filter((f) => f.name && !f.abandoned)
          .sort((a, b) => a.name.localeCompare(b.name));
        setFriends(list);
        setFriendsReady(true);
      },
      (err) => {
        console.error("[WC26] Firestore listener error:", err);
        setSyncError(formatSyncError(err, "listen"));
        setFriends([]);
        setFriendsReady(true);
        if (uidRef.current) {
          setProfileLoaded(true);
          setNeedsName(true);
        }
      }
    );

    return unsub;
  }, [enabled]);

  // Don't block the shell forever if Firestore is slow or offline on first visit.
  useEffect(() => {
    if (!enabled || friendsReady) return undefined;
    const timer = setTimeout(() => {
      console.warn("[WC26] Friends snapshot timed out — continuing");
      setFriendsReady(true);
      if (uidRef.current) setProfileLoaded(true);
    }, 10000);
    return () => clearTimeout(timer);
  }, [enabled, friendsReady]);

  // Resolve the signed-in user's profile once auth uid and the first Firestore snapshot are in.
  useEffect(() => {
    if (!enabled || !friendsReady) return;

    if (!uid) {
      setProfileLoaded(false);
      prevProfileUidRef.current = null;
      return;
    }

    if (prevProfileUidRef.current !== uid) {
      loadedRemoteRef.current = false;
      lastPersistedJsonRef.current = null;
      prevProfileUidRef.current = uid;
    }

    setProfileLoaded(true);

    const self = friends.find((f) => f.uid === uid) ?? null;

    if (!self) {
      loadedRemoteRef.current = true;
      setName("");
      setNeedsName(true);
      setLocked(false);
      setLockedAt(null);
      lockedRef.current = false;
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
    setLockedAt(self.lockedAt ?? null);

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
      lastPersistedJsonRef.current = remoteJson;
    }

    loadedRemoteRef.current = true;
    wasLockedRef.current = isLocked || lockedRef.current;
  }, [enabled, uid, friends, friendsReady]);

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

    const userId = uidRef.current;
    if (!userId) {
      setAuthError("Sign in with Google or email before saving your name.");
      return false;
    }

    try {
      setName(trimmed);
      setNeedsName(false);
      loadedRemoteRef.current = true;

      const payload = winnersRef.current;
      const ok = await persistWinners(payload, { force: true });
      if (!ok) return false;
      return true;
    } catch (err) {
      console.error("[WC26] Failed to save profile:", err);
      setAuthError(formatSyncError(err, "auth"));
      throw err;
    }
  }, [persistWinners]);

  const connectGoogle = useCallback(async ({ submitNameAfter = false } = {}) => {
    setLinkingGoogle(true);
    setAuthError(null);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;

      setUid(user.uid);
      setUserEmail(user.email ?? null);
      setAuthProvider(getAuthProviderTag(user));

      if (submitNameAfter) {
        const displayName = user.displayName?.trim() || "";
        if (displayName) {
          const ok = await submitName(displayName);
          return ok ? { success: true } : { success: false };
        }
        return { needsManualName: true };
      }

      return { success: true };
    } catch (err) {
      if (err?.code === "auth/popup-closed-by-user") {
        return { cancelled: true };
      }
      console.error("[WC26] Google sign-in failed:", err);
      const message = formatSyncError(err, "auth");
      if (message) setAuthError(message);
      throw err;
    } finally {
      setLinkingGoogle(false);
    }
  }, [submitName]);

  const signUpWithEmail = useCallback(async (email, password, displayName) => {
    setAuthError(null);
    try {
      const result = await createUserWithEmailAndPassword(auth, email, password);
      const user = result.user;

      setUid(user.uid);
      setUserEmail(user.email ?? null);
      setAuthProvider(getAuthProviderTag(user));

      const localName = displayName?.trim() || "";
      if (localName) {
        const ok = await submitName(localName);
        return ok ? { success: true } : { success: false };
      }
      return { needsManualName: true };
    } catch (err) {
      console.error("[WC26] Email sign-up failed:", err);
      const message = formatEmailAuthError(err);
      setAuthError(message);
      return { success: false, error: message };
    }
  }, [submitName]);

  const signInWithEmail = useCallback(async (email, password) => {
    setAuthError(null);
    try {
      const result = await signInWithEmailAndPassword(auth, email, password);
      const user = result.user;

      setUid(user.uid);
      setUserEmail(user.email ?? null);
      setAuthProvider(getAuthProviderTag(user));
      return { success: true };
    } catch (err) {
      console.error("[WC26] Email sign-in failed:", err);
      const message = formatEmailAuthError(err);
      setAuthError(message);
      return { success: false, error: message };
    }
  }, []);

  const resetPassword = useCallback(async (email) => {
    try {
      await sendPasswordResetEmail(auth, email);
      return { success: true };
    } catch (err) {
      console.error("[WC26] Password reset failed:", err);
      return { success: false, error: formatEmailAuthError(err) };
    }
  }, []);

  const signOutUser = useCallback(async () => {
    try {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      setViewingFriendUid(null);
      wasLockedRef.current = false;
      lockedRef.current = false;
      lockingRef.current = false;
      setLocked(false);
      setLockedAt(null);
      setLocking(false);
      setName("");
      setNeedsName(true);
      setUserEmail(null);
      setAuthProvider(null);
      setProfileLoaded(false);
      prevProfileUidRef.current = null;
      loadedRemoteRef.current = false;
      lastPersistedJsonRef.current = null;
      pendingWriteRef.current = null;
      onRemoteWinnersRef.current?.({}, { force: true });
      setUid(null);
      await firebaseSignOut(auth);
      return { success: true };
    } catch (err) {
      console.error("[WC26] Sign out failed:", err);
      setAuthError(formatSyncError(err, "auth"));
      return { success: false };
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setAuthReady(true);
      setFriendsReady(true);
      setProfileLoaded(true);
      return;
    }

    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUid(user.uid);
        setUserEmail(user.email ?? null);
        setAuthProvider(getAuthProviderTag(user));
        setAuthError(null);
        setAuthReady(true);
        return;
      }

      setUid(null);
      setUserEmail(null);
      setAuthProvider(null);
      setNeedsName(true);
      setProfileLoaded(false);
      prevProfileUidRef.current = null;
      setAuthReady(true);
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
          authProvider: getAuthProviderTag(auth.currentUser),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      lastPersistedJsonRef.current = payloadJson;
      wasLockedRef.current = true;
      setLockedAt(Date.now());
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

  return {
    uid,
    name,
    email: userEmail,
    authProvider,
    needsName,
    profileLoaded,
    authReady,
    authError,
    syncError,
    syncing,
    clearSyncError,
    persistWinners,
    submitName,
    connectGoogle,
    signUpWithEmail,
    signInWithEmail,
    resetPassword,
    signOutUser,
    linkingGoogle,
    locked,
    lockedAt,
    locking,
    lockPredictions,
    friends,
    friendsReady,
    viewingFriend,
    viewFriend,
    exitFriendView,
    readOnly: !!viewingFriendUid || locked,
  };
}
