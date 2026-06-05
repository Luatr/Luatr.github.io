//=============================================================================
// RPG Maker MV/MZ - Title Skip
//=============================================================================

/*:
 * @target MV MZ
 * @author ZX_Lost_Soul
 * @plugindesc Skip title screen.
 * 
 * @help
 * Skip title screen.
 * 
 * Version 1.0
 * Compatible with RPG Maker MV and MZ
 * 
 * [Attribution]
 * Add ZX_Lost_Soul and https://rpgmakerunion.ru to the game credits.
 * 
 * [License]
 * This plugin is released under MIT license.
 * http://opensource.org/licenses/mit-license.php
 */
/*:ru
 * @target MV MZ
 * @author ZX_Lost_Soul
 * @plugindesc Пропускает титульный экран.
 * 
 * @help
 * Пропускает титульный экран.
 * 
 * Версия 1.0
 * Совместима с RPG Maker MV и MZ
 * 
 * [Атрибуция]
 * Добавьте ZX_Lost_Soul и https://rpgmakerunion.ru в титры игры.
 * 
 * [Лицензия]
 * Этот плагин выпущен под лицензией MIT.
 * http://opensource.org/licenses/mit-license.php
 */

(() => {
    const sceneManagerGoto = SceneManager.goto;

    SceneManager.goto = function(sceneClass) {
        if (sceneClass == Scene_Title) {
            AudioManager.stopAll();
            DataManager.setupNewGame();
            SceneManager.goto(Scene_Map);
            return;
        }

        return sceneManagerGoto.apply(this, arguments);
    };
})();
