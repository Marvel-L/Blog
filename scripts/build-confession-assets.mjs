import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as T from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

// Offline asset build only. The website loads GLBs, never constructs these props as UI.
class BlobReader {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((result) => {
      this.result = result;
      this.onloadend?.();
    });
  }
  readAsDataURL(blob) {
    blob.arrayBuffer().then((result) => {
      this.result = `data:${blob.type};base64,${Buffer.from(result).toString('base64')}`;
      this.onloadend?.();
    });
  }
}
const root = fileURLToPath(new URL('../packages/blog/src/assets/confession/models/', import.meta.url));
const stone = new T.MeshStandardMaterial({ name: 'stone', color: 0x8c9391, roughness: 0.95 });
const wood = new T.MeshStandardMaterial({ name: 'wood', color: 0x695348, roughness: 0.86 });
const dark = new T.MeshStandardMaterial({ name: 'iron', color: 0x272d31, roughness: 0.7, metalness: 0.6 });
const glass = new T.MeshStandardMaterial({
  name: 'glass',
  color: 0xffffff,
  emissive: 0x6a8ba6,
  emissiveIntensity: 0.5,
  side: T.DoubleSide,
});
const black = new T.MeshStandardMaterial({ name: 'feathers', color: 0x141d25, roughness: 0.85 });
function mesh(group, geometry, material, position = [0, 0, 0], scale = [1, 1, 1], name = '') {
  const object = new T.Mesh(geometry, material);
  object.position.set(...position);
  object.scale.set(...scale);
  object.name = name;
  group.add(object);
  return object;
}
function box(g, size, pos, mat = stone, name = '') {
  return mesh(g, new T.BoxGeometry(...size), mat, pos, undefined, name);
}
function beam(g, start, end, radius, mat = stone, topRadius = radius) {
  const a = new T.Vector3(...start),
    b = new T.Vector3(...end),
    dir = b.clone().sub(a);
  const object = mesh(
    g,
    new T.CylinderGeometry(topRadius, radius, dir.length(), 8),
    mat,
    a.clone().add(b).multiplyScalar(0.5).toArray(),
  );
  object.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), dir.normalize());
  return object;
}
function archShape(width, height, base = 0) {
  const s = new T.Shape();
  s.moveTo(-width / 2, base);
  s.lineTo(-width / 2, height - width * 0.65);
  s.quadraticCurveTo(-width * 0.4, height - width * 0.15, 0, height);
  s.quadraticCurveTo(width * 0.4, height - width * 0.15, width / 2, height - width * 0.65);
  s.lineTo(width / 2, base);
  s.closePath();
  return s;
}
function archBand(g, w, h, thickness, z, y = 0, x = 0) {
  const outer = archShape(w, h);
  const inner = archShape(w - thickness * 2, h - thickness, 0);
  outer.holes.push(new T.Path(inner.getPoints(30)));
  return mesh(g, new T.ExtrudeGeometry(outer, { depth: 0.3, bevelEnabled: false, curveSegments: 12 }), stone, [
    x,
    y,
    z,
  ]);
}
function tomb(variant) {
  const g = new T.Group();
  g.name = `grave-${variant}`;
  box(g, [1.35, 0.17, 0.72], [0, 0.085, 0]);
  box(g, [1.14, 0.16, 0.5], [0, 0.25, 0]);
  const shape = archShape(1.04, 1.64, 0.32);
  mesh(
    g,
    new T.ExtrudeGeometry(shape, {
      depth: 0.3,
      bevelEnabled: true,
      bevelThickness: 0.035,
      bevelSize: 0.035,
      bevelSegments: 2,
      curveSegments: 12,
    }),
    stone,
    [0, 0, -0.15],
  );
  box(g, [0.055, 0.27, 0.024], [0, 1.31, 0.205], dark);
  box(g, [0.2, 0.055, 0.024], [0, 1.36, 0.205], dark);
  if (variant === 1) {
    box(g, [1.07, 0.06, 0.37], [0, 0.51, 0]);
    box(g, [1.07, 0.06, 0.37], [0, 1.08, 0]);
  }
  if (variant === 2) {
    beam(g, [-0.48, 0.36, 0.16], [-0.48, 1.1, 0.16], 0.025);
    beam(g, [0.48, 0.36, 0.16], [0.48, 1.1, 0.16], 0.025);
  }
  // Stable flat face for a separate private category decal.
  box(g, [0.72, 0.42, 0.018], [0, 0.85, 0.19], stone, 'inscription-face');
  return g;
}
function deadTree() {
  const g = new T.Group();
  g.name = 'dead-tree';
  const trunk = [
    [0, 0, 0],
    [0.12, 1.5, 0.03],
    [-0.18, 3, 0.06],
    [0.08, 4.5, 0.1],
    [0.45, 5.9, 0.12],
  ];
  for (let i = 0; i < trunk.length - 1; i++) beam(g, trunk[i], trunk[i + 1], 0.32 - i * 0.055, wood, 0.27 - i * 0.055);
  const branches = [
    [
      [0.02, 2.4, 0],
      [-1.2, 3.4, 0.1],
      [-2, 4.4, 0.5],
      [-2.5, 4.8, 0.6],
    ],
    [
      [0, 3.2, 0],
      [1.4, 4.1, -0.2],
      [2.1, 4.5, -0.4],
      [2.65, 5.1, -0.4],
    ],
    [
      [0.05, 4.2, 0.1],
      [-0.7, 5.3, -0.4],
      [-1.2, 6.2, -0.6],
    ],
    [
      [0.1, 2.9, 0],
      [0.6, 3.7, 1.1],
      [1.1, 4.1, 1.8],
    ],
  ];
  for (const points of branches) {
    for (let i = 0; i < points.length - 1; i++)
      beam(g, points[i], points[i + 1], 0.13 - i * 0.035, wood, 0.095 - i * 0.03);
    const p = points[1];
    beam(g, p, [p[0] + 0.4, p[1] + 1, p[2] - 0.5], 0.065, wood, 0.018);
  }
  for (let i = 0; i < 7; i++) {
    const a = (i * Math.PI * 2) / 7;
    beam(g, [0, 0.15, 0], [Math.cos(a) * 0.9, 0, Math.sin(a) * 0.9], 0.13, wood, 0.025);
  }
  return g;
}
function crow() {
  const g = new T.Group();
  g.name = 'crow';
  mesh(g, new T.SphereGeometry(1, 12, 8), black, [0, 0.18, 0], [0.17, 0.23, 0.36]);
  mesh(g, new T.SphereGeometry(1, 12, 8), black, [0, 0.38, -0.28], [0.14, 0.14, 0.16]);
  const beak = mesh(g, new T.ConeGeometry(0.065, 0.22, 8), dark, [0, 0.36, -0.48]);
  beak.rotation.x = -Math.PI / 2;
  for (const sign of [-1, 1]) {
    const wing = new T.Group();
    wing.name = sign < 0 ? 'wing-left' : 'wing-right';
    wing.position.set(sign * 0.12, 0.22, 0);
    mesh(wing, new T.SphereGeometry(1, 10, 6), black, [sign * 0.32, 0, 0.08], [0.4, 0.045, 0.22]);
    for (let i = 0; i < 4; i++) {
      const f = mesh(wing, new T.BoxGeometry(0.07, 0.025, 0.4), black, [sign * (0.26 + i * 0.1), 0, 0.24 + i * 0.015]);
      f.rotation.y = sign * (0.12 + i * 0.12);
    }
    g.add(wing);
    beam(g, [sign * 0.07, 0, 0], [sign * 0.07, 0.13, 0], 0.014, dark);
  }
  return g;
}
function pew() {
  const g = new T.Group();
  g.name = 'pew';
  box(g, [2.35, 0.14, 0.6], [0, 0.6, 0], wood);
  box(g, [2.35, 0.65, 0.12], [0, 0.89, 0.27], wood);
  for (const x of [-0.98, 0.98]) {
    box(g, [0.13, 0.6, 0.44], [x, 0.3, 0], wood);
    box(g, [0.14, 0.3, 0.63], [x, 0.75, 0], wood);
  }
  return g;
}
function door() {
  const g = new T.Group();
  g.name = 'door-leaf';
  const shape = archShape(1.8, 4.25);
  mesh(
    g,
    new T.ExtrudeGeometry(shape, {
      depth: 0.16,
      bevelEnabled: true,
      bevelThickness: 0.02,
      bevelSize: 0.02,
      bevelSegments: 1,
    }),
    wood,
    [0.9, 0, -0.08],
  );
  for (const y of [0.75, 2.15, 3.4]) {
    box(g, [1.76, 0.13, 0.06], [0.9, y, 0.13], dark);
    box(g, [0.18, 0.23, 0.05], [0.13, y, 0.16], dark);
  }
  const ring = mesh(g, new T.TorusGeometry(0.11, 0.025, 7, 18), dark, [1.49, 1.72, 0.17]);
  ring.rotation.x = 0.15;
  return g;
}
function church() {
  const g = new T.Group();
  g.name = 'chapel';
  box(g, [12, 0.16, 21], [0, 0.08, -10]);
  // Front wall has an actual opening, not a door drawn over solid geometry.
  box(g, [4.05, 7, 0.65], [-3.98, 3.5, 0]);
  box(g, [4.05, 7, 0.65], [3.98, 3.5, 0]);
  box(g, [3.9, 2.6, 0.65], [0, 5.7, 0]);
  box(g, [0.6, 7, 21], [-6, 3.5, -10]);
  box(g, [0.6, 7, 21], [6, 3.5, -10]);
  box(g, [12, 7, 0.6], [0, 3.5, -20]);
  archBand(g, 4.2, 4.8, 0.3, 0.34);
  archBand(g, 4.5, 5, 0.18, -0.14);
  for (const x of [-3.2, 3.2]) {
    box(g, [1, 8.1, 1.25], [x, 4.05, 0.6]);
    box(g, [1.2, 0.25, 1.4], [x, 7.95, 0.6]);
  }
  const roof = new T.Shape();
  roof.moveTo(-6.5, 7);
  roof.lineTo(0, 10.7);
  roof.lineTo(6.5, 7);
  roof.lineTo(-6.5, 7);
  mesh(g, new T.ExtrudeGeometry(roof, { depth: 21.8, bevelEnabled: false }), dark, [0, 0, -20.7]);
  // Raised nave, ribs, engaged columns, end altar and side windows are separate mesh objects.
  for (let i = 0; i < 5; i++) {
    const z = -2.3 - i * 3.55;
    for (const x of [-4.65, 4.65]) {
      mesh(g, new T.CylinderGeometry(0.24, 0.35, 5.5, 12), stone, [x, 2.75, z]);
      box(g, [0.9, 0.18, 0.9], [x, 0.12, z]);
      box(g, [0.7, 0.22, 0.7], [x, 5.4, z]);
      const pane = mesh(
        g,
        new T.PlaneGeometry(1.9, 3.5),
        glass,
        [Math.sign(x) * 5.67, 4.6, z],
        undefined,
        'window-glass',
      );
      pane.rotation.y = (Math.sign(x) * -Math.PI) / 2;
      for (const dz of [-1.15, 1.15]) box(g, [0.45, 4, 0.3], [Math.sign(x) * 5.7, 4.6, z + dz]);
      box(g, [0.5, 0.22, 2.4], [Math.sign(x) * 5.65, 2.65, z]);
      box(g, [0.5, 0.22, 2.4], [Math.sign(x) * 5.65, 6.55, z]);
      box(g, [1, 6.8, 1], [Math.sign(x) * 6.35, 3.4, z]);
    }
    archBand(g, 9.3, 4.1, 0.19, z, 5.15);
  }
  box(g, [4.5, 0.3, 2.5], [0, 0.25, -17.4]);
  box(g, [2.4, 1.05, 1], [0, 0.94, -18], stone);
  box(g, [0.17, 2.6, 0.15], [0, 4.8, -19.6], wood);
  box(g, [1.3, 0.17, 0.15], [0, 5.45, -19.6], wood);
  // Bell tower silhouette with four posts and high pyramidal cap.
  for (const x of [-1.1, 1.1]) for (const z of [-1.1, 1.1]) box(g, [0.4, 4, 0.4], [x, 9, z]);
  box(g, [2.8, 0.3, 2.8], [0, 10.8, 0]);
  mesh(g, new T.ConeGeometry(2.15, 3.5, 4), dark, [0, 12.7, 0]).rotation.y = Math.PI / 4;
  box(g, [0.12, 1.5, 0.12], [0, 15.1, 0], wood);
  box(g, [0.8, 0.12, 0.12], [0, 15.45, 0], wood);
  return g;
}
export async function buildConfessionAssets() {
  const originalReader = globalThis.FileReader;
  globalThis.FileReader = BlobReader;
  try {
    await mkdir(root, { recursive: true });
    const exporter = new GLTFExporter();
    for (const [name, object] of [
      ['grave-a', tomb(0)],
      ['grave-b', tomb(1)],
      ['grave-c', tomb(2)],
      ['dead-tree', deadTree()],
      ['crow', crow()],
      ['pew', pew()],
      ['door', door()],
      ['chapel', church()],
    ]) {
      const data = await exporter.parseAsync(object, { binary: true });
      await writeFile(`${root}${name}.glb`, Buffer.from(data));
    }
  } finally {
    globalThis.FileReader = originalReader;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await buildConfessionAssets();
}
