import * as THREE from 'three';

// Builds the stage, colored props (for camouflage targets), and the Oni seeker.
export class World {
  constructor(scene) {
    this.scene = scene;
    this.props = [];          // camouflage-able objects { mesh, color }
    this.colliders = [];      // bounding boxes for movement collision
    this.build();
    this.buildOni();
  }

  build() {
    const scene = this.scene;

    // Lighting
    const hemi = new THREE.HemisphereLight(0xffffff, 0x445544, 0.9);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff2dd, 1.1);
    sun.position.set(12, 20, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -25; sun.shadow.camera.right = 25;
    sun.shadow.camera.top = 25; sun.shadow.camera.bottom = -25;
    scene.add(sun);

    scene.fog = new THREE.Fog(0xbfe3d2, 30, 70);
    scene.background = new THREE.Color(0xbfe3d2);

    // Floor (checker-ish tile look via two materials patches)
    const floorGeo = new THREE.PlaneGeometry(60, 60);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x6fae74 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Outer walls (just for boundary feel)
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x4a7a5a });
    const wallH = 4, half = 26;
    const wallDefs = [
      [0, wallH/2, -half, 56, wallH, 1],
      [0, wallH/2, half, 56, wallH, 1],
      [-half, wallH/2, 0, 1, wallH, 56],
      [half, wallH/2, 0, 1, wallH, 56],
    ];
    for (const [x,y,z,w,h,d] of wallDefs) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), wallMat);
      m.position.set(x,y,z);
      m.receiveShadow = true; m.castShadow = true;
      scene.add(m);
      this._addCollider(m);
    }

    // Colorful props scattered around — these are the camouflage targets.
    // Color palette is "kid-friendly" bright tones.
    const propColors = [
      0xe74c3c, 0xf1c40f, 0x3498db, 0x9b59b6,
      0xe67e22, 0x1abc9c, 0xff6fb5, 0x2ecc71,
      0xffffff, 0x34495e,
    ];
    const rng = mulberry32(12345);
    const layout = [
      // [x, z, type] types: box, sphere, cyl, cone
      [-8, -6, 'box'], [6, -10, 'sphere'], [10, 4, 'cyl'], [-12, 8, 'cone'],
      [3, 9, 'box'], [-4, 12, 'sphere'], [14, -4, 'box'], [-15, -10, 'cyl'],
      [0, 0, 'sphere'], [8, 12, 'cone'], [-10, -2, 'box'], [12, -14, 'sphere'],
      [-6, 4, 'cyl'], [16, 10, 'box'], [-16, 6, 'cone'], [2, -16, 'box'],
    ];

    layout.forEach((entry, i) => {
      const [x, z, type] = entry;
      const color = propColors[i % propColors.length];
      let geo, h;
      const s = 1.4 + rng() * 1.6;
      switch (type) {
        case 'sphere': geo = new THREE.SphereGeometry(s*0.8, 20, 16); h = s*0.8; break;
        case 'cyl': geo = new THREE.CylinderGeometry(s*0.6, s*0.6, s*2, 18); h = s; break;
        case 'cone': geo = new THREE.ConeGeometry(s*0.8, s*2.2, 18); h = s*1.1; break;
        default: geo = new THREE.BoxGeometry(s*1.5, s*1.5, s*1.5); h = s*0.75;
      }
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, h, z);
      mesh.castShadow = true; mesh.receiveShadow = true;
      scene.add(mesh);
      this.props.push({ mesh, color: new THREE.Color(color) });
      this._addCollider(mesh, 0.6);
    });
  }

  _addCollider(mesh, shrink = 0) {
    const box = new THREE.Box3().setFromObject(mesh);
    if (shrink) box.expandByScalar(-shrink);
    this.colliders.push(box);
  }

  buildOni() {
    // Simple "oni" (seeker) — a red blocky character with eyes.
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xd9382f });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.6, 1.0, 6, 12), bodyMat);
    body.position.y = 1.1; body.castShadow = true;
    g.add(body);
    // head
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), bodyMat);
    head.position.y = 2.1; head.castShadow = true;
    g.add(head);
    // horns
    const hornMat = new THREE.MeshStandardMaterial({ color: 0xfff0c0 });
    for (const dx of [-0.25, 0.25]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.4, 8), hornMat);
      horn.position.set(dx, 2.6, 0);
      g.add(horn);
    }
    // eyes (white, will glow when alert)
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x000000 });
    this.oniEyeMat = eyeMat;
    for (const dx of [-0.2, 0.2]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), eyeMat);
      eye.position.set(dx, 2.15, 0.45);
      g.add(eye);
    }
    g.position.set(0, 0, -18);
    this.scene.add(g);
    this.oni = g;
  }

  // Resolve circle-vs-box collisions; returns adjusted position
  resolveCollision(pos, radius = 0.5) {
    const p = pos.clone();
    for (const box of this.colliders) {
      // closest point on box to p (in XZ)
      const cx = Math.max(box.min.x, Math.min(p.x, box.max.x));
      const cz = Math.max(box.min.z, Math.min(p.z, box.max.z));
      const dx = p.x - cx, dz = p.z - cz;
      const d2 = dx*dx + dz*dz;
      if (d2 < radius*radius && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        const push = (radius - d);
        p.x += (dx / d) * push;
        p.z += (dz / d) * push;
      }
    }
    // keep in arena
    p.x = Math.max(-24, Math.min(24, p.x));
    p.z = Math.max(-24, Math.min(24, p.z));
    return p;
  }
}

// deterministic RNG
function mulberry32(a) {
  return function() {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
