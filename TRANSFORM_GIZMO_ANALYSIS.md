# Análisis del Sistema de Gizmos de Transformación

## Resumen Ejecutivo

**Fecha**: 2026-01-15
**Commit Analizado**: 7536efa "Add transform gizmo mode and space controls"
**Estado**: Sistema implementado pero con bugs funcionales

---

## Estado de los Branches

### Branch Principal (main)
- **Commit**: ba3d33d
- **Estado**: Más actualizado, contiene todos los cambios importantes
- **Incluye**: PR #13 con sistema de gizmos y controles de espacio

### Otros Branches
- **claude/review-and-merge-branches-de0IK**: Sincronizado con main
- **claude/extract-zip-to-root-uoqaH**: 35 commits atrás de main (obsoleto)

**Conclusión**: No se requiere merge. Main ya contiene todos los cambios actuales.

---

## Sistema de Transformación - Problemas Identificados

### Archivos Modificados en el Commit 7536efa

1. **src/editing/Gizmo.js** (+153 líneas)
2. **src/editing/tools/Transform.js** (+80 líneas)
3. **src/gui/GuiSculptingTools.js** (+31 líneas)
4. **src/gui/tr/*.js** (traducciones)

### Funcionalidad Implementada

El sistema agrega tres modos de espacio para las transformaciones:

- **WORLD (Global)**: Los ejes permanecen alineados con los ejes mundiales
- **LOCAL**: Los ejes se alinean con la orientación local del objeto
- **NORMAL**: Los ejes se alinean con la normal de la cara seleccionada

---

## Bugs Encontrados

### 1. Modo NORMAL no funciona sin picking válido

**Ubicación**: `src/editing/Gizmo.js:266-293` (método `_updateSpaceMatrices`)

**Descripción del problema**:
```javascript
if (this._spaceMode === SPACE_NORMAL) {
  var picking = this._main.getPicking();
  picking.computePickedNormal();
  var normal = picking.getPickedNormal();
  var normalLen = vec3.len(normal);
  if (normalLen === 0.0) {
    // Vuelve a matriz identidad (comportamiento WORLD)
    mat4.identity(this._spaceMatrix);
    mat4.identity(this._spaceMatrixInv);
    return;
  }
  // ...
}
```

**Requisitos para que funcione**:
1. Debe haber un mesh seleccionado
2. Debe existir un punto de intersección válido (picking)
3. La normal debe estar calculada y ser != [0,0,0]

**Si no se cumplen**: El sistema usa matriz identidad (comportamiento de WORLD)

**Impacto**: El modo NORMAL solo funciona después de hacer clic en una superficie, no al seleccionarlo desde la UI

---

### 2. Actualización de matrices solo durante render

**Ubicación**: `src/editing/Gizmo.js:443-448` (método `_updateMatrices`)

**Descripción del problema**:
```javascript
_updateMatrices() {
  // ...
  this._updateSpaceMatrices(trMesh);  // Solo se llama aquí
  // ...
}
```

La función `_updateSpaceMatrices()` solo se ejecuta durante el render del gizmo, no cuando se cambia el modo desde la UI.

**Secuencia actual**:
1. Usuario cambia de WORLD a LOCAL en la UI
2. Se llama `setGizmoSpace(space)` → `_updateGizmo()` → `setSpaceMode(mode)`
3. Solo se actualiza la variable `_spaceMode`
4. Las matrices `_spaceMatrix` y `_spaceMatrixInv` NO se actualizan
5. Las matrices se actualizan recién en el siguiente render

**Impacto**: Los cambios visuales del gizmo no se reflejan inmediatamente al cambiar el modo

**Solución sugerida**: Llamar a `_updateMatrices()` o `main.render()` después de cambiar el modo

---

### 3. Inconsistencia en aplicación de transformaciones de espacio

**Ubicación**: Métodos de edición en `src/editing/Gizmo.js`

**Rotación** (líneas 636-639):
```javascript
if (this._spaceMode !== SPACE_WORLD) {
  mat4.mul(mrot, this._spaceMatrix, mrot);
  mat4.mul(mrot, mrot, this._spaceMatrixInv);
}
```

**Escala** (líneas 780-783):
```javascript
if (this._spaceMode !== SPACE_WORLD) {
  mat4.mul(edim, this._spaceMatrix, edim);
  mat4.mul(edim, edim, this._spaceMatrixInv);
}
```

**Traslación** (línea 570):
```javascript
// SIEMPRE aplica la transformación de espacio
vec3.transformMat4(dir, dir, this._spaceMatrix);
```

**Problema**:
- Rotación y Escala solo aplican las matrices de espacio si el modo NO es WORLD
- Traslación SIEMPRE aplica la transformación (incluso en modo WORLD)

**Impacto**: Puede causar comportamiento inconsistente entre diferentes tipos de transformación

**Análisis**:
- En modo WORLD, `_spaceMatrix` es la matriz identidad, así que aplicarla no causa problemas visibles
- Pero conceptualmente hay inconsistencia en el código

---

### 4. Modo NORMAL requiere workflow específico

**Flujo actual para usar modo NORMAL**:

1. ✅ Seleccionar herramienta Transform
2. ✅ Seleccionar un mesh
3. ✅ Hacer clic en una cara del mesh (genera picking con normal)
4. ✅ Cambiar a modo NORMAL en la UI
5. ✅ Ahora los ejes se alinean con la normal de la cara

**Problema**: Si cambias a modo NORMAL ANTES de hacer clic en una cara, los ejes permanecen en orientación WORLD hasta que hagas un picking válido.

**Comportamiento esperado**: Los ejes deberían actualizarse automáticamente al primer picking válido después de cambiar al modo NORMAL.

---

## Verificación del Código de la UI

### GuiSculptingTools.js (líneas 289-321)

La interfaz está correctamente implementada:

```javascript
GuiTools[Enums.Tools.TRANSFORM] = {
  _ctrls: [],
  init: function (tool, fold, main) {
    var spaceOptions = [];
    spaceOptions[tool.constructor.Space.WORLD] = TR('sculptTransformSpaceWorld');
    spaceOptions[tool.constructor.Space.LOCAL] = TR('sculptTransformSpaceLocal');
    spaceOptions[tool.constructor.Space.NORMAL] = TR('sculptTransformSpaceNormal');

    this._ctrls.push(fold.addCombobox(TR('sculptTransformSpace'), tool._gizmoSpace, function (val) {
      tool.setGizmoSpace(val);
      main.render();  // 👍 Se fuerza un render
    }, spaceOptions));
  }
};
```

**Nota positiva**: La UI SÍ llama a `main.render()` después de cambiar el espacio, lo que debería actualizar las matrices.

---

## Recomendaciones de Corrección

### Alta Prioridad

1. **Mejorar modo NORMAL con fallback inteligente**:
   ```javascript
   // En _updateSpaceMatrices, si no hay normal válida:
   // - En modo NORMAL sin picking: usar orientación LOCAL como fallback
   // - Mostrar mensaje visual indicando que se necesita hacer clic en una cara
   ```

2. **Garantizar actualización de matrices**:
   ```javascript
   setSpaceMode(mode) {
     this._spaceMode = mode;
     // Forzar actualización de matrices si hay mesh seleccionado
     if (this._main.getMesh()) {
       this._updateMatrices();
     }
   }
   ```

3. **Unificar lógica de aplicación de espacio**:
   ```javascript
   // Usar el mismo patrón en todos los métodos de edición:
   if (this._spaceMode !== SPACE_WORLD) {
     // aplicar transformación de espacio
   }
   ```

### Media Prioridad

4. **Agregar validación de estado**:
   - Deshabilitar opción NORMAL en la UI si no hay mesh seleccionado
   - Mostrar tooltip indicando requisitos para cada modo

5. **Mejorar feedback visual**:
   - Cambiar color de los ejes según el modo activo
   - Agregar indicador visual cuando modo NORMAL no puede calcular normal

---

## Casos de Prueba Sugeridos

### Test 1: Modo WORLD
1. Seleccionar mesh
2. Activar Transform tool
3. Modo: WORLD
4. **Esperado**: Ejes alineados con X, Y, Z mundiales
5. Rotar objeto → **Esperado**: Los ejes NO rotan con el objeto

### Test 2: Modo LOCAL
1. Seleccionar mesh
2. Rotar objeto manualmente
3. Activar Transform tool
4. Modo: LOCAL
5. **Esperado**: Ejes alineados con orientación local del objeto
6. Rotar objeto → **Esperado**: Los ejes rotan con el objeto

### Test 3: Modo NORMAL
1. Seleccionar mesh
2. Activar Transform tool
3. Hacer clic en una cara del mesh
4. Modo: NORMAL
5. **Esperado**:
   - Eje Z alineado con la normal de la cara
   - Eje X perpendicular al eje de vista
   - Eje Y completa el sistema ortogonal

### Test 4: Modo NORMAL sin picking
1. Seleccionar mesh
2. Activar Transform tool
3. Modo: NORMAL (SIN hacer clic en cara primero)
4. **Actual**: Ejes en orientación WORLD
5. **Esperado**: Debería usar LOCAL como fallback o mostrar indicación

---

## Conclusión

El sistema de gizmos con modos de espacio WORLD/LOCAL/NORMAL está **implementado pero no funciona correctamente** debido a:

1. ❌ Modo NORMAL requiere picking válido previo
2. ❌ Inconsistencia en aplicación de transformaciones
3. ⚠️ Falta de feedback visual sobre estado del sistema

**Recomendación**: Aplicar las correcciones de alta prioridad antes de considerar esta funcionalidad como completa.

---

## Referencias de Código

- **Gizmo.js:77-79**: Definición de constantes SPACE_*
- **Gizmo.js:221-223**: Método setSpaceMode
- **Gizmo.js:240-293**: Método _updateSpaceMatrices (lógica principal)
- **Gizmo.js:636-639, 780-783**: Aplicación de transformaciones en rotación y escala
- **Transform.js:22-26**: Definición de enum Space
- **Transform.js:179-183**: Método setGizmoSpace
- **GuiSculptingTools.js:289-321**: Configuración de UI para Transform tool
