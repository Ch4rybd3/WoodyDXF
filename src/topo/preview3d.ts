import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { openRing } from '../core/geometry';
import type { TopoResult } from './layers';
import { WATER_COLOR, woodColor } from './preview2d';

export class Preview3D {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(35, 1, 1, 20000);
  private controls: OrbitControls;
  private group = new THREE.Group();
  private ro: ResizeObserver;
  private raf = 0;

  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    host.appendChild(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7560, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(-0.6, 1, 0.4);
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

  show(r: TopoResult, layerMm: number, water: boolean) {
    for (const c of [...this.group.children]) {
      this.group.remove(c);
      const m = c as THREE.Mesh;
      m.geometry?.dispose();
      (m.material as THREE.Material)?.dispose();
    }
    const n = r.layers.length;
    r.layers.forEach((L, i) => {
      const shapes = L.pieces.map((poly) => {
        const s = new THREE.Shape(openRing(poly[0]).map(([x, y]) => new THREE.Vector2(x - r.W / 2, y - r.H / 2)));
        s.holes = poly.slice(1).map((h) => new THREE.Path(openRing(h).map(([x, y]) => new THREE.Vector2(x - r.W / 2, y - r.H / 2))));
        return s;
      });
      const geo = new THREE.ExtrudeGeometry(shapes, { depth: layerMm, bevelEnabled: false, curveSegments: 1 });
      const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(woodColor(i, n)), roughness: 0.85 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.z = i * layerMm;
      this.group.add(mesh);
    });
    // eau : fine plaque bleue posée sur la couche qui la porte (résine / bois teinté)
    if (water) {
      for (const b of r.water) {
        const s = new THREE.Shape(openRing(b.poly[0]).map(([x, y]) => new THREE.Vector2(x - r.W / 2, y - r.H / 2)));
        s.holes = b.poly.slice(1).map((h) => new THREE.Path(openRing(h).map(([x, y]) => new THREE.Vector2(x - r.W / 2, y - r.H / 2))));
        const geo = new THREE.ExtrudeGeometry([s], { depth: Math.max(0.3, layerMm * 0.6), bevelEnabled: false, curveSegments: 1 });
        const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(WATER_COLOR), roughness: 0.25, metalness: 0.05 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.z = (b.layerIndex + 1) * layerMm;
        this.group.add(mesh);
      }
    }
    // plan XY du dessin → le relief monte vers +Y à l'écran
    this.group.rotation.x = -Math.PI / 2;
    const size = Math.max(r.W, r.H);
    this.camera.position.set(0, size * 1.35, size * 1.25);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
    this.resize();
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
