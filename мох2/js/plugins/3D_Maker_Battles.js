//=============================================================================
// 3D_Maker_Battles.js - Action RPG Addon (Melee + Ranged + AI Fixed)
//=============================================================================

(() => {
    'use strict';

    if (!window.Maker3D) return;

    const getScene = () => window.Maker3D ? window.Maker3D.scene : null;
    const getCamera = () => window.Maker3D ? window.Maker3D.camera : null;

    let activeAI = [];
    let activeProjectiles = [];
	let activeFloatingTexts = [];
    
    let playerAttackCooldown = 0;
    let playerShootCooldown = 0;
    let playerHP = 100;
    let playerMaxHP = 100;

    // ---------------------------------------------------------
    // КЛАСС ЛЕТАЮЩИХ ЦИФР УРОНА
    // ---------------------------------------------------------
    class FloatingText3D {
        constructor(position, text, color = '#ffff00') {
            this.lifetime = 60; // Длительность в кадрах (1 секунда)
            this.maxLifetime = 60;
            this.velocityY = 0.02; // Скорость полета вверх

            // 1. Создаем HTML5 Canvas для рисования текста
            const canvas = document.createElement('canvas');
            canvas.width = 128;
            canvas.height = 64;
            const ctx = canvas.getContext('2d');

            // 2. Рисуем текст с обводкой (чтобы было видно на любом фоне)
            ctx.font = 'Bold 40px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            ctx.strokeStyle = 'black'; // Черная обводка
            ctx.lineWidth = 4;
            ctx.strokeText(text, 64, 32);
            
            ctx.fillStyle = color; // Цвет текста (желтый/красный)
            ctx.fillText(text, 64, 32);

            // 3. Превращаем Canvas в 3D Текстуру
            const texture = new THREE.CanvasTexture(canvas);
            texture.needsUpdate = true;

            // 4. Создаем 3D Спрайт
            const material = new THREE.SpriteMaterial({ 
                map: texture, 
                transparent: true, 
                depthTest: false // Чтобы цифра не проваливалась сквозь стены
            });
            this.sprite = new THREE.Sprite(material);
            
            // Настраиваем размер и позицию
            this.sprite.scale.set(1.5, 0.75, 1); 
            this.sprite.position.copy(position);
            this.sprite.position.y += 1.5; // Приподнимаем над головой
            this.sprite.renderOrder = 999; // Рисовать поверх всего

            // Добавляем в 3D сцену
            const scene = getScene();
            if (scene) scene.add(this.sprite);
        }

        update() {
            if (this.lifetime <= 0) { this.destroy(); return; }
            
            // Летим вверх
            this.sprite.position.y += this.velocityY;
            
            // Плавно затухаем (прозрачность)
            this.sprite.material.opacity = this.lifetime / this.maxLifetime;
            
            this.lifetime--;
        }

        destroy() {
            const scene = getScene();
            if (scene && this.sprite) {
                scene.remove(this.sprite);
                this.sprite.material.map.dispose(); // Очищаем память от текстуры
                this.sprite.material.dispose();
            }
            activeFloatingTexts = activeFloatingTexts.filter(t => t !== this);
        }
    }


    // ---------------------------------------------------------
    // КЛАСС СНАРЯДА
    // ---------------------------------------------------------
    class Projectile3D {
        constructor(startPos, direction, damage) {
            this.damage = damage;
            this.speed = 0.3;
            this.lifetime = 120;
            this.direction = direction.normalize();

            const geo = new THREE.SphereGeometry(0.15, 8, 8);
            const mat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
            this.mesh = new THREE.Mesh(geo, mat);
            
            const trailGeo = new THREE.SphereGeometry(0.3, 8, 8);
            const trailMat = new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.3 });
            this.mesh.add(new THREE.Mesh(trailGeo, trailMat));

            this.mesh.position.copy(startPos);
            this.mesh.position.y += 0.5;

            const scene = getScene();
            if (scene) scene.add(this.mesh);
        }

        update() {
            if (this.lifetime <= 0) { this.destroy(); return; }
            this.mesh.position.add(this.direction.clone().multiplyScalar(this.speed));
            this.lifetime--;

            for (let i = 0; i < activeAI.length; i++) {
                const ai = activeAI[i];
                if (ai.obj.hp <= 0) continue;
                const dist = this.mesh.position.distanceTo(ai.obj.mesh.position);
                if (dist < 0.8) {
                    const enemyDef = ai.obj.enemyId > 0 && $dataEnemies[ai.obj.enemyId] ? $dataEnemies[ai.obj.enemyId].params[3] : 0;
                    const damage = Math.max(1, this.damage - enemyDef);
                    ai.takeDamage(damage);
                    this.destroy();
                    return;
                }
            }
        }

        destroy() {
            const scene = getScene();
            if (scene && this.mesh) scene.remove(this.mesh);
            activeProjectiles = activeProjectiles.filter(p => p !== this);
        }
    }

    // ---------------------------------------------------------
    // КЛАСС ИИ (Оживляет существующие События)
    // ---------------------------------------------------------
    class AIController {
        constructor(obj) {
            this.obj = obj; 
            
            // --- ЗАГРУЗКА СТАТОВ ИЗ БАЗЫ ДАННЫХ MZ ---
            if (this.obj.enemyId && this.obj.enemyId > 0 && $dataEnemies[this.obj.enemyId]) {
                let eData = $dataEnemies[this.obj.enemyId];
                this.obj.maxHp = eData.params[0]; // 0 = MHP
                this.obj.atk = eData.params[2];   // 2 = ATK
            }
            
            // Восстанавливаем HP перед тестом
            this.obj.hp = this.obj.maxHp;

            // Запоминаем оригинальный цвет и прозрачность
            if (this.obj.mesh.material) {
                this.origColor = this.obj.mesh.material.color.getHex();
                this.origOpacity = this.obj.mesh.material.opacity;
            } else {
                this.origColor = 0xffffff;
                this.origOpacity = 1.0;
            }

            this.state = 'idle';
            this.attackCooldown = 0;
            this.wanderTarget = null; // Для брожения
            this.speed = 0.04;
            this.aggroRange = 6;
            this.attackRange = 1.5;

            // Создаем полоску HP
            this.hpBarGroup = new THREE.Group();
            const bgGeo = new THREE.PlaneGeometry(1, 0.1);
            const bgMat = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide, depthTest: false });
            this.hpBarBg = new THREE.Mesh(bgGeo, bgMat);
            
            const hpGeo = new THREE.PlaneGeometry(1, 0.1);
            this.hpBarMat = new THREE.MeshBasicMaterial({ color: 0x00ff00, side: THREE.DoubleSide, depthTest: false });
            this.hpBarFill = new THREE.Mesh(hpGeo, this.hpBarMat);
            
            this.hpBarGroup.add(this.hpBarBg, this.hpBarFill);
            this.hpBarGroup.position.set(0, 1.5, 0); 
            this.hpBarGroup.renderOrder = 999;
            
            if (this.obj.mesh) this.obj.mesh.add(this.hpBarGroup);
        }

        update(playerPos) {
            // --- ЛОГИКА СМЕРТИ И РЕСПАУНА ---
            if (this.obj.isDead) {
                // Если таймер активен - отсчитываем
                if (this.respawnTimer && this.respawnTimer > 0) {
                    this.respawnTimer--;
                    
                    if (this.respawnTimer <= 0) {
                        // Воскрешаем!
                        this.obj.hp = this.obj.maxHp;
                        this.obj.isDead = false;
                        this.obj.mesh.visible = true;
                        this.state = 'idle';
                        this.respawnTimer = null;
                        
                        // Восстанавливаем полоску HP
                        this.hpBarFill.scale.x = 1;
                        this.hpBarFill.position.x = 0;
                        this.hpBarMat.color.setHex(0x00ff00);
                    }
                }
                return; // Пока мертв - ничего не делаем
            }
            // ---------------------------------

            const myPos = this.obj.mesh.position;
            const distToPlayer = myPos.distanceTo(playerPos);

            // Логика поведения
            if (this.obj.behavior === 'chase' || (this.obj.behavior === 'random' && this.obj.hp < this.obj.maxHp)) {
                this.state = 'chase';
            } else if (this.obj.behavior === 'random' && this.state === 'idle' && Math.random() < 0.02) {
                this.state = 'wander';
                // Увеличили радиус брожения
                this.wanderTarget = new THREE.Vector3(myPos.x + (Math.random() - 0.5) * 8, myPos.y, myPos.z + (Math.random() - 0.5) * 8);
            }

            if (this.state === 'chase') {
                if (distToPlayer > this.attackRange) {
                    const dir = new THREE.Vector3().subVectors(playerPos, myPos).normalize();
                    myPos.x += dir.x * this.speed;
                    myPos.z += dir.z * this.speed;
                    this.obj.mesh.lookAt(new THREE.Vector3(playerPos.x, myPos.y, playerPos.z));
                } else if (this.attackCooldown <= 0) {
                    this.performAttack();
                    this.attackCooldown = 90;
                }
            } 
            // ПОЧИНЕННОЕ БРОЖЕНИЕ
            else if (this.state === 'wander' && this.wanderTarget) {
                const dir = new THREE.Vector3().subVectors(this.wanderTarget, myPos).normalize();
                myPos.x += dir.x * this.speed * 0.5; // Идем медленнее
                myPos.z += dir.z * this.speed * 0.5;
                this.obj.mesh.lookAt(new THREE.Vector3(this.wanderTarget.x, myPos.y, this.wanderTarget.z));
                
                if (myPos.distanceTo(this.wanderTarget) < 0.5) {
                    this.state = 'idle'; // Дошли до точки, стоим
                }
            }

            if (this.attackCooldown > 0) this.attackCooldown--;

            const camera = getCamera();
            if (camera) this.hpBarGroup.lookAt(camera.position);
        }

        performAttack() {
            let atkDamage = this.obj.atk || 0;
            if (this.obj.atkVarId && this.obj.atkVarId > 0 && $gameVariables) {
                atkDamage = $gameVariables.value(this.obj.atkVarId) || 0;
            }

            playerHP -= atkDamage;
            if (playerHP < 0) playerHP = 0;
            
            console.log(`Враг атакует! Урон: ${atkDamage}. HP игрока: ${playerHP}`);
            
            if (playerHP <= 0) {
                console.log("Игрок погиб! Возврат на спавн.");
                playerHP = playerMaxHP; 
                
                let sp = (window.Maker3D && window.Maker3D.getSpawnPoint) ? window.Maker3D.getSpawnPoint() : {x:0, y:0.5, z:0};
                
                // ИСПОЛЬЗУЕМ НОВЫЙ API ОСНОВНОГО ПЛАГИНА
                if (window.Maker3D && window.Maker3D.setPlayerPos) {
                    window.Maker3D.setPlayerPos(sp.x, sp.y, sp.z);
                    window.Maker3D.resetPlayerVelocity();
                }
            }
        }

        takeDamage(damage) {
            if (this.obj.isDead) return; // Если уже мертв - урон не проходит
            // --- НОВОЕ: СОЗДАЕМ ЛЕТАЮЩУЮ ЦИФРУ ---
            let textColor = '#ffff00'; // Желтый для обычного урона
            if (damage >= 50) textColor = '#ff3300'; // Красный для критического/большого урона
            else if (damage <= 5) textColor = '#aaaaaa'; // Серый для слабого урона
            
            const textPos = this.obj.mesh.position.clone();
            activeFloatingTexts.push(new FloatingText3D(textPos, damage, textColor));
            // --------------------------------------
			this.obj.hp -= damage;
            if (this.obj.hp < 0) this.obj.hp = 0;

            const hpPercent = this.obj.hp / this.obj.maxHp;
            this.hpBarFill.scale.x = hpPercent;
            this.hpBarFill.position.x = -(1 - hpPercent) / 2; 

            if (hpPercent < 0.3) this.hpBarMat.color.setHex(0xff0000); 
            else if (hpPercent < 0.6) this.hpBarMat.color.setHex(0xffff00);

            if (this.obj.mesh.material && this.obj.mesh.material.color) {
                this.obj.mesh.material.color.setHex(0xffffff);
                setTimeout(() => { if(this.obj.mesh && this.obj.mesh.material) this.obj.mesh.material.color.setHex(this.origColor); }, 80);
            }

            // --- НОВАЯ ЛОГИКА СМЕРТИ ---
            if (this.obj.hp <= 0) {
                this.obj.isDead = true;
                this.obj.mesh.visible = false;
                
                // Если есть время респауна - запускаем таймер
                if (this.obj.respawnTime && this.obj.respawnTime > 0) {
                    this.respawnTimer = this.obj.respawnTime;
                } else {
                    // Если респауна нет - удаляем из массива навсегда
                    activeAI = activeAI.filter(e => e !== this);
                }
            }
        }

        die() {
            this.obj.mesh.visible = false;
            activeAI = activeAI.filter(e => e !== this);
        }
    }

    // ---------------------------------------------------------
    // АТАКИ ИГРОКА
    // ---------------------------------------------------------
    
    // E / У — Ближний бой (Меч)
    window.Maker3D.onPlayerAttack = function() {
        if (playerAttackCooldown > 0 || window.Maker3D.isDialogueActive()) return;

        const scene = getScene();
        if (!scene) return;

        playerAttackCooldown = 20;

        const playerPos = window.Maker3D.getPlayerPos();
        const playerMesh = window.Maker3D.getPlayerMesh();
        
        const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(playerMesh.quaternion).normalize();
        const hitboxCenter = new THREE.Vector3().copy(playerPos).add(forward.multiplyScalar(1.2));

        const hitboxRadius = 1.5;

        // БЕЗОПАСНОЕ ПОЛУЧЕНИЕ ATK ИГРОКА
        const leader = $gameParty ? $gameParty.leader() : null;
        const playerAtk = leader ? leader.param(2) : 10;

        activeAI.forEach(ai => {
            if (ai.obj.hp <= 0) return;
            const dist = ai.obj.mesh.position.distanceTo(hitboxCenter);
            if (dist < hitboxRadius) {
                // ВЫЧИТАЕМ ЗАЩИТУ ВРАГА (DEF = param(3)), А НЕ ЕГО АТАКУ!
                const enemyDef = ai.obj.enemyId > 0 && $dataEnemies[ai.obj.enemyId] ? $dataEnemies[ai.obj.enemyId].params[3] : 0;
                const damage = Math.max(1, playerAtk - enemyDef); 
                
                ai.takeDamage(damage);
                
                const knockDir = new THREE.Vector3().subVectors(ai.obj.mesh.position, playerPos).normalize();
                ai.obj.mesh.position.add(knockDir.multiplyScalar(0.5));
            }
        });

        // Визуализация замаха
        const hitGeo = new THREE.SphereGeometry(hitboxRadius, 8, 8);
        const hitMat = new THREE.MeshBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.3 });
        const hitMesh = new THREE.Mesh(hitGeo, hitMat);
        hitMesh.position.copy(hitboxCenter);
        scene.add(hitMesh);
        setTimeout(() => { if(getScene()) getScene().remove(hitMesh); }, 120);

        playerMesh.material.color.setHex(0x88ffcc);
        setTimeout(() => { if(playerMesh) playerMesh.material.color.setHex(0x00ff88); }, 80);
    };

    // ЛКМ — Дальнобойе (Лук/Магия)
    window.Maker3D.onPlayerShoot = function() {
        if (playerShootCooldown > 0 || window.Maker3D.isDialogueActive()) return;

        const scene = getScene();
        if (!scene) return;

        playerShootCooldown = 25;

        const playerPos = window.Maker3D.getPlayerPos();
        const playerMesh = window.Maker3D.getPlayerMesh();
        const camera = window.Maker3D.camera;

        // БЕЗОПАСНОЕ ПОЛУЧЕНИЕ ATK ИГРОКА
        const leader = $gameParty ? $gameParty.leader() : null;
        const playerAtk = leader ? leader.param(2) : 10;

        let direction;
        
        if (window.Maker3D.isAiming()) {
            direction = new THREE.Vector3();
            camera.getWorldDirection(direction);
        } else {
            direction = new THREE.Vector3(0, 0, 1).applyQuaternion(playerMesh.quaternion).normalize();
        }
        
        // Передаём урон в снаряд
        const projectile = new Projectile3D(playerPos, direction, playerAtk);
        activeProjectiles.push(projectile);
    };

    // ---------------------------------------------------------
    // ВВОД
    // ---------------------------------------------------------
    document.addEventListener('keydown', function(e) {
        if (e.key === 'e' || e.key === 'E' || e.key === 'у' || e.key === 'У') {
            window.Maker3D.onPlayerAttack(); 
        }
    });

    // ---------------------------------------------------------
    // ИНИЦИАЛИЗАЦИЯ И ИГРОВОЙ ЦИКЛ
    // ---------------------------------------------------------
    function initBattleScene() {
        activeAI = [];
        activeProjectiles = [];
        const objects = window.Maker3D.getObjects();
        if (!objects) return;

        objects.forEach(obj => {
            if (obj.bodyType === 'moving' && obj.mesh) {
                obj.mesh.visible = true; 
                
                // Сохраняем оригинальную позицию перед стартом теста!
                obj.origPosition = obj.mesh.position.clone();
                obj.origRotation = obj.mesh.rotation.clone();
                
                const ai = new AIController(obj);
                activeAI.push(ai);
                obj.ai = ai; 
            }
        });
    }

    // Функция сброса боевки при возврате в редактор
    function resetBattleScene() {
        const objects = window.Maker3D.getObjects();
        if (objects) {
            objects.forEach(obj => {
                if (obj.bodyType === 'moving' && obj.ai) {
                    obj.mesh.visible = true;      
                    obj.hp = obj.maxHp;           
                    
                    // Возвращаем на сохраненную позицию
                    if (obj.origPosition) {
                        obj.mesh.position.copy(obj.origPosition);
                    }
                    if (obj.origRotation) {
                        obj.mesh.rotation.copy(obj.origRotation);
                    }

                    if (obj.mesh.material) {
                        obj.mesh.material.color.setHex(obj.ai.origColor); 
                        obj.mesh.material.opacity = obj.ai.origOpacity;   
                    }
                    if (obj.ai.hpBarGroup) {
                        obj.mesh.remove(obj.ai.hpBarGroup); 
                    }
                    delete obj.ai; 
                    delete obj.origPosition;
                    delete obj.origRotation;
                }
            });
        }
        activeAI = [];
        activeProjectiles.forEach(p => p.destroy());
        activeProjectiles = [];
		activeFloatingTexts.forEach(t => t.destroy());
    }

    const _Spriteset_Map_update = Spriteset_Map.prototype.update;
    Spriteset_Map.prototype.update = function() {
        _Spriteset_Map_update.call(this);

        if (!window.Maker3D.renderer || window.Maker3D.isEditorMode()) return;

        // ОБНОВЛЯЕМ UI КАЖДЫЙ КАДР
        if (window.Maker3D.updateDynamicUI) window.Maker3D.updateDynamicUI();

        if (playerAttackCooldown > 0) playerAttackCooldown--;

        if (playerAttackCooldown > 0) playerAttackCooldown--;
        if (playerShootCooldown > 0) playerShootCooldown--;

        const playerPos = window.Maker3D.getPlayerPos();
        
        activeAI.forEach(ai => ai.update(playerPos));
        activeProjectiles.forEach(p => p.update());
		activeFloatingTexts.forEach(t => t.update()); 
        if (playerHP <= 0) {
            console.log("Игрок погиб!");
            playerHP = playerMaxHP; 
        }
    };

    window.Maker3D.initBattleScene = initBattleScene;
    window.Maker3D.resetBattleScene = resetBattleScene;
        window.Maker3D.clearBattleScene = function() { 
        activeAI = []; 
        activeProjectiles.forEach(p => p.destroy()); 
        activeProjectiles = []; 
        activeFloatingTexts.forEach(t => t.destroy());
    };

    // --- НОВЫЕ ЭКСПОРТЫ ДЛЯ UI ---
    window.Maker3D.getPlayerHP = () => playerHP;
    window.Maker3D.getPlayerMaxHP = () => playerMaxHP;
    // --------------------------------
})();