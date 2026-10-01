const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./src/config');
const schedulerService = require('./src/services/schedulerService');

const databasesRoutes = require('./src/routes/databasesRoutes');
const strategiesRoutes = require('./src/routes/strategiesRoutes');
const executionsRoutes = require('./src/routes/executionsRoutes');
const alertsRoutes = require('./src/routes/alertsRoutes');
const schedulerRoutes = require('./src/routes/schedulerRoutes');

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir frontend estático
app.use(express.static(path.join(__dirname, 'public')));

// Rutas de API
app.use('/api/databases', databasesRoutes);
app.use('/api/strategies', strategiesRoutes);
app.use('/api/executions', executionsRoutes);
app.use('/api/alerts', alertsRoutes);
app.use('/api/scheduler', schedulerRoutes);

// Fallback a index.html para SPA
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Iniciar servidor y scheduler
const server = app.listen(config.PORT, () => {
  console.log(`========================================================================`);
  console.log(` GESTOR DE ESTRATEGIAS DE RESPALDO ORACLE (CONTROL PREVENTIVO RMAN)`);
  console.log(` Servidor activo en: http://localhost:${config.PORT}`);
  console.log(` Modo: Producción / Laboratorio Académico UNA EIF402`);
  console.log(`========================================================================`);
  
  // Iniciar planificador automático
  schedulerService.start();
});

// Manejo de apagado limpio
process.on('SIGINT', () => {
  console.log('\nCerrando servidor...');
  schedulerService.stop();
  server.close(() => {
    console.log('Servidor finalizado con éxito.');
    process.exit(0);
  });
});

module.exports = app;
