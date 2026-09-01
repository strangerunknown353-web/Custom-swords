/**
 * Custom Swords - behaviour pack script entry point.
 *
 * Declared in `manifest.json` as the script module's `entry`. It does nothing
 * but hand control to the bootstrap, so the lifecycle stays readable in one
 * place and this file never accumulates logic.
 *
 * Runs in Scripting V2 early execution: no world state may be touched here.
 */

import { start } from './core/bootstrap.js';

start();
