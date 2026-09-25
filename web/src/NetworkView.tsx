import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { Graph } from "./api";
import { toUm } from "./units";

type Props = {
  graph: Graph;
  colors: string[]; // one per edge
  highlight: number | null;
  onHover: (edge: number | null, x: number, y: number) => void;
};

/**
 * 3D view of a vascular graph. Every edge is one instance of a unit cylinder,
 * so large networks render in a single draw call. Coordinates are shown in
 * micrometres at true scale. Parallel edges between the same two nodes are
 * offset sideways so each stays visible.
 */
export function NetworkView({ graph, colors, highlight, onHover }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const state = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    mesh: THREE.InstancedMesh | null;
    render: () => void;
  } | null>(null);
  const hoverRef = useRef(onHover);
  hoverRef.current = onHover;

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
    const onMove = (ev: PointerEvent) => {
      const s = state.current;
      if (!s?.mesh) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObject(s.mesh)[0];
      hoverRef.current(hit?.instanceId ?? null, ev.clientX - rect.left, ev.clientY - rect.top);
    };
    const onLeave = () => hoverRef.current(null, 0, 0);
    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("pointerleave", onLeave);

    state.current = { renderer, scene, camera, controls, mesh: null, render };
    resize();
    return () => {
      observer.disconnect();
      renderer.domElement.removeEventListener("pointermove", onMove);
      renderer.domElement.removeEventListener("pointerleave", onLeave);
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
    const pos = graph.positions.map((p) => new THREE.Vector3(toUm(p[0]), toUm(p[1]), toUm(p[2])));
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
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    graph.edges.forEach(([a, b], k) => {
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
      const r = toUm(graph.diameter[k]) / 2;
      q.setFromUnitVectors(up, dir);
      m.compose(pa.clone().add(pb).multiplyScalar(0.5), q, new THREE.Vector3(r, len, r));
      mesh.setMatrixAt(k, m);
      mesh.setColorAt(k, new THREE.Color("#a8a7a1"));
    });
    mesh.instanceMatrix.needsUpdate = true;
    s.scene.add(mesh);
    s.mesh = mesh;

    s.camera.position.set(0, -radius * 0.3, radius * 1.9);
    s.camera.near = radius / 100;
    s.camera.far = radius * 100;
    s.camera.updateProjectionMatrix();
    s.controls.target.set(0, 0, 0);
    s.controls.update();
    s.render();
  }, [graph]);

  // Colours: updated in place.
  useEffect(() => {
    const s = state.current;
    if (!s?.mesh) return;
    const c = new THREE.Color();
    colors.forEach((hex, k) => {
      c.set(hex);
      if (highlight !== null && k !== highlight) c.lerp(new THREE.Color(0xfcfcfb), 0.55);
      s.mesh!.setColorAt(k, c);
    });
    if (s.mesh.instanceColor) s.mesh.instanceColor.needsUpdate = true;
    s.render();
  }, [colors, highlight, graph]);

  return <div className="viewer" ref={host} />;
}
