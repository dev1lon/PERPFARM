"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * WebGL protocol route navigator — React port of the design's <route-map>.
 * `three` is bundled (not the CDN UMD) so it works under the app's CSP.
 *   - "network" (hero): the full protocol cloud with a LONG→SHORT route curve.
 *     The route is INTERACTIVE — grab either endpoint and drag it onto another
 *     protocol node to re-route; the arc follows and snaps magnetically.
 *   - "result": a compact, fixed two-node route (long-label × short-label, pair
 *     at the apex) for the calculation result summary.
 * Respects prefers-reduced-motion (no camera drift, no pulse travel).
 */

const ACCENT = 0x4d8dff;
const IDLE = 0x64708a;
const LONG_COLOR = 0x35d399; // green — LONG leg (design "positive")
const SHORT_COLOR = 0xe5645f; // red — SHORT leg (design "negative")
const SNAP_PX = 62; // magnet radius when dragging an endpoint onto a node
const GRAB_PX = 46; // forgiving screen radius for grabbing an endpoint
const TUBULAR = 80; // tube segments (down from 120 — rebuilt every drag frame)
const RADIAL = 8;

type NodeData = { name: string; p: [number, number, number]; role?: "long" | "short"; slug?: string };

const NETWORK: NodeData[] = [
  { name: "Variational", slug: "variational", p: [-1.55, 0.34, 0.62], role: "long" },
  { name: "TxFlow", slug: "txflow", p: [1.52, -0.26, -0.42], role: "short" },
  { name: "TradeXYZ", slug: "tradexyz", p: [-0.62, -1.12, -0.35] },
  { name: "RiseX", slug: "risex", p: [0.3, -0.92, 0.95] },
  { name: "Polymarket", slug: "polymarket", p: [-1.35, -0.62, -1.25] },
  { name: "N1", slug: "01exchange", p: [1.68, 0.86, 0.55] },
  { name: "Hibachi", slug: "hibachi", p: [-1.92, -0.78, -0.7] },
  { name: "Extended", slug: "extended", p: [0.3, 0.52, 1.3] },
  { name: "Pacifica", slug: "pacifica", p: [-0.3, 0.02, -1.55] },
  { name: "Bullet", slug: "bullet", p: [1.9, -1.06, 0.85] },
  { name: "Reya", slug: "reya", p: [1.05, 1.18, -1.35] },
  { name: "Nado", slug: "nado", p: [0.68, -0.34, 0.05] },
];

interface NodeRec {
  d: NodeData;
  core: THREE.Mesh;
  coreMat: THREE.MeshBasicMaterial;
  halo: THREE.Mesh;
  haloMat: THREE.MeshBasicMaterial;
  outer: THREE.Mesh;
  outerMat: THREE.MeshBasicMaterial;
  label: HTMLDivElement;
  hover: number;
  depth: number;
  lx: number;
  ly: number;
  lw: number;
  lh: number;
  labelOpacity: number | undefined;
}

function overlaps(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
) {
  return Math.abs(a.x - b.x) * 2 < a.w + b.w + 16 && Math.abs(a.y - b.y) * 2 < a.h + b.h + 8;
}

export function RouteMap({
  mode = "network",
  pair = "XAU",
  longLabel = "Variational",
  shortLabel = "TxFlow",
  height = 432,
}: {
  mode?: "network" | "result";
  pair?: string;
  longLabel?: string;
  shortLabel?: string;
  height?: number;
}) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const result = mode === "result";

    const canvas = document.createElement("canvas");
    Object.assign(canvas.style, { position: "absolute", inset: "0", width: "100%", height: "100%", display: "block" });
    host.appendChild(canvas);

    const overlay = document.createElement("div");
    Object.assign(overlay.style, { position: "absolute", inset: "0", pointerEvents: "none", overflow: "hidden" });
    host.appendChild(overlay);

    function label(text: string, kind: "idle" | "side" | "pair"): HTMLDivElement {
      const el = document.createElement("div");
      el.textContent = text;
      const base: Partial<CSSStyleDeclaration> = {
        position: "absolute",
        left: "0",
        top: "0",
        whiteSpace: "nowrap",
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
        transition: "opacity 220ms ease, color 220ms ease",
        transform: "translate(-50%,-50%)",
        willChange: "transform",
      };
      if (kind === "idle") Object.assign(base, { fontSize: "11px", fontWeight: "500", color: "#8b96ad" });
      if (kind === "side")
        Object.assign(base, {
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: "10px",
          fontWeight: "500",
          letterSpacing: "0.14em",
          padding: "4px 8px",
          borderRadius: "6px",
          border: "1px solid rgba(77,141,255,0.38)",
          background: "rgba(10,16,30,0.78)",
          color: "#9dc0ff",
        });
      if (kind === "pair")
        Object.assign(base, {
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: "11px",
          fontWeight: "500",
          letterSpacing: "0.08em",
          padding: "4px 9px",
          borderRadius: "6px",
          border: "1px solid rgba(255,255,255,0.10)",
          background: "rgba(10,16,30,0.86)",
          color: "#e8ecf5",
        });
      Object.assign(el.style, base);
      overlay.appendChild(el);
      return el;
    }

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(result ? 34 : 40, 1, 0.1, 100);
    const camBase = result ? new THREE.Vector3(0, 0.15, 5.4) : new THREE.Vector3(0.1, 0.3, 7.1);
    camera.position.copy(camBase);

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));

    const data: NodeData[] = result
      ? [
          { name: longLabel, p: [-1.18, 0.05, 0.25], role: "long" },
          { name: shortLabel, p: [1.72, -0.05, -0.25], role: "short" },
        ]
      : NETWORK;

    // faint horizon rings for depth (network only)
    if (!result) {
      for (let i = 1; i <= 3; i++) {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(i * 0.95, i * 0.95 + 0.005, 128),
          new THREE.MeshBasicMaterial({ color: 0x3a465e, transparent: true, opacity: 0.34 - i * 0.08, side: THREE.DoubleSide }),
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = -1.35;
        scene.add(ring);
      }
    }

    const group = new THREE.Group();
    scene.add(group);

    // Every node is created identically; LONG/SHORT emphasis is applied per
    // frame based on which two are the current route endpoints (so endpoints
    // can change at runtime by dragging).
    const nodes: NodeRec[] = data.map((d) => {
      const coreMat = new THREE.MeshBasicMaterial({ color: IDLE, transparent: true, opacity: 0.62 });
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.05, 20, 20), coreMat);
      core.position.set(d.p[0], d.p[1], d.p[2]);
      group.add(core);

      const haloMat = new THREE.MeshBasicMaterial({ color: IDLE, transparent: true, opacity: 0.26, side: THREE.DoubleSide });
      const halo = new THREE.Mesh(new THREE.RingGeometry(0.13, 0.138, 48), haloMat);
      halo.position.copy(core.position);
      group.add(halo);

      const outerMat = new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0, side: THREE.DoubleSide });
      const outer = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.303, 64), outerMat);
      outer.position.copy(core.position);
      group.add(outer);

      return {
        d, core, coreMat, halo, haloMat, outer, outerMat,
        label: label(d.name, "idle"),
        hover: 0, depth: 1, lx: 0, ly: 0, lw: 0, lh: 0, labelOpacity: undefined,
      };
    });

    // Current route endpoints (mutable — drag reassigns them).
    let longRec = nodes.find((n) => n.d.role === "long") ?? nodes[0];
    let shortRec = nodes.find((n) => n.d.role === "short") ?? nodes[1];

    // GREEN (LONG) -> RED (SHORT) gradient along the tube. Vertex count is
    // constant for fixed segments, so the colour array is computed ONCE and
    // reused on every rebuild (no per-frame recompute during a drag).
    const vertsPerRing = RADIAL + 1;
    const ringCount = TUBULAR + 1;
    const gradArray = new Float32Array(ringCount * vertsPerRing * 3);
    {
      const ca = new THREE.Color(LONG_COLOR);
      const cb = new THREE.Color(SHORT_COLOR);
      const tmp = new THREE.Color();
      for (let ring = 0; ring < ringCount; ring++) {
        tmp.copy(ca).lerp(cb, ring / TUBULAR);
        for (let j = 0; j < vertsPerRing; j++) {
          const idx = (ring * vertsPerRing + j) * 3;
          gradArray[idx] = tmp.r;
          gradArray[idx + 1] = tmp.g;
          gradArray[idx + 2] = tmp.b;
        }
      }
    }

    // route curve (tube + additive glow), rebuilt on endpoint / drag change.
    const tubeMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95 });
    const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false });
    const tube = new THREE.Mesh(new THREE.BufferGeometry(), tubeMat);
    const glow = new THREE.Mesh(new THREE.BufferGeometry(), glowMat);
    group.add(tube);
    group.add(glow);
    let curve: THREE.CubicBezierCurve3 | null = null;
    let curveDirty = true;

    function buildCurve(pa: THREE.Vector3, pb: THREE.Vector3) {
      const lift = result ? 0.95 : 1.15;
      curve = new THREE.CubicBezierCurve3(
        pa.clone(),
        pa.clone().lerp(pb, 0.3).add(new THREE.Vector3(0, lift, result ? 0.5 : 0.9)),
        pa.clone().lerp(pb, 0.7).add(new THREE.Vector3(0, lift * 0.72, result ? 0.5 : 0.9)),
        pb.clone(),
      );
      // Trim the tube ends so the line stops at the node's edge instead of
      // running under the sphere/halo (pulse still uses the full `curve`).
      const trimPts: THREE.Vector3[] = [];
      for (let i = 0; i <= 64; i++) trimPts.push(curve.getPoint(0.07 + 0.86 * (i / 64)));
      const tubeCurve = new THREE.CatmullRomCurve3(trimPts);
      tube.geometry.dispose();
      const g1 = new THREE.TubeGeometry(tubeCurve, TUBULAR, 0.016, RADIAL, false);
      g1.setAttribute("color", new THREE.BufferAttribute(gradArray, 3));
      tube.geometry = g1;
      glow.geometry.dispose();
      const g2 = new THREE.TubeGeometry(tubeCurve, TUBULAR, 0.055, RADIAL, false);
      g2.setAttribute("color", new THREE.BufferAttribute(gradArray, 3));
      glow.geometry = g2;
    }

    const pulse = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 16), new THREE.MeshBasicMaterial({ color: 0xbcd6ff }));
    group.add(pulse);

    const longBadge = label("LONG", "side");
    const shortBadge = label("SHORT", "side");
    Object.assign(longBadge.style, { color: "#7ff0c6", borderColor: "rgba(53,211,153,0.5)" });
    Object.assign(shortBadge.style, { color: "#f5a3a0", borderColor: "rgba(229,100,95,0.5)" });
    const midLabel = result ? label(pair, "pair") : null;

    // ---- interaction (network only) ----
    const coreList = nodes.map((n) => n.core); // reused for the hover raycast
    const ray = new THREE.Raycaster();
    const pointer = new THREE.Vector2(-10, -10);
    const pointerPx = { x: -1, y: -1 };

    // Screen-space endpoint pick: grabbing uses a generous pixel radius (the
    // core spheres are tiny, so a raw raycast felt like you had to "peel" them
    // off). Returns the nearest endpoint within GRAB_PX, else null.
    function endpointHit(px: number, py: number, w: number, h: number): "long" | "short" | null {
      let which: "long" | "short" | null = null;
      let bestD = GRAB_PX;
      for (const cand of [["long", longRec] as const, ["short", shortRec] as const]) {
        const pp = cand[1].core.position.clone().project(camera);
        const d = Math.hypot((pp.x * 0.5 + 0.5) * w - px, (-pp.y * 0.5 + 0.5) * h - py);
        if (d < bestD) {
          bestD = d;
          which = cand[0];
        }
      }
      return which;
    }
    let drag: { which: "long" | "short"; ndcZ: number } | null = null;
    let dragPos: THREE.Vector3 | null = null; // eased current position of the dragged end
    let dragTarget: THREE.Vector3 | null = null; // where it's heading (cursor or snapped node)
    let dragCandidate: NodeRec | null = null;

    function ndc(e: PointerEvent | MouseEvent) {
      const r = host!.getBoundingClientRect();
      return { x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -((e.clientY - r.top) / r.height) * 2 + 1, r };
    }

    const onMove = (e: PointerEvent) => {
      const c = ndc(e);
      pointer.set(c.x, c.y);
      pointerPx.x = e.clientX - c.r.left;
      pointerPx.y = e.clientY - c.r.top;
      if (!drag) return;
      const w = host!.clientWidth;
      const h = host!.clientHeight;
      const other = drag.which === "long" ? shortRec : longRec;
      const px = e.clientX - c.r.left;
      const py = e.clientY - c.r.top;
      let best: NodeRec | null = null;
      let bestD = Infinity;
      for (const n of nodes) {
        if (n === other) continue;
        const pp = n.core.position.clone().project(camera);
        const sx = (pp.x * 0.5 + 0.5) * w;
        const sy = (-pp.y * 0.5 + 0.5) * h;
        const d = Math.hypot(sx - px, sy - py);
        if (d < bestD) {
          bestD = d;
          best = n;
        }
      }
      if (best && bestD < SNAP_PX) {
        dragCandidate = best;
        dragTarget = best.core.position.clone();
      } else {
        dragCandidate = null;
        dragTarget = new THREE.Vector3(c.x, c.y, drag.ndcZ).unproject(camera);
      }
    };
    const onLeave = () => pointer.set(-10, -10);
    const onDown = (e: PointerEvent) => {
      if (result) return;
      const c = ndc(e);
      const which = endpointHit(e.clientX - c.r.left, e.clientY - c.r.top, host!.clientWidth, host!.clientHeight);
      if (!which) return;
      const rec = which === "long" ? longRec : shortRec;
      drag = { which, ndcZ: rec.core.position.clone().project(camera).z };
      dragPos = rec.core.position.clone();
      dragTarget = rec.core.position.clone();
      dragCandidate = null;
      try {
        host!.setPointerCapture(e.pointerId);
      } catch {
        /* pointer capture unsupported -- drag still works via window listeners */
      }
      e.preventDefault();
    };
    const onUp = () => {
      if (!drag) return;
      if (dragCandidate) {
        if (drag.which === "long") longRec = dragCandidate;
        else shortRec = dragCandidate;
      }
      drag = null;
      dragPos = null;
      dragTarget = null;
      dragCandidate = null;
      curveDirty = true;
    };
    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerleave", onLeave);
    host.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);

    function resize() {
      const w = host!.clientWidth || 600;
      const h = host!.clientHeight || 400;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    const ro = new ResizeObserver(() => resize());
    ro.observe(host);
    resize();

    const v = new THREE.Vector3();
    const t0 = performance.now();
    let raf = 0;

    function place(el: HTMLDivElement, pos: THREE.Vector3, dy: number, w: number, h: number) {
      v.copy(pos).project(camera);
      const x = (v.x * 0.5 + 0.5) * w;
      const y = (-v.y * 0.5 + 0.5) * h + dy;
      el.style.transform = `translate(-50%,-50%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    }

    function frame(t: number) {
      const w = host!.clientWidth;
      const h = host!.clientHeight;
      // camera drift (frozen while dragging so the drag plane stays put)
      if (!REDUCED && !drag) {
        camera.position.set(
          camBase.x + Math.sin(t * 0.17) * (result ? 0.16 : 0.3),
          camBase.y + Math.sin(t * 0.13 + 1.1) * (result ? 0.08 : 0.22),
          camBase.z + Math.cos(t * 0.11) * 0.22,
        );
      }
      camera.lookAt(0, result ? 0.12 : 0.05, 0);

      // ease the dragged endpoint toward its target (smooth follow, gentle magnet)
      if (drag && dragPos && dragTarget) {
        dragPos.lerp(dragTarget, 0.22);
        curveDirty = true;
      }

      // rebuild the arc when an endpoint moved
      if (curveDirty) {
        const lp = drag && drag.which === "long" && dragPos ? dragPos : longRec.core.position;
        const sp = drag && drag.which === "short" && dragPos ? dragPos : shortRec.core.position;
        buildCurve(lp, sp);
        curveDirty = false;
      }

      // hover (for cursor affordance on endpoints)
      ray.setFromCamera(pointer, camera);
      const hit = ray.intersectObjects(coreList)[0];
      const hovered = hit ? (hit.object as THREE.Mesh) : null;
      const nearEnd = endpointHit(pointerPx.x, pointerPx.y, w, h);
      host!.style.cursor = drag ? "grabbing" : nearEnd ? "grab" : "";

      nodes.forEach((n) => {
        const active = n === longRec || n === shortRec;
        const col = n === longRec ? LONG_COLOR : n === shortRec ? SHORT_COLOR : IDLE;
        const isHover = n.core === hovered;
        n.hover += ((isHover ? 1 : 0) - n.hover) * 0.14;
        const pv = REDUCED ? 0 : Math.sin(t * 1.4 + n.core.position.x * 2) * 0.5 + 0.5;

        n.coreMat.color.setHex(col);
        n.haloMat.color.setHex(col);
        n.outerMat.color.setHex(col);
        n.core.scale.setScalar(active ? 1.5 : 0.9);
        n.halo.scale.setScalar(active ? 1.22 : 0.85);
        n.halo.quaternion.copy(camera.quaternion);
        n.outer.quaternion.copy(camera.quaternion);
        n.outer.scale.setScalar(1 + (REDUCED ? 0 : pv * 0.16));
        n.outerMat.opacity = active ? 0.3 - (REDUCED ? 0 : pv * 0.14) : 0;
        n.coreMat.opacity = (active ? 1 : 0.62) + n.hover * 0.35;
        n.haloMat.opacity = (active ? 0.75 : 0.26) + n.hover * 0.5;

        v.copy(n.core.position).project(camera);
        const x = (v.x * 0.5 + 0.5) * w;
        const y = (-v.y * 0.5 + 0.5) * h;
        n.depth = THREE.MathUtils.clamp(1 - (v.z - 0.9) * 6, 0.25, 1);
        n.lx = x;
        n.ly = y + (active ? 30 : 22);
        if (!n.lw || !n.lh) {
          n.lw = n.label.offsetWidth;
          n.lh = n.label.offsetHeight;
        }
        n.label.style.transform = `translate(-50%,-50%) translate(${x.toFixed(1)}px, ${n.ly.toFixed(1)}px)`;
        if (active) {
          n.label.style.color = "#e8ecf5";
          n.label.style.fontWeight = "600";
          n.label.style.fontSize = "12px";
        } else {
          n.label.style.fontWeight = "500";
          n.label.style.fontSize = "11px";
          n.label.style.color = n.hover > 0.4 ? "#e8ecf5" : "#8b96ad";
        }
      });

      // LONG / SHORT badges follow their endpoint (or the dragged position)
      const lp = drag && drag.which === "long" && dragPos ? dragPos : longRec.core.position;
      const sp = drag && drag.which === "short" && dragPos ? dragPos : shortRec.core.position;
      place(longBadge, lp, -30, w, h);
      place(shortBadge, sp, -30, w, h);

      // travelling pulse + optional pair label at the apex
      let mx = 0;
      let my = 0;
      let mw = 0;
      let mh = 0;
      if (curve) {
        const p = REDUCED ? 0.5 : (t * 0.28) % 1;
        pulse.position.copy(curve.getPoint(p));
        if (midLabel) {
          v.copy(curve.getPoint(0.5)).project(camera);
          mx = (v.x * 0.5 + 0.5) * w;
          my = (-v.y * 0.5 + 0.5) * h - 2;
          mw = midLabel.offsetWidth;
          mh = midLabel.offsetHeight;
          midLabel.style.transform = `translate(-50%,-50%) translate(${mx.toFixed(1)}px, ${my.toFixed(1)}px)`;
        }
      }

      // idle labels yield to the route's own labels + badges
      const claimed: { x: number; y: number; w: number; h: number }[] = [];
      nodes.forEach((n) => {
        if (n !== longRec && n !== shortRec) return;
        claimed.push({ x: n.lx, y: n.ly, w: n.lw, h: n.lh });
      });
      if (mw) claimed.push({ x: mx, y: my, w: mw, h: mh });

      nodes.forEach((n) => {
        if (n === longRec || n === shortRec) {
          n.label.style.opacity = "1";
          return;
        }
        const r = { x: n.lx, y: n.ly, w: n.lw, h: n.lh };
        let clash = claimed.some((c) => overlaps(r, c));
        if (!clash) {
          for (const o of nodes) {
            if (o === n || o === longRec || o === shortRec || !o.lw) continue;
            if (o.core.position.z <= n.core.position.z) continue;
            if (overlaps(r, { x: o.lx, y: o.ly, w: o.lw, h: o.lh })) {
              clash = true;
              break;
            }
          }
        }
        const target = clash && n.hover < 0.4 ? 0 : Math.min(0.85, n.depth * 0.7 + n.hover * 0.6);
        n.labelOpacity = n.labelOpacity === undefined ? target : n.labelOpacity + (target - n.labelOpacity) * 0.18;
        n.label.style.opacity = n.labelOpacity.toFixed(2);
      });

      renderer.render(scene, camera);
      raf = requestAnimationFrame(() => frame((performance.now() - t0) / 1000));
    }
    raf = requestAnimationFrame(() => frame((performance.now() - t0) / 1000));

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
      host.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      renderer.dispose();
      scene.traverse((obj) => {
        const m = obj as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        const mat = (m as THREE.Mesh).material;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else if (mat) mat.dispose();
      });
      canvas.remove();
      overlay.remove();
    };
  }, [mode, pair, longLabel, shortLabel]);

  return <div ref={hostRef} style={{ position: "relative", width: "100%", height }} />;
}
