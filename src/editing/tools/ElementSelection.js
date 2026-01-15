/**
 * Parte del código de SculptGL.
 * Implementa funciones o clases internas usadas por la aplicación durante su ejecución.
 */
import SculptBase from 'editing/tools/SculptBase';
import Utils from 'misc/Utils';

var _TMP_INTER = [0.0, 0.0, 0.0];

class ElementSelection extends SculptBase {

  constructor(main) {
    super(main);

    this._selectionMode = ElementSelection.Mode.FACE;
    this._selectionAction = ElementSelection.Action.REPLACE;
  }

  start(ctrl) {
    var main = this._main;
    var picking = main.getPicking();

    if (!picking.intersectionMouseMeshes())
      return false;

    var mesh = main.setOrUnsetMesh(picking.getMesh(), ctrl);
    if (!mesh)
      return false;

    if (picking.getPickedFace() === -1)
      return false;

    this._main.getStateManager().pushStateColorAndMaterial(mesh);
    this.applySelection(mesh, picking);
    this.updateRender();
    this._lastMouseX = main._mouseX;
    this._lastMouseY = main._mouseY;
    return true;
  }

  update() {}

  updateMeshBuffers() {
    var mesh = this.getMesh();
    if (!mesh)
      return;
    if (mesh.isDynamic) {
      mesh.updateBuffers();
      return;
    }
    mesh.updateDuplicateColorsAndMaterials();
    mesh.updateDrawArrays();
    mesh.updateMaterialBuffer();
  }

  applySelection(mesh, picking) {
    var verts = this.getSelectionVertices(mesh, picking);
    if (!verts.length)
      return;

    var mAr = mesh.getMaterials();
    var nbVertices = mesh.getNbVertices();

    if (this._selectionAction === ElementSelection.Action.REPLACE) {
      for (var i = 0; i < nbVertices; ++i)
        mAr[i * 3 + 2] = 0.0;
    }

    var targetValue = this._selectionAction === ElementSelection.Action.REMOVE ? 0.0 : 1.0;
    for (var j = 0, nb = verts.length; j < nb; ++j)
      mAr[verts[j] * 3 + 2] = targetValue;
  }

  getSelectionVertices(mesh, picking) {
    var faceId = picking.getPickedFace();
    var fAr = mesh.getFaces();
    var id = faceId * 4;
    var v1 = fAr[id];
    var v2 = fAr[id + 1];
    var v3 = fAr[id + 2];
    var v4 = fAr[id + 3];
    var verts = [v1, v2, v3];
    if (v4 !== Utils.TRI_INDEX) verts.push(v4);

    if (this._selectionMode === ElementSelection.Mode.FACE)
      return verts;

    var inter = picking.getIntersectionPoint();
    _TMP_INTER[0] = inter[0];
    _TMP_INTER[1] = inter[1];
    _TMP_INTER[2] = inter[2];

    if (this._selectionMode === ElementSelection.Mode.VERTEX)
      return [this.getClosestVertex(mesh, verts, _TMP_INTER)];

    if (this._selectionMode === ElementSelection.Mode.EDGE)
      return this.getClosestEdge(mesh, verts, _TMP_INTER);

    return verts;
  }

  getClosestVertex(mesh, verts, inter) {
    var vAr = mesh.getVertices();
    var best = verts[0];
    var bestDist = Infinity;
    for (var i = 0, nb = verts.length; i < nb; ++i) {
      var id = verts[i] * 3;
      var dx = vAr[id] - inter[0];
      var dy = vAr[id + 1] - inter[1];
      var dz = vAr[id + 2] - inter[2];
      var dist = dx * dx + dy * dy + dz * dz;
      if (dist < bestDist) {
        bestDist = dist;
        best = verts[i];
      }
    }
    return best;
  }

  getClosestEdge(mesh, verts, inter) {
    var edges = [
      [verts[0], verts[1]],
      [verts[1], verts[2]],
      [verts[2], verts[0]]
    ];
    if (verts.length === 4) {
      edges.push([verts[2], verts[3]]);
      edges.push([verts[3], verts[0]]);
    }

    var vAr = mesh.getVertices();
    var bestEdge = edges[0];
    var bestDist = Infinity;
    for (var i = 0, nb = edges.length; i < nb; ++i) {
      var edge = edges[i];
      var dist = this.distanceToSegmentSquared(vAr, edge[0], edge[1], inter);
      if (dist < bestDist) {
        bestDist = dist;
        bestEdge = edge;
      }
    }
    return bestEdge;
  }

  distanceToSegmentSquared(vAr, vA, vB, point) {
    var a = vA * 3;
    var b = vB * 3;
    var ax = vAr[a];
    var ay = vAr[a + 1];
    var az = vAr[a + 2];
    var bx = vAr[b];
    var by = vAr[b + 1];
    var bz = vAr[b + 2];
    var abx = bx - ax;
    var aby = by - ay;
    var abz = bz - az;
    var apx = point[0] - ax;
    var apy = point[1] - ay;
    var apz = point[2] - az;
    var abLen2 = abx * abx + aby * aby + abz * abz;
    if (abLen2 === 0.0)
      return apx * apx + apy * apy + apz * apz;
    var t = (apx * abx + apy * aby + apz * abz) / abLen2;
    if (t < 0.0) t = 0.0;
    else if (t > 1.0) t = 1.0;
    var dx = ax + abx * t - point[0];
    var dy = ay + aby * t - point[1];
    var dz = az + abz * t - point[2];
    return dx * dx + dy * dy + dz * dz;
  }

  selectAll() {
    var mesh = this.getMesh();
    if (!mesh) return;
    this._main.getStateManager().pushStateColorAndMaterial(mesh);
    var mAr = mesh.getMaterials();
    var nbVertices = mesh.getNbVertices();
    for (var i = 0; i < nbVertices; ++i)
      mAr[i * 3 + 2] = 1.0;
    this.updateRender();
  }

  clearSelection() {
    var mesh = this.getMesh();
    if (!mesh) return;
    this._main.getStateManager().pushStateColorAndMaterial(mesh);
    var mAr = mesh.getMaterials();
    var nbVertices = mesh.getNbVertices();
    for (var i = 0; i < nbVertices; ++i)
      mAr[i * 3 + 2] = 0.0;
    this.updateRender();
  }

  invertSelection() {
    var mesh = this.getMesh();
    if (!mesh) return;
    this._main.getStateManager().pushStateColorAndMaterial(mesh);
    var mAr = mesh.getMaterials();
    var nbVertices = mesh.getNbVertices();
    for (var i = 0; i < nbVertices; ++i) {
      var id = i * 3 + 2;
      mAr[id] = mAr[id] > 0.5 ? 0.0 : 1.0;
    }
    this.updateRender();
  }
}

ElementSelection.Mode = {
  VERTEX: 0,
  EDGE: 1,
  FACE: 2
};

ElementSelection.Action = {
  REPLACE: 0,
  ADD: 1,
  REMOVE: 2
};

export default ElementSelection;
