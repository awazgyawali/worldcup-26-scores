import { useCallback, useEffect, useRef, useState } from "react";
import { buildAppSearch, mergeAppUrlState, parseAppSearch, syncAppUrl } from "../lib/appUrl";

export function useAppUrl() {
  const [urlState, setUrlState] = useState(() => parseAppSearch());
  const urlStateRef = useRef(urlState);
  urlStateRef.current = urlState;

  const hadExplicitTabRef = useRef(null);
  if (hadExplicitTabRef.current === null) {
    hadExplicitTabRef.current =
      typeof window !== "undefined" && !!new URLSearchParams(window.location.search).get("tab");
  }

  useEffect(() => {
    const onPop = () => setUrlState(parseAppSearch());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const updateUrl = useCallback((patch, { replace = false } = {}) => {
    const next = mergeAppUrlState(urlStateRef.current, patch);
    setUrlState(next);
    syncAppUrl(next, { replace });
  }, []);

  const setTab = useCallback(
    (tab, opts) => updateUrl({ tab }, opts),
    [updateUrl]
  );

  const setMatchNum = useCallback(
    (matchNum, opts) => updateUrl({ tab: "matchday", matchNum }, opts),
    [updateUrl]
  );

  const setMemberUid = useCallback(
    (memberUid, opts) => updateUrl({ tab: "standings", memberUid: memberUid || null }, opts),
    [updateUrl]
  );

  return {
    tab: urlState.tab,
    matchNum: urlState.matchNum,
    memberUid: urlState.memberUid,
    hadExplicitTab: hadExplicitTabRef.current,
    setTab,
    setMatchNum,
    setMemberUid,
    updateUrl,
    buildShareUrl: (overrides = {}) => {
      const merged = mergeAppUrlState(urlStateRef.current, overrides);
      if (typeof window === "undefined") return buildAppSearch(merged);
      return `${window.location.origin}${window.location.pathname}${buildAppSearch(merged)}`;
    },
  };
}
