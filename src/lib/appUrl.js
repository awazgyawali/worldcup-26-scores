const VALID_TABS = new Set(["bracket", "matchday", "standings"]);

/** @typedef {{ tab: string, matchNum: number | null, memberUid: string | null }} AppUrlState */

/** @returns {AppUrlState} */
export function parseAppSearch(search = typeof window !== "undefined" ? window.location.search : "") {
  const params = new URLSearchParams(search);
  const tabParam = params.get("tab");
  const matchParam = params.get("match");
  const memberParam = params.get("member");

  const matchNum = matchParam != null && matchParam !== "" ? Number.parseInt(matchParam, 10) : null;

  return {
    tab: tabParam && VALID_TABS.has(tabParam) ? tabParam : "bracket",
    matchNum: Number.isFinite(matchNum) ? matchNum : null,
    memberUid: memberParam || null,
  };
}

/** @param {AppUrlState} state */
export function buildAppSearch({ tab, matchNum, memberUid }) {
  const params = new URLSearchParams();
  if (tab && tab !== "bracket") params.set("tab", tab);
  if (tab === "matchday" && matchNum != null) params.set("match", String(matchNum));
  if (tab === "standings" && memberUid) params.set("member", memberUid);
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** @param {AppUrlState} state */
export function syncAppUrl(state, { replace = false } = {}) {
  if (typeof window === "undefined") return;
  const nextSearch = buildAppSearch(state);
  const currentSearch = window.location.search || "";
  if (nextSearch === currentSearch) return;
  const url = `${window.location.pathname}${nextSearch}${window.location.hash}`;
  if (replace) window.history.replaceState(state, "", url);
  else window.history.pushState(state, "", url);
}

/** @param {Partial<AppUrlState>} patch @param {AppUrlState} prev */
export function mergeAppUrlState(prev, patch) {
  const next = { ...prev, ...patch };
  if (next.tab !== "matchday") next.matchNum = null;
  if (next.tab !== "standings") next.memberUid = null;
  return next;
}
