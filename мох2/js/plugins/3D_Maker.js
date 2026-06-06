//=============================================================================
// 3D_Maker.js - FULL STABLE BUILD
//=============================================================================

(() => {
    'use strict';

    let threeRenderer, threeScene, threeCamera;
    let gridHelper;
    let cursorGroup, cursorFill, cursorEdges;
    let previewMesh;

    const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    let currentTool = 'none';
	let current3DMapId = 0;
    let placedObjects = []; 
    let undoStack = []; 

    let camTarget = new THREE.Vector3(0, 0, 0);
    let camTheta = Math.PI / 4; 
    let camPhi = Math.PI / 4;   
    let camRadius = 15;
    let targetCamRadius = 15; // Новая переменная для плавного зума       

    let currentFloor = 0;
    let currentRotation = 0;
    let cubeSizeX = 1, cubeSizeY = 1, cubeSizeZ = 1;
    let blockColor = '#ffffff';

    let isEditorMode = false; // По умолчанию False! При Новой Игре включается режим игры.
    let isDialogueActive = false;
    let activeEventObj = null;

    let playerMesh;
    let playerX = 0, playerZ = 0;
    let playerY = 0.5; 
    let targetPlayerY = 0.5;
    let playerVelocityY = 0;
    let isGrounded = false;
    const playerSpeed = 0.08;
    const jumpForce = 0.15;
    const gravity = -0.01;

    let mouseClientX = 0, mouseClientY = 0;
    const raycaster = new THREE.Raycaster();
    const playerRaycaster = new THREE.Raycaster(); 

    let isRotatingCamera = false;
    // --- НОВЫЕ ПЕРЕМЕННЫЕ ДЛЯ КАМЕРЫ И ПРИЦЕЛИВАНИЯ ---
    let playerCamYaw = Math.PI; // Горизонтальный поворот камеры в игре
    let playerCamPitch = 0.3;   // Вертикальный поворот камеры в игре
    let isAiming = false;       // Зажата ли ПКМ (режим прицеливания)
    // --------------------------------------------------
    
    let isEventEditorOpen = false;
    let currentEditingObj = null;
    let isNewEvent = false;

    let spawnPoint = { x: 0.5, z: 0.5, y: 0.5 };
    let spawnMarker;
    let heldObject = null; 
    let moveGhostMesh = null; 
    let contextTargetObj = null; 
	
	// --- СИСТЕМА БЫСТРЫХ СЛОТОВ ---
    let quickSlots = [null, null, null, null]; // 4 слота (предметы из базы MZ)
    let playerMaxHP = 100; 
    let playerHP = 100;
    // -------------------------------
    
    // --- СПИСОК ДОСТУПНЫХ 3D МОДЕЛЕЙ ---
    const AVAILABLE_MODELS = [
        { name: "Стандартный (Цилиндр/Круг)", path: "" },
        { name: "NPC Рыцарь", path: "assets/тест_НПС.glb" },
        { name: "Сундук", path: "assets/chest.glb" },
        { name: "Дерево", path: "assets/tree.glb" }
    ];
	
	    // --- СПИСОК ДОСТУПНЫХ ТЕКСТУР ---
    const AVAILABLE_TEXTURES = [
        { name: "Убрать текстуру", path: "" },
        { name: "Стена кирпич", path: "assets/textures/wall_1.png" },
        { name: "Стена камень", path: "assets/textures/wall_2.png" },
        { name: "Стена серый кирпич", path: "assets/textures/wall_3.png" },
        { name: "Пол трава", path: "assets/textures/grass_1.png" }
        // Добавляй сюда свои текстуры! Картинки клади в папку assets/textures/
    ];

    // --- ТЕКСТУРА ВОДЫ ---
    // Положи картинку water.png в папку assets проекта!
    const WATER_TEXTURE_URL = "assets/textures/water.png"; 

    let keysPressed = {};

    // ---------------------------------------------------------
    // ЛОГИКА ОБРАБОТКИ КОМАНД
    // ---------------------------------------------------------
    function checkCondition(condStr, obj) {
        if (!condStr || condStr === 'ALWAYS') return true; 
        if (!$gameSwitches) return false; 

        try {
            let match = condStr.match(/^SELF_A=(true|false)$/i);
            if (match) {
                let targetVal = match[1].toLowerCase() === 'true';
                let currentVal = obj ? (obj.selfSwitchA || false) : false;
                return currentVal === targetVal;
            }

            match = condStr.match(/^S(\d+)=?(true|false)$/i);
            if (match) {
                let switchId = Number(match[1]);
                let targetVal = match[2].toLowerCase() === 'true';
                let currentVal = $gameSwitches.value(switchId);
                return currentVal === targetVal;
            }

            match = condStr.match(/^V(\d+)(==|>=|<=|>|<)(\-?\d+)$/);
            if (match) {
                let varId = Number(match[1]);
                let currentVal = $gameVariables.value(varId) || 0;
                let targetVal = Number(match[3]);
                if (match[2] === '==') return currentVal == targetVal;
                if (match[2] === '>=') return currentVal >= targetVal;
                if (match[2] === '<=') return currentVal <= targetVal;
                if (match[2] === '>') return currentVal > targetVal;
                if (match[2] === '<') return currentVal < targetVal;
            }
        } catch(e) { return false; }
        return false; 
    }

    // ---------------------------------------------------------
    // ИДЕАЛЬНАЯ ЛОГИКА: Поддержка Параллельных процессов и Ждать
    // ---------------------------------------------------------
    function executeEvents(obj) {
        if (!obj.events || obj.events.length === 0) return;
        if (!$gameSwitches) return;

        // Если событие исчерпало свой лимит запусков - ничего не делаем!
        if (obj.isDepleted) return;

        // Инициализация счетчиков
        if (!obj.evIdx) obj.evIdx = 0;
        if (!obj.actIdx) obj.actIdx = 0;

        // Если событие в режиме ожидания (Команда Ждать)
        if (obj.waitFrames && obj.waitFrames > 0) {
            obj.waitFrames--;
            return; 
        }

        // Основной цикл выполнения
        while (obj.evIdx < obj.events.length) {
            const ev = obj.events[obj.evIdx];
            
            // 1. ПРОВЕРЯЕМ ВСЕ УСЛОВИЯ БЛОКА
            let condMet = true;
            if (ev.conditions && ev.conditions.length > 0) {
                for (const cond of ev.conditions) {
                    if (cond.type === 'switch') {
                        if ($gameSwitches.value(cond.id) !== (cond.val === 'true')) condMet = false;
                    } else if (cond.type === 'self_switch') {
                        // Проверяем локальный переключатель!
                        if (obj.selfSwitchA !== (cond.val === 'true')) condMet = false;
                    } else if (cond.type === 'variable') {
                        let v = $gameVariables.value(cond.id) || 0;
                        let t = Number(cond.valNum) || 0;
                        if (cond.op === '==' && v != t) condMet = false;
                        else if (cond.op === '>' && !(v > t)) condMet = false;
                        else if (cond.op === '<' && !(v < t)) condMet = false;
                        else if (cond.op === '>=' && !(v >= t)) condMet = false;
                        else if (cond.op === '<=' && !(v <= t)) condMet = false;
                    }
                    if (!condMet) break;
                }
            }

            // 2. ВЫПОЛНЕНИЕ ДЕЙСТВИЙ
            if (condMet) {
                while (obj.actIdx < ev.actions.length) {
                    const act = ev.actions[obj.actIdx];

                    if (act.type === 'message') {
                        window.openDialogue(act.text, obj);
                        obj.actIdx++; 
                        obj.isDialogueBlocking = true; 
                        return; 
                    }
                    if (act.type === 'wait') {
                        obj.waitFrames = Number(act.frames) || 60;
                        obj.actIdx++; 
                        return; 
                    }

                    // --- ОБЫЧНЫЕ КОМАНДЫ ---
                    if (act.type === 'switch_on') $gameSwitches.setValue(act.id, true);
                    else if (act.type === 'switch_off') $gameSwitches.setValue(act.id, false);
                    else if (act.type === 'self_switch_on') {
                        obj.selfSwitchA = true;
                        updateEventVisibility(); // Обновляем видимость на карте!
                    }
                    else if (act.type === 'self_switch_off') {
                        obj.selfSwitchA = false;
                        updateEventVisibility(); // Проверяем, должно ли событие появиться!
                    }
                    else if (act.type === 'restore_hp') {
                        obj.hp = obj.maxHp; 
                        obj.isDepleted = false; 
                        obj.isDead = false; // ВАЖНО: Снимаем флаг смерти!
                        if (obj.mesh) obj.mesh.visible = true; 
                        if (window.Maker3D && window.Maker3D.initBattleScene) window.Maker3D.initBattleScene();
                    }
                    else if (act.type === 'execution_limit') {
                        obj.executionCount = (obj.executionCount || 0) + 1;
                        if (obj.executionCount >= (act.limit || 1)) {
                            obj.isDepleted = true; // Событие исчерпано!
                        }
                    }
                    else if (act.type === 'variable') {
                        let currentVal = $gameVariables.value(act.id) || 0;
                        if (act.op === '=') $gameVariables.setValue(act.id, Number(act.value));
                        else if (act.op === '+') $gameVariables.setValue(act.id, currentVal + Number(act.value));
                        else if (act.op === '-') $gameVariables.setValue(act.id, currentVal - Number(act.value));
                    }
                    else if (act.type === 'play_se') {
                        if (act.name) AudioManager.playSe({ name: act.name, volume: 90, pitch: 100 });
                    }
                    else if (act.type === 'common_event') {
                        if (act.ceId && act.ceId > 0 && $gameTemp) {
                            $gameTemp.reserveCommonEvent(act.ceId);
                        }
                    }
                    else if (act.type === 'script') {
                        try { eval(act.code); } catch(e) { console.error("Скрипт ошибка:", e); }
                    }

                    obj.actIdx++;
                }
            }

            obj.evIdx++;
            obj.actIdx = 0;
        }

        // --- КОНЕЦ СОБЫТИЯ ---
        // Если событие исчерпало лимит - прячем его
        if (obj.isDepleted) {
            if (obj.mesh) obj.mesh.visible = false; 
            return;
        }

        if (obj.triggerType === 'parallel') {
            obj.evIdx = 0;
            obj.actIdx = 0;
        } else {
            obj.evIdx = 0;
            obj.actIdx = 0;
            obj.isProcessing = false;
        }
    }

    function updateEventVisibility() {
        placedObjects.forEach(obj => {
            if (obj.type === 'event' && obj.mesh) {
                if (isEditorMode) {
                    obj.mesh.visible = true; // В редакторе показываем все
                } else {
                    // Проверяем: НЕ исчерпан лимит, НЕ мертв, и условие появления выполнено
                    obj.mesh.visible = !obj.isDepleted && !obj.isDead && checkCondition(obj.condition, obj);
                }
            }
        });
    }
    
    // --- ПЕРЕХВАТ ИЗМЕНЕНИЙ RPG MAKER ---
    const _Game_Switches_setValue = Game_Switches.prototype.setValue;
    Game_Switches.prototype.setValue = function(switchId, value) {
        _Game_Switches_setValue.call(this, switchId, value);
        updateEventVisibility();
    };

    const _Game_Variables_setValue = Game_Variables.prototype.setValue;
    Game_Variables.prototype.setValue = function(variableId, value) {
        _Game_Variables_setValue.call(this, variableId, value);
        updateEventVisibility();
    };

    // ---------------------------------------------------------
    // UI ПАНЕЛИ (ОБНОВЛЕННЫЙ ДИЗАЙН)
    // ---------------------------------------------------------
function createEditorUI() {
        const wrapper = document.createElement('div');
        wrapper.id = 'editor-ui';
        wrapper.className = 'editor-wrapper'; // Класс вместо style.cssText

        // --- ВЕРХНЯЯ ПАНЕЛЬ ---
        wrapper.innerHTML += `
        <div class="editor-top-panel">
            <span style="font-weight:bold;">Этаж:</span> <span id="floor-num">0</span>
            <button onmousedown="this.blur()" onclick="window.editorFloorUp()" class="btn-base">+</button>
            <button onmousedown="this.blur()" onclick="window.editorFloorDown()" class="btn-base">-</button>
            <div class="editor-divider"></div>
            <button onmousedown="this.blur()" onclick="window.openUIManager()" class="btn-base">🖥️ UI</button>
            <button onmousedown="this.blur()" onclick="window.setCameraPreset('iso')" class="btn-base">Изо</button>
            <button onmousedown="this.blur()" onclick="window.setCameraPreset('top')" class="btn-base">Сверху</button>
            <button onmousedown="this.blur()" onclick="window.setCameraPreset('3rd')" class="btn-base">3-е лицо</button>
            <div class="editor-divider"></div>
            <button onmousedown="this.blur()" onclick="window.editorRotate()" class="btn-base">Повернуть (R)</button>
            <button onmousedown="this.blur()" onclick="window.editorUndo()" class="btn-base">Отмена</button>
            <div class="editor-divider"></div>
            <button onmousedown="this.blur()" onclick="window.exportLevelToMap()" class="btn-violet">💾 Экспорт</button>
            <button onmousedown="this.blur()" onclick="window.editorTestLevel()" class="btn-violet">▶ Тест</button>
            <button onmousedown="this.blur()" onclick="window.editorClear()" class="btn-base">Очистить</button>
            <button onmousedown="this.blur()" onclick="window.openCustomMenu()" class="btn-base">Меню</button>
        </div>`;

        // --- ЛЕВАЯ ПАНЕЛЬ ---
        wrapper.innerHTML += `
        <div class="editor-left-panel">
            <p id="editor-status" style="font-size:11px; margin:0 0 6px 0; color:#6B7280; text-align:center;">Инструмент: Нет</p>
            <p style="font-size:10px; margin:0 0 6px 0; color:#9CA3AF; text-align:center;">Shift+ПКМ: Меню объекта</p>
            <div style="display:flex; flex-direction:column; gap:3px; margin-bottom:8px;">
                <button onmousedown="this.blur()" onclick="window.editorSetTool('cube')" class="btn-base" style="width:100%;">Куб</button>
                <button onmousedown="this.blur()" onclick="window.editorSetTool('stairs')" class="btn-base" style="width:100%;">Лестница</button>
                <button onmousedown="this.blur()" onclick="window.editorSetTool('event')" class="btn-base" style="width:100%;">Событие</button>
                <button onmousedown="this.blur()" onclick="window.editorSetTool('spawn')" class="btn-base" style="width:100%;">Спавн</button>
                <button onmousedown="this.blur()" onclick="window.editorSetTool('water')" class="btn-base" style="width:100%;">Вода / Лава</button>
                <button onmousedown="this.blur()" onclick="window.editorSetTool('eraser')" class="btn-danger" style="width:100%;">Ластик</button>
                <button onmousedown="this.blur()" onclick="window.editorSetTool('none')" class="btn-base" style="width:100%;">Убрать курсор</button>
            </div>
            <div class="editor-size-box">
                <p style="margin:0 0 4px 0; font-size:11px; color:#4B5563;">Размеры (X Y Z):</p>
                <div style="display:flex; gap:3px; margin-bottom:4px;">
                    <input type="number" id="cube-sx" value="1" min="1" class="input-style" style="width:33%;" title="X">
                    <input type="number" id="cube-sy" value="1" min="1" class="input-style" style="width:33%;" title="Y">
                    <input type="number" id="cube-sz" value="1" min="1" class="input-style" style="width:33%;" title="Z">
                </div>
                <p style="margin:0 0 2px 0; font-size:11px; color:#4B5563;">Цвет:</p>
                <input type="color" id="block-color" value="#ffffff" style="width:100%; height:24px; padding:0; border:1px solid #D1D5DB; cursor:pointer; border-radius:3px;">
            </div>
        </div>`;

        document.body.appendChild(wrapper);
    }

	function createPlayUI() {
        const crossDiv = document.createElement('div');
        crossDiv.id = 'crosshair';
        crossDiv.className = 'crosshair';
        crossDiv.innerHTML = `
            <div class="crosshair-h"></div>
            <div class="crosshair-v"></div>
            <div class="crosshair-dot"></div>
        `;
        document.body.appendChild(crossDiv);

        const uiDiv = document.createElement('div');
        uiDiv.id = 'play-ui';
        uiDiv.className = 'play-ui-panel';
        uiDiv.innerHTML = `
            <h3 style="margin: 0 0 6px 0; font-size:14px;">Режим Игры</h3>
            <p style="font-size:11px; color:#6B7280; margin: 0 0 8px 0;">ЛКМ = Стрельба | E(У) = Удар<br>F = Взаимодействие | Пробел = Прыжок</p>
            <div style="display:flex; gap:4px;">
                <button onmousedown="this.blur()" onclick="window.editorBackToEditor()" class="btn-danger">◄ Назад</button>
                <button onmousedown="this.blur()" onclick="window.openCustomMenu()" class="btn-base">Меню</button>
            </div>
        `;
        document.body.appendChild(uiDiv);
    }

	function createDialogueUI() {
        const dlgDiv = document.createElement('div');
        dlgDiv.id = 'dialogue-box';
        dlgDiv.className = 'dialogue-box';
        dlgDiv.innerHTML = `
            <div id="dlg-text" style="margin-bottom: 12px; line-height: 1.4;">Текст</div>
            <button onclick="window.closeDialogue()" class="btn-violet" style="padding: 6px 16px;">Закрыть (Enter/F)</button>
        `;
        document.body.appendChild(dlgDiv);
    }

    function createCustomMenu() {
        const menuDiv = document.createElement('div');
        menuDiv.id = 'custom-menu';
        menuDiv.className = 'custom-menu-overlay';
        menuDiv.innerHTML = `<div class="custom-menu-box"><h2 style="margin-top:0; margin-bottom:15px;">Меню движка</h2><div style="display:flex; flex-direction:column; gap:6px; margin-bottom:15px;"><button onclick="window.customSave(1)" class="btn-violet" style="width:200px; padding:8px;">Сохранить</button><button onclick="window.customLoad(1)" class="btn-base" style="width:200px; padding:8px;">Загрузить</button></div><button onclick="window.closeCustomMenu()" class="btn-danger" style="width:200px; padding:8px;">Закрыть</button></div>`;
        document.body.appendChild(menuDiv);
    }

	function createContextMenu() {
        const ctxDiv = document.createElement('div');
        ctxDiv.id = 'context-menu';
        ctxDiv.className = 'context-menu';
        ctxDiv.innerHTML = `
            <button onclick="window.ctxEdit()" class="ctx-btn">✏️ Редактировать</button>
            <button onclick="window.ctxEditSize()" class="ctx-btn">📐 Размер/Цвет</button>
            <button onclick="window.ctxAddTexture()" class="ctx-btn">🖼️ Текстура</button>
            <button onclick="window.ctxMove()" class="ctx-btn">🔄 Переместить</button>
            <button onclick="window.ctxDelete()" class="ctx-btn ctx-btn-danger">🗑️ Удалить</button>
        `;
        document.body.appendChild(ctxDiv);
    }
    
    function createTextureMenu() {
        const tDiv = document.createElement('div');
        tDiv.id = 'texture-menu';
        tDiv.className = 'context-menu'; // Используем стили контекстного меню, они подходят
        let btns = AVAILABLE_TEXTURES.map(t => `<button onclick="window.selectTexture('${t.path}')" class="ctx-btn">🖼️ ${t.name}</button>`).join('');
        tDiv.innerHTML = btns;
        document.body.appendChild(tDiv);
    }

    // ---------------------------------------------------------
    // ВИЗУАЛЬНЫЙ РЕДАКТОР СОБЫТИЙ
    // ---------------------------------------------------------
    function createEventEditorUI() {
        const eeDiv = document.createElement('div');
        eeDiv.id = 'event-editor';
        eeDiv.className = 'event-editor-overlay'; // Используем класс из CSS
        
        let modelOptions = AVAILABLE_MODELS.map(m => `<option value="${m.path}">${m.name}</option>`).join('');

        eeDiv.innerHTML = `
            <div class="event-editor-container">
                <h2 style="margin:0 0 6px 0; text-align:center; font-size:14px; flex-shrink:0;">Настройка события</h2>
                
                <div style="flex:1; display:flex; gap:8px; overflow:hidden;">
                    <!-- ЛЕВАЯ ПАНЕЛЬ (НАСТРОЙКИ) -->
                    <div style="width:30%; background:#fff; border:1px solid #D1D5DB; border-radius:3px; padding:6px; display:flex; flex-direction:column; gap:4px; overflow-y:auto;">
                        <div>
                            <label style="font-size:10px; font-weight:bold; display:block; margin-bottom:1px;">Графика</label>
                            <select id="ee-model-path" style="width:100%;" class="input-style">${modelOptions}</select>
                        </div>
                        <div>
                            <label style="font-size:10px; font-weight:bold; display:block; margin-bottom:1px;">Активация</label>
                            <select id="ee-trigger-type" style="width:100%;" class="input-style">
                                <option value="interact">По кнопке (F)</option>
                                <option value="step">По наступанию</option>
                                <option value="parallel">Параллельный</option>
                            </select>
                        </div>
                        <div>
                            <label style="font-size:10px; font-weight:bold; display:block; margin-bottom:1px;">Условие появления</label>
                            <select id="ee-cond-type" style="width:auto;" class="input-style">
                                <option value="ALWAYS">Всегда</option>
                                <option value="SELF_A">Лок. свич A</option>
                                <option value="SWITCH">Переключатель</option>
                                <option value="VARIABLE">Переменная</option>
                            </select>
                            <div id="ee-cond-params" style="margin-top:2px;"></div>
                        </div>
                        <div>
                            <label style="font-size:10px; font-weight:bold; display:block; margin-bottom:1px;">Тело и поведение</label>
                            <select id="ee-body-type" style="width:auto;" class="input-style">
                                <option value="static">Статичное</option>
                                <option value="moving">Подвижное</option>
                            </select>
                            <div id="ee-body-params" style="margin-top:2px;"></div>
                        </div>

                        <div style="margin-top:auto; display:flex; gap:4px; padding-top:6px;">
                            <button onclick="window.saveEventEditor()" class="btn-violet" style="flex:1; padding:6px 0;">Сохранить</button>
                            <button onclick="window.cancelEventEditor()" class="btn-base" style="flex:1; padding:6px 0;">Отмена</button>
                        </div>
                    </div>

                    <!-- ПРАВАЯ ПАНЕЛЬ (ЛОГИКА) -->
                    <div style="flex:1; background:#fff; border:1px solid #D1D5DB; border-radius:3px; display:flex; flex-direction:column; overflow:hidden;">
                        <div style="background:#E5E7EB; padding:3px 6px; display:flex; justify-content:space-between; align-items:center; flex-shrink:0;">
                            <span style="font-size:11px; font-weight:bold;">Логика события</span>
                            <button onclick="window.addEventBlock()" class="btn-violet" style="padding:1px 8px; font-size:10px;">+ Блок</button>
                        </div>
                        <div id="ee-events-list" style="flex:1; padding:4px; overflow-y:auto; background:#F9FAFB;"></div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(eeDiv);

        // Динамические параметры для условий появления
        const condParams = document.getElementById('ee-cond-params');
        const condType = document.getElementById('ee-cond-type');
        function updateCondParams() {
            if (condType.value === 'SELF_A') condParams.innerHTML = `<select id="ee-cond-s-val-self" class="input-style" style="width:100%;"><option value="true">ВКЛ</option><option value="false">ВЫКЛ</option></select>`;
            else if (condType.value === 'SWITCH') condParams.innerHTML = `ID:<input type="number" id="ee-cond-s-id" value="1" min="1" style="width:40px;" class="input-style"> <select id="ee-cond-s-val" class="input-style"><option value="true">ВКЛ</option><option value="false">ВЫКЛ</option></select>`;
            else if (condType.value === 'VARIABLE') condParams.innerHTML = `ID:<input type="number" id="ee-cond-v-id" value="1" min="1" style="width:40px;" class="input-style"> <select id="ee-cond-v-op" class="input-style"><option value="==">==</option><option value=">">></option><option value="<"><</option><option value=">=">>=</option><option value="<="><=</option></select> <input type="number" id="ee-cond-v-val" value="0" style="width:40px;" class="input-style">`;
            else condParams.innerHTML = '';
        }
        condType.addEventListener('change', updateCondParams); updateCondParams();

        // Динамические параметры для тела (вертикальная версия)
        const bodyParams = document.getElementById('ee-body-params');
        const bodyType = document.getElementById('ee-body-type');
        function updateBodyParams() {
            if (bodyType.value === 'moving') {
                let enemyOpts = '<option value="0">-- Ручной --</option>';
                if ($dataEnemies) {
                    for (let i = 1; i < $dataEnemies.length; i++) {
                        if ($dataEnemies[i] && $dataEnemies[i].name.trim() !== "") enemyOpts += `<option value="${i}">${i}: ${$dataEnemies[i].name}</option>`;
                    }
                }
                bodyParams.innerHTML = `
                <div style="display:flex; gap:3px; align-items:center; flex-wrap:wrap;">
                    Враг:<select id="ee-enemy-id" style="flex:1; min-width:80px;" class="input-style">${enemyOpts}</select>
                </div>
                <div style="display:flex; gap:3px; margin-top:2px;">
                    <select id="ee-behavior" class="input-style" style="flex:1;"><option value="idle">Стоять</option><option value="random">Бродить</option><option value="chase">Гнаться</option></select>
                </div>
                <div style="display:flex; gap:3px; margin-top:2px; align-items:center;">
                    HP:<input type="number" id="ee-hp" value="100" style="width:35px;" class="input-style">
                    ATK:<input type="number" id="ee-atk" value="10" style="width:30px;" class="input-style">
                </div>
                <div style="display:flex; gap:3px; margin-top:2px; align-items:center;">
                    ATK Перем ID:<input type="number" id="ee-atk-var" value="0" min="0" style="width:30px;" class="input-style" title="0 = стат. ATK">
                </div>
                <div style="display:flex; gap:3px; margin-top:2px; align-items:center;">
                    Респаун (кадры):<input type="number" id="ee-respawn" value="0" min="0" style="width:40px;" class="input-style" title="0 = не воскрешать">
                </div>`;

                document.getElementById('ee-enemy-id').addEventListener('change', function() {
                    let eid = Number(this.value);
                    if (eid > 0 && $dataEnemies[eid]) {
                        document.getElementById('ee-hp').value = $dataEnemies[eid].params[0];
                        document.getElementById('ee-atk').value = $dataEnemies[eid].params[2];
                    }
                });
            }
            else bodyParams.innerHTML = '';
        }
        bodyType.addEventListener('change', updateBodyParams); updateBodyParams();
    }


    // ---------------------------------------------------------
    // МЕНЕДЖЕР UI ЭЛЕМЕНТОВ (Улучшенный UX)
    // ---------------------------------------------------------
    let placedUIElements = [];
    let selectedUIIndex = -1;

    function createUIManager() {
        const uiDiv = document.createElement('div');
        uiDiv.id = 'ui-manager';
        uiDiv.className = 'custom-menu-overlay'; // Переиспользуем класс оверлея
        
        uiDiv.innerHTML = `
            <div style="background: #F3F4F6; padding: 20px; border-radius: 4px; width: 800px; border: 1px solid #9CA3AF; height: 80vh; display: flex; flex-direction: column; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                    <h2 style="margin:0;">🖥️ Редактор UI (Интерфейс игры)</h2>
                    <button onclick="window.closeUIManager()" class="btn-danger" style="padding:5px 15px;">Закрыть</button>
                </div>
                
                <div style="display:flex; gap:15px; flex:1; overflow:hidden;">
                    <!-- ЛЕВАЯ КОЛОНКА -->
                    <div style="width:40%; background:#fff; border:1px solid #ccc; border-radius:4px; display:flex; flex-direction:column;">
                        <div style="background:#E5E7EB; padding:8px; font-weight:bold; display:flex; justify-content:space-between;">
                            <span>Элементы на экране</span>
                            <button onclick="window.addNewUIElement()" class="btn-violet" style="padding:2px 10px; font-size:11px;">+ Добавить</button>
                        </div>
                        <div id="ui-list-container" style="flex:1; overflow-y:auto; padding:5px;"></div>
                    </div>

                    <!-- ПРАВАЯ КОЛОНКА -->
                    <div id="ui-props-panel" style="width:60%; background:#fff; border:1px solid #ccc; border-radius:4px; padding:15px; display:flex; flex-direction:column; gap:10px;">
                        <h3 style="margin:0; color:#6B7280;">Выберите элемент слева для редактирования</h3>
                        
                        <div style="display:flex; gap:10px;">
                            <div style="flex:1;">
                                <label style="font-size:11px; font-weight:bold;">Тип элемента:</label><br>
                                <select id="up-type" style="width:100%;" class="input-style">
                                    <option value="text">📝 Текст (Значение переменной)</option>
                                    <option value="bar">📊 Полоса (Здоровье/Мана/Опыт)</option>
                                </select>
                            </div>
                            <div style="flex:1;">
                                <label style="font-size:11px; font-weight:bold;">Слой поверх других (Z-Index):</label><br>
                                <input type="number" id="up-z" value="15" style="width:100%;" class="input-style" title="Чем больше число, тем элемент рисуется выше остальных">
                            </div>
                        </div>

                        <div style="display:flex; gap:10px;">
                            <div style="flex:1;">
                                <label style="font-size:11px; font-weight:bold;">Позиция X (%):</label><br>
                                <input type="number" id="up-x" value="50" min="0" max="100" style="width:100%;" class="input-style">
                            </div>
                            <div style="flex:1;">
                                <label style="font-size:11px; font-weight:bold;">Позиция Y (%):</label><br>
                                <input type="number" id="up-y" value="50" min="0" max="100" style="width:100%;" class="input-style">
                            </div>
                        </div>

                        <div style="display:flex; gap:10px;">
                            <div style="flex:1;">
                                <label style="font-size:11px; font-weight:bold;">Ширина (px):</label><br>
                                <input type="number" id="up-w" value="200" style="width:100%;" class="input-style">
                            </div>
                            <div style="flex:1;">
                                <label style="font-size:11px; font-weight:bold;">Высота (px):</label><br>
                                <input type="number" id="up-h" value="30" style="width:100%;" class="input-style">
                            </div>
                        </div>

                        <!-- НАСТРОЙКИ ТЕКСТА -->
                        <div id="up-text-params" style="background:#FEF3C7; padding:10px; border-radius:3px;">
                            <label style="font-size:12px; font-weight:bold; color:#92400E;">Вывод текста на экран:</label><br>
                            <div style="display:flex; gap:5px; margin-top:5px; align-items:center;">
                                <input type="text" id="up-prefix" value="" placeholder="Текст до (напр. HP: )" style="flex:1;" class="input-style" title="Этот текст будет всегда перед значением">
                                <select id="up-var-id" style="flex:1;" class="input-style" title="Выберите переменную"></select>
                            </div>
                            <p style="font-size:10px; color:#92400E; margin:5px 0 0 0;">💡 Пример: Выбираете префикс "HP: " и "Игрок: Текущее HP". На экране будет: "HP: 50"</p>
                        </div>

                        <!-- НАСТРОЙКИ ПОЛОСЫ -->
                        <div id="up-bar-params" style="display:none; background:#D1FAE5; padding:10px; border-radius:3px;">
                            <label style="font-size:12px; font-weight:bold; color:#065F46;">Полоса прогресса / Здоровья:</label><br>
                            <div style="display:flex; gap:5px; margin-top:5px;">
                                <div style="flex:1;">
                                    <label style="font-size:10px;">Текущее значение:</label><br>
                                    <select id="up-bar-cur" style="width:100%;" class="input-style"></select>
                                </div>
                                <div style="flex:1;">
                                    <label style="font-size:10px;">Максимальное значение:</label><br>
                                    <select id="up-bar-max" style="width:100%;" class="input-style"></select>
                                </div>
                            </div>
                            <label style="font-size:10px; margin-top:8px; display:block;">Цвет полосы:</label>
                            <input type="color" id="up-bar-color" value="#4ade80" style="width:100%; height:30px; border:1px solid #ccc; border-radius:3px; cursor:pointer;">
                            <p style="font-size:10px; color:#065F46; margin:5px 0 0 0;">💡 Совет: Для HP выберите "Игрок: Текущее HP" и "Игрок: Макс. HP" — это не тратит переменные MZ!</p>
                        </div>

                        <div style="margin-top:auto; display:flex; gap:10px; justify-content:flex-end;">
                            <button onclick="window.deleteUIElement()" class="btn-danger" style="padding:6px 15px;">Удалить элемент</button>
                            <button onclick="window.applyUIChanges()" class="btn-violet" style="padding:6px 15px;">💾 Применить изменения</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(uiDiv);

        // Переключение вида Текст/Полоса
        document.getElementById('up-type').addEventListener('change', function() {
            document.getElementById('up-text-params').style.display = this.value === 'text' ? 'block' : 'none';
            document.getElementById('up-bar-params').style.display = this.value === 'bar' ? 'block' : 'none';
        });
    }

    window.openUIManager = function() {
        // --- ЗАПОЛНЯЕМ СПИСКИ ПЕРЕМЕННЫХ + СТАТУСЫ ИГРОКА ---
        let varOpts = '<option value="0">-- Не выбрано --</option>';
        // Добавляем статусы движка (чтобы не тратить переменные MZ)
        varOpts += '<option value="PLAYER_CUR_HP" style="color:#7C3AED; font-weight:bold;">Игрок: Текущее HP</option>';
        varOpts += '<option value="PLAYER_MAX_HP" style="color:#7C3AED; font-weight:bold;">Игрок: Макс. HP</option>';
        varOpts += '<option value="0" disabled>────── Переменные MZ ──────</option>';
        
        if ($dataSystem && $dataSystem.variables) {
            for (let i = 1; i < $dataSystem.variables.length; i++) {
                let name = $dataSystem.variables[i];
                // Показываем переменную, даже если у неё нет названия (чтобы не ломать UI)
                if (!name || name.trim() === "") name = `Переменная ${i}`;
                varOpts += `<option value="${i}">${i}: ${name}</option>`;
            }
        }
        document.getElementById('up-var-id').innerHTML = varOpts;
        document.getElementById('up-bar-cur').innerHTML = varOpts;
        document.getElementById('up-bar-max').innerHTML = varOpts;
        // -------------------------------------------------------

        refreshUIList();
        
        // Загружаем свойства только если выбран элемент
        if (selectedUIIndex >= 0 && placedUIElements[selectedUIIndex]) {
            loadUIProps(selectedUIIndex);
        }
        
        document.getElementById('ui-manager').style.display = 'flex';
    };
	
    window.closeUIManager = function() {
        document.getElementById('ui-manager').style.display = 'none';
    };

    function refreshUIList() {
        const container = document.getElementById('ui-list-container');
        container.innerHTML = '';
        placedUIElements.forEach((el, index) => {
            const btn = document.createElement('button');
            btn.style.cssText = `width:100%; padding:8px; margin-bottom:4px; text-align:left; background:${selectedUIIndex === index ? '#EDE9FE' : '#F3F4F6'}; border:1px solid #D1D5DB; border-radius:3px; cursor:pointer; font-size:12px;`;
            btn.innerText = `${el.type === 'text' ? '📝 Текст: '+el.prefix : '📊 Полоса'} (X:${el.x} Y:${el.y})`;
            btn.onclick = () => { selectedUIIndex = index; loadUIProps(index); refreshUIList(); };
            container.appendChild(btn);
        });
    }

    function loadUIProps(index) {
        const el = placedUIElements[index];
        if (!el) return;
        document.getElementById('up-type').value = el.type;
        document.getElementById('up-x').value = el.x;
        document.getElementById('up-y').value = el.y;
        document.getElementById('up-w').value = el.w;
        document.getElementById('up-h').value = el.h;
        document.getElementById('up-z').value = el.z || 15;
        
        if (el.type === 'text') {
            document.getElementById('up-prefix').value = el.prefix || "";
            // Безопасная установка значения (если NaN, вернет 0)
            document.getElementById('up-var-id').value = el.varId || 0;
        } else {
            document.getElementById('up-bar-cur').value = el.varIdCur || 0;
            document.getElementById('up-bar-max').value = el.varIdMax || 0;
            document.getElementById('up-bar-color').value = el.color || "#4ade80";
        }
        document.getElementById('up-type').dispatchEvent(new Event('change'));
    }

    window.addNewUIElement = function() {
        placedUIElements.push({ type: 'text', x: 50, y: 50, w: 200, h: 30, z: 15, prefix: 'Значение: ', varId: 1 });
        selectedUIIndex = placedUIElements.length - 1;
        renderSingleUIElement(placedUIElements[selectedUIIndex]);
        refreshUIList();
        loadUIProps(selectedUIIndex);
    };

    window.applyUIChanges = function() {
        if (selectedUIIndex < 0 || !placedUIElements[selectedUIIndex]) return;
        const el = placedUIElements[selectedUIIndex];
        
        el.type = document.getElementById('up-type').value;
        el.x = Number(document.getElementById('up-x').value);
        el.y = Number(document.getElementById('up-y').value);
        el.w = Number(document.getElementById('up-w').value);
        el.h = Number(document.getElementById('up-h').value);
        el.z = Number(document.getElementById('up-z').value);

        if (el.type === 'text') {
            el.prefix = document.getElementById('up-prefix').value;
            
            // Безопасное сохранение ID (Текст для HP, Число для переменных)
            let varVal = document.getElementById('up-var-id').value;
            if (varVal === "PLAYER_CUR_HP" || varVal === "PLAYER_MAX_HP") {
                el.varId = varVal; // Сохраняем как текст
            } else {
                el.varId = Number(varVal); // Сохраняем как число
            }
        } else {
            // Безопасное сохранение для полосы
            let curVal = document.getElementById('up-bar-cur').value;
            let maxVal = document.getElementById('up-bar-max').value;
            
            el.varIdCur = (curVal === "PLAYER_CUR_HP" || curVal === "PLAYER_MAX_HP") ? curVal : Number(curVal);
            el.varIdMax = (maxVal === "PLAYER_CUR_HP" || maxVal === "PLAYER_MAX_HP") ? maxVal : Number(maxVal);
            
            el.color = document.getElementById('up-bar-color').value;
        }

        renderSingleUIElement(el);
        refreshUIList();
    };

    window.deleteUIElement = function() {
        if (selectedUIIndex < 0) return;
        const el = placedUIElements[selectedUIIndex];
        if (el.domElement) el.domElement.remove(); // Удаляем со экрана
        placedUIElements.splice(selectedUIIndex, 1); // Удаляем из массива
        selectedUIIndex = -1;
        refreshUIList();
    };

    // Рендер одного элемента на экран
	function renderSingleUIElement(data) {
        if (data.domElement) data.domElement.remove();

        const el = document.createElement('div');
        el.className = 'dynamic-ui-element'; // Основной класс
        // Динамические стили (позиция и Z-слой) оставляем в JS
        el.style.left = `${data.x}%`; 
        el.style.top = `${data.y}%`; 
        el.style.zIndex = data.z || 15;

        if (data.type === 'text') {
            el.classList.add('dynamic-ui-text'); // Класс для текста
            el.innerHTML = `${data.prefix} 0`;
        } else if (data.type === 'bar') {
            el.classList.add('dynamic-ui-bar'); // Класс для полоски
            el.style.width = `${data.w}px`;
            el.style.height = `${data.h}px`;
            
            const fill = document.createElement('div');
            fill.className = 'dynamic-ui-bar-fill'; // Класс для заливки
            fill.style.background = data.color; // Динамический цвет
            el.appendChild(fill);
        }

        document.body.appendChild(el);
        data.domElement = el;
    }

    // Обновление данных каждую секунду (уже было, оставляем)
    function updateDynamicUI() {
        if (!$gameVariables) return;
        
        // Получаем текущее HP из боевки (безопасно)
        let currentHP = (window.Maker3D && window.Maker3D.getPlayerHP) ? window.Maker3D.getPlayerHP() : 0;
        let maxHP = (window.Maker3D && window.Maker3D.getPlayerMaxHP) ? window.Maker3D.getPlayerMaxHP() : 1;

        placedUIElements.forEach(data => {
            if (!data.domElement) return;
            if (data.type === 'text') {
                let val = 0;
                if (data.varId === 'PLAYER_CUR_HP') val = Math.floor(currentHP);
                else if (data.varId === 'PLAYER_MAX_HP') val = Math.floor(maxHP);
                else val = $gameVariables.value(Number(data.varId)) || 0;
                
                data.domElement.innerHTML = `${data.prefix} ${val}`;
            } else if (data.type === 'bar') {
                let cur = 0, max = 1;
                // Текущее значение
                if (data.varIdCur === 'PLAYER_CUR_HP') cur = Math.floor(currentHP);
                else cur = $gameVariables.value(Number(data.varIdCur)) || 0;
                // Максимальное значение
                if (data.varIdMax === 'PLAYER_MAX_HP') max = Math.floor(maxHP);
                else max = $gameVariables.value(Number(data.varIdMax)) || 1;

                let percent = Math.max(0, Math.min(100, (cur / max) * 100));
                let fill = data.domElement.querySelector('div');
                if (fill) fill.style.width = `${percent}%`;
            }
        });
    }


    // Функция отрисовки UI (работает и в редакторе, и в игре)
    function renderUIDynamic(data) {
        // Удаляем старый элемент с таким же индексом, если он есть
        if (data.domElement) data.domElement.remove();

        const el = document.createElement('div');
        el.className = 'dynamic-ui-element';
        el.style.cssText = `position: fixed; left: ${data.x}%; top: ${data.y}%; transform: translate(-50%, -50%); pointer-events: none; z-index: 15; font-family: Arial, sans-serif;`;

        if (data.type === 'text') {
            el.style.color = '#fff';
            el.style.textShadow = '1px 1px 2px #000';
            el.style.fontSize = '18px';
            el.style.fontWeight = 'bold';
            el.innerHTML = `${data.prefix} 0`;
        } else if (data.type === 'bar') {
            el.style.width = `${data.w}px`;
            el.style.height = `${data.h}px`;
            el.style.background = 'rgba(0,0,0,0.5)';
            el.style.border = '2px solid #fff';
            el.style.borderRadius = '3px';
            el.style.overflow = 'hidden';
            
            const fill = document.createElement('div');
            fill.style.cssText = `width: 100%; height: 100%; background: ${data.color}; transition: width 0.2s;`;
            el.appendChild(fill);
        }

        document.body.appendChild(el);
        data.domElement = el;
    }

    // Создание пустого блока (Условие + Действие)
  window.addEventBlock = function(data = {}) {
        const list = document.getElementById('ee-events-list');
        const block = document.createElement('div');
        block.className = 'event-block'; 
        block.style.cssText = `display:flex; border:1px solid #9CA3AF; border-radius:4px; background:#fff; overflow:hidden; margin-bottom: 10px;`;
        
        block.innerHTML = `
            <div style="width:25%; background:#E0F2FE; padding:10px; border-right:2px solid #93C5FD; display:flex; flex-direction:column; gap:6px; flex-shrink:0;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span style="font-size:11px; font-weight:bold; color:#0369A1;">ЕСЛИ (Условия)</span>
                    <button onclick="window.addCondition(this)" class="btn-base" style="padding:2px 6px; font-size:10px;">+ Усл.</button>
                </div>
                <div class="cond-list" style="display:flex; flex-direction:column; gap:5px;"></div>
            </div>
            <div style="flex:1; background:#F3F4F6; padding:10px; display:flex; flex-direction:column; gap:6px; min-width:0;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span style="font-size:11px; font-weight:bold; color:#6D28D9;">ТО (Действия)</span>
                    <div style="display:flex; gap:3px;">
                        <button onclick="window.moveBlock(this, -1)" class="btn-base" style="padding:2px 5px; font-size:10px;" title="Блок вверх">▲</button>
                        <button onclick="window.moveBlock(this, 1)" class="btn-base" style="padding:2px 5px; font-size:10px;" title="Блок вниз">▼</button>
                        <button onclick="this.closest('.event-block').remove()" class="btn-danger" style="padding:2px 8px; font-size:10px; font-weight:bold;">X</button>
                    </div>
                </div>
                <div class="act-list" style="flex:1; display:flex; flex-direction:column; gap:5px; min-height: 30px;"></div>
                <button onclick="window.addAction(this)" class="btn-violet" style="padding:3px 10px; font-size:10px; align-self:flex-start; margin-top:5px;">+ Действие</button>
            </div>
        `;
        list.appendChild(block);

        const condList = block.querySelector('.cond-list');
        const actList = block.querySelector('.act-list');
        if (data.conditions) data.conditions.forEach(c => window.addCondition(condList.previousElementSibling.querySelector('button'), c));
        if (data.actions) data.actions.forEach(a => window.addAction(actList.nextElementSibling, a));

        if (!data.actions || data.actions.length === 0) window.addAction(actList.nextElementSibling);
    };

    // Перемещение блока целиком
    window.moveBlock = function(btn, direction) {
        const block = btn.closest('.event-block'); // Ищем именно главный блок!
        if (!block) return;
        const parent = block.parentNode;
        if (direction === -1 && block.previousElementSibling) {
            parent.insertBefore(block, block.previousElementSibling);
        } else if (direction === 1 && block.nextElementSibling) {
            parent.insertBefore(block.nextElementSibling, block);
        }
    };

    // Добавление Условия (Голубое)
window.addCondition = function(btn, data = {}) {
        const condList = btn.parentElement.nextElementSibling;
        const div = document.createElement('div');
        div.style.cssText = `display:flex; gap:4px; align-items:center; flex-wrap:wrap; background:rgba(255,255,255,0.7); padding:6px; border-radius:4px; border:1px solid #BAE6FD;`;
        
        div.innerHTML = `
            <select class="c-type" class="block-select">
                <option value="switch" ${data.type==='switch'?'selected':''}>Переключатель</option>
                <option value="self_switch" ${data.type==='self_switch'?'selected':''}>Лок. переключатель</option>
                <option value="variable" ${data.type==='variable'?'selected':''}>Переменная</option>
            </select>
            ID:<input type="number" class="c-id" value="${data.id || 1}" min="1" style="width:45px;" class="block-input">
            <span class="c-sw-params"><select class="c-sw-val" class="block-select"><option value="true" ${data.val==='true'?'selected':''}>ВКЛ</option><option value="false" ${data.val==='false'?'selected':''}>ВЫКЛ</option></select></span>
            <span class="c-sw-self-params" style="display:none;">
                <select class="c-sw-self-val" class="block-select"><option value="true" ${data.val==='true'?'selected':''}>ВКЛ</option><option value="false" ${data.val==='false'?'selected':''}>ВЫКЛ</option></select>
            </span>
            <span class="c-var-params" style="display:none;">
                <select class="c-var-op" class="block-select">
                    <option value="==" ${data.op==='=='?'selected':''}>Равно (==)</option>
                    <option value=">" ${data.op==='>'?'selected':''}>Больше (>)</option>
                    <option value="<" ${data.op==='<'?'selected':''}>Меньше (<)</option>
                    <option value=">=" ${data.op==='>='?'selected':''}>Больше или равно (>=)</option>
                    <option value="<=" ${data.op==='<='?'selected':''}>Меньше или равно (<=)</option>
                </select>
                <input type="number" class="c-var-val" value="${data.valNum || 0}" style="width:50px;" class="block-input">
            </span>
            <button onclick="this.parentElement.remove()" class="block-del-btn">X</button>
        `;

        const typeSel = div.querySelector('.c-type');
        const swP = div.querySelector('.c-sw-params');
        const varP = div.querySelector('.c-var-params');
        function toggle() { 
            swP.style.display = typeSel.value === 'switch' ? 'inline' : 'none'; 
            varP.style.display = typeSel.value === 'variable' ? 'inline' : 'none'; 
            let selfP = div.querySelector('.c-sw-self-params');
            if (selfP) selfP.style.display = typeSel.value === 'self_switch' ? 'inline' : 'none';
        }
        typeSel.addEventListener('change', toggle); toggle();

        condList.appendChild(div);
    }
    // Перемещение действий Вверх/Вниз внутри блока
	window.moveAction = function(btn, direction) {
        const actionDiv = btn.closest('.action-row'); // Ищем именно блок действия!
        if (!actionDiv) return;
        
        const list = actionDiv.parentNode;
        
        if (direction === -1 && actionDiv.previousElementSibling) {
            list.insertBefore(actionDiv, actionDiv.previousElementSibling);
        } else if (direction === 1 && actionDiv.nextElementSibling) {
            list.insertBefore(actionDiv.nextElementSibling, actionDiv);
        }
    }
    // Добавление Действия (Цветное!)
   window.addAction = function(btn, data = {}) {
        const actList = btn.previousElementSibling;
        const div = document.createElement('div');
        div.className = 'action-row'; 
        div.style.cssText = `display:flex; gap:4px; align-items:center; flex-wrap:wrap; padding:6px; border-radius:4px; border:1px solid #D1D5DB; transition: background 0.2s;`;
        
        div.innerHTML = `
            <select class="a-type" class="block-select" style="font-weight:bold;">
                <option value="message" ${data.type==='message'?'selected':''}>💬 Сообщение</option>
                <option value="switch_on" ${data.type==='switch_on'?'selected':''}>🔵 Перекл. ВКЛ</option>
                <option value="switch_off" ${data.type==='switch_off'?'selected':''}>🔵 Перекл. ВЫКЛ</option>
                <option value="self_switch_on" ${data.type==='self_switch_on'?'selected':''}>🟣 Лок. свич ВКЛ</option>
                <option value="self_switch_off" ${data.type==='self_switch_off'?'selected':''}>🟣 Лок. свич ВЫКЛ</option>
                <option value="restore_hp" ${data.type==='restore_hp'?'selected':''}>💚 Восстановить HP события</option>
                <option value="execution_limit" ${data.type==='execution_limit'?'selected':''}>🔄 Лимит запусков</option>
                <option value="variable" ${data.type==='variable'?'selected':''}>🟢 Переменная</option>
                <option value="play_se" ${data.type==='play_se'?'selected':''}>🟠 Звук (SE)</option>
                <option value="wait" ${data.type==='wait'?'selected':''}>⏳ Ждать (Кадры)</option>
                <option value="common_event" ${data.type==='common_event'?'selected':''}>🌐 Общее событие (MZ)</option>
                <option value="script" ${data.type==='script'?'selected':''}>⬜ Скрипт</option>
            </select>
            <div class="a-params" style="flex:1; display:flex; gap:4px; align-items:center; flex-wrap:wrap;"></div>
            <div style="display:flex; gap:2px; margin-left:auto;">
                <button onclick="window.moveAction(this, -1)" class="btn-base" style="padding:2px 4px; font-size:10px;">▲</button>
                <button onclick="window.moveAction(this, 1)" class="btn-base" style="padding:2px 4px; font-size:10px;">▼</button>
                <button onclick="this.parentElement.parentElement.remove()" class="block-del-btn">X</button>
            </div>
        `;

        const typeSel = div.querySelector('.a-type');
        const paramsDiv = div.querySelector('.a-params');
        
        const colors = {
            message: '#FEF3C7', switch_on: '#DBEAFE', switch_off: '#DBEAFE',
            self_switch_on: '#E0E7FF', self_switch_off: '#E0E7FF', 
            restore_hp: '#D1FAE5',
            execution_limit: '#FCE7F3', variable: '#D1FAE5', play_se: '#FFEDD5', 
            wait: '#ECFDF5', common_event: '#EDE9FE', script: '#F3F4F6'
        };

        function updateParams() {
            const t = typeSel.value;
            div.style.backgroundColor = colors[t] || '#FFFFFF';

            if (t === 'message') {
                paramsDiv.innerHTML = `<input type="text" class="a-msg" value="${data.text || ''}" placeholder="Текст сообщения..." style="flex:1; min-width: 100px;" class="block-input">`;
            }
            else if (t === 'script') {
                paramsDiv.innerHTML = `<input type="text" class="a-code" value="${data.code || ''}" placeholder="Код на JavaScript..." style="flex:1; min-width: 150px; font-family: monospace;" class="block-input">`;
            }
            else if (t === 'switch_on' || t === 'switch_off') {
                paramsDiv.innerHTML = `ID:<input type="number" class="a-id" value="${data.id || 1}" style="width:50px;" class="block-input">`;
            }
            else if (t === 'self_switch_on' || t === 'self_switch_off') {
                paramsDiv.innerHTML = `<span style="font-size:12px; color:#4B5563;">Локальный переключатель A</span>`;
            }
            else if (t === 'execution_limit') {
                paramsDiv.innerHTML = `Макс. раз:<input type="number" class="a-limit" value="${data.limit || 1}" min="1" style="width:50px;" class="block-input" title="Событие отключится после N запусков">`;
            }
            else if (t === 'variable') {
                paramsDiv.innerHTML = `
                    <select class="a-var-op" class="block-select"><option value="=">Установить (=)</option><option value="+">Прибавить (+)</option><option value="-">Отнять (-)</option><option value="*">Умножить (*)</option><option value="/">Разделить (/)</option></select>
                    ID:<input type="number" class="a-id" value="${data.id || 1}" style="width:45px;" class="block-input">
                    Знач:<input type="number" class="a-val" value="${data.value || 0}" style="width:55px;" class="block-input">
                `;
                if (data.op) paramsDiv.querySelector('.a-var-op').value = data.op;
            }
            else if (t === 'play_se') {
                paramsDiv.innerHTML = `Файл:<input type="text" class="a-snd" value="${data.name || ''}" placeholder="name.mp3" style="width:100px;" class="block-input"> Vol:<input type="number" class="a-vol" value="${data.vol || 90}" style="width:40px;" class="block-input">`;
            }
            else if (t === 'wait') {
                paramsDiv.innerHTML = `Кадров:<input type="number" class="a-frames" value="${data.frames || 60}" style="width:60px;" class="block-input" title="60 кадров = 1 секунда">`;
            }
            else if (t === 'common_event') {
                let ceOpts = '<option value="0">-- Не выбрано --</option>';
                if ($dataCommonEvents) {
                    for (let i = 1; i < $dataCommonEvents.length; i++) {
                        let ce = $dataCommonEvents[i];
                        if (ce && ce.name.trim() !== "") ceOpts += `<option value="${ce.id}">${ce.id}: ${ce.name}</option>`;
                    }
                }
                paramsDiv.innerHTML = `<select class="a-ce-id" class="block-select">${ceOpts}</select>`;
                if (data.ceId) paramsDiv.querySelector('.a-ce-id').value = data.ceId;
            }
        }
        typeSel.addEventListener('change', updateParams); updateParams();

        actList.appendChild(div);
    }

    // ---------------------------------------------------------
    // ЛОГИКА РЕДАКТОРА СОБЫТИЙ И КОНТЕКСТНОГО МЕНЮ
    // ---------------------------------------------------------
    window.exportLevelToMap = function() {
        const exportData = {
            // Сохраняем объекты
            objects: placedObjects.map(obj => ({ 
                type: obj.type, gridX: obj.gridX, gridY: obj.gridY, gridZ: obj.gridZ, gridRot: obj.gridRot || 0, 
                sizeX: obj.sizeX || 1, sizeY: obj.sizeY || 1, sizeZ: obj.sizeZ || 1, color: obj.color || '#ffffff',
                texturePath: obj.texturePath || "", 
                condition: obj.condition || "ALWAYS", 
                events: obj.events || [],
                selfSwitchA: obj.selfSwitchA || false,
                triggerType: obj.triggerType || 'interact', modelPath: obj.modelPath || '',
                bodyType: obj.bodyType || 'static', behavior: obj.behavior || 'idle',
                hp: obj.hp || 0, maxHp: obj.maxHp || 0, atk: obj.atk || 0, 
                enemyId: obj.enemyId || 0, atkVarId: obj.atkVarId || 0, respawnTime: obj.respawnTime || 0 // НОВЫЕ ПОЛЯ!
            })),
              spawn: spawnPoint,
            // --- СОХРАНЕНИЕ UI ---
            ui: placedUIElements.map(el => ({
                type: el.type, x: el.x, y: el.y, w: el.w, h: el.h, z: el.z || 15,
                prefix: el.prefix || "", varId: el.varId || 0,
                varIdCur: el.varIdCur || 0, varIdMax: el.varIdMax || 0,
                color: el.color || "#4ade80"
            }))
            // --------------------
        };
        
        const dataStr = JSON.stringify(exportData);
        const tag = `<My3DLevel>${dataStr}</My3DLevel>`;
        
        navigator.clipboard.writeText(tag).then(() => {
            alert("Данные уровня (включая текстуры и точку спавна) скопированы!\n\n1. Открой RPG Maker MZ\n2. Настройки карты\n3. Вставь в поле 'Note'\n4. Сохрани проект.");
        }).catch(err => {
            prompt("Скопируй вручную:", tag);
        });
    };

    function loadLevelFromRMMZ() { 
        let data = null;
        
        // 1. Проверяем Note карты (приоритет для Новой Игры)
        if ($dataMap && $dataMap.note) {
            const match = $dataMap.note.match(/<My3DLevel>([\s\S]*?)<\/My3DLevel>/);
            if (match) {
                try { 
                    data = JSON.parse(match[1]); 
                    // Совместимость со старым форматом
                    if (Array.isArray(data)) data = { objects: data, spawn: null };
                } catch(e) { console.error("Ошибка парсинга Note карты", e); }
            }
        }
        
        // 2. Если в Note пусто, пробуем загрузить из сохранения
        if (!data && $gameSystem && $gameSystem._myIsoLevelData) {
            data = { 
                objects: $gameSystem._myIsoLevelData, 
                spawn: $gameSystem._my3dSpawn || null 
            };
        }

        // 3. Применяем данные 3D объектов
        if (data && data.objects) {
            // Умная установка спавна: Из карты -> Из сохранения -> Дефолт
            if (data.spawn) spawnPoint = data.spawn;
            else if ($gameSystem && $gameSystem._my3dSpawn) spawnPoint = $gameSystem._my3dSpawn;
            else spawnPoint = { x: 0.5, z: 0.5, y: 0.5 };
            
            rebuildLevel(data.objects); 

            // --- ЗАГРУЗКА UI ИЗ КАРТЫ ---
            if (data.ui) {
                rebuildUI(data.ui);
            } else {
                rebuildUI(null); // Если в заметках карты UI нет - очищаем
            }
            // ----------------------------
        } 
        // Если данных с карты нет, пробуем загрузить из сохранения (только UI)
        else if ($gameSystem && $gameSystem._myIsoLevelData) {
            // Объекты уже загрузятся через стандартный поток, а вот UI надо дернуть отдельно
            if ($gameSystem._myIsoUIData) {
                rebuildUI($gameSystem._myIsoUIData);
            } else {
                rebuildUI(null);
            }
        }
    }
    
	    let highlightedObj = null;

    function highlightObject(obj) {
        unhighlightObject(); // Снимаем старую подсветку
        if (obj && obj.mesh && obj.mesh.material) {
            // Запоминаем оригинальный цвет свечения (обычно 0)
            obj.mesh.material._origEmissive = obj.mesh.material.emissive.getHex(); 
            obj.mesh.material.emissive.setHex(0x333333); // Подсветка серым
            highlightedObj = obj;
        }
    }

    function unhighlightObject() {
        if (highlightedObj && highlightedObj.mesh && highlightedObj.mesh.material) {
            // Возвращаем как было
            highlightedObj.mesh.material.emissive.setHex(highlightedObj.mesh.material._origEmissive || 0x000000);
            highlightedObj = null;
        }
    }
	
    function showContextMenu(obj, x, y) {
        contextTargetObj = obj;
        highlightObject(obj); // Включаем подсветку!
        const menu = document.getElementById('context-menu');
        menu.style.left = x + 'px';
        menu.style.top = y + 'px';
        menu.style.display = 'block';
    }

    function hideContextMenu() {
        unhighlightObject(); // Убираем подсветку!
        document.getElementById('context-menu').style.display = 'none';
        document.getElementById('texture-menu').style.display = 'none'; // Прячем меню текстур
        contextTargetObj = null;
    }
	
    window.ctxEdit = function() { if (contextTargetObj) window.openEventEditor(contextTargetObj); hideContextMenu(); };
    window.ctxMove = function() {
        if (contextTargetObj) {
            heldObject = contextTargetObj; heldObject.mesh.visible = false;
            
            // БЕЗОПАСНОЕ ПЕРЕМЕЩЕНИЕ: Создаем полупрозрачную рамку вместо клонирования!
            // Это навсегда избавляет от ошибки Maximum call stack size exceeded
            const geo = new THREE.BoxGeometry(heldObject.sizeX || 1, heldObject.sizeY || 1, heldObject.sizeZ || 1);
            const mat = new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.4, wireframe: true });
            moveGhostMesh = new THREE.Mesh(geo, mat);
            
            // Копируем позицию и поворот от оригинала
            moveGhostMesh.position.copy(heldObject.mesh.position);
            moveGhostMesh.rotation.copy(heldObject.mesh.rotation);
            
            threeScene.add(moveGhostMesh); 
            currentTool = 'move'; 
            document.getElementById('editor-status').innerText = `Инструмент: Перемещение`;
        }
        hideContextMenu();
    };
	
    window.ctxDelete = function() { if (contextTargetObj) { threeScene.remove(contextTargetObj.mesh); placedObjects = placedObjects.filter(o => o !== contextTargetObj); undoStack.push({ type: 'erase', data: contextTargetObj }); } hideContextMenu(); };

    window.openEventEditor = function(obj) {
        isEventEditorOpen = true; currentEditingObj = obj; isNewEvent = !obj || !obj.mesh;
        
        // Базовые настройки
        document.getElementById('ee-trigger-type').value = (obj && obj.triggerType) ? obj.triggerType : 'interact';
        const modelSelect = document.getElementById('ee-model-path');
        let path = (obj && obj.modelPath) ? obj.modelPath : '';
        let optionExists = false;
        for(let i=0; i<modelSelect.options.length; i++) { if(modelSelect.options[i].value === path) { modelSelect.selectedIndex = i; optionExists = true; break; } }
        if(!optionExists) modelSelect.selectedIndex = 0;

        // Условия появления
        const condType = document.getElementById('ee-cond-type');
        if (obj && obj.condition && obj.condition !== 'ALWAYS') {
            if (obj.condition.startsWith('SELF_A')) condType.value = "SELF_A";
            else if (obj.condition.startsWith('S')) condType.value = "SWITCH";
            else if (obj.condition.startsWith('V')) condType.value = "VARIABLE";
        } else {
            condType.value = "ALWAYS";
        }
        condType.dispatchEvent(new Event('change'));

        setTimeout(() => {
            if (obj && obj.condition && obj.condition !== 'ALWAYS') {
                if (obj.condition.startsWith('SELF_A')) { let m = obj.condition.match(/^SELF_A=(true|false)$/i); let el = document.getElementById('ee-cond-s-val-self'); if(m && el) el.value = m[1]; }
                else if (obj.condition.startsWith('S')) { let m = obj.condition.match(/^S(\d+)=?(true|false)$/i); let elId = document.getElementById('ee-cond-s-id'); let elVal = document.getElementById('ee-cond-s-val'); if(m && elId && elVal) { elId.value = m[1]; elVal.value = m[2]; } }
                else if (obj.condition.startsWith('V')) { let m = obj.condition.match(/^V(\d+)(==|>=|<=|>|<)(\-?\d+)$/); let elId = document.getElementById('ee-cond-v-id'); let elOp = document.getElementById('ee-cond-v-op'); let elVal = document.getElementById('ee-cond-v-val'); if(m && elId && elOp && elVal) { elId.value = m[1]; elOp.value = m[2]; elVal.value = m[3]; } }
            }
        }, 0);

        // Тело и Поведение
        const bodyType = document.getElementById('ee-body-type');
        bodyType.value = (obj && obj.bodyType) ? obj.bodyType : 'static';
        bodyType.dispatchEvent(new Event('change'));

        setTimeout(() => {
            if (obj && obj.bodyType === 'moving') {
                let elBeh = document.getElementById('ee-behavior');
                let elHp = document.getElementById('ee-hp');
                let elAtk = document.getElementById('ee-atk');
                let elAtkVar = document.getElementById('ee-atk-var');
				let elEnemyId = document.getElementById('ee-enemy-id');
                if(elEnemyId) elEnemyId.value = obj.enemyId || 0; // ЗАГРУЗКА ID ВРАГА
                if(elBeh) elBeh.value = obj.behavior || 'idle';
				let elRespawn = document.getElementById('ee-respawn');
                if(elRespawn) elRespawn.value = obj.respawnTime || 0; // ЗАГРУЗКА РЕСПАУНА
                if(elHp) elHp.value = obj.maxHp || 100;
                if(elAtk) elAtk.value = obj.atk || 10;
                if(elAtkVar) elAtkVar.value = obj.atkVarId || 0; // Загружаем ID переменной
            }
        }, 0);

        // --- ЗАГРУЗКА БЛОКОВ ЛОГИКИ ---
        const eventsList = document.getElementById('ee-events-list'); // ИСПРАВЛЕННЫЙ ID
        eventsList.innerHTML = ''; // Очищаем список
        
        // Если у объекта уже есть блоки - загружаем их
        if (obj && obj.events && obj.events.length > 0) {
            obj.events.forEach(evData => window.addEventBlock(evData));
        } else if (isNewEvent) {
            // Если событие новое - добавляем один пустой блок
            window.addEventBlock();
        }

        document.getElementById('event-editor').style.display = 'flex';
    };

    window.saveEventEditor = function() {
        let triggerType = document.getElementById('ee-trigger-type').value;
        let modelPath = document.getElementById('ee-model-path').value;
        let condType = document.getElementById('ee-cond-type').value; let condition = "ALWAYS";
        if (condType === 'SELF_A') condition = `SELF_A=${document.getElementById('ee-cond-s-val-self').value}`;
        else if (condType === 'SWITCH') condition = `S${document.getElementById('ee-cond-s-id').value}=${document.getElementById('ee-cond-s-val').value}`; 
        else if (condType === 'VARIABLE') condition = `V${document.getElementById('ee-cond-v-id').value}${document.getElementById('ee-cond-v-op').value}${document.getElementById('ee-cond-v-val').value}`;
        
        let events = [];
        document.querySelectorAll('#ee-events-list > div').forEach(block => {
            let blockData = { conditions: [], actions: [] };
            
            // Собираем условия
            block.querySelectorAll('.cond-list > div').forEach(cond => {
                let cType = cond.querySelector('.c-type').value;
                let cData = { type: cType, id: Number(cond.querySelector('.c-id').value) };
                if (cType === 'switch') cData.val = cond.querySelector('.c-sw-val').value;
                else if (cType === 'variable') {
                    cData.op = cond.querySelector('.c-var-op').value;
                    cData.valNum = Number(cond.querySelector('.c-var-val').value);
                }
                blockData.conditions.push(cData);
            });

            // Собираем действия
            block.querySelectorAll('.act-list > div').forEach(act => {
                let aType = act.querySelector('.a-type').value;
                let aData = { type: aType };
                if (aType === 'message') aData.text = act.querySelector('.a-msg') ? act.querySelector('.a-msg').value : '';
                else if (aType === 'switch_on' || aType === 'switch_off') aData.id = Number(act.querySelector('.a-id') ? act.querySelector('.a-id').value : 1);
                else if (aType === 'self_switch_on' || aType === 'self_switch_off') { /* Нет доп. данных */ }
                else if (aType === 'execution_limit') aData.limit = Number(act.querySelector('.a-limit') ? act.querySelector('.a-limit').value : 1);
                else if (aType === 'restore_hp') { /* Нет доп. данных */ }
                else if (aType === 'variable') {
                    aData.op = act.querySelector('.a-var-op') ? act.querySelector('.a-var-op').value : '=';
                    aData.id = Number(act.querySelector('.a-id') ? act.querySelector('.a-id').value : 1);
                    aData.value = Number(act.querySelector('.a-val') ? act.querySelector('.a-val').value : 0);
                    aData.source = 'const';
                }
                else if (aType === 'play_se') aData.name = act.querySelector('.a-snd') ? act.querySelector('.a-snd').value : '';
                else if (aType === 'wait') aData.frames = Number(act.querySelector('.a-frames') ? act.querySelector('.a-frames').value : 60);
                else if (aType === 'common_event') aData.ceId = Number(act.querySelector('.a-ce-id') ? act.querySelector('.a-ce-id').value : 0);
                else if (aType === 'script') aData.code = act.querySelector('.a-code') ? act.querySelector('.a-code').value : '';
                blockData.actions.push(aData);
            });

            events.push(blockData);
        });

        // --- СЧИТЫВАНИЕ ПАРАМЕТРОВ ТЕЛА ---
        let bodyType = document.getElementById('ee-body-type').value;
        let behavior = bodyType === 'moving' ? (document.getElementById('ee-behavior') ? document.getElementById('ee-behavior').value : 'idle') : 'idle';
        let enemyId = bodyType === 'moving' ? (Number(document.getElementById('ee-enemy-id') ? document.getElementById('ee-enemy-id').value : 0) || 0) : 0;
        let hp = bodyType === 'moving' ? (Number(document.getElementById('ee-hp') ? document.getElementById('ee-hp').value : 100) || 100) : 0;
        let atk = bodyType === 'moving' ? (Number(document.getElementById('ee-atk') ? document.getElementById('ee-atk').value : 10) || 10) : 0;
        let atkVarId = bodyType === 'moving' ? (Number(document.getElementById('ee-atk-var') ? document.getElementById('ee-atk-var').value : 0) || 0) : 0;
        let respawnTime = bodyType === 'moving' ? (Number(document.getElementById('ee-respawn') ? document.getElementById('ee-respawn').value : 0) || 0) : 0; // НОВОЕ
        // -----------------------------------

        // --- СОХРАНЕНИЕ ДАННЫХ В ОБЪЕКТ ---
        if (isNewEvent) {
            currentEditingObj.triggerType = triggerType; 
            currentEditingObj.modelPath = modelPath; 
            currentEditingObj.condition = condition;
            currentEditingObj.events = events; 
            currentEditingObj.bodyType = bodyType;
            currentEditingObj.behavior = behavior;
			currentEditingObj.enemyId = enemyId; // СОХРАНЯЕМ ID ВРАГА
            currentEditingObj.hp = hp;
            currentEditingObj.maxHp = hp;
            currentEditingObj.atk = atk;
            currentEditingObj.atkVarId = atkVarId; 
            currentEditingObj.respawnTime = respawnTime; // СОХРАНЕНИЕ РЕСПАУНА
            
            createEventMesh(currentEditingObj); placedObjects.push(currentEditingObj); undoStack.push({ type: 'add', data: currentEditingObj });
        } else { 
            currentEditingObj.triggerType = triggerType; 
            currentEditingObj.modelPath = modelPath; 
            currentEditingObj.condition = condition; 
            currentEditingObj.events = events; 
            currentEditingObj.bodyType = bodyType;
            currentEditingObj.behavior = behavior;
			currentEditingObj.enemyId = enemyId; // СОХРАНЯЕМ ID ВРАГА
            currentEditingObj.hp = hp;
            currentEditingObj.maxHp = hp;
            currentEditingObj.atk = atk;
            currentEditingObj.atkVarId = atkVarId; 
            currentEditingObj.respawnTime = respawnTime; // СОХРАНЕНИЕ РЕСПАУНА
            
            threeScene.remove(currentEditingObj.mesh); createEventMesh(currentEditingObj);
        }
        
        isEventEditorOpen = false; document.getElementById('event-editor').style.display = 'none'; currentEditingObj = null;
    };

    function createEventMesh(obj) {
        const tempMat = new THREE.MeshPhongMaterial({color: 0xffaa00, transparent: true, opacity: 0.8});
        const tempMesh = new THREE.Mesh(new THREE.BoxGeometry(0.5,0.5,0.5), tempMat);
        tempMesh.position.set(obj.gridX, obj.gridY + 0.5, obj.gridZ); threeScene.add(tempMesh); obj.mesh = tempMesh;
        tempMesh.userData.placedObj = obj; // Метка для ПКМ

        if (obj.modelPath && THREE.GLTFLoader) {
            const loader = new THREE.GLTFLoader();
            loader.load(obj.modelPath, (gltf) => { 
                const model = gltf.scene; model.position.set(obj.gridX, obj.gridY, obj.gridZ); model.scale.set(0.5, 0.5, 0.5); threeScene.remove(obj.mesh); threeScene.add(model); obj.mesh = model; 
                model.userData.placedObj = obj; // Метка для ПКМ (на загруженную модель)
            }, undefined, (error) => { console.error("Ошибка загрузки модели:", error); });
        } else { createDefaultEventMesh(obj); }
    }

    function createDefaultEventMesh(obj) {
        if (obj.mesh) threeScene.remove(obj.mesh); let mesh;
        if (obj.triggerType === 'step') { const geo = new THREE.CircleGeometry(0.5, 16); geo.rotateX(-Math.PI / 2); const mat = new THREE.MeshPhongMaterial({ color: 0x00ff00, transparent: true, opacity: 0.3, depthWrite: false }); mesh = new THREE.Mesh(geo, mat); mesh.position.set(obj.gridX, obj.gridY + 0.01, obj.gridZ); } 
        else { mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 1, 8), new THREE.MeshPhongMaterial({ color: 0xff3333, flatShading: true })); mesh.position.set(obj.gridX, obj.gridY + 0.5, obj.gridZ); }
        threeScene.add(mesh); obj.mesh = mesh;
        mesh.userData.placedObj = obj; // Метка для ПКМ
    }

    window.cancelEventEditor = function() { if (isNewEvent && currentEditingObj && currentEditingObj.mesh) { threeScene.remove(currentEditingObj.mesh); } isEventEditorOpen = false; document.getElementById('event-editor').style.display = 'none'; currentEditingObj = null; };

    // ---------------------------------------------------------
    // РЕДАКТИРОВАНИЕ РАЗМЕРОВ И ТЕКСТУР
    // ---------------------------------------------------------
    window.ctxEditSize = function() {
        if (!contextTargetObj || contextTargetObj.type === 'event') { alert("События редактируются через ✏️ Редактировать"); hideContextMenu(); return; }
        let newX = prompt("Ширина (X):", contextTargetObj.sizeX || 1);
        let newY = prompt("Высота (Y):", contextTargetObj.sizeY || 1);
        let newZ = prompt("Глубина (Z):", contextTargetObj.sizeZ || 1);
        let newColor = prompt("Цвет (HEX, например #3388ff):", contextTargetObj.color || "#3388ff");
        if (newX === null || newY === null || newZ === null || newColor === null) { hideContextMenu(); return; }
        
        contextTargetObj.sizeX = Math.max(0.1, Number(newX) || 1);
        contextTargetObj.sizeY = Math.max(0.1, Number(newY) || 1);
        contextTargetObj.sizeZ = Math.max(0.1, Number(newZ) || 1);
        contextTargetObj.color = newColor;

        threeScene.remove(contextTargetObj.mesh);
        let geo, mat;
        if (contextTargetObj.type === 'water') {
            geo = new THREE.PlaneGeometry(contextTargetObj.sizeX, contextTargetObj.sizeZ, 32, 32);
            mat = createWaterMaterial(contextTargetObj.sizeX, contextTargetObj.sizeZ, contextTargetObj.color);
            contextTargetObj.mesh = new THREE.Mesh(geo, mat);
            contextTargetObj.mesh.rotation.x = -Math.PI / 2;
            contextTargetObj.mesh.position.set(contextTargetObj.gridX, contextTargetObj.gridY + contextTargetObj.sizeY / 2, contextTargetObj.gridZ);
        } else if (contextTargetObj.type === 'stairs') {
            geo = createStairsGeometry();
            mat = new THREE.MeshPhongMaterial({ color: contextTargetObj.color, flatShading: true });
            contextTargetObj.mesh = new THREE.Mesh(geo, mat);
            contextTargetObj.mesh.position.set(contextTargetObj.gridX, contextTargetObj.gridY, contextTargetObj.gridZ);
            contextTargetObj.mesh.rotation.y = THREE.MathUtils.degToRad(contextTargetObj.gridRot || 0);
        } else { // Куб
            geo = new THREE.BoxGeometry(contextTargetObj.sizeX, contextTargetObj.sizeY, contextTargetObj.sizeZ);
            mat = new THREE.MeshPhongMaterial({ color: contextTargetObj.color, flatShading: true });
            contextTargetObj.mesh = new THREE.Mesh(geo, mat);
            contextTargetObj.mesh.position.set(contextTargetObj.gridX, contextTargetObj.gridY + contextTargetObj.sizeY/2, contextTargetObj.gridZ);
        }
        
        // ВАЖНО: Возвращаем метку для ПКМ на новый меш ЛЮБОГО типа!
        contextTargetObj.mesh.userData.placedObj = contextTargetObj;

        // Возвращаем текстуру, если она была
        if (contextTargetObj.texturePath && contextTargetObj.type !== 'water') {
            applyTextureToObject(contextTargetObj);
        }

        threeScene.add(contextTargetObj.mesh);
        
        // Обновляем подсветку на новый меш
        highlightObject(contextTargetObj);
        hideContextMenu();
    };

    window.ctxAddTexture = function() {
        if (!contextTargetObj || contextTargetObj.type === 'water') { alert("Текстура воды управляется цветом."); hideContextMenu(); return; }
        if (contextTargetObj.type === 'event') { alert("Для событий используйте 3D модели."); hideContextMenu(); return; }
        
        // Позиционируем меню текстур рядом с основным меню
        const menu = document.getElementById('texture-menu');
        const mainMenu = document.getElementById('context-menu');
        menu.style.left = (parseInt(mainMenu.style.left) + 150) + 'px';
        menu.style.top = mainMenu.style.top;
        menu.style.display = 'block';
    };

    window.selectTexture = function(path) {
        contextTargetObj.texturePath = path;
        if (path === "") {
            if (contextTargetObj.mesh.material.map) {
                contextTargetObj.mesh.material.map.dispose();
                contextTargetObj.mesh.material.map = null;
                contextTargetObj.mesh.material.needsUpdate = true;
            }
        } else {
            applyTextureToObject(contextTargetObj);
        }
        hideContextMenu();
    };

    function applyTextureToObject(obj) {
        if (!obj.mesh) return;
        const loader = new THREE.TextureLoader();
        loader.load(obj.texturePath, (tex) => {
            tex.wrapS = THREE.RepeatWrapping;
            tex.wrapT = THREE.RepeatWrapping;
            // Повторяем текстуру в зависимости от размера объекта
            tex.repeat.set(obj.sizeX || 1, obj.sizeY || 1);
            if (obj.mesh.material.map) obj.mesh.material.map.dispose();
            obj.mesh.material.map = tex;
            obj.mesh.material.needsUpdate = true;
        }, undefined, () => { alert("Ошибка загрузки текстуры! Проверьте путь."); });
    }
    // ---------------------------------------------------------
    // ОСТАЛЬНАЯ ЛОГИКА
    // ---------------------------------------------------------
    window.openCustomMenu = function() { document.getElementById('custom-menu').style.display = 'flex'; };
    window.closeCustomMenu = function() { document.getElementById('custom-menu').style.display = 'none'; };
    window.customSave = function(id) { $gameSystem.onBeforeSave(); DataManager.saveGame(id) ? alert("Сохранено!") : alert("Ошибка!"); window.closeCustomMenu(); };
    window.customLoad = function(id) { if(DataManager.loadGame(id)) SceneManager.goto(Scene_Map); else alert("Слот пуст!"); window.closeCustomMenu(); };

    window.openDialogue = function(text, eventObj) { isDialogueActive = true; activeEventObj = eventObj; document.exitPointerLock(); document.getElementById('dlg-text').innerText = text; document.getElementById('dialogue-box').style.display = 'block'; };
    window.closeDialogue = function() { 
        isDialogueActive = false; 
        document.getElementById('dialogue-box').style.display = 'none'; 
        
        if (activeEventObj) {
            activeEventObj.isDialogueBlocking = false;
            
            // Если это обычное событие - продолжаем с микро-задержкой (чтобы не сломать цепочку сообщений)
            if (activeEventObj.triggerType !== 'parallel') {
                const objToResume = activeEventObj;
                setTimeout(() => { executeEvents(objToResume); }, 50); // Задержка 50мс
            }
        } 
        activeEventObj = null; 
        
        if (!isEditorMode) threeRenderer.domElement.requestPointerLock(); 
    };

    window.editorSetTool = function(tool) { if (heldObject) return; currentTool = tool; document.getElementById('editor-status').innerText = `Инструмент: ${tool === 'event' ? 'Событие / Выбор' : tool === 'none' ? 'Нет' : tool}`; updateCursorColor(); updatePreviewMesh(); };
    window.editorFloorUp = function() { currentFloor++; updateFloorVisuals(); };
    window.editorFloorDown = function() { if (currentFloor > 0) currentFloor--; updateFloorVisuals(); };
    window.editorRotate = function() { if (currentTool === 'cube') { let tempX = cubeSizeX; cubeSizeX = cubeSizeZ; cubeSizeZ = tempX; document.getElementById('cube-sx').value = cubeSizeX; document.getElementById('cube-sz').value = cubeSizeZ; updatePreviewMesh(); } else { currentRotation = (currentRotation + 90) % 360; if (previewMesh) previewMesh.rotation.y = THREE.MathUtils.degToRad(currentRotation); } };
    window.setCameraPreset = function(preset) { if (preset === 'iso') { camTheta = Math.PI / 4; camPhi = Math.PI / 4; camRadius = 15; } else if (preset === 'top') { camTheta = 0.1; camPhi = 0; camRadius = 20; } else if (preset === '3rd') { camTheta = 1.2; camPhi = Math.PI; camRadius = 6; } };

    function updateFloorVisuals() { document.getElementById('floor-num').innerText = currentFloor; gridHelper.position.y = currentFloor; floorPlane.constant = -currentFloor; if (previewMesh) previewMesh.position.y = currentFloor + (cubeSizeY/2); }
    window.editorUndo = function() { if (undoStack.length === 0) return; const action = undoStack.pop(); if (action.type === 'add') { threeScene.remove(action.data.mesh); placedObjects = placedObjects.filter(o => o !== action.data); } else if (action.type === 'erase') { threeScene.add(action.data.mesh); placedObjects.push(action.data); } };

    window.editorTestLevel = function() {
       document.getElementById('crosshair').style.display = 'block'; // Показываем прицел
		
        isEditorMode = false; document.getElementById('editor-ui').style.display = 'none'; document.getElementById('play-ui').style.display = 'block';
        if (!playerMesh) { const geo = new THREE.ConeGeometry(0.4, 1, 5); const mat = new THREE.MeshPhongMaterial({ color: 0x00ff88, flatShading: true }); playerMesh = new THREE.Mesh(geo, mat); threeScene.add(playerMesh); }
        playerMesh.visible = true; playerX = spawnPoint.x; playerZ = spawnPoint.z; playerY = spawnPoint.y; targetPlayerY = spawnPoint.y; playerVelocityY = 0;
        playerMesh.position.set(playerX, playerY, playerZ); cursorGroup.visible = false; if (previewMesh) previewMesh.visible = false; if (spawnMarker) spawnMarker.visible = false;
        camTarget.set(playerX, 0, playerZ); updateEventVisibility();
    // --- ОЖИВЛЯЕМ ВРАГОВ ПРИ НАЖАТИИ "ТЕСТ" ---
        if (window.Maker3D && window.Maker3D.initBattleScene) window.Maker3D.initBattleScene();
	};
    window.editorBackToEditor = function() { 
        document.getElementById('crosshair').style.display = 'none'; // Прячем прицел

        isAiming = false; // Сбрасываем состояние
	isEditorMode = true; document.exitPointerLock(); document.getElementById('editor-ui').style.display = 'block'; document.getElementById('play-ui').style.display = 'none'; 
	if(playerMesh) playerMesh.visible = false; if (spawnMarker) spawnMarker.visible = true; updatePreviewMesh(); 
	// --- ВОСКРЕШАЕМ И ЗАМОРАЖИВАЕМ ВРАГОВ ПРИ ВОЗВРАТЕ ---
    if (window.Maker3D && window.Maker3D.resetBattleScene) window.Maker3D.resetBattleScene();
	};
    window.editorClear = function() { placedObjects.forEach(obj => threeScene.remove(obj.mesh)); placedObjects = []; undoStack = []; spawnPoint = { x: 0.5, z: 0.5, y: 0.5 }; if (spawnMarker) threeScene.remove(spawnMarker); spawnMarker = null; };

    // ---------------------------------------------------------
    // ЗАГРУЗЧИК ВНЕШНИХ СТИЛЕЙ (ДЛЯ ДИЗАЙНЕРА)
    // ---------------------------------------------------------
    function loadCustomCSS() {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.type = 'text/css';
        // Путь к файлу. Дизайнер создаст этот файл в папке css проекта!
        link.href = 'css/3D_Maker.css'; 
        document.head.appendChild(link);
        console.log("3D_Maker: Внешние стили загружены из css/3D_Maker.css");
    }
	
    function initThreeJS() {
		loadCustomCSS(); // ЗАГРУЖАЕМ СТИЛИ ДО СОЗДАНИЯ UI
        threeScene = new THREE.Scene(); threeScene.background = new THREE.Color(0x1e1e24);
        const aspect = window.innerWidth / window.innerHeight; threeCamera = new THREE.PerspectiveCamera(50, aspect, 0.1, 1000);
        threeRenderer = new THREE.WebGLRenderer({ antialias: true }); threeRenderer.setSize(window.innerWidth, window.innerHeight); threeRenderer.setPixelRatio(window.devicePixelRatio);
         if (window.Maker3D) {
            window.Maker3D.scene = threeScene;
            window.Maker3D.camera = threeCamera;
            window.Maker3D.renderer = threeRenderer;
        }
		const rmmzCanvas = document.querySelector('canvas'); rmmzCanvas.parentNode.appendChild(threeRenderer.domElement);
        threeRenderer.domElement.style.position = 'absolute'; threeRenderer.domElement.style.top = '0'; threeRenderer.domElement.style.left = '0'; threeRenderer.domElement.style.zIndex = '2';
        threeScene.add(new THREE.AmbientLight(0xffffff, 0.6)); const dirLight = new THREE.DirectionalLight(0xffffff, 0.8); dirLight.position.set(10, 20, 10); threeScene.add(dirLight);
        gridHelper = new THREE.GridHelper(40, 40, 0x444444, 0x222222); threeScene.add(gridHelper);
        cursorGroup = new THREE.Group(); cursorFill = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0.3, depthTest: true, depthWrite: false, side: THREE.DoubleSide }));
        cursorEdges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(1, 1)), new THREE.LineBasicMaterial({ color: 0xffff00, depthTest: false, depthWrite: false })); cursorEdges.renderOrder = 999; cursorGroup.add(cursorFill, cursorEdges);
        cursorGroup.rotation.x = -Math.PI / 2; cursorGroup.visible = false; threeScene.add(cursorGroup);
        createEditorUI(); createPlayUI(); createCustomMenu(); createDialogueUI(); createEventEditorUI(); createContextMenu(); createTextureMenu(); createUIManager(); setupInputEvents();
        document.getElementById('editor-ui').style.display = 'none'; // Прячем на старте, так как включен режим игры
    }

    function updateOrbitalCamera() { const x = camTarget.x + camRadius * Math.sin(camTheta) * Math.cos(camPhi); const y = camTarget.y + camRadius * Math.cos(camTheta); const z = camTarget.z + camRadius * Math.sin(camTheta) * Math.sin(camPhi); threeCamera.position.set(x, y, z); threeCamera.lookAt(camTarget); }
    function updateCursorColor() { let colorHex = 0xffff00; if (currentTool === 'event') colorHex = 0x00ff00; if (currentTool === 'eraser') colorHex = 0xff0000; if (currentTool === 'stairs') colorHex = 0xff8800; if (currentTool === 'spawn') colorHex = 0x00ffff; if (currentTool === 'move') colorHex = 0xff00ff; if (currentTool === 'water') colorHex = 0x0088ff; cursorFill.material.color.setHex(colorHex); cursorEdges.material.color.setHex(colorHex); }
    
	function updatePreviewMesh() { 
        if (previewMesh) { threeScene.remove(previewMesh); previewMesh = null; } 
        if (currentTool === 'none' || currentTool === 'eraser' || currentTool === 'event' || currentTool === 'spawn' || currentTool === 'move') return; 
        
        let geo, mat; 
        
        if (currentTool === 'cube') { 
            cubeSizeX = parseInt(document.getElementById('cube-sx').value) || 1;
            cubeSizeY = parseInt(document.getElementById('cube-sy').value) || 1;
            cubeSizeZ = parseInt(document.getElementById('cube-sz').value) || 1;
            blockColor = document.getElementById('block-color').value;
            geo = new THREE.BoxGeometry(cubeSizeX, cubeSizeY, cubeSizeZ); 
            mat = new THREE.MeshPhongMaterial({ color: blockColor, transparent: true, opacity: 0.5 }); 
            previewMesh = new THREE.Mesh(geo, mat); 
            previewMesh.position.y = currentFloor + (cubeSizeY / 2); 
        } 
        else if (currentTool === 'stairs') { 
            blockColor = document.getElementById('block-color').value;
            geo = createStairsGeometry(); 
            mat = new THREE.MeshPhongMaterial({ color: blockColor, transparent: true, opacity: 0.5 }); 
            previewMesh = new THREE.Mesh(geo, mat); 
            previewMesh.position.y = currentFloor; 
            previewMesh.rotation.y = THREE.MathUtils.degToRad(currentRotation); 
        } 
        else if (currentTool === 'water') { 
            cubeSizeX = parseInt(document.getElementById('cube-sx').value) || 1;
            cubeSizeZ = parseInt(document.getElementById('cube-sz').value) || 1;
            blockColor = document.getElementById('block-color').value;
            const waterHeight = 0.6;
            geo = new THREE.PlaneGeometry(cubeSizeX, cubeSizeZ, 32, 32);
            mat = createWaterMaterial(cubeSizeX, cubeSizeZ, blockColor); // ИСПОЛЬЗУЕМ НОВУЮ ФУНКЦИЮ
            previewMesh = new THREE.Mesh(geo, mat); 
            previewMesh.rotation.x = -Math.PI / 2; 
            previewMesh.position.y = currentFloor + waterHeight / 2; 
        }
        
        if (previewMesh) { threeScene.add(previewMesh); } 
    }

    // ---------------------------------------------------------
    // ВВОД
    // ---------------------------------------------------------
    function setupInputEvents() {
        const isOverUI = (e) => { let el = e.target; while (el && el !== document.body) { if (['editor-ui', 'event-editor', 'custom-menu', 'dialogue-box', 'context-menu', 'texture-menu'].includes(el.id)) return true; el = el.parentElement; } return false; };

        window.addEventListener('mousemove', (e) => { mouseClientX = e.clientX; mouseClientY = e.clientY; });
        ['cube-sx', 'cube-sy', 'cube-sz', 'block-color'].forEach(id => { const el = document.getElementById(id); if(el) { el.addEventListener('input', () => updatePreviewMesh()); el.addEventListener('keydown', (e) => { if (e.key === 'Enter') el.blur(); }); } });

        window.addEventListener('mousedown', function(e) {
            if (isEventEditorOpen && e.target.tagName !== 'BUTTON') return;
            if (isOverUI(e)) { e.stopPropagation(); return; }
            if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) document.activeElement.blur();
            if (document.getElementById('context-menu').style.display === 'block' && e.target.tagName !== 'BUTTON') hideContextMenu();
            
            // ПКМ: Камера крутится только без Shift
            if (e.button === 2) { 
                if (isEditorMode) {
                    if (!e.shiftKey) isRotatingCamera = true; 
                } else {
                    isAiming = true; // В игре ПКМ включает прицеливание
                }
                e.preventDefault(); e.stopPropagation(); return; 
            }
            
            // ЛКМ: Умная установка
            if (e.button === 0) {
                if (!isEditorMode) { 
                    if (!isDialogueActive) {
                        if (document.pointerLockElement === threeRenderer.domElement) {
                            // Если в прицеливании - стреляем, иначе просто идем
                            if (window.Maker3D && window.Maker3D.onPlayerShoot) window.Maker3D.onPlayerShoot();
                        } else {
                            threeRenderer.domElement.requestPointerLock();
                        }
                    }
                    return; 
                }
                
                const clickMouse = new THREE.Vector2(); 
                clickMouse.x = (e.clientX / window.innerWidth) * 2 - 1; 
                clickMouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
                raycaster.setFromCamera(clickMouse, threeCamera); 
                
                // Получаем умные координаты ОДИН РАЗ для всех инструментов!
                const targetPos = getTargetGridPos(raycaster);

                // --- СОБЫТИЕ ---
                if (currentTool === 'event') {
                    const clickMouse = new THREE.Vector2(); clickMouse.x = (e.clientX / window.innerWidth) * 2 - 1; clickMouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
                    raycaster.setFromCamera(clickMouse, threeCamera); 

                    // Пускаем луч по ВСЕЙ сцене
                    const hits = raycaster.intersectObjects(threeScene.children, true);
                    let foundObj = null;
                    for (let i = 0; i < hits.length; i++) {
                        let hitObj = hits[i].object;
                        while (hitObj) {
                            if (hitObj.userData && hitObj.userData.placedObj) { foundObj = hitObj.userData.placedObj; break; }
                            hitObj = hitObj.parent;
                        }
                        if (foundObj) break;
                    }

                    if (foundObj && foundObj.type === 'event') { 
                        window.openEventEditor(foundObj); 
                        e.preventDefault(); e.stopPropagation(); return; 
                    }

                    // Если не попали в модель - проверяем пол (сетку)
                    const intersectPoint = new THREE.Vector3(); const hitPlane = raycaster.ray.intersectPlane(floorPlane, intersectPoint);
                    if (hitPlane) { 
                        const snapX = Math.floor(intersectPoint.x + 0.001) + 0.5; const snapZ = Math.floor(intersectPoint.z + 0.001) + 0.5; const gridY = currentFloor;
                        const existingObj = placedObjects.find(o => o.gridX === snapX && o.gridY === gridY && o.gridZ === snapZ);
                        
                        if (existingObj && existingObj.type === 'event') { window.openEventEditor(existingObj); } 
                        else if (!existingObj) {
                            cursorGroup.position.set(snapX, gridY + 0.01, snapZ); cursorGroup.visible = true;
                            const tempObj = { type: 'event', gridX: snapX, gridY: gridY, gridZ: snapZ, gridRot: 0, condition: "ALWAYS", events: [], selfSwitchA: false, triggerType: "interact", modelPath: "", texturePath: "", bodyType: 'static', behavior: 'idle', hp: 0, maxHp: 0, atk: 0, mesh: null }; 
                            window.openEventEditor(tempObj);
                        }
                    }
                    e.preventDefault(); e.stopPropagation(); return;
                }
                
                // --- ПЕРЕМЕЩЕНИЕ ---
                if (currentTool === 'move') {
                    if (!targetPos) return;
                    const snapX = targetPos.x; const snapZ = targetPos.z; const gridY = targetPos.y;
                    if (heldObject) { 
                        const existingObj = placedObjects.find(o => o.gridX === snapX && o.gridY === gridY && o.gridZ === snapZ); 
                        if (!existingObj) { 
                            heldObject.gridX = snapX; heldObject.gridY = gridY; heldObject.gridZ = snapZ;
                            if (heldObject.type === 'stairs') { heldObject.mesh.position.set(snapX, gridY, snapZ); } 
                            else if (heldObject.type === 'water') { heldObject.mesh.position.set(snapX, gridY + (heldObject.sizeY || 0.6) / 2, snapZ); } 
                            else { heldObject.mesh.position.set(snapX, gridY + (heldObject.sizeY || 1) / 2, snapZ); }
                            heldObject.mesh.visible = true; 
                            if (moveGhostMesh) { threeScene.remove(moveGhostMesh); moveGhostMesh = null; } 
                            heldObject = null; window.editorSetTool('event'); 
                        } 
                    }
                    e.preventDefault(); e.stopPropagation(); return;
                }
                
                // --- ЛЮБОЙ ДРУГОЙ ИНСТРУМЕНТ (Куб, лестница, вода, ластик, спавн) ---
                if (currentTool !== 'none') { 
                    if (currentTool === 'ui') {
                        window.openUIEditor(); // Открываем редактор UI вместо размещения в 3D!
                        e.preventDefault(); e.stopPropagation(); 
                        return;
                    }
                    
                    const targetPos = getTargetGridPos(raycaster); 
                    if (targetPos) { 
                        cursorGroup.position.set(targetPos.x, targetPos.y + 0.01, targetPos.z); 
                        cursorGroup.visible = true; 
                        if (currentTool === 'eraser') eraseObject(); 
                        else placeObject(); 
                    } 
                    e.preventDefault(); e.stopPropagation(); 
                }
            }
        }, true);

        window.addEventListener('mouseup', function(e) { 
            if (e.button === 2) {
                isRotatingCamera = false; 
                isAiming = false; // Отпустили ПКМ - вышли из прицеливания
            }
        }, true);
        

        // МАГИЯ ПКМ: Контекстное меню ТОЛЬКО по Shift + ПКМ (100% ПОЧИНЕНО ДЛЯ GLB!)
        window.addEventListener('contextmenu', function(e) { 
            e.preventDefault(); e.stopPropagation(); 
            
            if (!e.shiftKey) return;
            if (!isEditorMode || isEventEditorOpen) return;

            const clickMouse = new THREE.Vector2(); 
            clickMouse.x = (e.clientX / window.innerWidth) * 2 - 1; 
            clickMouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
            raycaster.setFromCamera(clickMouse, threeCamera);

            // Пускаем луч по ВСЕЙ сцене (это надежнее, чем по массиву мешей)
            const hits = raycaster.intersectObjects(threeScene.children, true); 

            let foundObj = null;
            for (let i = 0; i < hits.length; i++) {
                let hitObj = hits[i].object;
                // Поднимаемся вверх по иерархии, пока не найдём метку
                while (hitObj) {
                    if (hitObj.userData && hitObj.userData.placedObj) {
                        foundObj = hitObj.userData.placedObj;
                        break;
                    }
                    hitObj = hitObj.parent;
                }
                if (foundObj) break; // Нашли ближайший объект с меткой - хватит искать
            }

            if (foundObj) {
                showContextMenu(foundObj, e.clientX, e.clientY);
            }
        }, true);

        window.addEventListener('mousemove', function(e) { 
            if (isOverUI(e)) return; 
            
            if (isEditorMode && isRotatingCamera) {
                camPhi += e.movementX * 0.005; 
                camTheta = Math.max(0.2, Math.min(1.4, camTheta - e.movementY * 0.005)); 
                e.stopPropagation(); 
            } 
            else if (!isEditorMode && document.pointerLockElement === threeRenderer.domElement) {
                playerCamYaw -= e.movementX * 0.003; 
                // ИСПРАВЛЕНО: минус вместо плюса, чтобы мышка вниз опускала камеру
                playerCamPitch = Math.max(-0.5, Math.min(1.2, playerCamPitch - e.movementY * 0.003)); 
                e.stopPropagation(); 
            }
        }, true);
                window.addEventListener('wheel', function(e) { 
            if (isOverUI(e)) { e.stopPropagation(); return; } 
            targetCamRadius = Math.max(5, Math.min(40, targetCamRadius + e.deltaY * 0.05)); // Изменяем цель, а не сам радиус
            e.preventDefault(); e.stopPropagation(); 
        }, { passive: false, capture: true });

        document.addEventListener('keydown', function(e) {
            keysPressed[e.code] = true; 
            if (e.key === 'F9') return; 
            
            const activeTag = document.activeElement.tagName; const activeType = document.activeElement.type;
            const isTextInput = (activeTag === 'TEXTAREA' || (activeTag === 'INPUT' && activeType === 'text')); const isNumberInput = (activeTag === 'INPUT' && (activeType === 'number' || activeType === 'color'));
            
            if (isTextInput) { e.stopPropagation(); if (e.key === 'Escape') document.activeElement.blur(); return; }
            if (isNumberInput) { if (e.key === 'r' || e.key === 'R' || e.key === 'к' || e.key === 'К' || e.key === 'u' || e.key === 'U' || e.key === 'г' || e.key === 'Г' || e.key === 'Enter' || e.key === 'Escape') document.activeElement.blur(); else { e.stopPropagation(); return; } }
            
            if (isEditorMode) { 
                if ((e.ctrlKey && e.key === 'z') || e.key === 'u' || e.key === 'U' || e.key === 'г' || e.key === 'Г') { e.preventDefault(); e.stopPropagation(); window.editorUndo(); } 
                if (e.key === 'r' || e.key === 'R' || e.key === 'к' || e.key === 'К') window.editorRotate(); 
                if (e.key === 'Escape') { if (heldObject) { heldObject.mesh.visible = true; if (moveGhostMesh) { threeScene.remove(moveGhostMesh); moveGhostMesh = null; } heldObject = null; window.editorSetTool('event'); } e.preventDefault(); e.stopPropagation(); }
            } else { 
                if (isDialogueActive) { if (e.key === 'f' || e.key === 'F' || e.key === 'а' || e.key === 'А' || e.key === ' ' || e.key === 'Enter') window.closeDialogue(); return; } 
                if (e.key === 'f' || e.key === 'F' || e.key === 'а' || e.key === 'А') checkEventInteraction(); 
                if (e.key === ' ' && isGrounded) { playerVelocityY = jumpForce; isGrounded = false; e.preventDefault(); }
            }
        }, true);
        document.addEventListener('keyup', function(e) { keysPressed[e.code] = false; }, true);
    }

    // УМНАЯ ВЫСОТА: Проверяем, кликнул ли игрок на объект, чтобы поставить на него
    function getTargetGridPos(ray) {
        // 1. Сначала кидаем луч в существующие объекты
        const meshes = placedObjects.map(o => o.mesh);
        const hits = ray.intersectObjects(meshes, true);

        if (hits.length > 0) {
            let hitObj = hits[0].object;
            // Ищем корневой объект с данными
            while (hitObj && !hitObj.userData.placedObj) { hitObj = hitObj.parent; }
            
            if (hitObj && hitObj.userData.placedObj) {
                const objData = hitObj.userData.placedObj;
                const hitPoint = hits[0].point; // Мировая координата клика
                
                // Если кликнули примерно на верхнюю грань (с погрешностью 0.1)
                const topY = objData.gridY + (objData.sizeY || 1);
                if (hitPoint.y >= topY - 0.1) {
                    return {
                        x: Math.floor(hitPoint.x + 0.001) + 0.5,
                        y: topY, // Ставим СВЕРХУ объекта!
                        z: Math.floor(hitPoint.z + 0.001) + 0.5,
                        source: 'object'
                    };
                }
            }
        }

        // 2. Если ни во что не попали (или кликнули в бок) — используем плоскость этажа
        const intersectPoint = new THREE.Vector3(); 
        const hitPlane = ray.ray.intersectPlane(floorPlane, intersectPoint);
        if (hitPlane) {
            return {
                x: Math.floor(intersectPoint.x + 0.001) + 0.5,
                y: currentFloor, // Используем ручной выбор этажа!
                z: Math.floor(intersectPoint.z + 0.001) + 0.5,
                source: 'floor'
            };
        }
        return null;
    }

    function updateCursor() { 
        const clickMouse = new THREE.Vector2(); 
        clickMouse.x = (mouseClientX / window.innerWidth) * 2 - 1; 
        clickMouse.y = -(mouseClientY / window.innerHeight) * 2 + 1; 
        raycaster.setFromCamera(clickMouse, threeCamera); 

        const targetPos = getTargetGridPos(raycaster);
        if (targetPos) { 
            cursorGroup.position.set(targetPos.x, targetPos.y + 0.01, targetPos.z); 
            cursorGroup.visible = true; 
            
            if (previewMesh) {
                if (currentTool === 'cube') { 
                    previewMesh.position.set(targetPos.x, targetPos.y + (cubeSizeY / 2), targetPos.z); 
                } else if (currentTool === 'stairs') { 
                    previewMesh.position.set(targetPos.x, targetPos.y, targetPos.z); 
                } else if (currentTool === 'water') { 
                    previewMesh.position.set(targetPos.x, targetPos.y + 0.3, targetPos.z); 
                }
            }
            
            if (moveGhostMesh && heldObject) { 
                let ghostY = targetPos.y;
                if (heldObject.type === 'stairs') ghostY = targetPos.y;
                else if (heldObject.type === 'water') ghostY = targetPos.y + (heldObject.sizeY || 0.6) / 2;
                else ghostY = targetPos.y + (heldObject.sizeY || 1) / 2;
                moveGhostMesh.position.set(targetPos.x, ghostY, targetPos.z); 
            }
        } else { 
            cursorGroup.visible = false; 
        } 
    }
	
    function createStairsGeometry() { const shape = new THREE.Shape(); shape.moveTo(0, 0); shape.lineTo(1, 0); shape.lineTo(1, 1); shape.lineTo(0, 0); const geometry = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false }); geometry.translate(-0.5, 0, -0.5); return geometry; }
    function createWaterMaterial(sizeX, sizeZ, color) {
        const textureLoader = new THREE.TextureLoader();
        const waterTex = textureLoader.load(WATER_TEXTURE_URL);
        waterTex.wrapS = THREE.RepeatWrapping;
        waterTex.wrapT = THREE.RepeatWrapping;
        // Повторяем текстуру в зависимости от размера воды
        waterTex.repeat.set(Math.max(1, sizeX), Math.max(1, sizeZ));
        
        return new THREE.MeshPhongMaterial({ 
            map: waterTex,
            color: color, // Цвет будет тонировать текстуру
            transparent: true, 
            opacity: 0.7, 
            specular: 0x444444, 
            shininess: 100, 
            side: THREE.DoubleSide, 
            flatShading: false // С текстурой лучше без плоских теней
        });
    }


    function placeObject() {
        // ВАЖНО: Берем высоту из курсора, а не из переменной этажа! Курсор уже умный.
        const gridX = cursorGroup.position.x; 
        const gridY = Math.round(cursorGroup.position.y * 10) / 10; // Округляем, чтобы не было микро-сдвигов
        const gridZ = cursorGroup.position.z; 
        const gridRot = currentRotation;

        if (currentTool === 'spawn') { 
            spawnPoint.x = gridX; spawnPoint.z = gridZ; spawnPoint.y = gridY + 0.5; 
            if (!spawnMarker) { const geo = new THREE.ConeGeometry(0.5, 1, 4); const mat = new THREE.MeshPhongMaterial({ color: 0x00ffff, flatShading: true }); spawnMarker = new THREE.Mesh(geo, mat); spawnMarker.rotation.x = Math.PI; threeScene.add(spawnMarker); } 
            spawnMarker.position.set(gridX, gridY + 1.5, gridZ); return; 
        }
        if (currentTool === 'event') return;

        const isDuplicate = placedObjects.some(o => o.gridX === gridX && o.gridY === gridY && o.gridZ === gridZ && o.type === currentTool);
        if (isDuplicate) return;

        let mesh;
        if (currentTool === 'cube') { 
            let geo = new THREE.BoxGeometry(cubeSizeX, cubeSizeY, cubeSizeZ); 
            let mat = new THREE.MeshPhongMaterial({ color: blockColor, flatShading: true }); 
            mesh = new THREE.Mesh(geo, mat); mesh.position.set(gridX, gridY + cubeSizeY/2, gridZ); 
            const objData = { type: currentTool, gridX, gridY, gridZ, gridRot: 0, sizeX: cubeSizeX, sizeY: cubeSizeY, sizeZ: cubeSizeZ, color: blockColor, texturePath: "", dialogueText: "", condition: "ALWAYS", commands: [], selfSwitchA: false, mesh }; 
            placedObjects.push(objData); undoStack.push({ type: 'add', data: objData }); 
            mesh.userData.placedObj = objData; // Метка для ПКМ
            threeScene.add(mesh); 
        }
        else if (currentTool === 'stairs') { 
            mesh = new THREE.Mesh(createStairsGeometry(), new THREE.MeshPhongMaterial({ color: blockColor, flatShading: true })); 
            mesh.position.set(gridX, gridY, gridZ); mesh.rotation.y = THREE.MathUtils.degToRad(gridRot); 
            const objData = { type: currentTool, gridX, gridY, gridZ, gridRot, sizeX: 1, sizeY: 1, sizeZ: 1, color: blockColor, texturePath: "", dialogueText: "", condition: "ALWAYS", commands: [], selfSwitchA: false, mesh }; 
            placedObjects.push(objData); undoStack.push({ type: 'add', data: objData }); 
            mesh.userData.placedObj = objData; // Метка для ПКМ
            threeScene.add(mesh); 
        }
        else if (currentTool === 'water') { 
            const waterHeight = 0.6;
            let geo = new THREE.PlaneGeometry(cubeSizeX, cubeSizeZ, 32, 32); 
            let mat = createWaterMaterial(cubeSizeX, cubeSizeZ, blockColor); 
            mesh = new THREE.Mesh(geo, mat); 
            mesh.rotation.x = -Math.PI / 2; 
            mesh.position.set(gridX, gridY + waterHeight / 2, gridZ); 
            const objData = { type: currentTool, gridX, gridY, gridZ, gridRot: 0, sizeX: cubeSizeX, sizeY: waterHeight, sizeZ: cubeSizeZ, color: blockColor, texturePath: "", dialogueText: "", condition: "ALWAYS", commands: [], selfSwitchA: false, mesh }; 
            placedObjects.push(objData); undoStack.push({ type: 'add', data: objData }); 
            mesh.userData.placedObj = objData; // Метка для ПКМ
            threeScene.add(mesh); 
        }
    }

        function eraseObject() { 
        const clickMouse = new THREE.Vector2(); clickMouse.x = (mouseClientX / window.innerWidth) * 2 - 1; clickMouse.y = -(mouseClientY / window.innerHeight) * 2 + 1;
        raycaster.setFromCamera(clickMouse, threeCamera); const meshes = placedObjects.map(o => o.mesh); const hits = raycaster.intersectObjects(meshes, true);
        if (hits.length > 0) {
            let hitObj = hits[0].object;
            // Ищем корневой объект с меткой
            while (hitObj && !hitObj.userData.placedObj) { hitObj = hitObj.parent; }
            if (hitObj && hitObj.userData.placedObj) {
                const objData = hitObj.userData.placedObj;
                threeScene.remove(objData.mesh); placedObjects = placedObjects.filter(o => o !== objData); undoStack.push({ type: 'erase', data: objData }); 
            }
        }
    }
    function checkEventInteraction() { 
        let closestDist = 1.5; let closestEv = null; 
        placedObjects.forEach(obj => { 
            // Проверяем: это событие, оно взаимодействует по кнопке, оно видимо И оно не исчерпало лимит запусков!
            if (obj.type === 'event' && obj.triggerType === 'interact' && obj.mesh && obj.mesh.visible && !obj.isDepleted) { 
                let dist = Math.hypot(playerX - obj.gridX, playerZ - obj.gridZ); 
                let heightDiff = Math.abs(playerY - (obj.gridY + 1.0)); 
                if (dist < closestDist && heightDiff < 1.5) { 
                    closestDist = dist; closestEv = obj; 
                } 
            } 
        }); 
        if (closestEv) { 
            closestEv.evIdx = 0; closestEv.actIdx = 0; 
            executeEvents(closestEv); 
        }
    }

    function updatePlayerPhysics() {
        if (isDialogueActive) return;
        
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(threeCamera.quaternion).normalize(); forward.y = 0; forward.normalize();
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(threeCamera.quaternion).normalize(); right.y = 0; right.normalize();
        
        let dx = 0, dz = 0;
        if (Input.isPressed('up')) { dx += forward.x; dz += forward.z; } if (Input.isPressed('down')) { dx -= forward.x; dz -= forward.z; }
        if (Input.isPressed('left')) { dx -= right.x; dz -= right.z; } if (Input.isPressed('right')) { dx += right.x; dz += right.z; }
        
        if (dx !== 0 || dz !== 0) {
            const length = Math.sqrt(dx * dx + dz * dz); 
            
            // Проверяем, стоит ли игрок в воде
            const isInWater = placedObjects.some(o => o.type === 'water' && o.gridX === Math.floor(playerX + 0.001) + 0.5 && o.gridZ === Math.floor(playerZ + 0.001) + 0.5 && playerY < (o.gridY + (o.sizeY || 0.6) + 0.5));
            let speedMult = isInWater ? 0.4 : 1.0; // В воде скорость 40% от обычной

            let nextX = playerX + (dx / length) * playerSpeed * speedMult; 
            let nextZ = playerZ + (dz / length) * playerSpeed * speedMult;
            
            // AABB Коллизия с масштабированными кубами (Вода НЕ блокирует!)
            const isBlocked = placedObjects.some(o => {
                if (o.type !== 'cube') return false;
                const pRadX = 0.3, pRadZ = 0.3; const bHalfX = (o.sizeX || 1) / 2; const bHalfZ = (o.sizeZ || 1) / 2;
                const overlapX = (nextX + pRadX > o.gridX - bHalfX) && (nextX - pRadX < o.gridX + bHalfX); const overlapZ = (nextZ + pRadZ > o.gridZ - bHalfZ) && (nextZ - pRadZ < o.gridZ + bHalfZ);
                if (!overlapX || !overlapZ) return false;
                const blockTopY = o.gridY + (o.sizeY || 1); const playerFeetY = playerY - 0.5; const stepHeight = 0.4;
                if (blockTopY - playerFeetY <= stepHeight) return false;
                const overlapY = (playerY > o.gridY) && (playerY < blockTopY + 0.5); return overlapY;
            });

            if (!isBlocked) { playerX = nextX; playerZ = nextZ; }
            
            // --- ПОВОРОТ ИГРОКА В СТОРОНУ ДВИЖЕНИЯ ---
            if (isAiming) {
                // В режиме прицеливания (ПКМ): лицо всегда смотрит туда, куда смотрит камера
                playerMesh.rotation.y = playerCamYaw;
            } else {
                // В обычном режиме: лицо смотрит по ходу движения
                const targetAngle = Math.atan2(dx, dz); 
                playerMesh.rotation.y = targetAngle;
            }
            // --------------------------------------------
        }

        // Гравитация и прыжок
        playerVelocityY += gravity; playerY += playerVelocityY; isGrounded = false;
        
        // Вода не должна твердо держать игрока на поверхности, он должен тонуть до дна
        const collisionMeshes = placedObjects.filter(o => o.type !== 'event' && o.type !== 'water').map(o => o.mesh);
        playerRaycaster.set(new THREE.Vector3(playerX, playerY + 2.0, playerZ), new THREE.Vector3(0, -1, 0));
        const hits = playerRaycaster.intersectObjects(collisionMeshes);
        if (hits.length > 0) { const hit = hits[0]; const objData = placedObjects.find(o => o.mesh === hit.object); if (objData) { let floorY = 0.5; if (objData.type === 'cube') floorY = objData.gridY + (objData.sizeY || 1) + 0.5; else if (objData.type === 'stairs') floorY = hit.point.y + 0.5; if (playerY <= floorY && playerVelocityY <= 0) { playerY = floorY; playerVelocityY = 0; isGrounded = true; } } } else { if (playerY <= 0.5) { playerY = 0.5; playerVelocityY = 0; isGrounded = true; } }

        // Проверка наступания на событие
        placedObjects.forEach(obj => { 
            if (obj.type === 'event' && obj.triggerType === 'step' && obj.mesh && obj.mesh.visible && !obj.isDepleted) { 
                let dist = Math.hypot(playerX - obj.gridX, playerZ - obj.gridZ); 
                let heightDiff = Math.abs(playerY - (obj.gridY + 1.0)); 
                if (dist < 0.8 && heightDiff < 1.0) {
                    obj.evIdx = 0; 
                    obj.actIdx = 0; 
                    executeEvents(obj); 
                }
            }
        });
    }

    // ---------------------------------------------------------
    // СОХРАНЕНИЕ И ЗАГРУЗКА
    // ---------------------------------------------------------
    const _GameSystem_onBeforeSave = Game_System.prototype.onBeforeSave;
    Game_System.prototype.onBeforeSave = function() { 
        _GameSystem_onBeforeSave.call(this); 
        this._myIsoLevelData = placedObjects.map(obj => ({ 
            type: obj.type, gridX: obj.gridX, gridY: obj.gridY, gridZ: obj.gridZ, gridRot: obj.gridRot || 0, 
            sizeX: obj.sizeX || 1, sizeY: obj.sizeY || 1, sizeZ: obj.sizeZ || 1, color: obj.color || '#ffffff',
            texturePath: obj.texturePath || "", 
            condition: obj.condition || "ALWAYS", 
            events: obj.events || [], // НОВАЯ СТРУКТУРА!
            selfSwitchA: obj.selfSwitchA || false,
            triggerType: obj.triggerType || 'interact', modelPath: obj.modelPath || '',
            bodyType: obj.bodyType || 'static', behavior: obj.behavior || 'idle',
            hp: obj.hp || 0, maxHp: obj.maxHp || 0, atk: obj.atk || 0 
        }));
        this._my3dSpawn = spawnPoint;
		// --- СОХРАНЕНИЕ UI В СЕЙВ ---
        this._myIsoUIData = placedUIElements.map(el => ({
            type: el.type, x: el.x, y: el.y, w: el.w, h: el.h, z: el.z || 15,
            prefix: el.prefix || "", varId: el.varId || 0,
            varIdCur: el.varIdCur || 0, varIdMax: el.varIdMax || 0,
            color: el.color || "#4ade80"
        }));
        // ----------------------------
    };

    function rebuildLevel(data) {
        if (!data) return; placedObjects.forEach(obj => threeScene.remove(obj.mesh)); placedObjects = []; 
        // СТРОКА ПЕРЕЗАПИСИ СПАВНА УДАЛЕНА! Теперь rebuildLevel только строит геометрию.

        data.forEach(item => { 
            const tempObj = { type: item.type, gridX: item.gridX, gridY: item.gridY, gridZ: item.gridZ, gridRot: item.gridRot, sizeX: item.sizeX || 1, sizeY: item.sizeY || 1, sizeZ: item.sizeZ || 1, color: item.color || '#ffffff', condition: item.condition || "ALWAYS", events: item.events || [], selfSwitchA: item.selfSwitchA || false, triggerType: item.triggerType || 'interact', modelPath: item.modelPath || '', texturePath: item.texturePath || "", bodyType: item.bodyType || 'static', behavior: item.behavior || 'idle', hp: item.hp || 0, maxHp: item.maxHp || 0, atk: item.atk || 0, enemyId: item.enemyId || 0, atkVarId: item.atkVarId || 0, respawnTime: item.respawnTime || 0, mesh: null };            
            if (item.type === 'event') createEventMesh(tempObj);
            else { 
                let mesh; 
                if (item.type === 'cube') { mesh = new THREE.Mesh(new THREE.BoxGeometry(tempObj.sizeX, tempObj.sizeY, tempObj.sizeZ), new THREE.MeshPhongMaterial({ color: tempObj.color, flatShading: true })); mesh.position.set(item.gridX, item.gridY + tempObj.sizeY/2, item.gridZ); } 
                else if (item.type === 'stairs') { mesh = new THREE.Mesh(createStairsGeometry(), new THREE.MeshPhongMaterial({ color: tempObj.color, flatShading: true })); mesh.position.set(item.gridX, item.gridY, item.gridZ); mesh.rotation.y = THREE.MathUtils.degToRad(item.gridRot || 0); } 
                else if (item.type === 'water') { mesh = new THREE.Mesh(new THREE.PlaneGeometry(tempObj.sizeX, tempObj.sizeZ, 32, 32), createWaterMaterial(tempObj.sizeX, tempObj.sizeZ, tempObj.color)); mesh.rotation.x = -Math.PI / 2; mesh.position.set(item.gridX, item.gridY + (tempObj.sizeY || 0.6) / 2, item.gridZ); }
                if (mesh) { 
                    threeScene.add(mesh); tempObj.mesh = mesh; 
                    mesh.userData.placedObj = tempObj; 
                    if (tempObj.texturePath && tempObj.type !== 'water') applyTextureToObject(tempObj);
                }
            }
            placedObjects.push(tempObj); 
        }); 
        
        currentTool = 'none'; cursorGroup.visible = false; currentFloor = 0; currentRotation = 0; updateFloorVisuals(); 
        
        // Пересоздание маркера спавна
        if (spawnMarker) threeScene.remove(spawnMarker); 
        const geo = new THREE.ConeGeometry(0.5, 1, 4); const mat = new THREE.MeshPhongMaterial({ color: 0x00ffff, flatShading: true }); 
        spawnMarker = new THREE.Mesh(geo, mat); spawnMarker.rotation.x = Math.PI; 
        spawnMarker.position.set(spawnPoint.x, spawnPoint.y + 1.0, spawnPoint.z); threeScene.add(spawnMarker);
        
        updateEventVisibility();
    }
	
	// ---------------------------------------------------------
    // ЗАГРУЗКА / ВОССТАНОВЛЕНИЕ UI
    // ---------------------------------------------------------
    function rebuildUI(data) {
        // 1. Очищаем текущий UI с экрана и из памяти
        placedUIElements.forEach(el => { if (el.domElement) el.domElement.remove(); });
        placedUIElements = [];
        selectedUIIndex = -1;

        if (!data) return;

        // 2. Создаем элементы из сохраненных данных
        data.forEach(item => {
            // Очищаем данные от DOM-элемента (на всякий случай, при загрузке из строки его там нет)
            delete item.domElement; 
            
            placedUIElements.push(item);
            renderSingleUIElement(item);
        });
    }

    Game_Player.prototype.moveByInput = function() {}; 

    const _Spriteset_Map_update = Spriteset_Map.prototype.update;
    Spriteset_Map.prototype.update = function() {
        _Spriteset_Map_update.call(this);
        
        if (!threeRenderer) return; // Защита от краша

        const rmmzCanvas = document.querySelector('canvas'); const cssW = rmmzCanvas.clientWidth; const cssH = rmmzCanvas.clientHeight; const bufW = rmmzCanvas.width; const bufH = rmmzCanvas.height;
        if (threeRenderer.domElement.clientWidth !== cssW || threeRenderer.domElement.clientHeight !== cssH) { threeRenderer.setSize(bufW, bufH); threeRenderer.domElement.style.width = cssW + 'px'; threeRenderer.domElement.style.height = cssH + 'px'; threeCamera.aspect = bufW / bufH; threeCamera.updateProjectionMatrix(); }
        
        if (isEditorMode) {
            // Плавный зум в редакторе
            camRadius += (targetCamRadius - camRadius) * 0.1;

            if (currentTool !== 'none' && !isEventEditorOpen) updateCursor();
            if (!isEventEditorOpen) {
                const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(threeCamera.quaternion).normalize(); forward.y = 0; forward.normalize();
                const right = new THREE.Vector3(1, 0, 0).applyQuaternion(threeCamera.quaternion).normalize(); right.y = 0; right.normalize();
                const camSpeed = 0.2;
                if (keysPressed['ArrowUp'] || keysPressed['KeyW']) { camTarget.x += forward.x * camSpeed; camTarget.z += forward.z * camSpeed; }
                if (keysPressed['ArrowDown'] || keysPressed['KeyS']) { camTarget.x -= forward.x * camSpeed; camTarget.z -= forward.z * camSpeed; }
                if (keysPressed['ArrowLeft'] || keysPressed['KeyA']) { camTarget.x -= right.x * camSpeed; camTarget.z -= right.z * camSpeed; }
                if (keysPressed['ArrowRight'] || keysPressed['KeyD']) { camTarget.x += right.x * camSpeed; camTarget.z += right.z * camSpeed; }
                camTarget.y = currentFloor + 1; updateOrbitalCamera();
            }
        } else {
            // Плавное приближение/отдаление колеса мыши + плавный подъезд при прицеливании
            targetCamRadius = isAiming ? 3.5 : 6; 
            camRadius += (targetCamRadius - camRadius) * 0.15; 
            
            updatePlayerPhysics(); playerMesh.position.set(playerX, playerY, playerZ); 
            
            // --- ОБНОВЛЯЕМ ДИНАМИЧЕСКИЙ UI ЗДЕСЬ ---
            updateDynamicUI();
            // --- ОБРАБОТКА ПАРАЛЛЕЛЬНЫХ ПРОЦЕССОВ ---
            placedObjects.forEach(obj => {
                // Запускаем параллельный процесс каждый кадр, ЕСЛИ он не заблокирован диалогом
                if (obj.type === 'event' && obj.triggerType === 'parallel' && obj.mesh && obj.mesh.visible && !obj.isDialogueBlocking) {
                    executeEvents(obj);
                }
            });
            // ----------------------------------------
            // ----------------------------------------
            // Камера следует за игроком с учетом горизонтального и вертикального поворота
            const camX = playerX - Math.sin(playerCamYaw) * camRadius;
            const camZ = playerZ - Math.cos(playerCamYaw) * camRadius;
            const camY = playerY + (isAiming ? 1.5 : 3); 
            
            camTarget.lerp(new THREE.Vector3(playerX, playerY - 0.5, playerZ), 0.1); 
            threeCamera.position.set(camX, camY, camZ);
            
            // Точка, куда смотрит камера, сдвигается вверх/вниз от мышки
            threeCamera.lookAt(new THREE.Vector3(playerX, playerY + 0.5 + (playerCamPitch * 2), playerZ)); 
            
            const debugDiv = document.getElementById('debug-state'); if (debugDiv) debugDiv.innerText = `S1: ${$gameSwitches ? $gameSwitches.value(1) : false} | V1: ${$gameVariables ? $gameVariables.value(1) : 0}`;
        }

        // АНИМАЦИЯ ВОДЫ: Волны и воронка от игрока
        const time = performance.now() * 0.001;
        const _v3 = new THREE.Vector3(); // Временный вектор для расчетов
        placedObjects.forEach(obj => {
            if (obj.type === 'water' && obj.mesh) {
                const pos = obj.mesh.geometry.attributes.position;
                
                for (let i = 0; i < pos.count; i++) {
                    _v3.set(pos.getX(i), pos.getY(i), 0);
                    _v3.applyMatrix4(obj.mesh.matrixWorld);
                    
                    let worldX = _v3.x;
                    let worldZ = _v3.z;
                    
                    let waveHeight = Math.sin(time * 1.5 + worldX * 2.0) * 0.03 + Math.sin(time * 2.2 + worldZ * 2.5) * 0.02;
                    
                    let distToPlayer = Math.hypot(worldX - playerX, worldZ - playerZ);
                    let playerDip = 0;
                    const dipRadius = 0.8; 
                    const dipDepth = 0.15; 
                    if (distToPlayer < dipRadius) {
                        playerDip = -(1 - (distToPlayer / dipRadius)) * dipDepth;
                        playerDip += Math.sin(distToPlayer * 10 - time * 5) * 0.02 * (1 - (distToPlayer / dipRadius));
                    }
                    
                    pos.setZ(i, waveHeight + playerDip); 
                }
                
                pos.needsUpdate = true;
                obj.mesh.geometry.computeVertexNormals(); 
            }
        });

        if (threeRenderer) threeRenderer.render(threeScene, threeCamera);
    };

    // ---------------------------------------------------------
    // ИНТЕГРАЦИЯ С МЕНЮ RPG MAKER И УПРАВЛЕНИЕ СЦЕНАМИ
    // ---------------------------------------------------------
    const _Window_MenuCommand_makeCommandList = Window_MenuCommand.prototype.makeCommandList;
    Window_MenuCommand.prototype.makeCommandList = function() {
        _Window_MenuCommand_makeCommandList.call(this);
        this.addCommand("Редактор 3D", 'editor3d', true);
    };

    const _Scene_Menu_createCommandWindow = Scene_Menu.prototype.createCommandWindow;
    Scene_Menu.prototype.createCommandWindow = function() {
        _Scene_Menu_createCommandWindow.call(this);
        this._commandWindow.setHandler('editor3d', this.commandEditor3d.bind(this));
    };

    Scene_Menu.prototype.commandEditor3d = function() {
        window._launch3DEditorOnMapStart = true;
        SceneManager.pop();
    };

    const _Scene_Map_callMenu = Scene_Map.prototype.callMenu;
    Scene_Map.prototype.callMenu = function() {
        if (isEditorMode) return; 
        _Scene_Map_callMenu.call(this);
    };

    const _Scene_Map_start = Scene_Map.prototype.start; 
    Scene_Map.prototype.start = function() { 
        _Scene_Map_start.call(this); 
        
        if (!threeRenderer) initThreeJS(); 

        // Проверяем: мы перешли на НОВУЮ карту, или просто вернулись из меню на ТУ ЖЕ самую?
        const mapId = $gameMap ? $gameMap.mapId() : 0;
        const isNewMap = (mapId !== current3DMapId || placedObjects.length === 0);

        if (isNewMap) {
            current3DMapId = mapId;
            loadLevelFromRMMZ(); 

            if (threeRenderer) threeRenderer.domElement.style.display = 'block';

            if (window._launch3DEditorOnMapStart) {
                window._launch3DEditorOnMapStart = false;
                isEditorMode = true; 
                document.getElementById('editor-ui').style.display = 'block'; 
                document.getElementById('play-ui').style.display = 'none';
                document.getElementById('crosshair').style.display = 'none';
                if(playerMesh) playerMesh.visible = false; 
                if (spawnMarker) spawnMarker.visible = true; 
                updatePreviewMesh(); 
            } 
            else {
                // НОВАЯ КАРТА: Сбрасываем позиции и оживляем врагов
                isEditorMode = false;
                document.getElementById('editor-ui').style.display = 'none'; 
                document.getElementById('play-ui').style.display = 'none';
                document.getElementById('crosshair').style.display = 'block';
                if (!playerMesh) { 
                    const geo = new THREE.ConeGeometry(0.4, 1, 5); const mat = new THREE.MeshPhongMaterial({ color: 0x00ff88, flatShading: true }); 
                    playerMesh = new THREE.Mesh(geo, mat); threeScene.add(playerMesh); 
                }
                playerMesh.visible = true; 
                playerX = spawnPoint.x; playerZ = spawnPoint.z; playerY = spawnPoint.y; targetPlayerY = spawnPoint.y; playerVelocityY = 0;
                playerMesh.position.set(playerX, playerY, playerZ);
                cursorGroup.visible = false; if (previewMesh) previewMesh.visible = false;
                if (spawnMarker) spawnMarker.visible = false;
                camTarget.set(playerX, 0, playerZ); updateEventVisibility();
                
                if (window.Maker3D && window.Maker3D.initBattleScene) window.Maker3D.initBattleScene();
            }
        } else {
            // ВОЗВРАТ ИЗ МЕНЮ: Карта та же самая! НЕ сбрасываем позиции и НЕ оживляем врагов заново!
            if (threeRenderer) threeRenderer.domElement.style.display = 'block';
            
            if (!isEditorMode) {
                // Просто убедимся, что UI на месте (БЕЗ удаленных старых хотбаров!)
                document.getElementById('editor-ui').style.display = 'none'; 
                document.getElementById('crosshair').style.display = 'block';
                if(playerMesh) playerMesh.visible = true; 
                if (spawnMarker) spawnMarker.visible = false;
            } else {
                document.getElementById('editor-ui').style.display = 'block'; 
                document.getElementById('play-ui').style.display = 'none';
                document.getElementById('crosshair').style.display = 'none';
                if(playerMesh) playerMesh.visible = false;
                if (spawnMarker) spawnMarker.visible = true; 
            }
        }
    };

    const _Scene_Map_terminate = Scene_Map.prototype.terminate;
    Scene_Map.prototype.terminate = function() {
        _Scene_Map_terminate.call(this);
        if (threeRenderer) threeRenderer.domElement.style.display = 'none';
    };

    const _Scene_MenuBase_start = Scene_MenuBase.prototype.start;
    Scene_MenuBase.prototype.start = function() {
        _Scene_MenuBase_start.call(this);
        if (threeRenderer) threeRenderer.domElement.style.display = 'none';
    };

    const _Scene_Title_start = Scene_Title.prototype.start;
    Scene_Title.prototype.start = function() {
        _Scene_Title_start.call(this);
        if (threeRenderer) threeRenderer.domElement.style.display = 'none';
    };

    // Кнопка "Редактор 3D" на Титульном экране
    const _Window_TitleCommand_makeCommandList = Window_TitleCommand.prototype.makeCommandList;
    Window_TitleCommand.prototype.makeCommandList = function() {
        _Window_TitleCommand_makeCommandList.call(this);
        this.addCommand("Редактор 3D", 'editor3d', true);
    };

    const _Scene_Title_createCommandWindow = Scene_Title.prototype.createCommandWindow;
    Scene_Title.prototype.createCommandWindow = function() {
        _Scene_Title_createCommandWindow.call(this);
        this._commandWindow.setHandler('editor3d', this.commandEditor3d.bind(this));
    };

    Scene_Title.prototype.commandEditor3d = function() {
        window._launch3DEditorOnMapStart = true; 
        DataManager.setupNewGame(); 
        this._commandWindow.close();
        this.fadeOutAll();
        SceneManager.push(Scene_Map); 
    };

    // ---------------------------------------------------------
    // МОСТ ДЛЯ ДОПОЛНЕНИЙ (Battle System и т.д.)
    // ---------------------------------------------------------
    window.Maker3D = {
        scene: threeScene,
        camera: threeCamera,
        renderer: threeRenderer,
        getPlayerPos: () => new THREE.Vector3(playerX, playerY, playerZ),
        getPlayerMesh: () => playerMesh,
        isEditorMode: () => isEditorMode,
        isDialogueActive: () => isDialogueActive,
        getObjects: () => placedObjects,
        isAiming: () => isAiming,
        getSpawnPoint: () => spawnPoint,
        // --- НОВЫЕ ФУНКЦИИ ДЛЯ БОЕВКИ ---
        setPlayerPos: (x, y, z) => {
            playerX = x; playerY = y; playerZ = z;
            if (playerMesh) playerMesh.position.set(x, y, z);
        },
        resetPlayerVelocity: () => { playerVelocityY = 0; }
        // --------------------------------
    };

})();