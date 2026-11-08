import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { openRing, type Polygon } from '../core/geometry';
import type { LamesParams, LamesResult } from './model';

const shapeOf = (poly: Polygon) => {
  const s = new THREE.Shape(openRing(poly[0]).map(([x, y]) => new THREE.Vector2(x, y)));
  s.holes = poly.slice(1).map((h) => new THREE.Path(openRing(h).map(([x, y]) => new THREE.Vector2(x, y))));
  return s;
};

export class LamesPreview3D {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(35, 1, 1, 50000);
  private controls: OrbitControls;
  private group = new THREE.Group();
  private ro: ResizeObserver;
  private raf = 0;
  private lastKey = '';

  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    host.appendChild(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7560, 1.5));
    const sun = new THREE.DirectionalLight(0xffffff, 2.4);
    sun.position.set(0.5, 1, 0.8);
    this.scene.add(sun);
    this.scene.add(this.group);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  private resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  show(r: LamesResult, p: LamesParams) {
    for (const c of [...this.group.children]) {
      this.group.remove(c);
      const m = c as THREE.Mesh;
      m.geometry?.dispose();
    }
    const matA = new THREE.MeshStandardMaterial({ color: 0xd9b382, roughness: 0.8 });
    const matB = new THREE.MeshStandardMaterial({ color: 0xc89f6d, roughness: 0.8 });
    r.slices.forEach((s, i) => {
      if (!s.pieces.length) return;
      const geo = new THREE.ExtrudeGeometry(s.pieces.map(shapeOf), { depth: p.thickness, bevelEnabled: false, curveSegments: 1 });
      const mesh = new THREE.Mesh(geo, i % 2 ? matB : matA);
      // plan de la lame (u = profondeur, v = hauteur) ; extrusion le long de la longueur (x)
      mesh.rotation.y = -Math.PI / 2;
      mesh.position.x = s.x0 + p.thickness - p.L / 2;
      mesh.position.z = -p.P / 2;
      this.group.add(mesh);
    });
    // tiges
    const rodMat = new THREE.MeshStandardMaterial({ color: 0x8c96a0, metalness: 0.7, roughness: 0.35 });
    for (const t of r.rods) for (const run of t.runs) {
      const g = new THREE.CylinderGeometry(p.rodD / 2, p.rodD / 2, run.length, 16);
      const m = new THREE.Mesh(g, rodMat);
      const a = r.slices[run.first - 1].x0, b = r.slices[run.last - 1].x0 + p.thickness;
      m.rotation.z = Math.PI / 2;
      m.position.set((a + b) / 2 - p.L / 2, t.v, t.u - p.P / 2);
      this.group.add(m);
    }
    // nouvelle forme : on recadre la caméra (pas à chaque réglage)
    const key = [p.preset, p.L, p.P, p.H].join('|');
    if (key !== this.lastKey) {
      this.lastKey = key;
      const size = Math.max(p.L, p.P, p.H);
      this.camera.position.set(size * 1.0, p.H * 0.5 + size * 0.75, p.P / 2 + size * 1.5);
      this.controls.target.set(0, p.H / 2, 0);
      this.controls.update();
    }
    this.resize();
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
