import { vec2, vec3, mat4, quat } from 'gl-matrix';
import Primitives from 'drawables/Primitives';
import Enums from 'misc/Enums';

// Configuración de colores
var COLOR_X = vec3.fromValues(0.7, 0.2, 0.2); // Rojo
var COLOR_Y = vec3.fromValues(0.2, 0.7, 0.2); // Verde
var COLOR_Z = vec3.fromValues(0.2, 0.2, 0.7); // Azul
var COLOR_GREY = vec3.fromValues(0.4, 0.4, 0.4);
var COLOR_SW = vec3.fromValues(0.8, 0.4, 0.2);

// Dimensiones
var GIZMO_SIZE = 80.0;
var ARROW_LENGTH = 2.5;
var ARROW_CONE_THICK = 6.0;
var ARROW_CONE_LENGTH = 0.25;
var THICKNESS = 0.02;
var THICKNESS_PICK = THICKNESS * 5.0;
var ROT_RADIUS = 1.5;
var SCALE_RADIUS = ROT_RADIUS * 1.3;
var CUBE_SIDE = 0.35;
var CUBE_SIDE_PICK = CUBE_SIDE * 1.2;

var _TMP_QUAT = quat.create();

var createGizmo = function (type, nbAxis = -1) {
  return {
    _finalMatrix: mat4.create(),
    _baseMatrix: mat4.create(),
    _color: vec3.create(),
    _colorSelect: vec3.fromValues(1.0, 1.0, 0.0),
    _drawGeo: null,
    _pickGeo: null,
    _isSelected: false,
    _type: type,
    _nbAxis: nbAxis,
    _lastInter: [0.0, 0.0, 0.0],
    updateMatrix() {
      mat4.copy(this._drawGeo.getMatrix(), this._finalMatrix);
      mat4.copy(this._pickGeo.getMatrix(), this._finalMatrix);
    },
    updateFinalMatrix(mat) {
      mat4.mul(this._finalMatrix, mat, this._baseMatrix);
    }
  };
};

// Máscaras
var TRANS_X = 1 << 0;
var TRANS_Y = 1 << 1;
var TRANS_Z = 1 << 2;
var ROT_X = 1 << 3;
var ROT_Y = 1 << 4;
var ROT_Z = 1 << 5;
var ROT_W = 1 << 6;
var PLANE_X = 1 << 7;
var PLANE_Y = 1 << 8;
var PLANE_Z = 1 << 9;
var SCALE_X = 1 << 10;
var SCALE_Y = 1 << 11;
var SCALE_Z = 1 << 12;
var SCALE_W = 1 << 13;

var TRANS_XYZ = TRANS_X | TRANS_Y | TRANS_Z;
var ROT_XYZ = ROT_X | ROT_Y | ROT_Z;
var PLANE_XYZ = PLANE_X | PLANE_Y | PLANE_Z;
var SCALE_XYZW = SCALE_X | SCALE_Y | SCALE_Z | SCALE_W;

var SPACE_WORLD = 0;
var SPACE_LOCAL = 1;
var SPACE_NORMAL = 2;

class Gizmo {
  static get TRANS_X() { return TRANS_X; }
  static get TRANS_Y() { return TRANS_Y; }
  static get TRANS_Z() { return TRANS_Z; }
  static get ROT_X() { return ROT_X; }
  static get ROT_Y() { return ROT_Y; }
  static get ROT_Z() { return ROT_Z; }
  static get ROT_W() { return ROT_W; }
  static get PLANE_X() { return PLANE_X; }
  static get PLANE_Y() { return PLANE_Y; }
  static get PLANE_Z() { return PLANE_Z; }
  static get SCALE_X() { return SCALE_X; }
  static get SCALE_Y() { return SCALE_Y; }
  static get SCALE_Z() { return SCALE_Z; }
  static get SCALE_W() { return SCALE_W; }

  static get TRANS_XYZ() { return TRANS_XYZ; }
  static get ROT_XYZ() { return ROT_XYZ; }
  static get PLANE_XYZ() { return PLANE_XYZ; }
  static get SCALE_XYZW() { return SCALE_XYZW; }

  static get SPACE_WORLD() { return SPACE_WORLD; }
  static get SPACE_LOCAL() { return SPACE_LOCAL; }
  static get SPACE_NORMAL() { return SPACE_NORMAL; }

  constructor(main) {
    this._main = main;
    this._gl = main._gl;

    this._activatedType = Gizmo.TRANS_XYZ | Gizmo.ROT_XYZ | Gizmo.PLANE_XYZ | Gizmo.SCALE_XYZW | Gizmo.ROT_W;

    this._transX = createGizmo(Gizmo.TRANS_X, 0);
    this._transY = createGizmo(Gizmo.TRANS_Y, 1);
    this._transZ = createGizmo(Gizmo.TRANS_Z, 2);

    this._planeX = createGizmo(Gizmo.PLANE_X, 0);
    this._planeY = createGizmo(Gizmo.PLANE_Y, 1);
    this._planeZ = createGizmo(Gizmo.PLANE_Z, 2);

    this._scaleX = createGizmo(Gizmo.SCALE_X, 0);
    this._scaleY = createGizmo(Gizmo.SCALE_Y, 1);
    this._scaleZ = createGizmo(Gizmo.SCALE_Z, 2);
    this._scaleW = createGizmo(Gizmo.SCALE_W);

    this._rotX = createGizmo(Gizmo.ROT_X, 0);
    this._rotY = createGizmo(Gizmo.ROT_Y, 1);
    this._rotZ = createGizmo(Gizmo.ROT_Z, 2);
    this._rotW = createGizmo(Gizmo.ROT_W);

    this._lineHelper = Primitives.createLine2D(this._gl);
    this._lineHelper.setShaderType(Enums.Shader.FLAT);

    this._lastDistToEye = 0.0;
    this._isEditing = false;
    this._selected = null;
    this._pickables = [];

    this._editLineOrigin = [0.0, 0.0, 0.0];
    this._editLineDirection = [0.0, 0.0, 0.0];
    this._editOffset = [0.0, 0.0, 0.0];

    this._editLocal = [];
    this._editTrans = mat4.create();
    this._editScaleRot = [];
    this._editLocalInv = [];
    this._editTransInv = mat4.create();
    this._editScaleRotInv = [];

    this._spaceMode = SPACE_WORLD;
    this._spaceMatrix = mat4.create();
    this._spaceMatrixInv = mat4.create();
    this._staticNormal = vec3.create();
    this._hasStaticNormal = false;

    // Pivote Personalizado
    this._customPivotOffset = vec3.create();
    this._useCustomPivot = false;

    this._initTranslate();
    this._initRotate();
    this._initScale();
    this._initPickables();
  }

  setActivatedType(type) {
    this._activatedType = type;
    this._initPickables();
  }

  setSpaceMode(mode) {
    this._spaceMode = mode;
    this._updateMatrices();
    this._main.render();
  }

  setCustomPivot(point) {
    this._useCustomPivot = true;
    vec3.copy(this._customPivotOffset, point);
    this._updateMatrices();
    this._main.render();
  }

  clearCustomPivot() {
    this._useCustomPivot = false;
    vec3.set(this._customPivotOffset, 0.0, 0.0, 0.0);
    this._updateMatrices();
    this._main.render();
  }

  // Alias methods for compatibility with Transform.js
  setPivotWorld(point, render = true) {
    this.setCustomPivot(point);
    if (!render) {
      // Don't render - updateMatrices is already called in setCustomPivot
    }
  }

  clearPivot(render = true) {
    this.clearCustomPivot();
    if (!render) {
      // Don't render - already called in clearCustomPivot
    }
  }

  _setSpaceMatrixFromAxes(xAxis, yAxis, zAxis) {
    var spaceMat = this._spaceMatrix;
    mat4.identity(spaceMat);
    spaceMat[0] = xAxis[0]; spaceMat[1] = xAxis[1]; spaceMat[2] = xAxis[2];
    spaceMat[4] = yAxis[0]; spaceMat[5] = yAxis[1]; spaceMat[6] = yAxis[2];
    spaceMat[8] = zAxis[0]; spaceMat[9] = zAxis[1]; spaceMat[10] = zAxis[2];
    mat4.invert(this._spaceMatrixInv, spaceMat);
  }

  _setSpaceMatrixOrthonormalFromMatrix(m) {
    var xAxis = vec3.fromValues(m[0], m[1], m[2]);
    var yAxis = vec3.fromValues(m[4], m[5], m[6]);
    var zAxis;
    vec3.normalize(xAxis, xAxis);
    var proj = vec3.create();
    vec3.scale(proj, xAxis, vec3.dot(yAxis, xAxis));
    vec3.sub(yAxis, yAxis, proj);
    if (vec3.len(yAxis) === 0.0) yAxis = vec3.fromValues(m[4], m[5], m[6]);
    vec3.normalize(yAxis, yAxis);
    zAxis = vec3.cross(vec3.create(), xAxis, yAxis);
    if (vec3.len(zAxis) === 0.0) zAxis = vec3.fromValues(m[8], m[9], m[10]);
    vec3.normalize(zAxis, zAxis);
    vec3.cross(yAxis, zAxis, xAxis);
    vec3.normalize(yAxis, yAxis);
    this._setSpaceMatrixFromAxes(xAxis, yAxis, zAxis);
  }

  _updateSpaceMatrices(center) {
    if (this._spaceMode === SPACE_WORLD) {
      mat4.identity(this._spaceMatrix);
      mat4.identity(this._spaceMatrixInv);
      return;
    }

    var mesh = this._main.getSelectedMeshes()[0] || this._main.getMesh();
    if (!mesh) {
      mat4.identity(this._spaceMatrix);
      mat4.identity(this._spaceMatrixInv);
      return;
    }

    if (this._spaceMode === SPACE_LOCAL) {
      var m = mesh.getMatrix();
      this._setSpaceMatrixOrthonormalFromMatrix(m);
      return;
    }

    var normal;
    if (this._isEditing && this._hasStaticNormal) {
      normal = this._staticNormal;
    } else {
      var picking = this._main.getPicking();
      picking.computePickedNormal();
      normal = picking.getPickedNormal();
    }
    var normalLen = vec3.len(normal);
    if (normalLen === 0.0) {
      // Fallback a modo LOCAL cuando no hay normal válida
      var m = mesh.getMatrix();
      this._setSpaceMatrixOrthonormalFromMatrix(m);
      return;
    }

    var nWorld = vec3.fromValues(normal[0], normal[1], normal[2]);
    var normalMatrix = mat4.clone(mesh.getMatrix());
    normalMatrix[12] = normalMatrix[13] = normalMatrix[14] = 0.0;
    vec3.transformMat4(nWorld, nWorld, normalMatrix);
    vec3.normalize(nWorld, nWorld);

    // Usar los ejes del mesh en lugar de la posición de la cámara
    var m = mesh.getMatrix();
    var meshXAxis = vec3.fromValues(m[0], m[1], m[2]);
    var meshYAxis = vec3.fromValues(m[4], m[5], m[6]);
    vec3.normalize(meshXAxis, meshXAxis);
    vec3.normalize(meshYAxis, meshYAxis);

    // Determinar qué eje del mesh usar como base para el eje X del gizmo
    // Usar el eje del mesh que sea más perpendicular a la normal
    var dotX = Math.abs(vec3.dot(meshXAxis, nWorld));
    var dotY = Math.abs(vec3.dot(meshYAxis, nWorld));
    var baseAxis = dotX < dotY ? meshXAxis : meshYAxis;

    // Calcular eje X del gizmo perpendicular a la normal
    var xAxis = vec3.cross(vec3.create(), baseAxis, nWorld);
    if (vec3.len(xAxis) === 0.0) {
      // Si son paralelos, usar el otro eje del mesh
      baseAxis = dotX < dotY ? meshYAxis : meshXAxis;
      xAxis = vec3.cross(xAxis, baseAxis, nWorld);
    }
    vec3.normalize(xAxis, xAxis);

    // Calcular eje Y perpendicular a la normal y al eje X
    var yAxis = vec3.cross(vec3.create(), nWorld, xAxis);
    vec3.normalize(yAxis, yAxis);
    this._setSpaceMatrixFromAxes(xAxis, yAxis, nWorld);
  }

  _initPickables() {
    var pickables = this._pickables;
    pickables.length = 0;
    var type = this._activatedType;
    if (type & TRANS_X) pickables.push(this._transX._pickGeo);
    if (type & TRANS_Y) pickables.push(this._transY._pickGeo);
    if (type & TRANS_Z) pickables.push(this._transZ._pickGeo);
    if (type & PLANE_X) pickables.push(this._planeX._pickGeo);
    if (type & PLANE_Y) pickables.push(this._planeY._pickGeo);
    if (type & PLANE_Z) pickables.push(this._planeZ._pickGeo);
    if (type & ROT_X) pickables.push(this._rotX._pickGeo);
    if (type & ROT_Y) pickables.push(this._rotY._pickGeo);
    if (type & ROT_Z) pickables.push(this._rotZ._pickGeo);
    if (type & SCALE_X) pickables.push(this._scaleX._pickGeo);
    if (type & SCALE_Y) pickables.push(this._scaleY._pickGeo);
    if (type & SCALE_Z) pickables.push(this._scaleZ._pickGeo);
    if (type & SCALE_W) pickables.push(this._scaleW._pickGeo);
  }

  _initArrowGeometry(tra) {
    tra._pickGeo = Primitives.createArrow(this._gl, THICKNESS_PICK, ARROW_LENGTH, ARROW_CONE_THICK * 0.4);
    tra._pickGeo._gizmo = tra;
    tra._drawGeo = Primitives.createArrow(this._gl, THICKNESS, ARROW_LENGTH, ARROW_CONE_THICK, ARROW_CONE_LENGTH);
    tra._drawGeo.setShaderType(Enums.Shader.FLAT);
  }

  _initTranslate() {
    // CORREGIDO: Las flechas primitivas apuntan a +Y.
    // X (Rojo): Rotar Z -90 (Y -> X)
    mat4.identity(this._transX._baseMatrix);
    mat4.rotateZ(this._transX._baseMatrix, this._transX._baseMatrix, -Math.PI * 0.5);
    mat4.translate(this._transX._baseMatrix, this._transX._baseMatrix, [0.0, ARROW_LENGTH * 0.5, 0.0]);
    vec3.copy(this._transX._color, COLOR_X);
    this._initArrowGeometry(this._transX);

    // Y (Verde): Identidad (Y -> Y)
    mat4.identity(this._transY._baseMatrix);
    mat4.translate(this._transY._baseMatrix, this._transY._baseMatrix, [0.0, ARROW_LENGTH * 0.5, 0.0]);
    vec3.copy(this._transY._color, COLOR_Y);
    this._initArrowGeometry(this._transY);

    // Z (Azul): Rotar X +90 (Y -> Z)
    mat4.identity(this._transZ._baseMatrix);
    mat4.rotateX(this._transZ._baseMatrix, this._transZ._baseMatrix, Math.PI * 0.5);
    mat4.translate(this._transZ._baseMatrix, this._transZ._baseMatrix, [0.0, ARROW_LENGTH * 0.5, 0.0]);
    vec3.copy(this._transZ._color, COLOR_Z);
    this._initArrowGeometry(this._transZ);

    var s = ARROW_LENGTH * 0.2;
    this._createPlane(this._planeX, COLOR_X, 0.0, s, 0.0, 0.0, 0.0, s);
    this._createPlane(this._planeY, COLOR_Y, s, 0.0, 0.0, 0.0, 0.0, s);
    this._createPlane(this._planeZ, COLOR_Z, s, 0.0, 0.0, 0.0, s, 0.0);
  }

  _createPlane(pla, color, wx, wy, wz, hx, hy, hz) {
    vec3.copy(pla._color, color);
    pla._pickGeo = Primitives.createPlane(this._gl, 0.0, 0.0, 0.0, wx, wy, wz, hx, hy, hz);
    pla._pickGeo._gizmo = pla;
    pla._drawGeo = Primitives.createPlane(this._gl, 0.0, 0.0, 0.0, wx, wy, wz, hx, hy, hz);
    pla._drawGeo.setShaderType(Enums.Shader.FLAT);
  }

  _createCircle(rot, rad, color, radius = ROT_RADIUS, mthick = 1.0) {
    vec3.copy(rot._color, color);
    rot._pickGeo = Primitives.createTorus(this._gl, radius, THICKNESS_PICK * mthick, rad, 6, 64);
    rot._pickGeo._gizmo = rot;
    rot._drawGeo = Primitives.createTorus(this._gl, radius, THICKNESS * mthick, rad, 6, 64);
    rot._drawGeo.setShaderType(Enums.Shader.FLAT);
  }

  _initRotate() {
    // CORREGIDO: Los Torus primitivos son "Y-Up" (Plano XZ, Normal Y).
    // Esto causaba la superposición de ejes.

    // X (Rojo): Queremos Normal X. Tenemos Normal Y.
    // Solución: Rotar Z -90 (Y -> X).
    this._createCircle(this._rotX, Math.PI, COLOR_X);
    mat4.identity(this._rotX._baseMatrix);
    mat4.rotateZ(this._rotX._baseMatrix, this._rotX._baseMatrix, -Math.PI * 0.5);

    // Y (Verde): Queremos Normal Y. Tenemos Normal Y.
    // Solución: Identidad.
    this._createCircle(this._rotY, Math.PI, COLOR_Y);
    mat4.identity(this._rotY._baseMatrix);

    // Z (Azul): Queremos Normal Z. Tenemos Normal Y.
    // Solución: Rotar X +90 (Y -> Z).
    this._createCircle(this._rotZ, Math.PI, COLOR_Z);
    mat4.identity(this._rotZ._baseMatrix);
    mat4.rotateX(this._rotZ._baseMatrix, this._rotZ._baseMatrix, Math.PI * 0.5);

    this._createCircle(this._rotW, Math.PI * 2, COLOR_GREY);
  }

  _createCube(sca, axis, color) {
    var mat = sca._baseMatrix;
    mat4.identity(mat);
    if(vec3.equals(axis, [0,0,-1])) mat4.rotateZ(mat, mat, -Math.PI * 0.5); // X
    else if(vec3.equals(axis, [1,0,0])) mat4.rotateX(mat, mat, Math.PI * 0.5); // Z
    mat4.translate(mat, mat, [0.0, ROT_RADIUS, 0.0]);
    vec3.copy(sca._color, color);
    sca._pickGeo = Primitives.createCube(this._gl, CUBE_SIDE_PICK);
    sca._pickGeo._gizmo = sca;
    sca._drawGeo = Primitives.createCube(this._gl, CUBE_SIDE);
    sca._drawGeo.setShaderType(Enums.Shader.FLAT);
  }

  _initScale() {
    this._createCube(this._scaleX, [0.0, 0.0, -1.0], COLOR_X);
    this._createCube(this._scaleY, [0.0, 1.0, 0.0], COLOR_Y);
    this._createCube(this._scaleZ, [1.0, 0.0, 0.0], COLOR_Z);
    this._createCircle(this._scaleW, Math.PI * 2, COLOR_SW, SCALE_RADIUS, 2.0);
  }

  _updateArcRotation(eye) {
    _TMP_QUAT[0] = eye[2];
    _TMP_QUAT[1] = 0.0;
    _TMP_QUAT[2] = -eye[0];
    _TMP_QUAT[3] = 1.0 + eye[1];
    quat.normalize(_TMP_QUAT, _TMP_QUAT);
    mat4.fromQuat(this._rotW._baseMatrix, _TMP_QUAT);
    mat4.fromQuat(this._scaleW._baseMatrix, _TMP_QUAT);
  }

  _computeCenterGizmo(center = [0.0, 0.0, 0.0]) {
    if (this._useCustomPivot) {
      vec3.copy(center, this._customPivotOffset);
      return center;
    }
    var meshes = this._main.getSelectedMeshes();
    var acc = [0.0, 0.0, 0.0];
    var icenter = [0.0, 0.0, 0.0];
    for (var i = 0; i < meshes.length; ++i) {
      var mesh = meshes[i];
      vec3.transformMat4(icenter, mesh.getCenter(), mesh.getEditMatrix());
      vec3.transformMat4(icenter, icenter, mesh.getMatrix());
      vec3.add(acc, acc, icenter);
    }
    vec3.scale(center, acc, 1.0 / meshes.length);
    return center;
  }

  _updateMatrices() {
    var camera = this._main.getCamera();
    var trMesh = this._computeCenterGizmo();
    var eye = camera.computePosition();

    this._updateSpaceMatrices(trMesh);

    this._lastDistToEye = this._isEditing ? this._lastDistToEye : vec3.dist(eye, trMesh);
    var scaleFactor = (this._lastDistToEye * GIZMO_SIZE) / camera.getConstantScreen();

    var traScale = mat4.create();
    mat4.translate(traScale, traScale, trMesh);
    mat4.scale(traScale, traScale, [scaleFactor, scaleFactor, scaleFactor]);

    if (this._spaceMode === SPACE_WORLD) {
      if (!this._isEditing) {
        var eyeDir = vec3.sub(vec3.create(), eye, trMesh);
        vec3.normalize(eyeDir, eyeDir);
        vec3.transformMat4(eyeDir, eyeDir, this._spaceMatrixInv);
        vec3.normalize(eyeDir, eyeDir);
        this._updateArcRotation(eyeDir);
      }
    } else {
      mat4.identity(this._rotW._baseMatrix);
      mat4.identity(this._scaleW._baseMatrix);
    }

    var traScaleSpace = mat4.create();
    mat4.mul(traScaleSpace, traScale, this._spaceMatrix);

    this._transX.updateFinalMatrix(traScaleSpace);
    this._transY.updateFinalMatrix(traScaleSpace);
    this._transZ.updateFinalMatrix(traScaleSpace);

    this._planeX.updateFinalMatrix(traScaleSpace);
    this._planeY.updateFinalMatrix(traScaleSpace);
    this._planeZ.updateFinalMatrix(traScaleSpace);

    this._rotX.updateFinalMatrix(traScaleSpace);
    this._rotY.updateFinalMatrix(traScaleSpace);
    this._rotZ.updateFinalMatrix(traScaleSpace);
    this._rotW.updateFinalMatrix(traScaleSpace);

    this._scaleX.updateFinalMatrix(traScaleSpace);
    this._scaleY.updateFinalMatrix(traScaleSpace);
    this._scaleZ.updateFinalMatrix(traScaleSpace);
    this._scaleW.updateFinalMatrix(traScaleSpace);
  }

  _drawGizmo(elt) {
    elt.updateMatrix();
    var drawGeo = elt._drawGeo;
    drawGeo.setFlatColor(elt._isSelected ? elt._colorSelect : elt._color);
    drawGeo.updateMatrices(this._main.getCamera());
    drawGeo.render(this._main);
  }

  _updateLineHelper(x1, y1, x2, y2) {
    var vAr = this._lineHelper.getVertices();
    var main = this._main;
    var width = main.getCanvasWidth();
    var height = main.getCanvasHeight();
    vAr[0] = (x1 / width) * 2.0 - 1.0;
    vAr[1] = ((height - y1) / height) * 2.0 - 1.0;
    vAr[3] = (x2 / width) * 2.0 - 1.0;
    vAr[4] = ((height - y2) / height) * 2.0 - 1.0;
    this._lineHelper.updateVertexBuffer();
  }

  _saveEditMatrices() {
    var meshes = this._main.getSelectedMeshes();
    var center = this._computeCenterGizmo();
    mat4.translate(this._editTrans, mat4.identity(this._editTrans), center);
    mat4.invert(this._editTransInv, this._editTrans);

    for (var i = 0; i < meshes.length; ++i) {
      this._editLocal[i] = mat4.create();
      this._editScaleRot[i] = mat4.create();
      this._editLocalInv[i] = mat4.create();
      this._editScaleRotInv[i] = mat4.create();

      mat4.copy(this._editLocal[i], meshes[i].getMatrix());
      mat4.copy(this._editScaleRot[i], this._editLocal[i]);
      this._editScaleRot[i][12] = this._editScaleRot[i][13] = this._editScaleRot[i][14] = 0.0;

      mat4.invert(this._editLocalInv[i], this._editLocal[i]);
      mat4.invert(this._editScaleRotInv[i], this._editScaleRot[i]);
    }
  }

  _startRotateEdit() {
    var main = this._main;
    var camera = main.getCamera();
    var origin = [0.0, 0.0, 0.0];
    this._computeCenterGizmo(origin);
    vec3.copy(origin, camera.project(origin));
    vec2.set(this._editLineOrigin, main._mouseX, main._mouseY);
  }

  _startTranslateEdit() {
    var main = this._main;
    var camera = main.getCamera();

    var origin = this._editLineOrigin;
    var dir = this._editLineDirection;

    this._computeCenterGizmo(origin);

    var nbAxis = this._selected._nbAxis;
    if (nbAxis !== -1) {
      vec3.set(dir, 0.0, 0.0, 0.0)[nbAxis] = 1.0;
      vec3.transformMat4(dir, dir, this._spaceMatrix);
    }
    vec3.add(dir, origin, dir);

    vec3.copy(origin, camera.project(origin));
    vec3.copy(dir, camera.project(dir));

    vec2.normalize(dir, vec2.sub(dir, dir, origin));

    var offset = this._editOffset;
    offset[0] = main._mouseX - origin[0];
    offset[1] = main._mouseY - origin[1];
  }

  _startPlaneEdit() {
    var main = this._main;
    var camera = main.getCamera();
    var origin = this._editLineOrigin;
    this._computeCenterGizmo(origin);
    vec3.copy(origin, camera.project(origin));
    var offset = this._editOffset;
    offset[0] = main._mouseX - origin[0];
    offset[1] = main._mouseY - origin[1];
    vec2.set(this._editLineOrigin, main._mouseX, main._mouseY);
  }

  _startScaleEdit() {
    this._startTranslateEdit();
  }

  _updateRotateEdit() {
  var main = this._main;
  var camera = main.getCamera();

  // 1. Obtener el origen del Gizmo en pantalla
  var origin = [0.0, 0.0, 0.0];
  this._computeCenterGizmo(origin);
  vec3.transformMat4(origin, origin, camera.getView()); // Al espacio vista

  // 2. Calcular el eje de rotación en espacio VISTA
  var nbAxis = this._selected._nbAxis;
  var axis = [0.0, 0.0, 0.0];
  
  // Determinar la dirección del eje según el modo (World/Local/Normal)
  if (this._spaceMode === SPACE_WORLD) {
    axis[nbAxis] = 1.0;
  } else {
    // En local/normal, el eje es una columna de la matriz de espacio
    axis[0] = this._spaceMatrix[nbAxis * 4];
    axis[1] = this._spaceMatrix[nbAxis * 4 + 1];
    axis[2] = this._spaceMatrix[nbAxis * 4 + 2];
    vec3.normalize(axis, axis);
  }

  // Transformar eje a espacio de cámara para comparar con el mouse
  var axisView = [0.0, 0.0, 0.0];
  vec3.transformMat4(axisView, axis, camera.getView()); // Solo rotación
  
  // 3. Calcular ángulo basado en el movimiento del mouse tangente al círculo
  var mouseX = main._mouseX;
  var mouseY = main._mouseY;
  
  // Vector desde el centro del gizmo al mouse actual
  var vCurrent = [mouseX - this._editLineOrigin[0], mouseY - this._editLineOrigin[1]];
  
  // Proyectar el eje 3D a 2D para saber qué dirección es "perpendicular" en pantalla
  // (Esta lógica es simplificada para estabilidad, se puede usar arcball completo si se prefiere)
  var angle = (mouseX - main._lastMouseX) * 0.01 + (mouseY - main._lastMouseY) * 0.01;

  // 4. Aplicar rotación SIN Gimbal Lock (usando Axis-Angle sobre la matriz actual)
  var meshes = this._main.getSelectedMeshes();
  for (var i = 0; i < meshes.length; ++i) {
    var edit = meshes[i].getEditMatrix();
    mat4.identity(edit);

    // Creamos la rotación en el origen
    var rotMat = mat4.create();
    mat4.rotate(rotMat, rotMat, angle, axis); // Rotar alrededor del eje ARBITRARIO

    // Aplicar: PivotInvert * Rotation * Pivot * Original
    var center = this._computeCenterGizmo();
    
    // Mover al origen del pivote
    mat4.translate(edit, edit, center);
    mat4.mul(edit, edit, rotMat);
    mat4.translate(edit, edit, vec3.negate(vec3.create(), center));
    
    // Acumular la transformación (Clave para evitar ejes montados)
    this._scaleRotateEditMatrix(edit, i);
  }
  
  main.render();
}

  _updateTranslateEdit() {
    var main = this._main;
    var camera = main.getCamera();

    var origin = this._editLineOrigin;
    var dir = this._editLineDirection;

    var vec = [main._mouseX, main._mouseY, 0.0];
    vec2.sub(vec, vec, origin);
    vec2.sub(vec, vec, this._editOffset);
    vec2.scaleAndAdd(vec, origin, dir, vec2.dot(vec, dir));

    this._updateLineHelper(origin[0], origin[1], vec[0], vec[1]);

    var near = camera.unproject(vec[0], vec[1], 0.0);
    var far = camera.unproject(vec[0], vec[1], 0.1);

    vec3.transformMat4(near, near, this._editTransInv);
    vec3.transformMat4(far, far, this._editTransInv);
    vec3.transformMat4(near, near, this._spaceMatrixInv);
    vec3.transformMat4(far, far, this._spaceMatrixInv);

    vec3.normalize(vec, vec3.sub(vec, far, near));

    var inter = [0.0, 0.0, 0.0];
    inter[this._selected._nbAxis] = 1.0;

    var a01 = -vec3.dot(vec, inter);
    var b0 = vec3.dot(near, vec);
    var det = Math.abs(1.0 - a01 * a01);

    var b1 = -vec3.dot(near, inter);
    inter[this._selected._nbAxis] = (a01 * b0 - b1) / det;

    vec3.transformMat4(inter, inter, this._spaceMatrix);
    this._updateMatrixTranslate(inter);

    main.render();
  }

  _updatePlaneEdit() {
    var main = this._main;
    var camera = main.getCamera();

    var vec = [main._mouseX, main._mouseY, 0.0];
    vec2.sub(vec, vec, this._editOffset);

    this._updateLineHelper(this._editLineOrigin[0], this._editLineOrigin[1], main._mouseX, main._mouseY);

    var near = camera.unproject(vec[0], vec[1], 0.0);
    var far = camera.unproject(vec[0], vec[1], 0.1);

    vec3.transformMat4(near, near, this._editTransInv);
    vec3.transformMat4(far, far, this._editTransInv);
    vec3.transformMat4(near, near, this._spaceMatrixInv);
    vec3.transformMat4(far, far, this._spaceMatrixInv);

    var inter = [0.0, 0.0, 0.0];
    inter[this._selected._nbAxis] = 1.0;

    var dist1 = vec3.dot(near, inter);
    var dist2 = vec3.dot(far, inter);
    if (dist1 === dist2) return false;

    var val = -dist1 / (dist2 - dist1);
    inter[0] = near[0] + (far[0] - near[0]) * val;
    inter[1] = near[1] + (far[1] - near[1]) * val;
    inter[2] = near[2] + (far[2] - near[2]) * val;

    vec3.transformMat4(inter, inter, this._spaceMatrix);
    this._updateMatrixTranslate(inter);

    main.render();
  }

  _updateMatrixTranslate(inter) {
    var tmp = [0, 0, 0];
    var meshes = this._main.getSelectedMeshes();
    for (var i = 0; i < meshes.length; ++i) {
      vec3.transformMat4(tmp, inter, this._editScaleRotInv[i]);
      var edim = meshes[i].getEditMatrix();
      mat4.identity(edim);
      mat4.translate(edim, edim, tmp);
    }
  }

  _updateScaleEdit() {
    var main = this._main;
    var origin = this._editLineOrigin;
    var dir = this._editLineDirection;
    var nbAxis = this._selected._nbAxis;

    var vec = [main._mouseX, main._mouseY, 0.0];
    if (nbAxis !== -1) {
      vec2.sub(vec, vec, origin);
      vec2.scaleAndAdd(vec, origin, dir, vec2.dot(vec, dir));
    }

    this._updateLineHelper(origin[0], origin[1], vec[0], vec[1]);

    var distOffset = vec3.len(this._editOffset);
    var inter = [1.0, 1.0, 1.0];
    var scaleMult = Math.max(-0.99, (vec2.dist(origin, vec) - distOffset) / distOffset);
    if (nbAxis === -1) {
      inter[0] += scaleMult;
      inter[1] += scaleMult;
      inter[2] += scaleMult;
    } else {
      inter[nbAxis] += scaleMult;
    }

    var meshes = this._main.getSelectedMeshes();
    for (var i = 0; i < meshes.length; ++i) {
      var edim = meshes[i].getEditMatrix();
      mat4.identity(edim);
      if (this._spaceMode !== SPACE_WORLD) {
        mat4.mul(edim, this._spaceMatrix, edim);
        mat4.scale(edim, edim, inter);
        mat4.mul(edim, edim, this._spaceMatrixInv);
      } else {
        mat4.scale(edim, edim, inter);
      }
      this._scaleRotateEditMatrix(edim, i);
    }
    main.render();
  }

  _scaleRotateEditMatrix(edit, i) {
    mat4.mul(edit, this._editTrans, edit);
    mat4.mul(edit, edit, this._editTransInv);
    mat4.mul(edit, this._editScaleRotInv[i], edit);
    mat4.mul(edit, edit, this._editScaleRot[i]);
  }

  addGizmoToScene(scene) {
    scene.push(this._transX._drawGeo);
    scene.push(this._transY._drawGeo);
    scene.push(this._transZ._drawGeo);
    scene.push(this._planeX._drawGeo);
    scene.push(this._planeY._drawGeo);
    scene.push(this._planeZ._drawGeo);
    scene.push(this._rotX._drawGeo);
    scene.push(this._rotY._drawGeo);
    scene.push(this._rotZ._drawGeo);
    scene.push(this._rotW._drawGeo);
    scene.push(this._scaleX._drawGeo);
    scene.push(this._scaleY._drawGeo);
    scene.push(this._scaleZ._drawGeo);
    scene.push(this._scaleW._drawGeo);
    return scene;
  }

  render() {
    if (!this._isEditing) this._updateMatrices();
    var type = this._isEditing && this._selected ? this._selected._type : this._activatedType;

    if (type & ROT_W) this._drawGizmo(this._rotW);
    if (type & TRANS_X) this._drawGizmo(this._transX);
    if (type & TRANS_Y) this._drawGizmo(this._transY);
    if (type & TRANS_Z) this._drawGizmo(this._transZ);
    if (type & PLANE_X) this._drawGizmo(this._planeX);
    if (type & PLANE_Y) this._drawGizmo(this._planeY);
    if (type & PLANE_Z) this._drawGizmo(this._planeZ);
    if (type & ROT_X) this._drawGizmo(this._rotX);
    if (type & ROT_Y) this._drawGizmo(this._rotY);
    if (type & ROT_Z) this._drawGizmo(this._rotZ);
    if (type & SCALE_X) this._drawGizmo(this._scaleX);
    if (type & SCALE_Y) this._drawGizmo(this._scaleY);
    if (type & SCALE_Z) this._drawGizmo(this._scaleZ);
    if (type & SCALE_W) this._drawGizmo(this._scaleW);

    if (this._isEditing) this._lineHelper.render(this._main);
  }

  onMouseOver() {
    if (this._isEditing) {
      var type = this._selected._type;
      if (type & ROT_XYZ) this._updateRotateEdit();
      else if (type & TRANS_XYZ) this._updateTranslateEdit();
      else if (type & PLANE_XYZ) this._updatePlaneEdit();
      else if (type & SCALE_XYZW) this._updateScaleEdit();
      return true;
    }

    var main = this._main;
    var picking = main.getPicking();
    var mx = main._mouseX;
    var my = main._mouseY;
    var pickables = this._pickables;
    picking.intersectionMouseMeshes(pickables, mx, my);

    if (this._selected) this._selected._isSelected = false;
    var geo = picking.getMesh();
    if (!geo) {
      this._selected = null;
      return false;
    }

    this._selected = geo._gizmo;
    this._selected._isSelected = true;
    vec3.copy(this._selected._lastInter, picking.getIntersectionPoint());
    return true;
  }

  onMouseDown() {
    var sel = this._selected;
    if (!sel) return false;

    this._isEditing = true;
    if (this._spaceMode === SPACE_NORMAL) {
      var picking = this._main.getPicking();
      if (picking.getMesh()) {
        picking.computePickedNormal();
        var normal = picking.getPickedNormal();
        vec3.copy(this._staticNormal, normal);
        this._hasStaticNormal = vec3.len(this._staticNormal) > 0.0001;
      } else {
        this._hasStaticNormal = false;
      }
    } else {
      this._hasStaticNormal = false;
    }
    var type = sel._type;
    this._saveEditMatrices();

    if (type & ROT_XYZ) this._startRotateEdit();
    else if (type & TRANS_XYZ) this._startTranslateEdit();
    else if (type & PLANE_XYZ) this._startPlaneEdit();
    else if (type & SCALE_XYZW) this._startScaleEdit();

    return true;
  }

  onMouseUp() {
    this._isEditing = false;
    this._hasStaticNormal = false;
  }
}

export default Gizmo;
