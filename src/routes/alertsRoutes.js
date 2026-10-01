const express = require('express');
const router = express.Router();
const preventiveControlService = require('../services/preventiveControlService');
const db = require('../database/db');

// Obtener estado del control preventivo en vivo
router.get('/', (req, res) => {
  const evaluation = preventiveControlService.evaluateControls();
  res.json({
    success: true,
    data: evaluation
  });
});

// Resolver o descartar alerta
router.post('/resolve/:id', (req, res) => {
  db.resolveAlert(req.params.id);
  res.json({ success: true, message: 'Alerta atendida' });
});

module.exports = router;
