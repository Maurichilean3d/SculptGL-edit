/**
 * Lógica de mallas 3D editables adaptada para Three.js.
 */
import { vec3, mat3, mat4 } from 'gl-matrix';
import * as THREE from 'three'; // Importar Three.js
import Enums from 'misc/Enums';
import Utils from 'misc/Utils';
import OctreeCell from 'math3d/OctreeCell';
import RenderData from 'mesh/RenderData';

// Constantes
var DEF_ROUGHNESS = 0.18;
var DEF_METALNESS = 0.08;

class Mesh {

  constructor() {
    this._id = Mesh.ID++;
    this._meshData = null;
    this._transformData = null;
    this._renderData = null;
    this._isVisible = true;

    // Three.js Integration
    this._threeMesh = null;
    this._threeGeometry = null;
    this._threeMaterial = null;
  }

  static sortFunction(meshA, meshB) {
    // Three.js maneja el orden de renderizado, pero mantenemos esto por si acaso
    var aTr = meshA.isTransparent();
    var bTr = meshB.isTransparent();
    if (aTr && !bTr) return 1;
    if (!aTr && bTr) return -1;
    return (meshB.getDepth() - meshA.getDepth()) * (aTr && bTr ? 1.0 : -1.0);
  }

  setID(id) { this._id = id; }
  isVisible() { return this._isVisible; }
  setVisible(bool) { 
    this._isVisible = bool; 
    if(this._threeMesh) this._threeMesh.visible = bool;
  }

  // ... (Setters y Getters de datos crudos se mantienen igual: setVertices, setFaces, etc.) ...
  setVertices(vAr) { this._meshData._verticesXYZ = vAr; this._meshData._nbVertices = vAr.length / 3; }
  setFaces(fAr) { this._meshData._facesABCD = fAr; this._meshData._nbFaces = fAr.length / 4; }
  setTexCoords(tAr) { this._meshData._texCoordsST = tAr; this._meshData._nbTexCoords = tAr.length / 2; }
  setColors(cAr) { this._meshData._colorsRGB = cAr; }
  setMaterials(mAr) { this._meshData._materialsPBR = mAr; }
  setVerticesDuplicateStartCount(startCount) { this._meshData._duplicateStartCount = startCount; }
  setFacesTexCoord(fuAr) { this._meshData._UVfacesABCD = fuAr; }
  setMeshData(mdata) { this._meshData = mdata; }
  setRenderData(rdata) { this._renderData = rdata; }
  setTransformData(tdata) { this._transformData = tdata; }
  setNbVertices(nbVertices) { this._meshData._nbVertices = nbVertices; }
  setNbFaces(nbFaces) { this._meshData._nbFaces = nbFaces; }

  getID() { return this._id; }
  getRenderData() { return this._renderData; }
  getMeshData() { return this._meshData; }
  getTransformData() { return this._transformData; }
  getNbVertices() { return this._meshData._nbVertices; }
  getNbFaces() { return this._meshData._nbFaces; }
  getNbQuads() { return this.getNbTriangles() - this.getNbFaces(); }
  getNbTriangles() { return this._meshData._trianglesABC.length / 3; }
  getNbTexCoords() { return this._meshData._nbTexCoords; }
  hasUV() { return this._meshData._texCoordsST !== null; }
  
  // Getters de arrays
  getVertices() { return this._meshData._verticesXYZ; }
  getColors() { return this._meshData._colorsRGB; }
  getNormals() { return this._meshData._normalsXYZ; }
  getMaterials() { return this._meshData._materialsPBR; }
  
  // ... (Resto de getters de topología y datos internos se mantienen igual) ...
  getFaces() { return this._meshData._facesABCD; }
  getTriangles() { return this._meshData._trianglesABC; }
  getEdges() { return this._meshData._edges; }
  getNbEdges() { return this._meshData._edges.length; }
  getTexCoords() { return this._meshData._texCoordsST; }
  
  // Draw Arrays Getters
  getVerticesDrawArrays() { if (!this._meshData._DAverticesXYZ) this.updateDrawArrays(); return this._meshData._DAverticesXYZ; }
  getNormalsDrawArrays() { return this._meshData._DAnormalsXYZ; }
  getColorsDrawArrays() { return this._meshData._DAcolorsRGB; }
  getMaterialsDrawArrays() { return this._meshData._DAmaterialsPBR; }
  getTexCoordsDrawArrays() { return this._meshData._DAtexCoordsST; }

  // Octree y Transform Data Getters
  getOctree() { return this._meshData._octree; }
  getCenter() { return this._transformData._center; }
  getMV() { return this._transformData._lastComputedMV; }
  getMVP() { return this._transformData._lastComputedMVP; }
  getN() { return this._transformData._lastComputedN; }
  getEN() { return this._transformData._lastComputedEN; }
  getDepth() { return this._transformData._lastComputedDepth; }
  getMatrix() { return this._transformData._matrix; }
  getEditMatrix() { return this._transformData._editMatrix; }
  
  // Three.js Object Getter
  getThreeMesh() { return this._threeMesh; }

  // ... (Métodos de escala, simetría, bound box se mantienen igual) ...
  getScale2() { var m = this._transformData._matrix; return m[0] * m[0] + m[4] * m[4] + m[8] * m[8]; }
  getScale() { return Math.sqrt(this.getScale2()); }
  getLocalBound() { return this._meshData._octree._aabbLoose; }

  init() {
    this.initColorsAndMaterials();
    this.allocateArrays();
    this.initTopology();
    this.updateGeometry();
    if (this._renderData)
      this.updateDuplicateColorsAndMaterials();
    this.updateCenter();
  }

  // ... (Métodos de topología initTopology, updateGeometry, allocateArrays, initColorsAndMaterials, etc. se mantienen igual ya que gestionan la lógica interna de los datos) ...
  // NOTA: Se ha omitido el código repetitivo de cálculo geométrico (initFaceRings, updateVerticesNormal, etc) para brevedad, asumiendo que se mantiene idéntico al original.
  
  initTopology() {
    this.initFaceRings();
    this.optimize();
    this.initEdges();
    this.initVertexRings();
    this.initRenderTriangles();
  }

  updateGeometry(iFaces, iVerts) {
    this.updateFacesAabbAndNormal(iFaces);
    this.updateVerticesNormal(iVerts);
    this.updateOctree(iFaces);
    if (this._renderData) {
      this.updateDuplicateGeometry(iVerts);
      this.updateDrawArrays(iFaces);
    }
  }

  // ... (Métodos internos de geometría omitidos por brevedad: allocateArrays, initColorsAndMaterials, initFaceRings, etc. MANTENER IGUAL) ...
  
  // ----------------------------------------------------------------------
  // RENDER DATA (Adaptación Three.js)
  // ----------------------------------------------------------------------

  setFlatColor(val) { this.getFlatColor().set(val); if(this._threeMaterial) this._threeMaterial.color.setRGB(val[0], val[1], val[2]); }
  setAlbedo(val) { this.getAlbedo().set(val); }
  setRoughness(val) { this._renderData._roughness = val; if(this._threeMaterial) this._threeMaterial.roughness = val; }
  setMetallic(val) { this._renderData._metallic = val; if(this._threeMaterial) this._threeMaterial.metalness = val; }
  setOpacity(alpha) { 
      this._renderData._alpha = alpha; 
      if(this._threeMaterial) {
          this._threeMaterial.opacity = alpha;
          this._threeMaterial.transparent = alpha < 1.0;
      }
  }
  
  // ... (Getters de RenderData simples) ...
  getGL() { return this._renderData._gl; } // Probablemente null o el renderer de Three
  getVertexBuffer() { return this._renderData._vertexBuffer; }
  getNormalBuffer() { return this._renderData._normalBuffer; }
  getColorBuffer() { return this._renderData._colorBuffer; }
  getIndexBuffer() { return this._renderData._indexBuffer; }
  getWireframeBuffer() { return this._renderData._wireframeBuffer; }
  // ...

  isUsingDrawArrays() { return this._renderData._useDrawArrays || RenderData.ONLY_DRAW_ARRAYS; }
  isUsingTexCoords() { 
    var shaderType = this._renderData._shaderType;
    return shaderType === Enums.Shader.UV || shaderType === Enums.Shader.PAINTUV;
  }
  isTransparent() { return this._renderData._alpha < 0.99; }
  getShaderType() { return this._renderData._shaderType; }

  setShaderType(shaderName) {
    // Lógica para cambiar material de Three.js si es necesario
    this._renderData._shaderType = shaderName;
    if(this.hasUV()) {
        this.updateDuplicateGeometry();
        this.updateDrawArrays();
    }
    this.updateBuffers();
  }

  initRender() {
    // Inicializar geometría y malla de Three.js
    if (!this._threeGeometry) {
        this._threeGeometry = new THREE.BufferGeometry();
    }
    
    // Configurar material base
    if (!this._threeMaterial) {
        this._threeMaterial = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: DEF_ROUGHNESS,
            metalness: DEF_METALNESS,
            vertexColors: true // Usar colores de vértices
        });
    }

    if (!this._threeMesh) {
        this._threeMesh = new THREE.Mesh(this._threeGeometry, this._threeMaterial);
        // Asignar matriz de transformación inicial
        this.updateThreeMatrix();
    }

    this.setShaderType(this._renderData._shaderType);
    this.setShowWireframe(this.getShowWireframe());
  }

  updateThreeMatrix() {
    if(!this._threeMesh) return;
    // Sincronizar matriz gl-matrix con Three.js
    var m = this._transformData._matrix;
    this._threeMesh.matrix.set(
        m[0], m[4], m[8], m[12],
        m[1], m[5], m[9], m[13],
        m[2], m[6], m[10], m[14],
        m[3], m[7], m[11], m[15]
    );
    this._threeMesh.matrixAutoUpdate = false; // Usamos nuestra propia matriz
  }

  render(main) {
    // En Three.js, el renderizado es automático si la malla está en la escena.
    // Solo necesitamos asegurarnos de que la matriz esté actualizada.
    this.updateThreeMatrix();
  }

  renderWireframe(main) {
    // Lógica para renderizar wireframe si se requiere (ej: un hijo extra en el ThreeMesh)
  }

  // ----------------------------------------------------------------------
  // UPDATE BUFFERS (Sincronización con Three.js)
  // ----------------------------------------------------------------------
  
  getRenderNbVertices() {
    if (this.isUsingDrawArrays()) return this.getCount();
    return this.isUsingTexCoords() ? this.getNbTexCoords() : this.getNbVertices();
  }

  updateVertexBuffer() {
    var vertices = this.isUsingDrawArrays() ? this.getVerticesDrawArrays() : this.getVertices();
    // Actualizar wrapper Buffer (opcional)
    this.getVertexBuffer().update(vertices, 3);
    
    // Actualizar Three.js Geometry
    if(this._threeGeometry) {
        var attr = this.getVertexBuffer().getBufferAttribute();
        if(attr) this._threeGeometry.setAttribute('position', attr);
    }
  }

  updateNormalBuffer() {
    var normals = this.isUsingDrawArrays() ? this.getNormalsDrawArrays() : this.getNormals();
    this.getNormalBuffer().update(normals, 3);
    
    if(this._threeGeometry) {
        var attr = this.getNormalBuffer().getBufferAttribute();
        if(attr) this._threeGeometry.setAttribute('normal', attr);
    }
  }

  updateColorBuffer() {
    var colors = this.isUsingDrawArrays() ? this.getColorsDrawArrays() : this.getColors();
    this.getColorBuffer().update(colors, 3);
    
    if(this._threeGeometry) {
        var attr = this.getColorBuffer().getBufferAttribute();
        if(attr) this._threeGeometry.setAttribute('color', attr);
    }
  }

  updateMaterialBuffer() {
    // PBR data en atributos custom si el shader lo soporta
    var materials = this.isUsingDrawArrays() ? this.getMaterialsDrawArrays() : this.getMaterials();
    this.getMaterialBuffer().update(materials, 3);
  }

  updateTexCoordBuffer() {
    if (this.isUsingTexCoords()) {
      var texCoords = this.isUsingDrawArrays() ? this.getTexCoordsDrawArrays() : this.getTexCoords();
      this.getTexCoordBuffer().update(texCoords, 2);
      
      if(this._threeGeometry) {
          var attr = this.getTexCoordBuffer().getBufferAttribute();
          if(attr) this._threeGeometry.setAttribute('uv', attr);
      }
    }
  }

  updateIndexBuffer() {
    if (!this.isUsingDrawArrays()) {
      var triangles = this.isUsingTexCoords() ? this.getTrianglesTexCoord() : this.getTriangles();
      this.getIndexBuffer().update(triangles, 1); // 1 componente porque es índice plano o 3 si es tri
      
      if(this._threeGeometry) {
         // Three.js espera Uint16 o Uint32 para índices
         this._threeGeometry.setIndex(new THREE.BufferAttribute(triangles, 1));
      }
    } else {
        if(this._threeGeometry) this._threeGeometry.setIndex(null);
    }
  }

  updateWireframeBuffer() {
      // Implementación específica si se usa GL_LINES, en Three se usa un material wireframe
  }

  updateGeometryBuffers() {
    this.updateVertexBuffer();
    this.updateNormalBuffer();
  }

  updateBuffers() {
    this.updateGeometryBuffers();
    this.updateColorBuffer();
    this.updateMaterialBuffer();
    this.updateTexCoordBuffer();
    this.updateIndexBuffer();
  }

  release() {
    if (this.getTexture0()) { /* liberar textura */ }
    // Dispose geometry
    if (this._threeGeometry) this._threeGeometry.dispose();
    if (this._threeMaterial) this._threeMaterial.dispose();
    
    this.getVertexBuffer().release();
    this.getNormalBuffer().release();
    this.getColorBuffer().release();
    this.getMaterialBuffer().release();
    this.getIndexBuffer().release();
    this.getWireframeBuffer().release();
  }
  
  // ... (Resto de métodos copyData, optimize, etc. se mantienen igual ya que operan sobre arrays) ...
  // NOTA: Se ha omitido código de lógica pura (optimize, computeCacheScore) para brevedad, mantener original.

  // Agrega las funciones omitidas aquí...
  allocateArrays() { /* ... código original ... */ }
  initColorsAndMaterials() { /* ... código original ... */ }
  initFaceRings() { /* ... código original ... */ }
  updateVerticesNormal(iVerts) { /* ... código original ... */ }
  initVertexRings() { /* ... código original ... */ }
  expandsVertices(iVerts, nRing) { /* ... código original ... */ }
  getVerticesFromFaces(iFaces) { /* ... código original ... */ }
  updateFacesAabbAndNormal(iFaces) { /* ... código original ... */ }
  expandsFaces(iFaces, nRing) { /* ... código original ... */ }
  getFacesFromVertices(iVerts) { /* ... código original ... */ }
  initRenderTriangles() { /* ... código original ... */ }
  computeTrianglesFromFaces(faces) { /* ... código original ... */ }
  initEdges() { /* ... código original ... */ }
  getWireframe() { /* ... código original ... */ }
  updateDuplicateGeometry(iVerts) { /* ... código original ... */ }
  updateDuplicateColorsAndMaterials(iVerts) { /* ... código original ... */ }
  initTexCoordsDataFromOBJData(uvAr, uvfArOrig) { /* ... código original ... */ }
  setAlreadyDrawArrays() { /* ... código original ... */ }
  updateDrawArrays(iFaces) { /* ... código original ... */ }
  updateDrawArraysTexCoord(iFaces) { /* ... código original ... */ }
  updateCenter() { /* ... código original ... */ }
  updateMatrices(camera) { /* ... código original ... */ }
  computeLocalRadius() { /* ... código original ... */ }
  normalizeSize() { /* ... código original ... */ }
  computeWorldBound() { /* ... código original ... */ }
  intersectRay(vNear, eyeDir, collectLeaves) { /* ... código original ... */ }
  intersectSphere(vert, radiusSquared, collectLeaves) { /* ... código original ... */ }
  updateOctree(iFaces) { /* ... código original ... */ }
  computeAabb() { /* ... código original ... */ }
  computeOctree() { /* ... código original ... */ }
  updateOctreeRemove(iFaces) { /* ... código original ... */ }
  updateOctreeAdd(facesToMove) { /* ... código original ... */ }
  balanceOctree() { /* ... código original ... */ }
  // ... Render Data getters ...
  getFlatColor() { return this._renderData._flatColor; }
  getAlbedo() { return this._renderData._albedo; }
  getTexture0() { return this._renderData._texture0; }
  getMatcap() { return this._renderData._matcap; }
  getCurvature() { return this._renderData._curvature; }
  getFlatShading() { return this._renderData._flatShading; }
  getShowWireframe() { return this._renderData._showWireframe; }
  // ...
  setShowWireframe(showWireframe) { this._renderData._showWireframe = showWireframe; }
  setUseDrawArrays(bool) { this._renderData._useDrawArrays = bool; }
  // ...
  copyRenderConfig(mesh) { /* ... */ }
  copyTransformData(mesh) { /* ... */ }
  copyData(mesh) { /* ... */ }
  optimize() { /* ... */ }
  computeCacheScore() { /* ... */ }
  optimizePostTransform() { /* ... */ }
  optimizePreTransform() { /* ... */ }
}

Mesh.OPTIMIZE = true;
Mesh.ID = 0;

export default Mesh;
