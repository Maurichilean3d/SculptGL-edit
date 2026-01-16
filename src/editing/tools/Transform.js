/**
 * Parte del código de SculptGL.
 * Implementa funciones o clases internas usadas por la aplicación durante su ejecución.
 */
import { vec3, mat4 } from 'gl-matrix';
import Gizmo from 'editing/Gizmo';
import SculptBase from 'editing/tools/SculptBase';

var Mode = {
  TRANSLATE: 0,
  ROTATE: 1,
  SCALE: 2
};

var Axis = {
  ALL: 0,
  X: 1,
  Y: 2,
  Z: 3
};

var Space = {
  WORLD: 0,
  LOCAL: 1,
  NORMAL: 2
};

// Pivot (punto de transformación) al estilo Blender/Unity
var Pivot = {
  SELECTION: 0, // centro promedio de la selección (comportamiento actual)
  OBJECT_ORIGIN: 1, // origen de los objetos seleccionados (promediado)
  CUSTOM: 2 // punto definido por el usuario
};

class Transform extends SculptBase {
  static get Mode() {
    return Mode;
  }

  static get Axis() {
    return Axis;
  }

  static get Space() {
    return Space;
  }

  static get Pivot() {
    return Pivot;
  }

  constructor(main) {
    super(main);

    this._gizmo = new Gizmo(main);
    this._gizmoMode = Mode.TRANSLATE;
    this._gizmoAxis = Axis.ALL;
    this._gizmoSpace = Space.WORLD;

    this._pivotMode = Pivot.SELECTION;
    this._pivotCustom = vec3.create();
    this._updateGizmo();
  }

  _computePivotObjectOrigin(out = [0.0, 0.0, 0.0]) {
    var meshes = this._main.getSelectedMeshes();
    if (!meshes || meshes.length === 0) return out;

    var acc = vec3.fromValues(0.0, 0.0, 0.0);
    var tmp = vec3.create();
    var m = mat4.create();
    for (var i = 0; i < meshes.length; ++i) {
      // origen local [0,0,0] llevado a mundo por (Matrix * EditMatrix)
      mat4.mul(m, meshes[i].getMatrix(), meshes[i].getEditMatrix());
      vec3.transformMat4(tmp, vec3.set(tmp, 0.0, 0.0, 0.0), m);
      vec3.add(acc, acc, tmp);
    }
    vec3.scale(out, acc, 1.0 / meshes.length);
    return out;
  }

  isIdentity(m) {
    if (m[0] !== 1.0 || m[5] !== 1.0 || m[10] !== 1.0 || m[15] !== 1.0) return false;
    if (m[1] !== 0.0 || m[2] !== 0.0 || m[3] !== 0.0 || m[4] !== 0.0) return false;
    if (m[6] !== 0.0 || m[7] !== 0.0 || m[8] !== 0.0 || m[9] !== 0.0) return false;
    if (m[11] !== 0.0 || m[12] !== 0.0 || m[13] !== 0.0 || m[14] !== 0.0) return false;
    return true;
  }

  preUpdate() {
    var picking = this._main.getPicking();

    var mesh = picking.getMesh();
    this._gizmo.onMouseOver();
    picking._mesh = mesh;

    this._main.setCanvasCursor('default');
  }

  start(ctrl) {
    var main = this._main;
    var mesh = this.getMesh();
    var picking = main.getPicking();

    if (mesh && this._gizmo.onMouseDown()) {
      picking._mesh = mesh;
      return true;
    }

    if (!picking.intersectionMouseMeshes(main.getMeshes(), main._mouseX, main._mouseY))
      return false;

    if (!main.setOrUnsetMesh(picking.getMesh(), ctrl))
      return false;

    this._lastMouseX = main._mouseX;
    this._lastMouseY = main._mouseY;
    return false;
  }

  end() {
    this._gizmo.onMouseUp();

    if (!this.getMesh() || this.isIdentity(this.getMesh().getEditMatrix()))
      return;

    var meshes = this._main.getSelectedMeshes();
    for (var i = 0; i < meshes.length; ++i) {
      this._forceToolMesh = meshes[i];

      this.pushState();
      if (i > 0) this._main.getStateManager().getCurrentState().squash = true;

      var iVerts = this.getUnmaskedVertices();
      this._main.getStateManager().pushVertices(iVerts);
      this.applyEditMatrix(iVerts);

      if (iVerts.length === 0) continue;
      this.updateMeshBuffers();
    }
    this._forceToolMesh = null;
  }

  applyEditMatrix(iVerts) {
    var mesh = this.getMesh();
    var em = mesh.getEditMatrix();
    var emApply = em;
    if (this._gizmoSpace !== Space.WORLD) {
      var spaceMat = this._gizmo._spaceMatrix;
      var spaceInv = this._gizmo._spaceMatrixInv;
      emApply = mat4.create();
      mat4.mul(emApply, spaceMat, em);
      mat4.mul(emApply, emApply, spaceInv);
    }
    var mAr = mesh.getMaterials();
    var vAr = mesh.getVertices();
    var vTemp = [0.0, 0.0, 0.0];
    for (var i = 0, nb = iVerts.length; i < nb; ++i) {
      var j = iVerts[i] * 3;
      var mask = mAr[j + 2];
      var x = vTemp[0] = vAr[j];
      var y = vTemp[1] = vAr[j + 1];
      var z = vTemp[2] = vAr[j + 2];
      vec3.transformMat4(vTemp, vTemp, emApply);
      var iMask = 1.0 - mask;
      vAr[j] = x * iMask + vTemp[0] * mask;
      vAr[j + 1] = y * iMask + vTemp[1] * mask;
      vAr[j + 2] = z * iMask + vTemp[2] * mask;
    }
    vec3.transformMat4(mesh.getCenter(), mesh.getCenter(), emApply);
    mat4.identity(em);
    if (iVerts.length === mesh.getNbVertices()) mesh.updateGeometry();
    else mesh.updateGeometry(mesh.getFacesFromVertices(iVerts), iVerts);
  }

  update() {}

  _updateGizmo() {
    var type = 0;
    switch (this._gizmoMode) {
    case Mode.TRANSLATE:
      if (this._gizmoAxis === Axis.ALL) type = Gizmo.TRANS_XYZ | Gizmo.PLANE_XYZ;
      else if (this._gizmoAxis === Axis.X) type = Gizmo.TRANS_X;
      else if (this._gizmoAxis === Axis.Y) type = Gizmo.TRANS_Y;
      else if (this._gizmoAxis === Axis.Z) type = Gizmo.TRANS_Z;
      break;
    case Mode.ROTATE:
      if (this._gizmoAxis === Axis.ALL) type = Gizmo.ROT_XYZ | Gizmo.ROT_W;
      else if (this._gizmoAxis === Axis.X) type = Gizmo.ROT_X;
      else if (this._gizmoAxis === Axis.Y) type = Gizmo.ROT_Y;
      else if (this._gizmoAxis === Axis.Z) type = Gizmo.ROT_Z;
      break;
    case Mode.SCALE:
      if (this._gizmoAxis === Axis.ALL) type = Gizmo.SCALE_XYZW;
      else if (this._gizmoAxis === Axis.X) type = Gizmo.SCALE_X;
      else if (this._gizmoAxis === Axis.Y) type = Gizmo.SCALE_Y;
      else if (this._gizmoAxis === Axis.Z) type = Gizmo.SCALE_Z;
      break;
    default:
      type = Gizmo.TRANS_XYZ | Gizmo.PLANE_XYZ;
    }
    this._gizmo.setActivatedType(type);
    this._gizmo.setSpaceMode(this._gizmoSpace);

    // sincroniza pivote
    this._syncPivotToGizmo(true);
  }

  _syncPivotToGizmo(render = false) {
    if (this._pivotMode === Pivot.SELECTION) {
      this._gizmo.clearPivot(render);
      return;
    }

    if (this._pivotMode === Pivot.OBJECT_ORIGIN) {
      var p = this._computePivotObjectOrigin();
      this._gizmo.setPivotWorld(p, render);
      return;
    }

    // CUSTOM
    this._gizmo.setPivotWorld(this._pivotCustom, render);
  }

  setGizmoMode(mode) {
    this._gizmoMode = mode;
    this._updateGizmo();
    this._main.render();
  }

  setGizmoAxis(axis) {
    this._gizmoAxis = axis;
    this._updateGizmo();
    this._main.render();
  }

  setGizmoSpace(space) {
    this._gizmoSpace = space;
    this._updateGizmo();
    this._main.render();
  }

  setPivotMode(mode) {
    this._pivotMode = mode;
    this._syncPivotToGizmo(true);
    this._main.render();
  }

  /**
   * Define pivote custom a partir del punto actualmente pickeado.
   * Recomendado: atarlo a un botón de UI "Set Pivot From Click".
   */
  setPivotFromPicking() {
    var picking = this._main.getPicking();
    var p = picking.getIntersectionPoint();
    if (!p) return;
    vec3.copy(this._pivotCustom, p);
    this._pivotMode = Pivot.CUSTOM;
    this._syncPivotToGizmo(true);
    this._main.render();
  }

  resetPivot() {
    this._pivotMode = Pivot.SELECTION;
    this._syncPivotToGizmo(true);
    this._main.render();
  }

  postRender() {
    if (this.getMesh()) {
      // en OBJECT_ORIGIN, el pivote puede cambiar si el usuario mueve/edita
      if (this._pivotMode === Pivot.OBJECT_ORIGIN) this._syncPivotToGizmo(false);
      this._gizmo.render();
    }
  }

  addSculptToScene(scene) {
    if (this.getMesh())
      this._gizmo.addGizmoToScene(scene);
  }
}

export default Transform;
