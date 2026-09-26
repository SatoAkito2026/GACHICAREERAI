/**
 * AI面接官の 3D アバター（three.js）。外部サービスを使わずブラウザ内で描画する。
 * - 口パク: AvatarVoice の音量・声の明るさに合わせて口を開閉
 * - まばたき・呼吸・首の揺れ・話している間の軽いうなずき
 * - style で眉の形（表情の印象）を切り替える
 */
import { useEffect, useRef } from "react";
import type * as THREE_NS from "three";
import type { AvatarVoice } from "@/lib/avatar-voice";

export type AvatarStyle = "friendly" | "neutral" | "strict";

type Props = {
  voice: AvatarVoice | null;
  style?: AvatarStyle;
  /** 3D の準備ができたら呼ばれる */
  onReady?: () => void;
  className?: string;
};

const COLORS = {
  skin: 0xf2cfb0,
  skinShade: 0xe3b594,
  hair: 0x2a1c16,
  suit: 0x1e2940,
  suitDark: 0x151d30,
  blouse: 0xf7f7f5,
  iris: 0x3b2618,
  lip: 0xc9776f,
  mouth: 0x5c1f22,
  teeth: 0xf4f1ec,
  blush: 0xf09a8a,
};

export function InterviewerAvatar({ voice, style = "neutral", onReady, className }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const voiceRef = useRef(voice);
  voiceRef.current = voice;
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let disposed = false;
    let cleanup = () => {};

    void import("three").then((THREE) => {
      if (disposed) return;
      cleanup = buildScene(THREE, mount, style, () => voiceRef.current);
      onReadyRef.current?.();
    });

    return () => {
      disposed = true;
      cleanup();
    };
  }, [style]);

  return (
    <div
      ref={mountRef}
      className={className}
      style={{
        width: "100%",
        height: "100%",
        background: "radial-gradient(ellipse at 50% 35%, #f4f1ec 0%, #dcd6cc 55%, #b9b2a6 100%)",
      }}
    />
  );
}

function buildScene(
  THREE: typeof THREE_NS,
  mount: HTMLDivElement,
  style: AvatarStyle,
  getVoice: () => AvatarVoice | null,
): () => void {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.domElement.style.display = "block";
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  mount.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(24, 1, 0.1, 20);
  const lookAt = new THREE.Vector3(0, 1.5, 0);

  // ---- ライティング（柔らかいスタジオ光）----
  scene.add(new THREE.HemisphereLight(0xfff8f0, 0x6b6258, 1.1));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(0.8, 2.2, 2.4);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xdfe8ff, 0.5);
  fill.position.set(-1.5, 1.4, 1.5);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffffff, 0.8);
  rim.position.set(0, 2.2, -2);
  scene.add(rim);

  const disposables: { dispose: () => void }[] = [];
  const mat = (color: number, opts: Partial<THREE_NS.MeshStandardMaterialParameters> = {}) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.65, metalness: 0, ...opts });
    disposables.push(m);
    return m;
  };
  const geo = <G extends THREE_NS.BufferGeometry>(g: G) => {
    disposables.push(g);
    return g;
  };
  const mesh = (
    g: THREE_NS.BufferGeometry,
    m: THREE_NS.Material,
    pos: [number, number, number] = [0, 0, 0],
    scale: [number, number, number] = [1, 1, 1],
    rot: [number, number, number] = [0, 0, 0],
  ) => {
    const o = new THREE.Mesh(g, m);
    o.position.set(...pos);
    o.scale.set(...scale);
    o.rotation.set(...rot);
    return o;
  };

  const skin = mat(COLORS.skin, { roughness: 0.55 });
  const skinShade = mat(COLORS.skinShade, { roughness: 0.6 });
  const hair = mat(COLORS.hair, { roughness: 0.45 });
  const hairShell = mat(COLORS.hair, { roughness: 0.45, side: THREE.DoubleSide });
  const suit = mat(COLORS.suit, { roughness: 0.8 });
  const suitDark = mat(COLORS.suitDark, { roughness: 0.85 });
  const blouse = mat(COLORS.blouse, { roughness: 0.7 });
  const white = mat(0xffffff, { roughness: 0.3 });
  const iris = mat(COLORS.iris, { roughness: 0.2 });
  const black = mat(0x0c0908, { roughness: 0.2 });
  const lip = mat(COLORS.lip, { roughness: 0.4 });
  const mouthInside = mat(COLORS.mouth, { roughness: 0.9 });
  const teeth = mat(COLORS.teeth, { roughness: 0.4 });
  const blush = mat(COLORS.blush, {
    transparent: true,
    opacity: style === "friendly" ? 0.35 : 0.18,
  });

  const sphere = geo(new THREE.SphereGeometry(1, 48, 32));
  const lowSphere = geo(new THREE.SphereGeometry(1, 24, 16));

  const root = new THREE.Group();
  scene.add(root);

  // ---- 体（スーツ + ブラウス）----
  const body = new THREE.Group();
  root.add(body);
  body.add(
    mesh(geo(new THREE.CylinderGeometry(0.165, 0.18, 0.5, 48)), suit, [0, 1.05, 0], [1, 1, 0.55]),
  );
  body.add(mesh(sphere, suit, [0, 1.3, 0], [0.168, 0.06, 0.092]));
  // ブラウスの V ゾーン
  const vShape = new THREE.Shape();
  vShape.moveTo(-0.055, 1.365);
  vShape.lineTo(0.055, 1.365);
  vShape.lineTo(0, 1.16);
  vShape.closePath();
  body.add(mesh(geo(new THREE.ShapeGeometry(vShape)), blouse, [0, 0, 0.101]));
  // ラペル
  const lapel = (side: 1 | -1) => {
    const s = new THREE.Shape();
    s.moveTo(side * 0.055, 1.365);
    s.lineTo(side * 0.09, 1.345);
    s.lineTo(side * 0.012, 1.13);
    s.lineTo(0, 1.16);
    s.closePath();
    return mesh(geo(new THREE.ShapeGeometry(s)), suitDark, [0, 0, 0.103]);
  };
  body.add(lapel(1), lapel(-1));

  // ---- 首 ----
  body.add(
    mesh(geo(new THREE.CylinderGeometry(0.036, 0.042, 0.11, 32)), skinShade, [0, 1.39, -0.005]),
  );

  // ---- 頭（首の付け根を支点に回転させる）----
  const headPivot = new THREE.Group();
  headPivot.position.set(0, 1.41, 0);
  root.add(headPivot);
  const head = new THREE.Group();
  head.position.set(0, 0.14, 0.005);
  head.scale.setScalar(1.2);
  headPivot.add(head);

  // 卵形の輪郭（あごに向かって細くなる）を回転体で作る
  const profile = [
    [0.0, 0.118],
    [0.035, 0.11],
    [0.058, 0.095],
    [0.075, 0.075],
    [0.087, 0.05],
    [0.092, 0.02],
    [0.091, -0.01],
    [0.085, -0.04],
    [0.074, -0.065],
    [0.06, -0.085],
    [0.044, -0.1],
    [0.026, -0.112],
    [0.008, -0.118],
    [0.0, -0.119],
  ]
    .reverse() // LatheGeometry は下→上の順で渡すと面が外向きになる
    .map(([r, y]) => new THREE.Vector2(r, y));
  head.add(mesh(geo(new THREE.LatheGeometry(profile, 64)), skin, [0, 0, 0], [1, 1, 1.08]));
  // 耳
  head.add(mesh(lowSphere, skinShade, [0.089, 0, -0.008], [0.011, 0.02, 0.014]));
  head.add(mesh(lowSphere, skinShade, [-0.089, 0, -0.008], [0.011, 0.02, 0.014]));
  // 鼻
  head.add(mesh(lowSphere, skin, [0, -0.02, 0.096], [0.009, 0.014, 0.01]));
  // 頬の赤み
  head.add(mesh(lowSphere, blush, [0.05, -0.03, 0.074], [0.016, 0.009, 0.006]));
  head.add(mesh(lowSphere, blush, [-0.05, -0.03, 0.074], [0.016, 0.009, 0.006]));

  // ---- 髪（ボブ）----
  const hairCap = geo(new THREE.SphereGeometry(1, 48, 32, 0, Math.PI * 2, 0, Math.PI * 0.42));
  head.add(mesh(hairCap, hairShell, [0, 0.002, -0.002], [0.102, 0.13, 0.11], [-0.3, 0, 0]));
  head.add(mesh(sphere, hair, [0, -0.015, -0.03], [0.099, 0.112, 0.08]));
  // サイドの髪（あごのラインまで）
  head.add(mesh(sphere, hair, [0.083, -0.035, -0.004], [0.025, 0.078, 0.066], [0, 0, 0.06]));
  head.add(mesh(sphere, hair, [-0.083, -0.035, -0.004], [0.025, 0.078, 0.066], [0, 0, -0.06]));
  // 斜めに流した前髪（おでこに沿った薄い殻）
  const bangs = geo(
    new THREE.SphereGeometry(1, 32, 16, Math.PI * 0.5 - 0.35, 1.25, Math.PI * 0.16, Math.PI * 0.2),
  );
  head.add(mesh(bangs, hairShell, [0, 0.004, 0], [0.098, 0.125, 0.108], [0, 0, -0.18]));

  // ---- 目 ----
  const eyes: THREE_NS.Group[] = [];
  const irises: THREE_NS.Group[] = [];
  for (const side of [1, -1] as const) {
    const eye = new THREE.Group();
    eye.position.set(side * 0.034, 0.012, 0.086);
    head.add(eye);
    eye.add(mesh(sphere, white, [0, 0, 0], [0.016, 0.0125, 0.008]));
    const irisGroup = new THREE.Group();
    irisGroup.position.set(0, -0.0005, 0.0065);
    eye.add(irisGroup);
    irisGroup.add(mesh(sphere, iris, [0, 0, 0], [0.0082, 0.0092, 0.003]));
    irisGroup.add(mesh(lowSphere, black, [0, 0, 0.0016], [0.0038, 0.0043, 0.002]));
    irisGroup.add(mesh(lowSphere, white, [0.0028, 0.003, 0.003], [0.0017, 0.0017, 0.001]));
    // 上まつげのライン
    eye.add(
      mesh(
        geo(new THREE.CapsuleGeometry(0.0018, 0.026, 4, 8)),
        black,
        [side * 0.001, 0.0112, 0.004],
        [1, 1, 1],
        [0, 0, Math.PI / 2 + side * 0.14],
      ),
    );
    eyes.push(eye);
    irises.push(irisGroup);
  }

  // ---- 眉（style で角度を変える）----
  const browTilt = style === "strict" ? 0.2 : style === "friendly" ? -0.12 : 0.03;
  const browLift = style === "friendly" ? 0.003 : style === "strict" ? -0.003 : 0;
  const browGeo = geo(new THREE.CapsuleGeometry(0.0024, 0.024, 4, 8));
  for (const side of [1, -1] as const) {
    head.add(
      mesh(
        browGeo,
        hair,
        [side * 0.035, 0.041 + browLift, 0.09],
        [1, 1, 1],
        // 内側（顔の中心側）を下げると厳しい表情、上げると柔らかい表情
        [0, 0, Math.PI / 2 + side * browTilt],
      ),
    );
  }

  // ---- 口 ----
  const mouth = new THREE.Group();
  mouth.position.set(0, -0.056, 0.083);
  head.add(mouth);
  const mouthIn = mesh(sphere, mouthInside, [0, 0, -0.001], [0.015, 0.001, 0.006]);
  mouth.add(mouthIn);
  const upperTeeth = mesh(sphere, teeth, [0, 0.002, 0.0015], [0.011, 0.0022, 0.004]);
  mouth.add(upperTeeth);
  const lipGeo = geo(new THREE.CapsuleGeometry(0.0026, 0.02, 4, 12));
  const upperLip = mesh(lipGeo, lip, [0, 0.0013, 0.003], [1, 1, 0.7], [0, 0, Math.PI / 2]);
  const lowerLip = mesh(lipGeo, lip, [0, -0.0013, 0.003], [1.1, 1.1, 0.8], [0, 0, Math.PI / 2]);
  mouth.add(upperLip, lowerLip);
  // 口角（friendly は少し上げる）
  const cornerLift = style === "friendly" ? 0.003 : style === "strict" ? -0.0005 : 0.0012;
  const corners = [1, -1].map((side) => {
    const c = mesh(lowSphere, lip, [side * 0.0135, cornerLift, 0.0015], [0.002, 0.002, 0.0018]);
    mouth.add(c);
    return c;
  });

  // ---- サイズ変更 ----
  const resize = () => {
    const w = mount.clientWidth || 1;
    const h = mount.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // 縦長・横長どちらでも胸から上が収まるように距離を調整
    const dist = camera.aspect < 0.9 ? 1.45 / camera.aspect : 1.6;
    camera.position.set(0, 1.52, Math.min(dist, 3.6));
    camera.lookAt(lookAt);
    camera.updateProjectionMatrix();
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(mount);

  // ---- アニメーション ----
  const clock = new THREE.Clock();
  let open = 0;
  let wide = 0.5;
  let speakEnergy = 0;
  let nextBlink = 1.5 + Math.random() * 3;
  let blinkStart = -1;
  let gazeTarget = new THREE.Vector2();
  const gaze = new THREE.Vector2();
  let nextGaze = 2;
  let frame = 0;

  const tick = () => {
    frame = requestAnimationFrame(tick);
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;

    // 口パク（開くときは速く、閉じるときは少しゆっくり）
    const v = getVoice()?.getLevel() ?? { level: 0, brightness: 0.5 };
    const targetOpen = Math.min(1, Math.max(0, (v.level - 0.03) * 3.2));
    open += (targetOpen - open) * Math.min(1, dt * (targetOpen > open ? 28 : 14));
    wide += (v.brightness - wide) * Math.min(1, dt * 8);
    speakEnergy += ((v.level > 0.03 ? 1 : 0) - speakEnergy) * Math.min(1, dt * 3);

    const gap = open * 0.016;
    upperLip.position.y = 0.0015 + gap * 0.25;
    lowerLip.position.y = -0.0015 - gap * 0.75;
    mouthIn.scale.y = 0.001 + gap * 0.6;
    mouthIn.position.y = -gap * 0.25;
    upperTeeth.visible = open > 0.15;
    const widthScale = 0.9 + wide * 0.25 - open * 0.08;
    upperLip.scale.y = widthScale;
    lowerLip.scale.y = widthScale * 1.15;
    mouthIn.scale.x = 0.015 * widthScale;
    corners.forEach((c, i) => {
      c.position.x = (i === 0 ? 1 : -1) * 0.0135 * widthScale;
      c.position.y = cornerLift - gap * 0.3;
    });

    // まばたき
    if (blinkStart < 0 && t > nextBlink) blinkStart = t;
    let lid = 1;
    if (blinkStart >= 0) {
      const p = (t - blinkStart) / 0.16;
      if (p >= 1) {
        blinkStart = -1;
        nextBlink = t + 2.2 + Math.random() * 3.8;
      } else {
        lid = Math.max(0.08, Math.abs(1 - p * 2));
      }
    }
    eyes.forEach((e) => (e.scale.y = lid));

    // 視線（ときどき少しだけ動かす）
    if (t > nextGaze) {
      gazeTarget = new THREE.Vector2((Math.random() - 0.5) * 0.004, (Math.random() - 0.5) * 0.002);
      if (Math.random() < 0.5) gazeTarget.set(0, 0);
      nextGaze = t + 1.5 + Math.random() * 3;
    }
    gaze.lerp(gazeTarget, Math.min(1, dt * 10));
    irises.forEach((ir) => ir.position.set(gaze.x, -0.0005 + gaze.y, 0.0065));

    // 呼吸・首の揺れ・話している間の軽いうなずき
    const breath = Math.sin(t * 1.5);
    body.position.y = breath * 0.002;
    headPivot.position.y = 1.41 + breath * 0.0025;
    headPivot.rotation.y = Math.sin(t * 0.45) * 0.045 + Math.sin(t * 1.3) * 0.01 * speakEnergy;
    headPivot.rotation.x =
      Math.sin(t * 0.6) * 0.015 + (Math.sin(t * 3.1) * 0.5 + 0.5) * 0.035 * speakEnergy - 0.02;
    headPivot.rotation.z = Math.sin(t * 0.33) * 0.02;

    renderer.render(scene, camera);
  };
  tick();

  return () => {
    cancelAnimationFrame(frame);
    ro.disconnect();
    disposables.forEach((d) => d.dispose());
    renderer.dispose();
    renderer.domElement.remove();
  };
}
