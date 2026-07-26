"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import * as THREE from "three";

/**
 * WebGL protocol route navigator — React port of the design's <route-map>
 * custom element (route-map.js). `three` is bundled (not the CDN UMD), so it
 * works under the app's CSP. Two modes:
 *   - "network" (hero): the full protocol cloud with a LONG→SHORT route curve,
 *     hover-to-name labels, a travelling pulse and slow camera drift.
 *   - "result": a compact two-node route (long-label × short-label, pair at the
 *     apex) for the calculation result summary.
 * Respects prefers-reduced-motion (no drift, no pulse travel).
 */

const ACCENT = 0x4d8dff;
const IDLE = 0x64708a;

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
  outer: THREE.Mesh | null;
  outerMat: THREE.MeshBasicMaterial | null;
  active: boolean;
  label: HTMLDivElement;
  side: HTMLDivElement | null;
  hover: number;
  depth: number;
  lx: number;
  ly: number;
  lw: number;
  lh: number;
  sy: number;
  sw: number;
  sh: number;
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
  const router = useRouter();
  // Held in a ref so navigation works from the scene's click handler without
  // rebuilding the whole WebGL scene when the router identity changes.
  const routerRef = useRef(router);
  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const result = mode === "result";

    const canvas = document.createElement("canvas");
    Object.assign(canvas.style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
      display: "block",
    });
    host.appendChild(canvas);

    const overlay = document.createElement("div");
    Object.assign(overlay.style, {
      position: "absolute",
      inset: "0",
      pointerEvents: "none",
      overflow: "hidden",
    });
    host.appendChild(overlay);

    function label(text: string, kind: "venue" | "idle" | "side" | "pair"): HTMLDivElement {
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
      if (kind === "venue")
        Object.assign(base, { fontSize: "12px", fontWeight: "600", letterSpacing: "0.01em", color: "#e8ecf5" });
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
          { name: longLabel, p: [-1.45, 0.05, 0.25], role: "long" },
          { name: shortLabel, p: [1.45, -0.05, -0.25], role: "short" },
        ]
      : NETWORK;

    // faint horizon rings for depth (network only)
    if (!result) {
      for (let i = 1; i <= 3; i++) {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(i * 0.95, i * 0.95 + 0.005, 128),
          new THREE.MeshBasicMaterial({
            color: 0x3a465e,
            transparent: true,
            opacity: 0.34 - i * 0.08,
            side: THREE.DoubleSide,
          }),
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = -1.35;
        scene.add(ring);
      }
    }

    const nodes: NodeRec[] = [];
    const group = new THREE.Group();
    scene.add(group);

    data.forEach((d) => {
      const active = !!d.role;
      const color = active ? ACCENT : IDLE;
      const coreMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: active ? 1 : 0.62 });
      const core = new THREE.Mesh(new THREE.SphereGeometry(active ? 0.075 : 0.045, 20, 20), coreMat);
      core.position.set(d.p[0], d.p[1], d.p[2]);
      group.add(core);

      const haloMat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: active ? 0.75 : 0.26,
        side: THREE.DoubleSide,
      });
      const halo = new THREE.Mesh(
        new THREE.RingGeometry(active ? 0.16 : 0.11, active ? 0.168 : 0.115, 48),
        haloMat,
      );
      halo.position.copy(core.position);
      group.add(halo);

      let outer: THREE.Mesh | null = null;
      let outerMat: THREE.MeshBasicMaterial | null = null;
      if (active) {
        outerMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3, side: THREE.DoubleSide });
        outer = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.303, 64), outerMat);
        outer.position.copy(core.position);
        group.add(outer);
      }

      nodes.push({
        d,
        core,
        coreMat,
        halo,
        haloMat,
        outer,
        outerMat,
        active,
        label: label(d.name, active ? "venue" : "idle"),
        side: d.role ? label(d.role === "long" ? "LONG" : "SHORT", "side") : null,
        hover: 0,
        depth: 1,
        lx: 0,
        ly: 0,
        lw: 0,
        lh: 0,
        sy: 0,
        sw: 0,
        sh: 0,
        labelOpacity: undefined,
      });
    });

    // route curve between the two role nodes
    let curve: THREE.CubicBezierCurve3 | null = null;
    let pulse: THREE.Mesh | null = null;
    let midLabel: HTMLDivElement | null = null;
    const a = nodes.find((n) => n.d.role === "long");
    const b = nodes.find((n) => n.d.role === "short");
    if (a && b) {
      const pa = a.core.position;
      const pb = b.core.position;
      const lift = result ? 0.95 : 1.15;
      curve = new THREE.CubicBezierCurve3(
        pa.clone(),
        pa.clone().lerp(pb, 0.3).add(new THREE.Vector3(0, lift, result ? 0.5 : 0.9)),
        pa.clone().lerp(pb, 0.7).add(new THREE.Vector3(0, lift * 0.72, result ? 0.5 : 0.9)),
        pb.clone(),
      );
      group.add(
        new THREE.Mesh(
          new THREE.TubeGeometry(curve, 120, 0.014, 10, false),
          new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.95 }),
        ),
      );
      group.add(
        new THREE.Mesh(
          new THREE.TubeGeometry(curve, 120, 0.055, 10, false),
          new THREE.MeshBasicMaterial({
            color: ACCENT,
            transparent: true,
            opacity: 0.11,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          }),
        ),
      );
      pulse = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 16), new THREE.MeshBasicMaterial({ color: 0xbcd6ff }));
      group.add(pulse);
      midLabel = label(pair, "pair");
    }

    const ray = new THREE.Raycaster();
    const pointer = new THREE.Vector2(-10, -10);
    const onMove = (e: PointerEvent) => {
      const r = host.getBoundingClientRect();
      pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    };
    const onLeave = () => pointer.set(-10, -10);
    // Click a protocol node -> open its page.
    const onClick = (e: MouseEvent) => {
      const r = host.getBoundingClientRect();
      const pc = new THREE.Vector2(
        ((e.clientX - r.left) / r.width) * 2 - 1,
        -((e.clientY - r.top) / r.height) * 2 + 1,
      );
      ray.setFromCamera(pc, camera);
      const hitObj = ray.intersectObjects(nodes.map((n) => n.core))[0];
      if (!hitObj) return;
      const rec = nodes.find((n) => n.core === hitObj.object);
      if (rec?.d.slug) routerRef.current.push(`/${rec.d.slug}`);
    };
    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerleave", onLeave);
    host.addEventListener("click", onClick);

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

    function frame(t: number) {
      const w = host!.clientWidth;
      const h = host!.clientHeight;
      if (!REDUCED) {
        camera.position.set(
          camBase.x + Math.sin(t * 0.17) * (result ? 0.16 : 0.3),
          camBase.y + Math.sin(t * 0.13 + 1.1) * (result ? 0.08 : 0.22),
          camBase.z + Math.cos(t * 0.11) * 0.22,
        );
      }
      camera.lookAt(0, result ? 0.12 : 0.05, 0);

      ray.setFromCamera(pointer, camera);
      const hit = ray.intersectObjects(nodes.map((n) => n.core))[0];
      const hovered = hit ? hit.object : null;
      host!.style.cursor = hovered ? "pointer" : "";

      nodes.forEach((n) => {
        const isHover = n.core === hovered;
        n.hover += ((isHover ? 1 : 0) - n.hover) * 0.14;
        const pv = REDUCED ? 0 : Math.sin(t * 1.4 + n.core.position.x * 2) * 0.5 + 0.5;
        n.halo.quaternion.copy(camera.quaternion);
        if (n.outer && n.outerMat) {
          n.outer.quaternion.copy(camera.quaternion);
          const s = 1 + (REDUCED ? 0 : pv * 0.16);
          n.outer.scale.setScalar(s);
          n.outerMat.opacity = 0.3 - (REDUCED ? 0 : pv * 0.14);
        }
        n.coreMat.opacity = (n.active ? 1 : 0.62) + n.hover * 0.35;
        n.haloMat.opacity = (n.active ? 0.75 : 0.26) + n.hover * 0.5;

        v.copy(n.core.position).project(camera);
        const x = (v.x * 0.5 + 0.5) * w;
        const y = (-v.y * 0.5 + 0.5) * h;
        n.depth = THREE.MathUtils.clamp(1 - (v.z - 0.9) * 6, 0.25, 1);
        n.lx = x;
        n.ly = y + (n.active ? 30 : 22);
        if (!n.lw || !n.lh) {
          n.lw = n.label.offsetWidth;
          n.lh = n.label.offsetHeight;
        }
        n.label.style.transform = `translate(-50%,-50%) translate(${x.toFixed(1)}px, ${n.ly.toFixed(1)}px)`;
        if (!n.active) n.label.style.color = n.hover > 0.4 ? "#e8ecf5" : "#8b96ad";
        if (n.side) {
          n.sy = y - 30;
          if (!n.sw) {
            n.sw = n.side.offsetWidth;
            n.sh = n.side.offsetHeight;
          }
          n.side.style.transform = `translate(-50%,-50%) translate(${x.toFixed(1)}px, ${n.sy.toFixed(1)}px)`;
        }
      });

      let mx = 0;
      let my = 0;
      let mw = 0;
      let mh = 0;
      if (pulse && curve) {
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

      // idle labels yield to the route's own labels
      const claimed: { x: number; y: number; w: number; h: number }[] = [];
      nodes.forEach((n) => {
        if (!n.active) return;
        claimed.push({ x: n.lx, y: n.ly, w: n.lw, h: n.lh });
        if (n.side) claimed.push({ x: n.lx, y: n.sy, w: n.sw, h: n.sh });
      });
      if (midLabel && mw) claimed.push({ x: mx, y: my, w: mw, h: mh });

      nodes.forEach((n) => {
        if (n.active) {
          n.label.style.opacity = "1";
          return;
        }
        const r = { x: n.lx, y: n.ly, w: n.lw, h: n.lh };
        let clash = claimed.some((c) => overlaps(r, c));
        if (!clash) {
          for (const o of nodes) {
            if (o === n || o.active || !o.lw) continue;
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
      host.removeEventListener("click", onClick);
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
