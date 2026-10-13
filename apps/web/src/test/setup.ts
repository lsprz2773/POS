import '@testing-library/jest-dom/vitest';
import { onlineManager } from '@tanstack/react-query';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
  // El gestor de conexión de TanStack Query es global: una prueba que simula "sin conexión" no debe
  // dejar en pausa las consultas de las siguientes.
  onlineManager.setOnline(true);
  // El borrador de venta vive en sessionStorage: no debe pasar de una prueba a otra.
  sessionStorage.clear();
});
