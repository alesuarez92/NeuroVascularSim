import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { Graph } from "./api";
import { toUm } from "./units";

type Props = {
  graph: Graph;
  colors: string[]; // one per edge
  highlight: number | null;
  fade?: number; // how far other vessels fade toward the background while one is highlighted
  visible: boolean[]; // one per edge
  widthScale: number; // drawn radius = true radius x widthScale
  onHover: (edge: number | null, x: number, y: number) => void;
  onPick: (edge: number | null) => void; // click (not drag) on a vessel, or on empty space
};

type Segment = { mid: THREE.Vector3; rot: THREE.Quaternion; len: number; r: number };

/**
 * 3D view of a vascular graph. Every edge is one instance of a unit cylinder,
 * so large networks render in a single draw call. Coordinates are shown in
 * micrometres at true scale. Parallel edges between the same two nodes are
 * offset sideways so each stays visible.
 */
export function NetworkView({ graph, colors, highlight, fade = 0.55, visible, widthScale, onHover, onPick }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const state = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    mesh: THREE.InstancedMesh | null;
    segments: Segment[];
    render: () => void;
  } | null>(null);
  const hoverRef = useRef(onHover);
  hoverRef.current = onHover;
  const pickRef = useRef(onPick);
  pickRef.current = onPick;

  // Scene, camera, renderer: created once.
  useEffect(() => {
    const el = host.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setClearColor(0xfcfcfb);
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(1, 2, 3);
    scene.add(sun);

    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 1e6);
    const controls = new OrbitControls(camera, renderer.domElement);
    const render = () => renderer.render(scene, camera);
    controls.addEventListener("change", render);

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = el;
      renderer.setSize(w, h);
      camera.aspect = w / Math.max(h, 1);
      camera.updateProjectionMatrix();
      render();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(el);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const pick = (ev: PointerEvent): number | null => {
      const s = state.current;
      if (!s?.mesh) return null;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      return raycaster.intersectObject(s.mesh)[0]?.instanceId ?? null;
    };
    const onMove = (ev: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      hoverRef.current(pick(ev), ev.clientX - rect.left, ev.clientY - rect.top);
    };
    const onLeave = () => hoverRef.current(null, 0, 0);
    // A click selects; a drag (orbit, pan) does not.
    let down: { x: number; y: number } | null = null;
    const onDown = (ev: PointerEvent) => (down = { x: ev.clientX, y: ev.clientY });
    const onUp = (ev: PointerEvent) => {
      if (down && Math.hypot(ev.clientX - down.x, ev.clientY - down.y) < 4) pickRef.current(pick(ev));
      down = null;
    };
    const el2 = renderer.domElement;
    el2.addEventListener("pointermove", onMove);
    el2.addEventListener("pointerleave", onLeave);
    el2.addEventListener("pointerdown", onDown);
    el2.addEventListener("pointerup", onUp);

    state.current = { renderer, scene, camera, controls, mesh: null, segments: [], render };
    resize();
    return () => {
      observer.disconnect();
      el2.removeEventListener("pointermove", onMove);
      el2.removeEventListener("pointerleave", onLeave);
      el2.removeEventListener("pointerdown", onDown);
      el2.removeEventListener("pointerup", onUp);
      controls.dispose();
      renderer.dispose();
      el.removeChild(renderer.domElement);
      state.current = null;
    };
  }, []);

  // Geometry: rebuilt when the graph changes.
  useEffect(() => {
    const s = state.current;
    if (!s) return;
    if (s.mesh) {
      s.scene.remove(s.mesh);
      s.mesh.geometry.dispose();
      (s.mesh.material as THREE.Material).dispose();
    }
    // Cortical networks (with depth) are shown with the pia on top: depth runs down the screen.
    const cortical = graph.depth !== undefined;
    const pos = graph.positions.map((p) =>
      cortical
        ? new THREE.Vector3(toUm(p[0]), -toUm(p[2]), toUm(p[1]))
        : new THREE.Vector3(toUm(p[0]), toUm(p[1]), toUm(p[2])),
    );
    const box = new THREE.Box3().setFromPoints(pos);
    const center = box.getCenter(new THREE.Vector3());
    const radius = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 1);

    // Sideways offsets for parallel edges.
    const groups = new Map<string, number[]>();
    graph.edges.forEach(([a, b], k) => {
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      groups.set(key, [...(groups.get(key) ?? []), k]);
    });

    const geom = new THREE.CylinderGeometry(1, 1, 1, 16, 1);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.0 });
    const mesh = new THREE.InstancedMesh(geom, mat, graph.n_edges);
    const up = new THREE.Vector3(0, 1, 0);
    const segments: Segment[] = graph.edges.map(([a, b], k) => {
      const pa = pos[a].clone().sub(center);
      const pb = pos[b].clone().sub(center);
      const dir = pb.clone().sub(pa);
      const len = dir.length();
      dir.normalize();
      const siblings = groups.get(a < b ? `${a}-${b}` : `${b}-${a}`)!;
      if (siblings.length > 1) {
        const side = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 0, 1));
        if (side.lengthSq() < 1e-9) side.set(1, 0, 0);
        const spacing = Math.max(...siblings.map((e) => toUm(graph.diameter[e]))) * 1.5;
        const shift = (siblings.indexOf(k) - (siblings.length - 1) / 2) * spacing;
        side.normalize().multiplyScalar(shift);
        pa.add(side);
        pb.add(side);
      }
      mesh.setColorAt(k, new THREE.Color("#a8a7a1"));
      return {
        mid: pa.clone().add(pb).multiplyScalar(0.5),
        rot: new THREE.Quaternion().setFromUnitVectors(up, dir),
        len,
        r: toUm(graph.diameter[k]) / 2,
      };
    });
    s.scene.add(mesh);
    s.mesh = mesh;
    s.segments = segments;

    // Fit the whole box in view, whatever its aspect ratio.
    const size = box.getSize(new THREE.Vector3());
    const tan = Math.tan(THREE.MathUtils.degToRad(s.camera.fov / 2));
    const fitHeight = size.y / 2 / tan;
    const fitWidth = Math.max(size.x, size.z) / 2 / (tan * s.camera.aspect);
    const dist = Math.max(fitHeight, fitWidth) * 1.15 + size.z / 2;
    s.camera.position.set(0, 0, dist);
    s.camera.near = radius / 100;
    s.camera.far = radius * 100;
    s.camera.updateProjectionMatrix();
    s.controls.target.set(0, 0, 0);
    s.controls.update();
    s.render();
  }, [graph]);

  // Width and visibility: instance matrices rewritten in place (hidden = zero scale).
  useEffect(() => {
    const s = state.current;
    if (!s?.mesh) return;
    const m = new THREE.Matrix4();
    const scale = new THREE.Vector3();
    s.segments.forEach((seg, k) => {
      const r = visible[k] === false ? 0 : seg.r * widthScale;
      m.compose(seg.mid, seg.rot, scale.set(r, visible[k] === false ? 0 : seg.len, r));
      s.mesh!.setMatrixAt(k, m);
    });
    s.mesh.instanceMatrix.needsUpdate = true;
    s.mesh.boundingSphere = null; // recomputed for picking
    s.mesh.boundingBox = null;
    s.render();
  }, [graph, visible, widthScale]);

  // Colours: updated in place.
  useEffect(() => {
    const s = state.current;
    if (!s?.mesh) return;
    const c = new THREE.Color();
    colors.forEach((hex, k) => {
      c.set(hex);
      if (highlight !== null && k !== highlight) c.lerp(new THREE.Color(0xfcfcfb), fade);
      s.mesh!.setColorAt(k, c);
    });
    if (s.mesh.instanceColor) s.mesh.instanceColor.needsUpdate = true;
    s.render();
  }, [colors, highlight, fade, graph]);

  return <div className="viewer" ref={host} />;
}
