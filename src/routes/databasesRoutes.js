const express = require('express');
const router = express.Router();
const db = require('../database/db');
const oracleService = require('../services/oracleService');

// Listar todas las bases de datos
router.get('/', (req, res) => {
  const databases = db.getDatabases();
  res.json({ success: true, data: databases });
});

// Detectar automáticamente la base de datos Oracle local
router.get('/detect-local', (req, res) => {
  const binaries = oracleService.checkBinaries();
  if (!binaries.hasSqlPlus) {
    return res.json({
      success: false,
      message: 'Binario SQL*Plus no encontrado en el sistema local.',
      binaries
    });
  }

  const result = oracleService.queryLocalDatabase('XE');
  if (result.connected) {
    // Si la BD local no estaba registrada o se quiere actualizar:
    let existing = db.getDatabases().find(d => d.sid === 'XE' || d.name === 'XE_LOCAL');
    if (!existing) {
      existing = db.addDatabase({
        name: 'XE_LOCAL',
        sid: 'XE',
        host: 'localhost',
        port: 1521,
        isRealOracle: true,
        logMode: result.logMode,
        status: result.openMode === 'READ WRITE' ? 'OPEN' : result.openMode,
        openMode: result.openMode,
        description: 'Base de datos Oracle XE 21c local detectada automáticamente',
        criticality: 'ALTA',
        is24x7: true,
        allocatedSpaceGB: 15.0,
        tablespaces: result.tablespaces,
        datafiles: result.datafiles
      });
    } else {
      db.updateDatabase(existing.id, {
        logMode: result.logMode,
        openMode: result.openMode,
        tablespaces: result.tablespaces,
        datafiles: result.datafiles
      });
    }

    return res.json({
      success: true,
      message: 'Base de datos Oracle detectada y sincronizada exitosamente.',
      data: result,
      database: existing
    });
  } else {
    return res.json({
      success: false,
      message: 'No se pudo conectar a la base local XE: ' + result.error,
      binaries
    });
  }
});

// Obtener detalle de una BD
router.get('/:id', (req, res) => {
  const database = db.getDatabaseById(req.params.id);
  if (!database) {
    return res.status(404).json({ success: false, error: 'Base de datos no encontrada' });
  }
  res.json({ success: true, data: database });
});

// Registrar nueva BD
router.post('/', (req, res) => {
  const { name, sid, host, port, logMode, status, description, criticality, is24x7, tablespaces, datafiles } = req.body;
  if (!name || !sid) {
    return res.status(400).json({ success: false, error: 'El nombre y SID son obligatorios' });
  }

  const newDb = db.addDatabase({
    name,
    sid,
    host: host || 'localhost',
    port: port || 1521,
    isRealOracle: false,
    logMode: logMode || 'ARCHIVELOG',
    status: status || 'OPEN',
    openMode: 'READ WRITE',
    description: description || 'Base de datos Oracle registrada',
    criticality: criticality || 'MEDIA',
    is24x7: is24x7 === true || is24x7 === 'true',
    allocatedSpaceGB: req.body.allocatedSpaceGB || 50,
    tablespaces: tablespaces || ['SYSTEM', 'SYSAUX', 'USERS'],
    datafiles: datafiles || []
  });

  res.status(201).json({ success: true, data: newDb });
});

// Actualizar BD
router.put('/:id', (req, res) => {
  const updated = db.updateDatabase(req.params.id, req.body);
  if (!updated) {
    return res.status(404).json({ success: false, error: 'Base de datos no encontrada' });
  }
  res.json({ success: true, data: updated });
});

// Eliminar BD
router.delete('/:id', (req, res) => {
  db.deleteDatabase(req.params.id);
  res.json({ success: true, message: 'Base de datos y estrategias asociadas eliminadas' });
});

// Guía para cambiar de modo ARCHIVELOG / NOARCHIVELOG
router.get('/:id/archivelog-guide', (req, res) => {
  const database = db.getDatabaseById(req.params.id);
  if (!database) return res.status(404).json({ success: false, error: 'BD no encontrada' });

  res.json({
    success: true,
    currentMode: database.logMode,
    isNoArchive: database.logMode === 'NOARCHIVELOG',
    enableScript: oracleService.getEnableArchiveLogCommands(),
    disableScript: oracleService.getDisableArchiveLogCommands()
  });
});

module.exports = router;
