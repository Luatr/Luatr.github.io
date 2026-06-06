/*:
 * @target MZ
 * @plugindesc Fix Pointer Lock SecurityError
 * @author AI
 *
 * @help Скрывает ошибку браузера при нажатии Esc.
 */

(() => {
    const _SceneManager_onKeyDown = SceneManager.onKeyDown;
    SceneManager.onKeyDown = function(event) {
        try {
            _SceneManager_onKeyDown.call(this, event);
        } catch (e) {
            if (e.name !== 'SecurityError') {
                throw e;
            }
        }
    };
})();