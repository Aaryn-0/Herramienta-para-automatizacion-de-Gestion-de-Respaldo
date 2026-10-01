const express = require('express');
const router = express.Router();
const db = require('../database/db');
const rmanGenerator = require('../services/rmanGenerator');
const strategyRecommender = require('../services/strategyRecommender');

// Listar todas las estrategias
router.get('/', (req, res) => {
  const strategies = db.getStrategies();
  // Enriquecer con nombre de base de datos
  const enriched = strategies.map(s => {
    const database = db.getDatabaseById(s.databaseId);
    return {
      ...s,
      databaseName: database ? database.name : 'No asignada',
      databaseLogMode: database ? database.logMode : 'DESCONOCIDO'
    };
  });
  res.json({ success: true, data: enriched });
});

// Obtener detalle de una estrategia
router.get('/:id', (req, res) => {
  const strategy = db.getStrategyById(req.params.id);
  if (!strategy) return res.status(404).json({ success: false, error: 'Estrategia no encontrada' });
  const database = db.getDatabaseById(strategy.databaseId);
  const scriptDetails = database ? rmanGenerator.generateScript(strategy, database) : null;
  res.json({ success: true, data: strategy, database, scriptDetails });
});

// Crear estrategia manual
router.post('/', (req, res) => {
  const { name, databaseId, backupType, priority } = req.body;
  if (!name || !databaseId || !backupType) {
    return res.status(400).json({ success: false, error: 'Nombre, base de datos y tipo de respaldo son obligatorios' });
  }

  const created = db.addStrategy(req.body);
  res.status(201).json({ success: true, data: created });
});

// Generador Automático Inteligente de Estrategias (Requisito clave: 24/7 y Escenario 2 No Archive)
router.post('/auto-generate', (req, res) => {
  const { databaseId, targetProfile, priority, backupWindow, responsible, autoSave } = req.body;
  if (!databaseId) {
    return res.status(400).json({ success: false, error: 'Debe seleccionar una base de datos' });
  }

  const database = db.getDatabaseById(databaseId);
  if (!database) {
    return res.status(404).json({ success: false, error: 'Base de datos no encontrada' });
  }

  const generatedStrategy = strategyRecommender.generateAutomaticStrategy({
    database,
    targetProfile,
    priority,
    backupWindow,
    responsible
  });

  const scriptDetails = rmanGenerator.generateScript(generatedStrategy, database);

  let saved = null;
  if (autoSave) {
    saved = db.addStrategy(generatedStrategy);
  }

  res.json({
    success: true,
    message: 'Estrategia generada automáticamente de acuerdo con el perfil seleccionado y las mejores prácticas Oracle.',
    strategy: saved || generatedStrategy,
    scriptDetails
  });
});

// Actualizar estrategia
router.put('/:id', (req, res) => {
  const updated = db.updateStrategy(req.params.id, req.body);
  if (!updated) return res.status(404).json({ success: false, error: 'Estrategia no encontrada' });
  res.json({ success: true, data: updated });
});

// Aprobación del Administrador (Requisito del flujo: Configuración -> Validación -> Construcción -> Aprobación -> Programación -> Ejecución)
router.patch('/:id/approve', (req, res) => {
  const { approvedBy } = req.body;
  const updated = db.updateStrategy(req.params.id, {
    isApproved: true,
    approvedBy: approvedBy || 'Administrador DBA',
    approvedAt: new Date().toISOString()
  });
  if (!updated) return res.status(404).json({ success: false, error: 'Estrategia no encontrada' });
  res.json({ success: true, message: 'Estrategia aprobada satisfactoriamente por el Administrador.', data: updated });
});

// Alternar estado ACTIVA / INACTIVA
router.patch('/:id/toggle-status', (req, res) => {
  const strategy = db.getStrategyById(req.params.id);
  if (!strategy) return res.status(404).json({ success: false, error: 'Estrategia no encontrada' });
  const newStatus = strategy.status === 'ACTIVA' ? 'INACTIVA' : 'ACTIVA';
  const updated = db.updateStrategy(req.params.id, { status: newStatus });
  res.json({ success: true, data: updated });
});

// Obtener script RMAN de una estrategia
router.get('/:id/script', (req, res) => {
  const strategy = db.getStrategyById(req.params.id);
  if (!strategy) return res.status(404).json({ success: false, error: 'Estrategia no encontrada' });
  const database = db.getDatabaseById(strategy.databaseId);
  if (!database) return res.status(404).json({ success: false, error: 'Base de datos asociada no encontrada' });

  const scriptDetails = rmanGenerator.generateScript(strategy, database);
  res.json({ success: true, data: scriptDetails, strategy, database });
});

// Eliminar estrategia
router.delete('/:id', (req, res) => {
  db.deleteStrategy(req.params.id);
  res.json({ success: true, message: 'Estrategia eliminada' });
});

module.exports = router;
