// Touch controls: left virtual joystick + right swipe camera + action buttons
// Designed for landscape mobile. Also supports keyboard/mouse for desktop testing.

export class Controls {
  constructor() {
    // Movement vector (-1..1)
    this.move = { x: 0, y: 0 };
    // Camera delta (consumed each frame)
    this.look = { dx: 0, dy: 0 };

    // Joystick state
    this._joyId = null;
    this._joyStart = { x: 0, y: 0 };
    // Look (right side) state
    this._lookId = null;
    this._lookLast = { x: 0, y: 0 };

    // Keyboard (desktop)
    this._keys = {};

    this._initJoystick();
    this._initLook();
    this._initKeyboard();
  }

  _initJoystick() {
    const zone = document.getElementById('joystick-zone');
    const base = document.getElementById('joystick-base');
    const knob = document.getElementById('joystick-knob');
    const RADIUS = 50;

    const place = (x, y) => {
      base.style.display = 'block';
      base.style.left = (x - 60) + 'px';
      base.style.bottom = (window.innerHeight - y - 60) + 'px';
    };

    zone.addEventListener('touchstart', (e) => {
      if (this._joyId !== null) return;
      const t = e.changedTouches[0];
      this._joyId = t.identifier;
      this._joyStart = { x: t.clientX, y: t.clientY };
      place(t.clientX, t.clientY);
      knob.style.transform = 'translate(-50%,-50%)';
      e.preventDefault();
    }, { passive: false });

    zone.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== this._joyId) continue;
        let dx = t.clientX - this._joyStart.x;
        let dy = t.clientY - this._joyStart.y;
        const dist = Math.hypot(dx, dy);
        if (dist > RADIUS) { dx = dx / dist * RADIUS; dy = dy / dist * RADIUS; }
        knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
        this.move.x = dx / RADIUS;
        this.move.y = dy / RADIUS;
        e.preventDefault();
      }
    }, { passive: false });

    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== this._joyId) continue;
        this._joyId = null;
        this.move.x = 0; this.move.y = 0;
        base.style.display = 'none';
        knob.style.transform = 'translate(-50%,-50%)';
      }
    };
    zone.addEventListener('touchend', end);
    zone.addEventListener('touchcancel', end);
  }

  _initLook() {
    // Right side of screen = camera look. Avoid buttons (they have pointer-events).
    const root = document.getElementById('game-root');

    root.addEventListener('touchstart', (e) => {
      if (this._lookId !== null) return;
      const t = e.changedTouches[0];
      // only right half of screen, and not on a UI button
      if (t.clientX < window.innerWidth * 0.5) return;
      if (e.target.closest('button') || e.target.closest('#palette')) return;
      this._lookId = t.identifier;
      this._lookLast = { x: t.clientX, y: t.clientY };
    }, { passive: false });

    root.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== this._lookId) continue;
        this.look.dx += (t.clientX - this._lookLast.x);
        this.look.dy += (t.clientY - this._lookLast.y);
        this._lookLast = { x: t.clientX, y: t.clientY };
      }
    }, { passive: false });

    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this._lookId) this._lookId = null;
      }
    };
    root.addEventListener('touchend', end);
    root.addEventListener('touchcancel', end);

    // Desktop mouse drag for look
    let mouseDown = false, lastX = 0, lastY = 0;
    root.addEventListener('mousedown', (e) => {
      if (e.target.closest('button') || e.target.closest('#palette')) return;
      mouseDown = true; lastX = e.clientX; lastY = e.clientY;
    });
    window.addEventListener('mousemove', (e) => {
      if (!mouseDown) return;
      this.look.dx += (e.clientX - lastX);
      this.look.dy += (e.clientY - lastY);
      lastX = e.clientX; lastY = e.clientY;
    });
    window.addEventListener('mouseup', () => { mouseDown = false; });
  }

  _initKeyboard() {
    window.addEventListener('keydown', (e) => { this._keys[e.key.toLowerCase()] = true; });
    window.addEventListener('keyup', (e) => { this._keys[e.key.toLowerCase()] = false; });
  }

  // Call each frame; returns and clears look delta
  consumeLook() {
    const l = { dx: this.look.dx, dy: this.look.dy };
    this.look.dx = 0; this.look.dy = 0;
    return l;
  }

  getMove() {
    // merge keyboard into move for desktop
    let x = this.move.x, y = this.move.y;
    if (this._keys['a'] || this._keys['arrowleft']) x = -1;
    if (this._keys['d'] || this._keys['arrowright']) x = 1;
    if (this._keys['w'] || this._keys['arrowup']) y = -1;
    if (this._keys['s'] || this._keys['arrowdown']) y = 1;
    return { x, y };
  }
}
