const path = require('path');
const os = require('os');

const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const BACKUPS_DIR = path.join(ROOT_DIR, 'backups');
const SCRIPTS_DIR = path.join(ROOT_DIR, 'scripts');

module.exports = {
  PORT: process.env.PORT || 3000,
  ROOT_DIR,
  DATA_DIR,
  BACKUPS_DIR,
  SCRIPTS_DIR,
  DB_FILE: path.join(DATA_DIR, 'db.json'),
  
  // Umbrales de Control Preventivo
  THRESHOLDS: {
    MIN_DISK_FREE_GB: 5,            // Alerta si hay menos de 5 GB libres en destino
    WARNING_DISK_PERCENT: 15,       // Advertencia si queda menos del 15% de espacio
    MAX_HOURS_WITHOUT_BACKUP_HIGH: 24, // Alerta si BD con prioridad alta pasa >24h sin backup
    MAX_DAYS_WITHOUT_BACKUP_MED: 7,    // Alerta si BD con prioridad media pasa >7 días sin backup
  },

  // Detección de binarios Oracle
  ORACLE_BIN: {
    RMAN: 'C:\\app\\maaro\\product\\21c\\dbhomeXE\\bin\\rman.exe',
    SQLPLUS: 'C:\\app\\maaro\\product\\21c\\dbhomeXE\\bin\\sqlplus.exe'
  }
};
