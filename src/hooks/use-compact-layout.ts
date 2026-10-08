import { useEffect, useState } from "react";

/**
 * スマホ、または縦向きのタブレットのとき true。
 * 横に並べると窮屈になる画面（面接画面など）を、縦に積むレイアウトに切り替えるのに使う
 */
const QUERY = "(max-width: 767px), (orientation: portrait) and (max-width: 1100px)";

export function useCompactLayout(): boolean {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia(QUERY);
    const update = () => setCompact(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);
  return compact;
}
