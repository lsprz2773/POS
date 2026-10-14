import { z } from 'zod';
import { es } from 'zod/locales';

// Mensajes de validación en español para toda la aplicación.
z.config(es());

export * from './auth';
export * from './dates';
export * from './errors';
export * from './health';
export * from './history';
export * from './money';
export * from './permissions';
export * from './payments';
export * from './products';
export * from './reports';
export * from './sales';
export * from './store';
export * from './team';
export * from './team-owed';
export * from './team-reports';
export * from './workdays';
