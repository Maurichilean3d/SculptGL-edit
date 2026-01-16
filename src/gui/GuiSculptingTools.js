GuiTools[Enums.Tools.TRANSFORM] = {
  _ctrls: [],
  init: function (tool, fold, main) {
    var modeOptions = [];
    modeOptions[tool.constructor.Mode.TRANSLATE] = TR('sculptTransformTranslate');
    modeOptions[tool.constructor.Mode.ROTATE] = TR('sculptTransformRotate');
    modeOptions[tool.constructor.Mode.SCALE] = TR('sculptTransformScale');

    var axisOptions = [];
    axisOptions[tool.constructor.Axis.ALL] = TR('sculptTransformAxisAll');
    axisOptions[tool.constructor.Axis.X] = TR('sculptTransformAxisX');
    axisOptions[tool.constructor.Axis.Y] = TR('sculptTransformAxisY');
    axisOptions[tool.constructor.Axis.Z] = TR('sculptTransformAxisZ');

    var spaceOptions = [];
    spaceOptions[tool.constructor.Space.WORLD] = TR('sculptTransformSpaceWorld');
    spaceOptions[tool.constructor.Space.LOCAL] = TR('sculptTransformSpaceLocal');
    spaceOptions[tool.constructor.Space.NORMAL] = TR('sculptTransformSpaceNormal');

    // Pivot (punto de transformación)
    // Nota: si no se agregan traducciones, mostramos un label simple.
    var pivotOptions = [];
    pivotOptions[tool.constructor.Pivot.SELECTION] = 'Selection center';
    pivotOptions[tool.constructor.Pivot.OBJECT_ORIGIN] = 'Object origin';
    pivotOptions[tool.constructor.Pivot.CUSTOM] = 'Custom (set from click)';

    this._ctrls.push(fold.addCombobox(TR('sculptTransformMode'), tool._gizmoMode, function (val) {
      tool.setGizmoMode(val);
      main.render();
    }, modeOptions));
    this._ctrls.push(fold.addCombobox(TR('sculptTransformAxis'), tool._gizmoAxis, function (val) {
      tool.setGizmoAxis(val);
      main.render();
    }, axisOptions));
    this._ctrls.push(fold.addCombobox(TR('sculptTransformSpace'), tool._gizmoSpace, function (val) {
      tool.setGizmoSpace(val);
      main.render();
    }, spaceOptions));

    this._ctrls.push(fold.addCombobox('Pivot', tool._pivotMode, function (val) {
      tool.setPivotMode(val);
      main.render();
    }, pivotOptions));

    this._ctrls.push(fold.addButton('Set Pivot From Click', tool, 'setPivotFromPicking'));
    this._ctrls.push(fold.addButton('Reset Pivot', tool, 'resetPivot'));
  }
};
