import { readFileSync } from 'fs';
import { join } from 'path';
import { HOME_DIR } from '../constants';
import { isServiceRunning, cleanupPidFile, getReferenceCount } from './processCheck';

export async function closeService() {
    const PID_FILE = join(HOME_DIR, '.claude-code-router.pid');
    const isRunning = await isServiceRunning()

    if (!isRunning) {
        console.log("No service is currently running.");
        return;
    }

    if (getReferenceCount() > 0) {
        return;
    }

    try {
        const pid = parseInt(readFileSync(PID_FILE, 'utf-8'));
        process.kill(pid);
        cleanupPidFile();
        console.log("claude code router service has been successfully stopped.");
    } catch (e) {
        console.log("Failed to stop the service. It may have already been stopped.");
        cleanupPidFile();
    }
}
