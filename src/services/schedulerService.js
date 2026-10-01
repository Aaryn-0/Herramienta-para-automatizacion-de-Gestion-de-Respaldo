const db = require('../database/db');
const rmanExecutor = require('./rmanExecutor');
const path = require('path');
const config = require('../config');

class SchedulerService {
  constructor() {
    this.intervalId = null;
    this.isRunning = false;
    this.lastCheck = null;
    this.nextScheduledRuns = [];
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log('[SchedulerService] Iniciando motor de automatización preventiva...');

    // Ejecutar chequeo cada 60 segundos
    this.intervalId = setInterval(() => {
      this.checkAndTriggerStrategies();
    }, 60000);

    // Primer cálculo inmediato
    this.checkAndTriggerStrategies();
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log('[SchedulerService] Motor de automatización detenido.');
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      lastCheck: this.lastCheck,
      nextScheduledRuns: this.calculateNextRuns()
    };
  }

  /**
   * Revisa qué estrategias coinciden con el momento actual y las dispara
   */
  async checkAndTriggerStrategies() {
    this.lastCheck = new Date().toISOString();
    const now = new Date();
    const currentHourMinute = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const daysMap = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'];
    const currentDay = daysMap[now.getDay()];

    const strategies = db.getStrategies();

    for (const strategy of strategies) {
      if (strategy.status !== 'ACTIVA') continue;
      if (!strategy.isApproved) continue; // Solo ejecutar estrategias aprobadas por el DBA

      const sched = strategy.schedule;
      if (!sched || !sched.time) continue;

      let shouldRun = false;

      if (sched.frequency === 'DIARIA' && sched.time === currentHourMinute) {
        if (!sched.daysOfWeek || sched.daysOfWeek.includes(currentDay)) {
          shouldRun = true;
        }
      } else if (sched.frequency === 'SEMANAL' && sched.time === currentHourMinute) {
        if (sched.daysOfWeek && sched.daysOfWeek.includes(currentDay)) {
          shouldRun = true;
        }
      }

      if (shouldRun) {
        console.log(`[SchedulerService] Disparando automáticamente estrategia: ${strategy.name}`);
        try {
          await rmanExecutor.executeStrategy({ strategyId: strategy.id, isSimulation: false });
        } catch (err) {
          console.error(`[SchedulerService] Error ejecutando estrategia ${strategy.name}:`, err);
        }
      }
    }
  }

  /**
   * Calcula la lista de próximas ejecuciones programadas
   */
  calculateNextRuns() {
    const strategies = db.getStrategies().filter(s => s.status === 'ACTIVA');
    const runs = [];

    const now = new Date();
    const daysMap = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'];

    strategies.forEach(strategy => {
      const sched = strategy.schedule;
      if (!sched || !sched.time) return;

      const [hours, minutes] = sched.time.split(':').map(Number);
      const targetDate = new Date();
      targetDate.setHours(hours, minutes, 0, 0);

      if (targetDate <= now) {
        targetDate.setDate(targetDate.getDate() + 1);
      }

      runs.push({
        strategyId: strategy.id,
        strategyName: strategy.name,
        databaseId: strategy.databaseId,
        priority: strategy.priority,
        scheduledTime: sched.time,
        frequency: sched.frequency,
        nextRunEstimate: targetDate.toISOString(),
        isApproved: strategy.isApproved
      });
    });

    return runs;
  }

  /**
   * Genera scripts para programadores nativos del SO (Windows Task Scheduler, Linux cron, Oracle DBMS_SCHEDULER)
   */
  generateNativeSchedulerScripts(strategyId) {
    const strategy = db.getStrategyById(strategyId);
    if (!strategy) throw new Error('Estrategia no encontrada');
    const database = db.getDatabaseById(strategy.databaseId);

    const time = strategy.schedule.time || '23:00';
    const [hh, mm] = time.split(':');
    const scriptPath = path.join(config.SCRIPTS_DIR, `rman_${strategy.id}.rman`).replace(/\\/g, '/');

    // 1. Windows Task Scheduler (PowerShell / CMD schtasks)
    const windowsCmd = `schtasks /Create /SC DAILY /TN "OracleBackup_${database.sid || 'DB'}_${strategy.id}" /TR "rman.exe target / @\\"${scriptPath}\\" log=\\"${config.BACKUPS_DIR}\\backup.log\\"" /ST ${time} /RU "SYSTEM" /F`;

    // 2. Linux Cron
    const cronExpression = `${parseInt(mm)} ${parseInt(hh)} * * * /u01/app/oracle/product/bin/rman target / @${scriptPath} > ${config.BACKUPS_DIR}/backup.log 2>&1`;

    // 3. Oracle DBMS_SCHEDULER (PL/SQL nativo en la base de datos)
    const plsqlScheduler = `
-- Script PL/SQL para automatización interna con DBMS_SCHEDULER
BEGIN
  DBMS_SCHEDULER.CREATE_JOB (
    job_name        => 'JOB_RMAN_${database.sid || 'DB'}_${strategy.priority}',
    job_type        => 'EXECUTABLE',
    job_action      => 'C:\\app\\maaro\\product\\21c\\dbhomeXE\\bin\\rman.exe',
    number_of_arguments => 4,
    start_date      => SYSTIMESTAMP,
    repeat_interval => 'FREQ=DAILY; BYHOUR=${parseInt(hh)}; BYMINUTE=${parseInt(mm)}; BYSECOND=0',
    enabled         => FALSE,
    comments        => 'Automatización de respaldo para estrategia: ${strategy.name}'
  );
  
  DBMS_SCHEDULER.SET_JOB_ARGUMENT_VALUE('JOB_RMAN_${database.sid || 'DB'}_${strategy.priority}', 1, 'target');
  DBMS_SCHEDULER.SET_JOB_ARGUMENT_VALUE('JOB_RMAN_${database.sid || 'DB'}_${strategy.priority}', 2, '/');
  DBMS_SCHEDULER.SET_JOB_ARGUMENT_VALUE('JOB_RMAN_${database.sid || 'DB'}_${strategy.priority}', 3, '@${scriptPath}');
  
  DBMS_SCHEDULER.ENABLE('JOB_RMAN_${database.sid || 'DB'}_${strategy.priority}');
END;
/
    `.trim();

    return {
      windowsCmd,
      cronExpression,
      plsqlScheduler
    };
  }
}

module.exports = new SchedulerService();
