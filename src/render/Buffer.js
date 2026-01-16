/**
 * Módulo de renderizado adaptado para Three.js.
 * Actúa como un wrapper para THREE.BufferAttribute.
 */
import * as THREE from 'three';

class Buffer {

  constructor(gl, type, hint) {
    // El contexto 'gl' y 'type' (ARRAY_BUFFER) ya no son estrictamente necesarios
    // pero se mantienen los argumentos para compatibilidad de firma.
    this._bufferAttribute = null;
    this._version = 0;
  }

  bind() {
    // No es necesario bindear manualmente en Three.js
  }

  release() {
    if (this._bufferAttribute) {
      this._bufferAttribute = null;
    }
  }

  /**
   * Actualiza los datos del buffer.
   * @param {Float32Array|Uint16Array|Uint32Array} data - Los datos.
   * @param {Number} itemSize - Número de componentes por vértice (ej: 3 para XYZ).
   */
  update(data, itemSize) {
    if (!data) return;

    // Si el atributo no existe o el tamaño cambia drásticamente, creamos uno nuevo
    if (!this._bufferAttribute || this._bufferAttribute.count !== (data.length / itemSize)) {
      this._bufferAttribute = new THREE.BufferAttribute(data, itemSize);
      // Ajustar uso dinámico si es necesario
      this._bufferAttribute.setUsage(THREE.DynamicDrawUsage);
    } else {
      // Actualizamos los datos existentes
      this._bufferAttribute.set(data);
      this._bufferAttribute.needsUpdate = true;
    }
    
    this._version++;
  }

  getBufferAttribute() {
    return this._bufferAttribute;
  }
}

export default Buffer;
