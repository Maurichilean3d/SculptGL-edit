/**
 * SculptGL adaptado para Three.js con indicador de versión.
 */
import 'misc/Polyfill';
import { vec3 } from 'gl-matrix';
import { Manager as HammerManager, Pan, Pinch, Tap } from 'hammerjs';
import Tablet from 'misc/Tablet';
import Enums from 'misc/Enums';
import Utils from 'misc/Utils';
import Scene from 'Scene';
import Multimesh from 'mesh/multiresolution/Multimesh';

var MOUSE_LEFT = 1;
var MOUSE_MIDDLE = 2;
var MOUSE_RIGHT = 3;

class SculptGL extends Scene {

  constructor() {
    super();

    // Controllers stuffs
    this._mouseX = 0;
    this._mouseY = 0;
    this._lastMouseX = 0;
    this._lastMouseY = 0;
    this._lastScale = 0;

    this._action = Enums.Action.NOTHING;
    this._lastNbPointers = 0;
    this._isWheelingIn = false;

    // Masking
    this._maskX = 0;
    this._maskY = 0;
    this._eventProxy = {};
    
    // Hammer se inicializa en start()
    this._hammer = null;
  }

  start() {
    // 1. Iniciar Three.js (método de la clase padre Scene)
    super.start(); 

    // 2. Mostrar la etiqueta de versión en pantalla
    this.showVersionTag();

    // 3. Inicializar eventos de entrada
    this._hammer = new HammerManager(this._canvas);
    this.initHammer();
    this.addEvents();
  }

  /**
   * Muestra una etiqueta visual para confirmar la versión actualizada.
   */
  showVersionTag() {
    var div = document.createElement('div');
    div.style.position = 'absolute';
    div.style.top = '50px'; // Un poco abajo para no tapar menús si los hay
    div.style.left = '10px';
    div.style.padding = '5px 10px';
    div.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    div.style.color = '#00ff00'; // Verde brillante
    div.style.fontFamily = 'monospace';
    div.style.fontSize = '14px';
    div.style.zIndex = '10000';
    div.style.pointerEvents = 'none';
    div.style.border = '1px solid #00ff00';
    div.style.borderRadius = '4px';
    
    // FECHA MANUAL: Actualiza esto si generas una nueva build
    // O usa new Date() para ver la hora de carga del script.
    var versionDate = new Date().toLocaleString(); 
    div.innerHTML = '<strong>VERSIÓN THREE.JS ACTIVA</strong><br>' + versionDate;
    
    document.body.appendChild(div);
    console.log('SculptGL Version Loaded:', versionDate);
  }

  addEvents() {
    var canvas = this._canvas;

    var cbMouseWheel = this.onMouseWheel.bind(this);
    var cbOnPointer = this.onPointer.bind(this);

    // pointer
    canvas.addEventListener('pointerdown', cbOnPointer, false);
    canvas.addEventListener('pointermove', cbOnPointer, false);

    // mouse
    canvas.addEventListener('mousedown', this.onMouseDown.bind(this), false);
    canvas.addEventListener('mouseup', this.onMouseUp.bind(this), false);
    canvas.addEventListener('mouseout', this.onMouseOut.bind(this), false);
    canvas.addEventListener('mouseover', this.onMouseOver.bind(this), false);
    canvas.addEventListener('mousemove', Utils.throttle(this.onMouseMove.bind(this), 16.66), false);
    canvas.addEventListener('mousewheel', cbMouseWheel, false);
    canvas.addEventListener('DOMMouseScroll', cbMouseWheel, false);

    // key
    window.addEventListener('keydown', this.onKeyDown.bind(this), false);
    window.addEventListener('keyup', this.onKeyUp.bind(this), false);

    var cbLoadFiles = this.loadFiles.bind(this);
    var cbStopAndPrevent = this.stopAndPrevent.bind(this);
    
    // misc
    canvas.addEventListener('webglcontextlost', this.onContextLost.bind(this), false);
    canvas.addEventListener('webglcontextrestored', this.onContextRestored.bind(this), false);
    window.addEventListener('dragenter', cbStopAndPrevent, false);
    window.addEventListener('dragover', cbStopAndPrevent, false);
    window.addEventListener('drop', cbLoadFiles, false);
    
    var fileInput = document.getElementById('fileopen');
    if(fileInput) fileInput.addEventListener('change', cbLoadFiles, false);
  }

  onPointer(event) {
    Tablet.pressure = event.pressure;
  }

  initHammer() {
    this._hammer.options.enable = true;
    this._initHammerRecognizers();
    this._initHammerEvents();
  }

  _initHammerRecognizers() {
    var hm = this._hammer;
    // double tap
    hm.add(new Tap({
      event: 'doubletap',
      pointers: 1,
      taps: 2,
      time: 250,
      interval: 450,
      threshold: 5,
      posThreshold: 50
    }));

    // double tap 2 fingers
    hm.add(new Tap({
      event: 'doubletap2fingers',
      pointers: 2,
      taps: 2,
      time: 250,
      interval: 450,
      threshold: 5,
      posThreshold: 50
    }));

    // pan
    hm.add(new Pan({
      event: 'pan',
      pointers: 0,
      threshold: 0
    }));

    // pinch
    hm.add(new Pinch({
      event: 'pinch',
      pointers: 2,
      threshold: 0.1
    }));
    hm.get('pinch').recognizeWith(hm.get('pan'));
  }

  _initHammerEvents() {
    var hm = this._hammer;
    hm.on('panstart', this.onPanStart.bind(this));
    hm.on('panmove', this.onPanMove.bind(this));
    hm.on('panend pancancel', this.onPanEnd.bind(this));

    hm.on('doubletap', this.onDoubleTap.bind(this));
    hm.on('doubletap2fingers', this.onDoubleTap2Fingers.bind(this));
    hm.on('pinchstart', this.onPinchStart.bind(this));
    hm.on('pinchin pinchout', this.onPinchInOut.bind(this));
  }

  stopAndPrevent(event) {
    event.stopPropagation();
    event.preventDefault();
  }

  onContextLost() {
    window.alert('Oops... WebGL context lost.');
  }

  onContextRestored() {
    window.alert('Wow... Context is restored.');
  }

  ////////////////
  // KEY EVENTS
  ////////////////
  onKeyDown(e) {
    this._gui.callFunc('onKeyDown', e);
  }

  onKeyUp(e) {
    this._gui.callFunc('onKeyUp', e);
  }

  ////////////////
  // MOBILE EVENTS
  ////////////////
  onPanStart(e) {
    if (e.pointerType === 'mouse')
      return;
    this._focusGui = false;
    var evProxy = this._eventProxy;
    evProxy.pageX = e.center.x;
    evProxy.pageY = e.center.y;
    this.onPanUpdateNbPointers(Math.min(3, e.pointers.length));
  }

  onPanMove(e) {
    if (e.pointerType === 'mouse')
      return;
    var evProxy = this._eventProxy;
    evProxy.pageX = e.center.x;
    evProxy.pageY = e.center.y;

    var nbPointers = Math.min(3, e.pointers.length);
    if (nbPointers !== this._lastNbPointers) {
      this.onDeviceUp();
      this.onPanUpdateNbPointers(nbPointers);
    }
    this.onDeviceMove(evProxy);

    if (this._isIOS()) {
      window.clearTimeout(this._timerResetPointer);
      this._timerResetPointer = window.setTimeout(function () {
        this._lastNbPointers = 0;
      }.bind(this), 60);
    }
  }

  _isIOS() {
    if (this._isIOS !== undefined) return this._isIOS;
    this._isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    return this._isIOS;
  }

  onPanUpdateNbPointers(nbPointers) {
    var evProxy = this._eventProxy;
    evProxy.which = nbPointers === 1 && this._lastNbPointers >= 1 ? 3 : nbPointers;
    this._lastNbPointers = nbPointers;
    this.onDeviceDown(evProxy);
  }

  onPanEnd(e) {
    if (e.pointerType === 'mouse')
      return;
    this.onDeviceUp();
    window.setTimeout(function () {
      if (!e.pointers.length) this._lastNbPointers = 0;
    }.bind(this), 60);
  }

  onDoubleTap(e) {
    if (this._focusGui) return;

    var evProxy = this._eventProxy;
    evProxy.pageX = e.center.x;
    evProxy.pageY = e.center.y;
    this.setMousePosition(evProxy);
    
    // Lógica de picking (delegada a Scene o Picking)
    // Para Three.js, la lógica de centrado de cámara puede variar
    // Por ahora simplificamos:
    this.resetCameraMeshes();
  }

  onDoubleTap2Fingers() {
    if (this._focusGui) return;
    this.resetCameraMeshes();
  }

  onPinchStart(e) {
    this._focusGui = false;
    this._lastScale = e.scale;
  }

  onPinchInOut(e) {
    var dir = (e.scale - this._lastScale) * 25;
    this._lastScale = e.scale;
    this.onDeviceWheel(dir);
  }

  resetCameraMeshes(meshes) {
    if (!meshes) meshes = this._meshes;
    // En Three.js, podríamos usar un Box3 para enfocar todo
    // Esta llamada delega a la cámara shim de Scene.js
    if (meshes.length > 0) {
        // Implementación simplificada
        this.getCamera().resetView(); 
    } else {
        this.getCamera().resetView();
    }
    this.render();
  }

  ////////////////
  // LOAD FILES
  ////////////////
  getFileType(name) {
    var lower = name.toLowerCase();
    if (lower.endsWith('.obj')) return 'obj';
    if (lower.endsWith('.sgl')) return 'sgl';
    if (lower.endsWith('.stl')) return 'stl';
    if (lower.endsWith('.ply')) return 'ply';
    return;
  }

  loadFiles(event) {
    event.stopPropagation();
    event.preventDefault();
    var files = event.dataTransfer ? event.dataTransfer.files : event.target.files;
    for (var i = 0, nb = files.length; i < nb; ++i) {
      var file = files[i];
      var fileType = this.getFileType(file.name);
      this.readFile(file, fileType);
    }
  }

  readFile(file, ftype) {
    var fileType = ftype || this.getFileType(file.name);
    if (!fileType) return;

    var reader = new FileReader();
    var self = this;
    reader.onload = function (evt) {
      self.loadScene(evt.target.result, fileType);
      var fileOpenInput = document.getElementById('fileopen');
      if(fileOpenInput) fileOpenInput.value = '';
    };

    if (fileType === 'obj') reader.readAsText(file);
    else reader.readAsArrayBuffer(file);
  }

  ////////////////
  // MOUSE EVENTS
  ////////////////
  onMouseDown(event) {
    event.stopPropagation();
    event.preventDefault();
    this._gui.callFunc('onMouseDown', event);
    this.onDeviceDown(event);
  }

  onMouseMove(event) {
    event.stopPropagation();
    event.preventDefault();
    this._gui.callFunc('onMouseMove', event);
    this.onDeviceMove(event);
  }

  onMouseOver(event) {
    this._focusGui = false;
    this._gui.callFunc('onMouseOver', event);
  }

  onMouseOut(event) {
    this._focusGui = true;
    this._gui.callFunc('onMouseOut', event);
    this.onMouseUp(event);
  }

  onMouseUp(event) {
    event.preventDefault();
    this._gui.callFunc('onMouseUp', event);
    this.onDeviceUp();
  }

  onMouseWheel(event) {
    event.stopPropagation();
    event.preventDefault();
    this._gui.callFunc('onMouseWheel', event);
    var dir = event.wheelDelta === undefined ? -event.detail : event.wheelDelta;
    this.onDeviceWheel(dir > 0 ? 1 : -1);
  }

  ////////////////
  // HANDLES EVENTS
  ////////////////
  onDeviceUp() {
    this.setCanvasCursor('default');
    Multimesh.RENDER_HINT = Multimesh.NONE;
    this._sculptManager.end();

    if (this._action === Enums.Action.MASK_EDIT && this._mesh) {
      if (this._lastMouseX === this._maskX && this._lastMouseY === this._maskY)
        this.getSculptManager().getTool(Enums.Tools.MASKING).invert();
      else
        this.getSculptManager().getTool(Enums.Tools.MASKING).clear();
    }

    this._action = Enums.Action.NOTHING;
    this.render();
    this._stateManager.cleanNoop();
  }

  onDeviceWheel(dir) {
    if (dir > 0.0 && !this._isWheelingIn) {
      this._isWheelingIn = true;
      this._camera.start(this._mouseX, this._mouseY); // Usando shim
    }
    this.getCamera().zoom(dir * 0.02);
    Multimesh.RENDER_HINT = Multimesh.CAMERA;
    this.render();
    if (this._timerEndWheel) window.clearTimeout(this._timerEndWheel);
    this._timerEndWheel = window.setTimeout(this._endWheel.bind(this), 300);
  }

  _endWheel() {
    Multimesh.RENDER_HINT = Multimesh.NONE;
    this._isWheelingIn = false;
    this.render();
  }

  setMousePosition(event) {
    this._mouseX = this._pixelRatio * (event.pageX - this._canvasOffsetLeft);
    this._mouseY = this._pixelRatio * (event.pageY - this._canvasOffsetTop);
  }

  onDeviceDown(event) {
    if (this._focusGui) return;

    this.setMousePosition(event);

    var mouseX = this._mouseX;
    var mouseY = this._mouseY;
    var button = event.which;

    var canEdit = false;
    if (button === MOUSE_LEFT)
      canEdit = this._sculptManager.start(event.shiftKey || this._multiSelection);

    if (button === MOUSE_LEFT && canEdit)
      this.setCanvasCursor('none');

    if (button === MOUSE_RIGHT && event.ctrlKey)
      this._action = Enums.Action.CAMERA_ZOOM;
    else if (button === MOUSE_MIDDLE)
      this._action = Enums.Action.CAMERA_PAN;
    else if (!canEdit && event.ctrlKey) {
      this._maskX = mouseX;
      this._maskY = mouseY;
      this._action = Enums.Action.MASK_EDIT;
    } else if ((!canEdit || button === MOUSE_RIGHT) && event.altKey)
      this._action = Enums.Action.CAMERA_PAN_ZOOM_ALT;
    else if (button === MOUSE_RIGHT || (button === MOUSE_LEFT && !canEdit))
      this._action = Enums.Action.CAMERA_ROTATE;
    else
      this._action = Enums.Action.SCULPT_EDIT;

    if (this._action === Enums.Action.CAMERA_ROTATE || this._action === Enums.Action.CAMERA_ZOOM)
      this.getCamera().start(mouseX, mouseY); // Usando shim

    this._lastMouseX = mouseX;
    this._lastMouseY = mouseY;
  }

  getSpeedFactor() {
    return this._cameraSpeed / (this._canvasHeight * this.getPixelRatio());
  }

  onDeviceMove(event) {
    if (this._focusGui) return;
    this.setMousePosition(event);

    var mouseX = this._mouseX;
    var mouseY = this._mouseY;
    var action = this._action;
    var speedFactor = this.getSpeedFactor();

    if (action === Enums.Action.CAMERA_ZOOM || (action === Enums.Action.CAMERA_PAN_ZOOM_ALT && !event.altKey)) {
      this.getCamera().zoom((mouseX - this._lastMouseX + mouseY - this._lastMouseY) * speedFactor);
      this.render();

    } else if (action === Enums.Action.CAMERA_PAN_ZOOM_ALT || action === Enums.Action.CAMERA_PAN) {
      this.getCamera().translate((mouseX - this._lastMouseX) * speedFactor, (mouseY - this._lastMouseY) * speedFactor);
      this.render();

    } else if (action === Enums.Action.CAMERA_ROTATE) {
      if (!event.shiftKey)
        this.getCamera().rotate(mouseX, mouseY);
      this.render();

    }
