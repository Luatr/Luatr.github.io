(function () {
    var replacedKeyMapper = {
      87: 'up',
      65: 'left',
      83: 'down',
      68: 'right',
      69: 'pagedown',
    };
   
    for (code in replacedKeyMapper) {
      Input.keyMapper[code] = replacedKeyMapper[code];
    }
})();