/**
 * Parte del código de SculptGL migrado a Three.js.
 */
import { vec3, mat4 } from 'gl-matrix';
import * as THREE from 'three'; // THREE JS Import
import getOptionsURL from 'misc/getOptionsURL';
import Enums from 'misc/Enums';
import Utils from 'misc/Utils';
import SculptManager from 'editing/SculptManager';
import Subdivision from 'editing/Subdivision';
import Import from 'files/Import';
import Gui from 'gui/Gui';
import Picking from 'math3d/Picking';
import Background from 'drawables/Background'; // Debería actualizarse para ser un objeto Three.js
import Mesh from 'mesh/Mesh';
import Multimesh from 'mesh/multiresolution/Multimesh';
import Primitives from 'drawables/Primitives';
import { isZUp } from 'misc/AxesConfig';
import ViewGizmo2D from 'gui/ViewGizmo2D';
import StateManager from 'states/StateManager';
import Rtt from 'drawables/Rtt'; // Probablemente obsoleto o reemplazado por WebGLRenderTarget

class Scene {

  constructor() {
    this._renderer = null; // THREE.WebGLRenderer
    this._scene = null;    // THREE.Scene
    this._threeCamera = null; // THREE.PerspectiveCamera

    this._cameraSpeed = 0.25;

    // cache canvas stuffs
    this._pixelRatio = 1.0;
    this._viewport = document.getElementById('viewport');
    this._canvas = document.getElementById('canvas');
    this._canvasWidth = 0;
    this._canvasHeight = 0;
    this._canvasOffsetLeft = 0;
    this._canvasOffsetTop = 0;

    // core of the app
    this._stateManager = new StateManager(this);
    this._sculptManager = null;
    
    // El sistema de cámara y picking original usa lógica propia.
    // Deberíamos mantener las clases originales si se adaptan, o usar las de Three.
    // Aquí asumimos que Camera.js se adapta para envolver a this._threeCamera
    // Por ahora, instanciamos directamente Three.js para la demostración.
    // this._camera = new Camera(this); 
    this._picking = new Picking(this);
    this._pickingSym = new Picking(this, true);

    this._meshPreview = null;
    this._torusLength = 0.5;
    this._torusWidth = 0.1;
    this._torusRadius = Math.PI * 2;
    this._torusRadial = 32;
    this._torusTubular = 128;

    var opts = getOptionsURL();
    this._showContour = opts.outline;
    this._showGrid = opts.grid;
    this._grid = null;
    this._background = null;

    this._viewGizmo2D = null;
    this._meshes = [];
    this._selectMeshes = [];
    this._mesh = null;
    this._multiSelection = false;

    this._gui = new Gui(this);
    this._preventRender = false;
    this._vertexSRGB = true;
  }

  start() {
    this.initThreeJS();
    if (!this._renderer) return;

    this._sculptManager = new SculptManager(this);
    // Background debería ser compatible con Three.js (ej: scene.background)
    // this._background = new Background(this._gl, this); 
    this._scene.background = new THREE.Color(0x222222); 

    // Grid helper de Three.js como reemplazo rápido
    this._grid = new THREE.GridHelper(10, 10);
    this.initGrid();
    this._scene.add(this._grid);

    this.loadTextures();
    this._gui.initGui();
    this.onCanvasResize();

    this._viewGizmo2D = new ViewGizmo2D(this);
    this._viewGizmo2D.onResize();

    var modelURL = getOptionsURL().modelurl;
    if (modelURL) this.addModelURL(modelURL);
    else this.addSphere();
  }

  initThreeJS() {
    var canvas = document.getElementById('canvas');
    
    this._renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        antialias: false,
        stencil: true,
        alpha: true
    });
    
    this._renderer.setPixelRatio(window.devicePixelRatio);
    this._renderer.setSize(window.innerWidth, window.innerHeight);
    this._renderer.setClearColor(0x000000, 0);

    this._scene = new THREE.Scene();

    // Luces básicas
    var ambientLight = new THREE.AmbientLight(0x404040);
    this._scene.add(ambientLight);
    var directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
    directionalLight.position.set(1, 1, 1).normalize();
    this._scene.add(directionalLight);

    // Cámara
    this._threeCamera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    this._threeCamera.position.z = 5;
    this._scene.add(this._threeCamera);
  }

  // Wrappers para mantener compatibilidad con SculptGL original
  getGL() { return null; } // Ya no hay contexto GL crudo expuesto
  getRenderer() { return this._renderer; }
  getScene() { return this._scene; }
  
  // Adaptador para el objeto Camera legacy, si se usa fuera
  getCamera() {
    // Si SculptGL.js llama a métodos específicos de la cámara antigua,
    // este objeto debería mapearlos a this._threeCamera
    return {
        _threeCamera: this._threeCamera,
        getProjection: () => this._threeCamera.projectionMatrix.toArray(),
        getView: () => this._threeCamera.matrixWorldInverse.toArray(),
        resetView: () => {
            this._threeCamera.position.set(0, 0, 5);
            this._threeCamera.lookAt(0, 0, 0);
        },
        onResize: (w, h) => {
            this._threeCamera.aspect = w / h;
            this._threeCamera.updateProjectionMatrix();
        },
        start: () => {}, // Controladores de cámara orbit
        rotate: (x, y) => {}, // Implementar lógica OrbitControls aquí o usar Three
        zoom: (delta) => { this._threeCamera.translateZ(delta); },
        translate: (x, y) => { this._threeCamera.translateX(x); this._threeCamera.translateY(y); },
        computeFrustumFit: () => 1.0,
        setAndFocusOnPivot: (pivot, zoom) => {},
        optimizeNearFar: () => {}
    };
  }

  getBackground() { return this._background; }
  getViewport() { return this._viewport; }
  getCanvas() { return this._canvas; }
  getPixelRatio() { return this._pixelRatio; }
  getCanvasWidth() { return this._canvasWidth; }
  getCanvasHeight() { return this._canvasHeight; }
  getGui() { return this._gui; }
  getMeshes() { return this._meshes; }
  getMesh() { return this._mesh; }
  getSelectedMeshes() { return this._selectMeshes; }
  getPicking() { return this._picking; }
  getPickingSymmetry() { return this._pickingSym; }
  getSculptManager() { return this._sculptManager; }
  getStateManager() { return this._stateManager; }
  
  initGrid() {
      // Configuración del grid helper
      if(this._grid) {
          this._grid.rotation.x = isZUp() ? Math.PI / 2 : 0;
          this._grid.position.y = -0.45;
      }
  }

  setOrUnsetMesh(mesh, multiSelect) {
    if (!mesh) {
      this._selectMeshes.length = 0;
    } else if (!multiSelect) {
      this._selectMeshes.length = 0;
      this._selectMeshes.push(mesh);
    } else {
      var id = this.getIndexSelectMesh(mesh);
      if (id >= 0) {
        if (this._selectMeshes.length > 1) {
          this._selectMeshes.splice(id, 1);
          mesh = this._selectMeshes[0];
        }
      } else {
        this._selectMeshes.push(mesh);
      }
    }

    this._mesh = mesh;
    this.getGui().updateMesh();
    this.render();
    return mesh;
  }
  
  // ... Métodos de selección (selectAllMeshes, invertSelectionMeshes, etc.) se mantienen ...
  // Solo se incluye un ejemplo para brevedad
  setMesh(mesh) { return this.setOrUnsetMesh(mesh); }
  selectAllMeshes() {
    if (this._meshes.length === 0) return;
    this.setSelectionMeshes(this._meshes, this._mesh);
  }
  setSelectionMeshes(meshes, preferredMesh) {
    this._selectMeshes.length = 0;
    for (var i = 0, nbMeshes = meshes.length; i < nbMeshes; ++i) {
      this._selectMeshes.push(meshes[i]);
    }
    var nextMesh = null;
    if (preferredMesh && this.getIndexMesh(preferredMesh, true) >= 0) {
      nextMesh = preferredMesh;
    } else if (this._selectMeshes.length > 0) {
      nextMesh = this._selectMeshes[0];
    }
    this._mesh = nextMesh;
    this.getGui().updateMesh();
    this.render();
  }
  getIndexMesh(mesh, select) {
    var meshes = select ? this._selectMeshes : this._meshes;
    var id = mesh.getID();
    for (var i = 0, nbMeshes = meshes.length; i < nbMeshes; ++i) {
      var testMesh = meshes[i];
      if (testMesh === mesh || testMesh.getID() === id) return i;
    }
    return -1;
  }
  getIndexSelectMesh(mesh) { return this.getIndexMesh(mesh, true); }
  // ... Fin métodos selección ...

  _requestRender() {
    if (this._preventRender === true) return false;
    window.requestAnimationFrame(this.applyRender.bind(this));
    this._preventRender = true;
    return true;
  }

  render() {
    this._drawFullScene = true;
    this._requestRender();
  }

  renderSelectOverRtt() {
      // Simplificado en Three.js, solo render normal por ahora
      this.render();
  }

  applyRender() {
    this._preventRender = false;
    this.updateMatricesAndSort();

    if (this._renderer && this._scene && this._threeCamera) {
        // Renderizar escena principal
        this._renderer.render(this._scene, this._threeCamera);
    }
    
    // Gizmos y UI
    if (this._viewGizmo2D) this._viewGizmo2D.render();
  }

  _drawScene() {
      // Obsoleto con Three.js (manejado internamente por renderer.render)
  }

  updateMatricesAndSort() {
    var meshes = this._meshes;
    // Actualizar matrices de meshes para lógica interna (picking, sculpting)
    // El objeto cámara devuelto por getCamera() es un shim, así que pasamos el real si es necesario o el shim.
    var camShim = this.getCamera(); 
    
    for (var i = 0, nb = meshes.length; i < nb; ++i) {
      // Mesh.js usa la cámara para calcular MV y MVP internos
      meshes[i].updateMatrices(camShim); 
    }
  }

  loadTextures() {
     // Carga de texturas simplificada
  }

  onCanvasResize() {
    var viewport = this._viewport;
    var newWidth = viewport.clientWidth * this._pixelRatio;
    var newHeight = viewport.clientHeight * this._pixelRatio;

    this._canvasWidth = newWidth;
    this._canvasHeight = newHeight;
    this._canvas.width = newWidth;
    this._canvas.height = newHeight;

    if (this._renderer) {
        this._renderer.setSize(newWidth, newHeight, false);
    }
    
    this.getCamera().onResize(newWidth, newHeight);
    
    if (this._viewGizmo2D) this._viewGizmo2D.onResize();
    this.render();
  }

  // ... (Funciones de Bounding Box, Add Geometry, Load Scene se mantienen con ajustes menores) ...

  computeBoundingBoxMeshes(meshes) {
      // Mantener lógica original para cálculos de zoom y centro
    var bound = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (var i = 0, l = meshes.length; i < l; ++i) {
      if (!meshes[i].isVisible()) continue;
      var bi = meshes[i].computeWorldBound();
      if (bi[0] < bound[0]) bound[0] = bi[0];
      if (bi[1] < bound[1]) bound[1] = bi[1];
      if (bi[2] < bound[2]) bound[2] = bi[2];
      if (bi[3] > bound[3]) bound[3] = bi[3];
      if (bi[4] > bound[4]) bound[4] = bi[4];
      if (bi[5] > bound[5]) bound[5] = bi[5];
    }
    return bound;
  }
  
  computeRadiusFromBoundingBox(box) {
    var dx = box[3] - box[0];
    var dy = box[4] - box[1];
    var dz = box[5] - box[2];
    return 0.5 * Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  addNewMesh(mesh) {
    this._meshes.push(mesh);
    this._stateManager.pushStateAdd(mesh);
    
    // IMPORTANTE: Agregar el mesh de Three.js a la escena
    if (mesh.getThreeMesh()) {
        this._scene.add(mesh.getThreeMesh());
    }
    
    this.setMesh(mesh);
    return mesh;
  }
  
  removeMeshes(rm) {
    var meshes = this._meshes;
    for (var i = 0; i < rm.length; ++i) {
        var mesh = rm[i];
        meshes.splice(this.getIndexMesh(mesh), 1);
        if(mesh.getThreeMesh()) {
            this._scene.remove(mesh.getThreeMesh());
            // mesh.release(); // Limpiar memoria
        }
    }
  }

  clearScene() {
    this.getStateManager().reset();
    // Remover todos los meshes de Three.js
    for(var i=0; i<this._meshes.length; ++i) {
        if(this._meshes[i].getThreeMesh()) this._scene.remove(this._meshes[i].getThreeMesh());
    }
    this.getMeshes().length = 0;
    this.getCamera().resetView();
    this.setMesh(null);
    this._action = Enums.Action.NOTHING;
  }
  
  // ... Métodos restantes de reemplazo y utilidades (replaceMesh, duplicateSelection, etc) mantener igual ...
  // Asegurando siempre que si se crea un nuevo mesh, se añade a this._scene
  
  replaceMesh(mesh, newMesh) {
    var index = this.getIndexMesh(mesh);
    if (index >= 0) this._meshes[index] = newMesh;
    if (this._mesh === mesh) this.setMesh(newMesh);
    
    if(mesh.getThreeMesh()) this._scene.remove(mesh.getThreeMesh());
    if(newMesh.getThreeMesh()) this._scene.add(newMesh.getThreeMesh());
  }

  // Agrega las funciones omitidas aquí...
  addModelURL(url) { /* ... */ }
  getFileType(name) { /* ... */ } // Mover helper aquí o dejar en SculptGL
  loadScene(fileData, fileType) { /* Implementar lógica de carga adaptada */ }
  normalizeAndCenterMeshes(meshes) { /* ... */ }
  computeBoundingBoxScene() { /* ... */ }
  addSphere() { /* ... */ }
  addCube() { /* ... */ }
  addCylinder() { /* ... */ }
  addPlane() { /* ... */ }
  addTorus(preview) { /* ... */ }
  subdivideClamp(mesh, linear) { /* ... */ }
  deleteCurrentSelection() { /* ... */ }
  duplicateSelection() { /* ... */ }
  onLoadAlphaImage(img, name, tool) { /* ... */ }
}

export default Scene;
