import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { hasOpenOverlay } from '@/hooks/useModalOverlay';
import stoneUrl from '@/assets/confession/stone-map.jpg';
import groundUrl from '@/assets/confession/ground-map.jpg';
import woodUrl from '@/assets/confession/wood-map.jpg';
import glassUrl from '@/assets/confession/glass-map.jpg';
import rinUrl from '@/assets/confession/rin-saint-alpha.png';
import { WorldFog } from './WorldFog';
import { gravePosition, isInsideChurch, openingAngle, walkStep, type Collider } from './worldPhysics';
import type { ConfessionCategory } from './model';

const modelUrls = {
  graveA: new URL('../../assets/confession/models/grave-a.glb', import.meta.url).href,
  graveB: new URL('../../assets/confession/models/grave-b.glb', import.meta.url).href,
  graveC: new URL('../../assets/confession/models/grave-c.glb', import.meta.url).href,
  tree: new URL('../../assets/confession/models/dead-tree.glb', import.meta.url).href,
  crow: new URL('../../assets/confession/models/crow.glb', import.meta.url).href,
  pew: new URL('../../assets/confession/models/pew.glb', import.meta.url).href,
  door: new URL('../../assets/confession/models/door.glb', import.meta.url).href,
  chapel: new URL('../../assets/confession/models/chapel.glb', import.meta.url).href,
};
export type WorldCallbacks = {
  onTomb: (category: ConfessionCategory) => void;
  onSaint: () => void;
  onRegion: (inside: boolean) => void;
  onReady: () => void;
  onError: (message: string) => void;
  onHint: (hint: string) => void;
};
/** Owns GPU resources and native input; all private data remains in the existing React archive. */
export class ConfessionWorld {
  readonly scene = new T.Scene();
  readonly camera = new T.PerspectiveCamera(64, 1, 0.08, 100);
  private renderer: T.WebGLRenderer;
  private fog = new WorldFog();
  private models: T.Group[] = [];
  private textures: T.Texture[] = [];
  private tombs = new T.Group();
  private doorLeft = new T.Group();
  private doorRight = new T.Group();
  private crows: T.Group[] = [];
  private rin = new T.Group();
  private colliders: Collider[] = [];
  private propColliders: Collider[] = [];
  private keys = new Set<string>();
  private yaw = 0;
  private pitch = -0.03;
  private frame = 0;
  private last = 0;
  private elapsed = 0;
  private disposed = false;
  private ready = false;
  private paused = false;
  private blocked = false;
  private reduced = false;
  private density = 0.48;
  private doorProgress = 0;
  private doorMoving = false;
  private inside = false;
  private autoRoute: T.Vector3[] = [];
  private autoEnter = false;
  private pointer: { x: number; y: number; moved: boolean; id: number } | null = null;
  private ray = new T.Raycaster();
  private hint = '';
  private touch = { forward: 0, right: 0 };
  private categories: ConfessionCategory[] = [];
  private observer: ResizeObserver;
  constructor(
    private host: HTMLElement,
    private callbacks: WorldCallbacks,
  ) {
    this.renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.45;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    const canvas = this.renderer.domElement;
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-label', '三维墓地和教堂，WASD移动，拖动环视，E交互');
    canvas.dataset.sceneRenderer = 'three';
    host.append(canvas);
    this.camera.position.set(0, 1.65, 25);
    this.scene.background = new T.Color(0x18262d);
    this.scene.add(new T.HemisphereLight(0xaac4d0, 0x30332f, 1.5));
    const moon = new T.DirectionalLight(0xd2e5ed, 2.3);
    moon.position.set(-12, 22, 8);
    moon.castShadow = true;
    moon.shadow.mapSize.set(1024, 1024);
    moon.shadow.camera.left = -24;
    moon.shadow.camera.right = 24;
    moon.shadow.camera.top = 26;
    moon.shadow.camera.bottom = -24;
    this.scene.add(moon);
    const spot = new T.SpotLight(0xfff6d9, 110, 20, 0.38, 0.55, 1.1);
    spot.position.set(0, 7, -13.5);
    spot.target.position.set(0, 0, -13.5);
    spot.castShadow = true;
    spot.shadow.mapSize.set(1024, 1024);
    this.scene.add(spot, spot.target);
    const doorLight = new T.PointLight(0xecf0d9, 35, 10, 1.3);
    doorLight.position.set(0, 2.7, -1.2);
    this.scene.add(doorLight);
    this.scene.add(this.tombs, this.rin, this.doorLeft, this.doorRight);
    this.colliders = [
      { minX: -6.4, maxX: -5.4, minZ: -20, maxZ: 0.5 },
      { minX: 5.4, maxX: 6.4, minZ: -20, maxZ: 0.5 },
      { minX: -6, maxX: -2.1, minZ: -0.55, maxZ: 0.55 },
      { minX: 2.1, maxX: 6, minZ: -0.55, maxZ: 0.55 },
      { minX: -6, maxX: 6, minZ: -20.3, maxZ: -19.2 },
    ];
    this.observer = new ResizeObserver(this.resize);
    this.observer.observe(host);
    this.resize();
    canvas.addEventListener('pointerdown', this.down);
    canvas.addEventListener('pointermove', this.move);
    canvas.addEventListener('pointerup', this.up);
    canvas.addEventListener('pointercancel', this.cancelPointer);
    canvas.addEventListener('webglcontextlost', this.contextLost);
    window.addEventListener('keydown', this.keyDown);
    window.addEventListener('keyup', this.keyUp);
    window.addEventListener('blur', this.clearInput);
    document.addEventListener('visibilitychange', this.visibility);
    void this.load();
  }
  private resize = () => {
    const { width, height } = this.host.getBoundingClientRect();
    if (width < 1 || height < 1 || this.disposed) return;
    this.renderer.setSize(width, height);
    this.fog.resize(
      Math.round(width * this.renderer.getPixelRatio()),
      Math.round(height * this.renderer.getPixelRatio()),
    );
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    if (this.ready) this.renderFrame();
  };
  private async load() {
    try {
      const texLoader = new T.TextureLoader();
      const loader = new GLTFLoader();
      const maps = await Promise.all(
        [stoneUrl, groundUrl, woodUrl, glassUrl, rinUrl].map(async (url) => {
          const map = await texLoader.loadAsync(url);
          if (this.disposed) {
            map.dispose();
            throw new Error('Disposed');
          }
          this.textures.push(map);
          return map;
        }),
      );
      for (const map of maps) {
        map.colorSpace = T.SRGBColorSpace;
        map.anisotropy = 4;
      }
      for (const map of maps.slice(0, 3)) {
        map.wrapS = map.wrapT = T.RepeatWrapping;
        map.repeat.set(1, 1);
      }
      const loaded = await Promise.all(
        Object.values(modelUrls).map(async (url) => {
          const data = await loader.loadAsync(url);
          this.models.push(data.scene);
          if (this.disposed) {
            this.releaseResources();
            throw new Error('Disposed');
          }
          return data;
        }),
      );
      this.models = loaded.map((g) => g.scene);
      if (this.disposed) {
        this.releaseResources();
        return;
      }
      this.models.forEach((g) =>
        g.traverse((o) => {
          if (o instanceof T.Mesh) {
            o.castShadow = o.receiveShadow = true;
            const materials = Array.isArray(o.material) ? o.material : [o.material];
            materials.forEach((m) => {
              if (m instanceof T.MeshStandardMaterial) {
                if (m.name === 'stone') m.map = maps[0];
                if (m.name === 'wood') m.map = maps[2];
                if (m.name === 'glass') {
                  m.map = maps[3];
                  m.emissiveMap = maps[3];
                }
                m.needsUpdate = true;
              }
            });
          }
        }),
      );
      this.scene.add(this.models[7].clone(true));
      this.doorLeft.position.set(-1.8, 0, 0.35);
      this.doorRight.position.set(1.8, 0, 0.35);
      this.doorLeft.add(this.models[6].clone(true));
      const right = this.models[6].clone(true);
      right.scale.x = -1;
      this.doorRight.add(right);
      for (let i = 0; i < 16; i++) {
        const x = (i % 2 ? 1 : -1) * (9 + Math.floor(i / 6) * 4);
        const z = 22 - (i % 8) * 5;
        const tree = this.models[3].clone(true);
        tree.position.set(x, 0, z);
        tree.rotation.y = i * 1.41;
        tree.scale.setScalar(0.8 + (i % 3) * 0.16);
        this.scene.add(tree);
        this.propColliders.push({ minX: x - 0.4, maxX: x + 0.4, minZ: z - 0.4, maxZ: z + 0.4 });
      }
      for (let i = 0; i < 7; i++)
        for (const sign of [-1, 1]) {
          const pew = this.models[5].clone(true);
          pew.position.set(sign * 3.25, 0, -3.2 - i * 1.55);
          this.scene.add(pew);
          this.propColliders.push({
            minX: sign * 3.25 - 1.18,
            maxX: sign * 3.25 + 1.18,
            minZ: pew.position.z - 0.45,
            maxZ: pew.position.z + 0.45,
          });
        }
      const earth = new T.Mesh(
        new T.PlaneGeometry(52, 52),
        new T.MeshStandardMaterial({ map: maps[1], color: 0x9ca29a, roughness: 1 }),
      );
      earth.rotation.x = -Math.PI / 2;
      earth.position.set(0, -0.04, 2);
      earth.receiveShadow = true;
      maps[1].repeat.set(14, 14);
      this.scene.add(earth);
      // Individually placed paving stones trace a curved, navigable path.
      for (let i = 0; i < 36; i++) {
        const z = 22 - i * 0.64;
        const x = Math.sin(z * 0.26) * 1.05 * (z / 22);
        for (const sign of [-1, 1]) {
          const p = new T.Mesh(
            new T.BoxGeometry(0.92, 0.055, 0.58),
            new T.MeshStandardMaterial({ map: maps[0], color: 0x757d7c, roughness: 0.88 }),
          );
          p.position.set(x + sign * 0.47, 0, z);
          p.rotation.y = Math.sin(z * 0.26) * 0.12;
          p.receiveShadow = true;
          this.scene.add(p);
        }
      }
      for (let i = 0; i < 4; i++) {
        const bird = this.models[4].clone(true);
        if (i === 0) bird.position.set(-7.88, 3.75, 21.84);
        else bird.position.set(-7 + i * 3, 4 + i * 0.2, 9);
        bird.userData.flight = i > 0;
        this.crows.push(bird);
        this.scene.add(bird);
      }
      const person = new T.Mesh(
        new T.PlaneGeometry(2.0, 2.67),
        new T.MeshStandardMaterial({
          map: maps[4],
          transparent: true,
          alphaTest: 0.4,
          side: T.DoubleSide,
          roughness: 1,
          emissive: 0x655d53,
          emissiveIntensity: 0.33,
        }),
      );
      person.position.set(0, 1.47, 0);
      person.userData.kind = 'saint';
      this.rin.position.set(0, 0.05, -13.5);
      this.rin.add(person);
      const platform = new T.Mesh(
        new T.CylinderGeometry(1.65, 1.8, 0.18, 32),
        new T.MeshStandardMaterial({ map: maps[0], color: 0x79817c, roughness: 0.85 }),
      );
      platform.position.set(0, 0.12, -13.5);
      platform.receiveShadow = true;
      this.scene.add(platform);
      this.ready = true;
      this.syncGraves();
      this.callbacks.onReady();
      this.renderFrame();
      this.frame = requestAnimationFrame(this.animate);
    } catch {
      if (!this.disposed) this.callbacks.onError('三维素材加载失败，请重试加载场景');
    }
  }
  setState(categories: ConfessionCategory[], density: number, paused: boolean, blocked: boolean, reduced: boolean) {
    this.categories = categories;
    this.density = density / 100;
    this.paused = paused;
    this.blocked = blocked;
    this.reduced = reduced;
    if (blocked || paused) this.clearInput();
    if (this.ready) {
      this.syncGraves();
      this.renderFrame();
    }
  }
  private syncGraves() {
    const signature = this.categories.map((c) => `${c.id}:${c.name}`).join('|');
    if (this.tombs.userData.signature === signature) return;
    this.tombs.traverse((o) => {
      if (o instanceof T.Mesh && o.userData.decal) {
        o.geometry.dispose();
        o.material.map?.dispose();
        o.material.dispose();
      }
    });
    this.tombs.clear();
    this.tombs.userData.signature = signature;
    this.categories.forEach((category, i) => {
      const p = gravePosition(i);
      const g = this.models[i % 3].clone(true);
      g.position.set(p.x, 0, p.z);
      g.rotation.y = p.x > 0 ? -0.28 : 0.28;
      g.userData.category = category;
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 256;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#d8d5bd';
        ctx.textAlign = 'center';
        ctx.font = '40px "Songti SC",serif';
        const name = [...category.name];
        const lines = [name.slice(0, 12).join(''), name.slice(12).join('')].filter(Boolean);
        lines.forEach((l, j) => ctx.fillText(l, 256, lines.length === 1 ? 145 : 104 + j * 61));
      }
      const label = new T.Mesh(
        new T.PlaneGeometry(0.8, 0.39),
        new T.MeshBasicMaterial({ map: new T.CanvasTexture(canvas), transparent: true, depthWrite: false }),
      );
      label.position.set(0, 0.86, 0.22);
      label.userData.decal = true;
      g.add(label);
      this.tombs.add(g);
    });
  }
  enterChurch() {
    if (!this.ready || this.blocked || this.doorMoving || this.autoEnter) return;
    if (this.doorProgress >= 1) {
      this.autoRoute = [new T.Vector3(0, 1.65, -9.3)];
      return;
    }
    this.autoRoute = [new T.Vector3(0, 1.65, 2.4)];
    this.autoEnter = true;
  }
  returnToGraves() {
    this.autoRoute = [];
    this.autoEnter = false;
    this.doorMoving = false;
    this.clearInput();
    this.camera.position.set(0, 1.65, 25);
    this.yaw = 0;
    this.pitch = -0.03;
    this.renderFrame();
  }
  focusGrave(index: number) {
    this.autoRoute = [];
    this.autoEnter = false;
    this.doorMoving = false;
    this.clearInput();
    const p = gravePosition(index);
    this.camera.position.set(p.x, 1.65, p.z + 2.5);
    this.yaw = 0;
    this.pitch = -0.18;
    this.renderFrame();
  }
  moveTouch(forward: number, right: number) {
    this.touch = { forward, right };
  }
  private setRegion(inside: boolean) {
    if (this.inside === inside) return;
    this.inside = inside;
    this.callbacks.onRegion(inside);
  }
  private down = (e: PointerEvent) => {
    if (this.blocked || hasOpenOverlay()) return;
    this.renderer.domElement.focus();
    this.pointer = { x: e.clientX, y: e.clientY, moved: false, id: e.pointerId };
    this.renderer.domElement.setPointerCapture(e.pointerId);
  };
  private move = (e: PointerEvent) => {
    const p = this.pointer;
    if (!p || this.blocked) return;
    const dx = e.clientX - p.x,
      dy = e.clientY - p.y;
    if (Math.abs(dx) + Math.abs(dy) > 2) p.moved = true;
    this.yaw -= dx * 0.004;
    this.pitch = T.MathUtils.clamp(this.pitch - dy * 0.003, -1.1, 0.85);
    p.x = e.clientX;
    p.y = e.clientY;
  };
  private up = (e: PointerEvent) => {
    const p = this.pointer;
    this.pointer = null;
    if (!p || p.moved || this.blocked) return;
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ray.setFromCamera(
      new T.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, (-(e.clientY - r.top) / r.height) * 2 + 1),
      this.camera,
    );
    this.interact();
  };
  private cancelPointer = () => {
    this.pointer = null;
  };
  private keyDown = (e: KeyboardEvent) => {
    if (
      this.blocked ||
      hasOpenOverlay() ||
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement ||
      e.target instanceof HTMLSelectElement
    )
      return;
    if (!this.host.contains(document.activeElement)) return;
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
      e.preventDefault();
      this.autoRoute = [];
      this.autoEnter = false;
      this.keys.add(e.code);
    }
    if (e.code === 'KeyE' && !e.repeat) {
      e.preventDefault();
      this.ray.setFromCamera(new T.Vector2(), this.camera);
      this.interact();
    }
  };
  private keyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };
  private clearInput = () => {
    this.keys.clear();
    this.touch = { forward: 0, right: 0 };
    this.pointer = null;
  };
  private visibility = () => {
    this.clearInput();
    this.last = 0;
    if (!document.hidden) this.renderFrame();
  };
  private contextLost = (e: Event) => {
    e.preventDefault();
    cancelAnimationFrame(this.frame);
    this.callbacks.onError('三维画面连接已中断，请重新加载场景');
  };
  private interact() {
    if (!this.ready || this.blocked || hasOpenOverlay()) return;
    const hit = this.ray.intersectObjects(this.scene.children, true)[0];
    if (!hit) return;
    let o: T.Object3D | null = hit.object;
    while (o) {
      if (o.userData.category) {
        if (hit.distance < 5) this.callbacks.onTomb(o.userData.category);
        else this.callbacks.onHint('走近墓碑后查看');
        return;
      }
      if (o.userData.kind === 'saint') {
        if (hit.distance < 6) this.callbacks.onSaint();
        else this.callbacks.onHint('走近凛后交谈');
        return;
      }
      if (o === this.doorLeft || o === this.doorRight) {
        this.enterChurch();
        return;
      }
      o = o.parent;
    }
  }
  private navigationColliders() {
    const graves = this.categories.map((_, i) => {
      const p = gravePosition(i);
      return { minX: p.x - 0.65, maxX: p.x + 0.65, minZ: p.z - 0.38, maxZ: p.z + 0.38 };
    });
    return [...this.colliders, ...this.propColliders, ...graves];
  }
  private animate = (now: number) => {
    if (this.disposed) return;
    this.frame = requestAnimationFrame(this.animate);
    if (document.hidden) {
      this.last = 0;
      return;
    }
    const dt = this.last ? Math.min((now - this.last) / 1000, 0.05) : 0;
    this.last = now;
    if (!this.paused && !this.blocked && !hasOpenOverlay()) {
      if (!this.reduced) this.elapsed += dt;
      if (this.doorMoving) {
        this.doorProgress = Math.min(1, this.doorProgress + dt / 0.95);
        if (this.doorProgress >= 1) {
          this.doorMoving = false;
          this.autoRoute = [new T.Vector3(0, 1.65, -9.3)];
        }
      }
      if (this.autoRoute.length) {
        const goal = this.autoRoute[0];
        const dir = goal.clone().sub(this.camera.position);
        if (dir.length() < 0.15) {
          this.autoRoute.shift();
          if (this.autoEnter && this.camera.position.z > 0) {
            this.doorMoving = true;
            this.autoEnter = false;
          }
        } else {
          const step = dir.normalize().multiplyScalar(Math.min(3.9 * dt, this.camera.position.distanceTo(goal)));
          const next = walkStep(
            this.camera.position,
            step.x,
            step.z,
            this.navigationColliders(),
            this.doorProgress > 0.9,
          );
          if (
            Math.abs(next.x - this.camera.position.x) + Math.abs(next.z - this.camera.position.z) < 0.00001 &&
            dt > 0
          ) {
            this.autoRoute = [];
            this.autoEnter = false;
            this.callbacks.onHint('路径被挡住，请用WASD绕开物件再进入教堂');
          }
          this.camera.position.x = next.x;
          this.camera.position.z = next.z;
          this.yaw = 0;
          this.pitch = -0.03;
        }
      } else {
        const f =
          (this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0) -
          (this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0) +
          this.touch.forward;
        const r = (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0) + this.touch.right;
        if (this.keys.has('ArrowLeft')) this.yaw += dt * 1.1;
        if (this.keys.has('ArrowRight')) this.yaw -= dt * 1.1;
        const norm = Math.max(1, Math.hypot(f, r));
        const speed = (2.7 * dt) / norm;
        const dx = (-Math.sin(this.yaw) * f + Math.cos(this.yaw) * r) * speed;
        const dz = (-Math.cos(this.yaw) * f - Math.sin(this.yaw) * r) * speed;
        const next = walkStep(this.camera.position, dx, dz, this.navigationColliders(), this.doorProgress > 0.9);
        this.camera.position.x = next.x;
        this.camera.position.z = next.z;
      }
    }
    this.renderFrame();
  };
  /** Draw state changes immediately, even when the browser suspends background animation. */
  private renderFrame() {
    if (!this.ready || this.disposed) return;
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    this.camera.updateMatrixWorld();
    this.doorLeft.rotation.y = -openingAngle(this.doorProgress);
    this.doorRight.rotation.y = openingAngle(this.doorProgress);
    this.setRegion(isInsideChurch(this.camera.position));
    this.rin.rotation.y = Math.atan2(
      this.camera.position.x - this.rin.position.x,
      this.camera.position.z - this.rin.position.z,
    );
    this.rin.scale.y = 1 + Math.sin(this.elapsed * 1.5) * 0.004;
    this.crows.forEach((g, i) => {
      if (i > 0) {
        const t = this.elapsed * 0.2 + i * 1.9;
        g.position.set(Math.sin(t) * 12, 4.4 + Math.sin(t * 0.7) * 0.55, 9 + Math.cos(t) * 8);
        g.rotation.y = -t;
      }
      for (const name of ['wing-left', 'wing-right']) {
        const wing = g.getObjectByName(name);
        if (wing) wing.rotation.z = Math.sin(this.elapsed * 6 + i) * 0.55;
      }
    });
    const status = this.doorMoving
      ? '门正在开启…'
      : this.inside
        ? '教堂 · 走近凛，点击或按E交谈'
        : '墓地 · WASD行走，拖动环视，靠近墓碑按E';
    if (status !== this.hint) {
      this.hint = status;
      this.callbacks.onHint(status);
    }
    this.fog.render(this.renderer, this.scene, this.camera, this.elapsed, this.density);
  }
  projectSaint() {
    const v = new T.Vector3(0, 2.75, -13.5).project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * 100, y: (-v.y * 0.5 + 0.5) * 100, visible: v.z < 1 && v.z > -1 };
  }
  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    const c = this.renderer.domElement;
    c.removeEventListener('pointerdown', this.down);
    c.removeEventListener('pointermove', this.move);
    c.removeEventListener('pointerup', this.up);
    c.removeEventListener('pointercancel', this.cancelPointer);
    c.removeEventListener('webglcontextlost', this.contextLost);
    window.removeEventListener('keydown', this.keyDown);
    window.removeEventListener('keyup', this.keyUp);
    window.removeEventListener('blur', this.clearInput);
    document.removeEventListener('visibilitychange', this.visibility);
    this.fog.dispose();
    this.releaseResources();
    this.renderer.dispose();
    c.remove();
  }
  private releaseResources() {
    const geometry = new Set<T.BufferGeometry>(),
      materials = new Set<T.Material>(),
      textures = new Set<T.Texture>(this.textures);
    for (const root of [this.scene, ...this.models])
      root.traverse((o) => {
        if (o instanceof T.Mesh) {
          geometry.add(o.geometry);
          for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
            materials.add(m);
            for (const v of Object.values(m)) if (v instanceof T.Texture) textures.add(v);
          }
        }
      });
    geometry.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    textures.forEach((t) => t.dispose());
  }
}
