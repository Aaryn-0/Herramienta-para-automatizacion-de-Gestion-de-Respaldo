const assert = require('assert');
const path = require('path');
const fs = require('fs');

console.log('================================================================');
console.log(' INICIANDO BATERÍA DE PRUEBAS AUTOMATIZADAS - ORACLE BACKUP TOOL');
console.log('================================================================');

// 1. Probar Base de Datos Local
const db = require('../src/database/db');
console.log('\n[TEST 1] Verificando Base de Datos JSON Persistente...');
const dbs = db.getDatabases();
assert(Array.isArray(dbs) && dbs.length > 0, 'Debe haber bases de datos inicializadas');
console.log(`✓ Bases de datos cargadas: ${dbs.length} encontradas.`);

const strats = db.getStrategies();
assert(Array.isArray(strats) && strats.length > 0, 'Debe haber estrategias inicializadas');
console.log(`✓ Estrategias cargadas: ${strats.length} encontradas.`);

// 2. Probar Generador RMAN para Escenario 1 (24/7 en ARCHIVELOG)
const rmanGenerator = require('../src/services/rmanGenerator');
console.log('\n[TEST 2] Verificando Generador RMAN para Base 24/7 (ARCHIVELOG)...');
const archDb = dbs.find(d => d.logMode === 'ARCHIVELOG');
const strat24x7 = strats.find(s => s.databaseId === archDb.id) || strats[0];
const rman24x7 = rmanGenerator.generateScript(strat24x7, archDb);

assert(rman24x7.script.includes('RUN {'), 'El script debe contener bloque RUN');
assert(rman24x7.script.includes('ALLOCATE CHANNEL'), 'Debe asignar canales');
assert(rman24x7.script.includes('ARCHIVELOG ALL DELETE ALL INPUT'), 'En ARCHIVELOG debe respaldar y purgar redo logs');
assert(rman24x7.script.includes('RESTORE DATABASE VALIDATE'), 'Debe incluir validación de bloques');
console.log('✓ Script RMAN 24/7 ARCHIVELOG generado con directivas de alta disponibilidad.');

// 3. Probar Generador RMAN para Escenario 2 (NOARCHIVELOG)
console.log('\n[TEST 3] Verificando Generador RMAN para Escenario 2 No Archive (NOARCHIVELOG)...');
const noArchDb = dbs.find(d => d.logMode === 'NOARCHIVELOG');
const stratNoArch = strats.find(s => s.id === 'strat-noarchive-cold');
const rmanNoArch = rmanGenerator.generateScript(stratNoArch, noArchDb);

assert(rmanNoArch.warnings.some(w => w.code === 'WARN_NOARCHIVELOG'), 'Debe emitir advertencia preventiva obligatoria');
assert(rmanNoArch.script.includes("SQL 'SHUTDOWN IMMEDIATE';"), 'En NOARCHIVELOG debe cerrar la BD');
assert(rmanNoArch.script.includes("SQL 'STARTUP MOUNT';"), 'En NOARCHIVELOG debe montar en frío');
assert(rmanNoArch.script.includes("SQL 'ALTER DATABASE OPEN';"), 'Debe reabrir tras el respaldo');
console.log('✓ Script RMAN Escenario 2 No Archive generado con advertencia preventiva y Cold Backup.');

// 4. Probar Asistente Inteligente de Estrategias Automáticas
const strategyRecommender = require('../src/services/strategyRecommender');
console.log('\n[TEST 4] Verificando Generador Automático de Estrategias (Recomendador)...');
const autoStrat24x7 = strategyRecommender.generateAutomaticStrategy({
  database: archDb,
  targetProfile: '24X7_CRITICA',
  backupWindow: '22:30',
  responsible: 'DBA Automation Test'
});
assert(autoStrat24x7.priority === 'ALTA', '24/7 debe ser Prioridad ALTA');
assert(autoStrat24x7.backupType === 'INCREMENTAL_NIVEL_1_ACUMULATIVO', 'Debe recomendar Nivel 1 Acumulativo para acotar RTO');
console.log('✓ Estrategia 24/7 generada automáticamente con justificación técnica MAA.');

const autoStratNoArch = strategyRecommender.generateAutomaticStrategy({
  database: noArchDb,
  targetProfile: 'ESCENARIO_2_NOARCHIVE',
  backupWindow: '02:00'
});
assert(autoStratNoArch.mode === 'OFFLINE_CONSISTENTE', 'NoArchive debe ser OFFLINE_CONSISTENTE');
assert(autoStratNoArch.scope.archivedRedoLogs === false, 'NoArchive no puede respaldar archivelogs');
console.log('✓ Estrategia Escenario 2 No Archive generada automáticamente con restricciones aplicadas.');

// 5. Probar Motor de Control Preventivo y Alertas
const preventiveControlService = require('../src/services/preventiveControlService');
console.log('\n[TEST 5] Verificando Motor de Control Preventivo y Alertas...');
const evalResult = preventiveControlService.evaluateControls();
assert(evalResult.alerts.length > 0, 'Debe detectar alertas preventivas activas');
assert(evalResult.alerts.some(a => a.category === 'ARCHIVELOG_MODE'), 'Debe alertar base en NOARCHIVELOG');
assert(evalResult.riskMatrix.length >= 6, 'Debe presentar Matriz de Control Preventivo completa');
assert(typeof evalResult.summary.healthScore === 'number', 'Debe calcular Índice de Salud Preventiva');
console.log(`✓ Control Preventivo verificado: ${evalResult.alerts.length} alertas detectadas, Salud: ${evalResult.summary.healthScore}%.`);

// 6. Probar Ejecutor de RMAN (Simulación controlada)
const rmanExecutor = require('../src/services/rmanExecutor');
console.log('\n[TEST 6] Verificando Ejecutor de RMAN y Generación de Evidencia...');
rmanExecutor.executeStrategy({
  strategyId: strat24x7.id,
  isSimulation: true,
  simulationType: 'SUCCESS'
}).then(execSuccess => {
  assert(execSuccess.result === 'EXITOSO', 'La ejecución simulada debe ser exitosa');
  assert(execSuccess.filesGenerated.length > 0, 'Debe generar nombres de archivos físicos');
  assert(execSuccess.filesVerified === true, 'Los archivos deben verificarse');
  assert(execSuccess.rmanOutputLog.includes('Recovery Manager complete'), 'Debe contener log RMAN');
  console.log('✓ Evidencia de ejecución exitosa generada e integrada en catálogo.');

  // Probar simulación controlada de error NOARCHIVELOG
  return rmanExecutor.executeStrategy({
    strategyId: strat24x7.id,
    isSimulation: true,
    simulationType: 'ERROR_NOARCHIVELOG'
  });
}).then(execFail => {
  assert(execFail.result === 'FALLIDO', 'Debe fallar con simulación de error');
  assert(execFail.errorMessage.includes('RMAN-06149'), 'Debe contener código de error RMAN-06149');
  console.log('✓ Simulación controlada de error RMAN-06149 verificada con éxito.');

  console.log('\n================================================================');
  console.log(' ¡TODAS LAS PRUEBAS AUTOMATIZADAS PASARON SATISFACTORIAMENTE! ');
  console.log('================================================================\n');
}).catch(err => {
  console.error('\n❌ ERROR EN PRUEBAS:', err);
  process.exit(1);
});
