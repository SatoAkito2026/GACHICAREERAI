import { useEffect, useRef, type ComponentProps } from "react";
import { Navigate, useRouter } from "@tanstack/react-router";

/**
 * 表示されたら一度だけ別のページへ移動する（ルーターの <Navigate> の代わり）。
 *
 * <Navigate> は描画のたびに移動をやり直すため、移動先のページを読み込んでいる間に
 * 画面が描き直されると移動が延々と繰り返され、ページが固まっていた
 * （ログインしていない状態でマイページなどを開くと「読み込み中」のまま止まる不具合）。
 */
export function SafeNavigate(props: ComponentProps<typeof Navigate>) {
  const router = useRouter();
  const lastTarget = useRef<string | null>(null);
  const target = JSON.stringify([props.to, props.search ?? null, props.params ?? null]);

  useEffect(() => {
    if (lastTarget.current === target) return;
    lastTarget.current = target;
    void router.navigate({ replace: true, ...props } as Parameters<typeof router.navigate>[0]);
    // 移動先が変わったときだけやり直す
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return null;
}
