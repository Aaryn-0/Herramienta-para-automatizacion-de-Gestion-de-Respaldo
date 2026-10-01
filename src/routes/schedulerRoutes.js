const express = require('express');
const router = express.Router();
const schedulerService = require('../services/schedulerService');

// Obtener estado del scheduler
router.get('/status', (req, res) => {
  res.json({
    success: true,
    data: schedulerService.getStatus()
  });
});

// Alternar encendido/apagado del scheduler automático
router.post('/toggle', (req, res) => {
  if (schedulerService.isRunning) {
    schedulerService.stop();
  } else {
    schedulerService.start();
  }
  res.json({
    success: true,
    message: schedulerService.isRunning ? 'Planificador automático iniciado' : 'Planificador automático pausado',
    isRunning: schedulerService.isRunning
  });
});

// Generar scripts para automatizadores nativos (Windows Task Scheduler / Linux Cron / Oracle DBMS_SCHEDULER)
router.get('/native-scripts/:strategyId', (req, res) => {
  try {
    const scripts = schedulerService.generateNativeSchedulerScripts(req.params.strategyId);
    res.json({
      success: true,
      data: scripts
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
