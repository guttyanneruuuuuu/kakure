import * as THREE from 'three';

// The player chameleon. Holds body parts, current paint color, pose state,
// and exposes the camouflage color used for detection scoring.
export class Player {
  constructor(scene) {
    this.scene = scene;
    this.pos = new THREE.Vector3(0, 0, 8);
    this.heading = 0;          // facing yaw (radians)
    this.paintColor = new THREE.Color(0x7ed957); // default chameleon green
    this.posing = false;
    this.speed = 6.5;

    this._build();
  }

  _build() {
    const g = new THREE.Group();

    const mat = new THREE.MeshStandardMaterial({ color: this.paintColor.clone(), roughness: 0.6 });
    this.mat = mat;

    // body
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 20, 16), mat);
    body.scale.set(1.3, 0.85, 1.0);
    body.position.y = 0.55; body.castShadow = true;
    g.add(body); this.body = body;

    // head
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.38, 18, 14), mat);
    head.position.set(0, 0.7, 0.55); head.castShadow = true;
    g.add(head);

    // eyes (turret style)
    const eyeWhiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const eyeBlackMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
    for (const dx of [-0.28, 0.28]) {
      const turret = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), mat);
      turret.position.set(dx, 0.85, 0.5);
      g.add(turret);
      const w = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), eyeWhiteMat);
      w.position.set(dx, 0.85, 0.62); g.add(w);
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), eyeBlackMat);
      b.position.set(dx, 0.85, 0.71); g.add(b);
    }

    // tail (curled)
    const tail = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.09, 10, 20, Math.PI * 1.4), mat);
    tail.position.set(0, 0.5, -0.75);
    tail.rotation.set(Math.PI / 2, 0, 0);
    g.add(tail); this.tail = tail;

    // legs
    const legMat = mat;
    this.legs = [];
    const legPos = [[-0.35, -0.4], [0.35, -0.4], [-0.35, 0.35], [0.35, 0.35]];
    for (const [lx, lz] of legPos) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.5, 8), legMat);
      leg.position.set(lx, 0.25, lz);
      leg.castShadow = true;
      g.add(leg);
      this.legs.push(leg);
    }

    g.position.copy(this.pos);
    this.scene.add(g);
    this.group = g;

    // marker ring under player (helps depth perception)
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.6, 0.75, 24),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02;
    g.add(ring); this.ring = ring;
  }

  setPaintColor(hex) {
    this.paintColor.set(hex);
    // smooth transition handled in update
  }

  setPosing(v) {
    this.posing = v;
  }

  update(dt, world, walkAmt) {
    // smooth color toward target
    this.mat.color.lerp(this.paintColor, Math.min(1, dt * 8));

    // posing: crouch down a bit and stop the ring
    const targetScaleY = this.posing ? 0.7 : 1.0;
    this.group.scale.y += (targetScaleY - this.group.scale.y) * Math.min(1, dt * 10);

    // leg wiggle when walking
    const t = performance.now() * 0.012;
    this.legs.forEach((leg, i) => {
      const phase = (i % 2) * Math.PI;
      leg.rotation.x = Math.sin(t + phase) * 0.5 * walkAmt;
    });

    // pulse ring
    this.ring.material.opacity = this.posing ? 0.12 : 0.35;

    this.group.position.copy(this.pos);
    this.group.rotation.y = this.heading;
  }
}
