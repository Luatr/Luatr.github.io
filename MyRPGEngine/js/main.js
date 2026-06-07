// js/main.js
import { DEFAULT_RTP, state } from './state.js';
import * as Editor from './editor.js';
import * as Game from './game.js';

async function loadRTP() { 
    return new Promise(async (resolve) => { 
        let promises = []; 
        DEFAULT_RTP.tilesets.forEach(defTs => { 
            state.projectTilesets.push({ id: defTs.id, name: defTs.name, imageSrc: defTs.path, image: null, passability: defTs.passability, isDefault: true }); 
            promises.push(new Promise(res => { const img = new Image(); img.onload = () => { const ts = state.projectTilesets.find(t => t.id === defTs.id); if(ts) ts.image = img; res(); }; img.onerror = () => res(); img.src = defTs.path; })); 
        }); 
        DEFAULT_RTP.characters.forEach(defCh => { 
            state.projectCharacters.push({ id: defCh.id, name: defCh.name, imageSrc: defCh.path, image: null, isDefault: true }); 
            promises.push(new Promise(res => { const img = new Image(); img.onload = () => { const ch = state.projectCharacters.find(c => c.id === defCh.id); if(ch) ch.image = img; res(); }; img.onerror = () => res(); img.src = defCh.path; })); 
        }); 
        if (DEFAULT_RTP.faces.length > 0) { 
            const defFace = DEFAULT_RTP.faces[0]; 
            state.projectPlayer.faceSrc = defFace.path; 
            promises.push(new Promise(res => { const img = new Image(); img.onload = () => { state.projectPlayer.faceImg = img; res(); }; img.onerror = () => res(); img.src = defFace.path; })); 
        } 
        await Promise.all(promises); resolve(); 
    }); 
}

async function init() { 
    await loadRTP(); 
    document.getElementById('loading-screen').style.display = 'none'; 
    let defaultMapData = Editor.createEmptyMap(17, 13); 
    for(let y=0; y<13; y++) for(let x=0; x<17; x++) defaultMapData[y][x][0] = "T1_1"; 
    for(let x=0; x<17; x++) { defaultMapData[0][x][0] = "T1_2"; defaultMapData[12][x][0] = "T1_2"; } 
    for(let y=0; y<13; y++) { defaultMapData[y][0][0] = "T1_2"; defaultMapData[y][16][0] = "T1_2"; } 
    state.maps.push({mapId: 'map_' + Date.now(), name: "MAP001", width: 17, height: 13, mapData: defaultMapData, eventsData: {}, playerStartPos: {x: 8, y: 8} }); 
    state.currentMapIndex = 0; 
    Editor.switchMap(0);
    Game.setupTouchControls(); 
}

// Делаем функции глобальными, чтобы HTML кнопки (onclick) их видели
window.setMode = Editor.setMode;
window.applyMapSize = Editor.applyMapSize;
window.openDatabase = Editor.openDatabase;
window.saveProject = Editor.saveProject;
window.loadProject = Editor.loadProject;
window.closeTopModal = Editor.closeTopModal;
window.closeEventModal = Editor.closeEventModal;
window.deleteCurrentEvent = Editor.deleteCurrentEvent;
window.updateEventGraphic = Editor.updateEventGraphic;
window.openCreateMapModal = Editor.openCreateMapModal;
window.closeCreateMapModal = Editor.closeCreateMapModal;
window.createNewMap = Editor.createNewMap;
window.closeDatabase = Editor.closeDatabase;
window.switchDbTab = Editor.switchDbTab;
window.updatePlayerGraphicDb = Editor.updatePlayerGraphicDb;
window.handleFaceImport = Editor.handleFaceImport;
window.cycleTilePass = Editor.cycleTilePass;
window.addNewTileset = Editor.addNewTileset;
window.handleTilesetImport = Editor.handleTilesetImport;
window.addNewCharacter = Editor.addNewCharacter;
window.handleCharImport = Editor.handleCharImport;
window.renameSwitch = Editor.renameSwitch;
window.addNewSwitch = Editor.addNewSwitch;
window.renameVariable = Editor.renameVariable;
window.addNewVariable = Editor.addNewVariable;

window.startGame = Game.startGame;
window.stopGame = Game.stopGame;
window.gameAction = Game.gameAction;

window.closeAddCmdModal = Editor.closeAddCmdModal;
window.showMessageInput = Editor.showMessageInput;
window.showSwitchInput = Editor.showSwitchInput;
window.showLocalSwitchInput = Editor.showLocalSwitchInput;
window.showVariableInput = Editor.showVariableInput;
window.showIfInput = Editor.showIfInput;
window.showChoiceInput = Editor.showChoiceInput;
window.showTeleportInput = Editor.showTeleportInput;
window.toggleIfUI = Editor.toggleIfUI;
window.saveMessageCommand = Editor.saveMessageCommand;
window.saveSwitchCommand = Editor.saveSwitchCommand;
window.saveLocalSwitchCommand = Editor.saveLocalSwitchCommand;
window.saveVariableCommand = Editor.saveVariableCommand;
window.saveIfCommand = Editor.saveIfCommand;
window.saveChoiceCommand = Editor.saveChoiceCommand;
window.saveTeleportCommand = Editor.saveTeleportCommand;
window.deleteEditingCommand = Editor.deleteEditingCommand;

// Запуск приложения
init();