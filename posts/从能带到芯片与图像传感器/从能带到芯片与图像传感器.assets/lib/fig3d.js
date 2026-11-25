// Shared helpers for the interactive 3D figures (three.js r128, classic scripts, works from file://).
//
// makeView(el, { cam, box, fov, maxPolar })
//   cam : initial viewing direction (a point the camera looks from; only its direction matters when box is given)
//   box : [[xmin,ymin,zmin],[xmax,ymax,zmax]] that must always stay in view, including label anchors and
//         every state the figure can reach. Each frame the camera distance and a screen-space offset are
//         recomputed so this box fills the canvas and sits in its middle, at any canvas size and any
//         rotation angle. Nothing can drift off the top or bottom.
//   pts : optional list of [x,y,z] points used instead of the 8 box corners, for content that is far from
//         box-shaped (a tighter hull means a larger picture). The rotation centre is still the box centre.
function makeView(el, opts) {
  opts = opts || {};
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0xffffff);
  el.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(opts.fov || 34, 1, 0.1, 500);
  scene.add(new THREE.AmbientLight(0xffffff, 0.62));
  const d1 = new THREE.DirectionalLight(0xffffff, 0.62); d1.position.set(5, 9, 6); scene.add(d1);
  const d2 = new THREE.DirectionalLight(0xffffff, 0.25); d2.position.set(-6, 3, -5); scene.add(d2);

  const box = opts.box || [[-3, -1, -3], [3, 1, 3]];
  const lo = new THREE.Vector3().fromArray(box[0]), hi = new THREE.Vector3().fromArray(box[1]);
  const center = lo.clone().add(hi).multiplyScalar(0.5);
  const corners = [];
  if (opts.pts) for (const q of opts.pts) corners.push(new THREE.Vector3(q[0], q[1], q[2]));
  else for (let i = 0; i < 8; i++) corners.push(new THREE.Vector3(i & 1 ? hi.x : lo.x, i & 2 ? hi.y : lo.y, i & 4 ? hi.z : lo.z));
  const NP = corners.length;

  const p = opts.cam || [6, 5, 8];
  camera.position.set(center.x + p[0], center.y + p[1], center.z + p[2]);
  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.target.copy(center);
  controls.enableDamping = true; controls.dampingFactor = 0.12;
  controls.enableZoom = false;   // keep page scrolling usable inside Markdown viewers
  controls.enablePan = false;
  controls.maxPolarAngle = opts.maxPolar || Math.PI * 0.49;  // do not swing under the floor
  controls.minPolarAngle = 0.12;

  let W = 600, H = 360;
  function fit() {
    W = Math.max(1, el.clientWidth || 600); H = Math.max(1, el.clientHeight || 360);
    renderer.setSize(W, H); camera.aspect = W / H;
  }
  if (window.ResizeObserver) new ResizeObserver(fit).observe(el);
  window.addEventListener('resize', fit); fit();

  // --- auto framing -------------------------------------------------------
  const dir = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3(), tmp = new THREE.Vector3();
  const cxs = new Float64Array(NP), cys = new Float64Array(NP), czs = new Float64Array(NP);
  function frameBox() {
    camera.updateMatrixWorld();
    dir.copy(camera.position).sub(controls.target).normalize();
    right.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    up.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
    let zmax = -1e9;
    for (let i = 0; i < NP; i++) {
      tmp.copy(corners[i]).sub(controls.target);
      cxs[i] = tmp.dot(right); cys[i] = tmp.dot(up); czs[i] = tmp.dot(dir);
      zmax = Math.max(zmax, czs[i]);
    }
    const ty = Math.tan(camera.fov * Math.PI / 360), tx = ty * camera.aspect;
    // room for label text (about 48 px sideways, 14 px up/down) plus a small border
    const mx = Math.max(0.5, 1 - 2 * 56 / W), my = Math.max(0.5, 1 - 2 * 22 / H);
    function spans(D) {
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (let i = 0; i < NP; i++) {
        const dep = D - czs[i], nx = cxs[i] / (dep * tx), ny = cys[i] / (dep * ty);
        if (nx < x0) x0 = nx; if (nx > x1) x1 = nx; if (ny < y0) y0 = ny; if (ny > y1) y1 = ny;
      }
      return [x0, x1, y0, y1];
    }
    let a = zmax + 0.05, b = 400;
    for (let k = 0; k < 40; k++) {
      const m = (a + b) / 2, s = spans(m);
      if (s[1] - s[0] <= 2 * mx && s[3] - s[2] <= 2 * my) b = m; else a = m;
    }
    const s = spans(b);
    camera.position.copy(controls.target).addScaledVector(dir, b);
    camera.setViewOffset(W, H, (s[0] + s[1]) / 2 * W / 2, -(s[2] + s[3]) / 2 * H / 2, W, H);
    camera.updateMatrixWorld();
  }

  // --- HTML labels that follow 3D points ----------------------------------
  const labels = [];
  function label(text, pos, color) {
    const d = document.createElement('div'); d.className = 'lbl'; d.textContent = text;
    d.style.color = color || '#2C2C2A'; el.appendChild(d);
    const o = { el: d, pos: new THREE.Vector3(pos[0], pos[1], pos[2]), visible: true };
    labels.push(o); return o;
  }
  const v = new THREE.Vector3();
  function updateLabels() {
    for (const o of labels) {
      v.copy(o.pos).project(camera);
      const show = o.visible && v.z < 1;
      o.el.style.display = show ? 'block' : 'none';
      o.el.style.left = ((v.x + 1) / 2 * W) + 'px';
      o.el.style.top = ((1 - v.y) / 2 * H) + 'px';
    }
  }
  const hooks = [];
  (function loop() {
    for (const f of hooks) f();
    controls.update(); frameBox(); renderer.render(scene, camera); updateLabels();
    requestAnimationFrame(loop);
  })();
  return { renderer, scene, camera, controls, label, onFrame: f => hooks.push(f) };
}

function boxMesh(w, h, d, color, opts) {
  opts = opts || {};
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.0,
    transparent: !!opts.opacity && opts.opacity < 1, opacity: opts.opacity || 1, depthWrite: !(opts.opacity && opts.opacity < 1) });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  if (opts.edges !== false) {
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color: opts.edgeColor || 0x444441, transparent: true, opacity: 0.35 }));
    mesh.add(e);
  }
  return mesh;
}

function heatColor(t) { // 0 -> blue (low energy), 1 -> amber (high energy)
  t = Math.max(0, Math.min(1, t));
  const a = [0.09, 0.37, 0.65], b = [0.58, 0.55, 0.85], c = [0.94, 0.62, 0.15];
  const col = t < 0.5 ? a.map((x, i) => x + (b[i] - x) * t * 2) : b.map((x, i) => x + (c[i] - x) * (t - 0.5) * 2);
  return col;
}
