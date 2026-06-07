// js/main.js
import { TILE_SIZE, DEFAULT_RTP, projectTilesets, projectCharacters, projectPlayer } from './state.js';
import * as Editor from './editor.js';
import * as Game from './game.js';

// Функция загрузки RTP
async function loadRTP() { 
    return new Promise(async (resolve) => { 
        let promises = []; 
        DEFAULT_RTP.tilesets.forEach(defTs => { 
            projectTilesets.push({ id: defTs.id, name: defTs.name, imageSrc: defTs.path, image: null, passability: defTs.passability, isDefault: true }); 
            promises.push(new Promise(res => { const img = new Image(); img.onload = () => { const ts = projectTilesets.find(t => t.id === defTs.id); if(ts) ts.image = img; res(); }; img.onerror = () => res(); img.src = defTs.path; })); 
        }); 
        // ... остальной код загрузки персонажей и фейсов ...
        await Promise.all(promises); resolve(); 
    }); 
}

async function init() { 
    await loadRTP(); 
    document.getElementById('loading-screen').style.display = 'none'; 
    // Создание карты по умолчанию
    let defaultMapData = Editor.createEmptyMap(17, 13); 
    for(let y=0; y<13; y++) for(let x=0; x<17; x++) defaultMapData[y][x][0] = "T1_1"; 
    // ... остальная генерация стен ...
    
    Editor.switchMap(0);
    Game.setupTouchControls(); 
}

// САМОЕ ВАЖНОЕ: Делаем функции глобальными, чтобы HTML кнопки работали!
window.setMode = Editor.setMode;
window.applyMapSize = Editor.applyMapSize;
window.openDatabase = Editor.openDatabase;
window.saveProject = Editor.saveProject;
window.loadProject = Editor.loadProject;
window.closeTopModal = Editor.closeTopModal;
window.closeEventModal = Editor.closeEventModal;
window.deleteCurrentEvent = Editor.deleteCurrentEvent;
window.updateEventGraphic = Editor.updateEventGraphic;
// ... и так далее для всех функций, которые есть в атрибутах onclick в HTML ...

window.startGame = Game.startGame;
window.stopGame = Game.stopGame;
window.gameAction = Game.gameAction;

// Запуск!
init();