// Studworks — start-up and the frame loop. Open with #debug for a window.SW test hook.

let lastT = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, Math.max(0, (now - lastT) / 1000));
  lastT = now;
  keyCamera(dt);
  if (updateCamera(dt)) { invalidate(); ptr.dirty = true; }
  if (ptr.dirty && ptr.over) {
    ptr.dirty = false;
    updateHover(pickAt(ptr.x, ptr.y));
  }
  if (needsRender) {
    needsRender = false;
    renderer.render(scene, camera);
  }
}

function init() {
  resize();
  let saved = null;
  try { saved = JSON.parse(store(SAVE_KEY) || 'null'); } catch (e) { saved = null; }
  loadBuild(saved || { size: 32, base: 'green', bricks: [] });
  frameBaseplate(world.size, true);
  initUI();
  initInput();
  if (!store('studworks.seenHelp')) {
    store('studworks.seenHelp', '1');
    openModal('#helpDlg');
  }
  requestAnimationFrame(frame);

  if (DEBUG) {
    window.SW = {
      world, state, history, TYPE, COLOR, TYPES, view, goal,
      add: (type, color, x, y, z, rot = 0) => { const s = { type, color, x, y, z, rot }; if (!fits(s)) return null; perform([], [{ ...s, id: world.nextId++ }]); return true; },
      serialize, loadBuild, setTool, setType: (id) => setType(TYPE[id]), setColor, rotate, undo: doUndo, redo: doRedo,
      pickAt, hoverAt: hoverNow, placeBrick, selectAll, duplicateSelection, moveSelection, dropCarry, cancelCarry,
      // Screen position of the middle of a brick's top face.
      screenOf: (id) => {
        const b = world.bricks.get(id), [W, D, h] = extentOf(b), r = canvas.getBoundingClientRect();
        const v = new V3(b.x + W / 2, (b.y + h) * PLATE, b.z + D / 2).project(camera);
        return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
      },
      frame: (size) => { frameBaseplate(size || world.size, true); updateCamera(0); invalidate(); },
      orbit: (yaw, pitch, dist) => { Object.assign(goal, { yaw, pitch, dist }); Object.assign(view, { yaw, pitch, dist }); updateCamera(0); invalidate(); },
    };
  }
}
init();
