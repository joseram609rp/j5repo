import { ApiError } from './api';
export function loginErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403 && error.code === 'ORIGIN_REJECTED') return 'La dirección del portal no está autorizada. En desarrollo abre http://localhost:5173 y vuelve a entrar.';
    if (error.status === 401 && error.code === 'INVALID_CREDENTIALS') return 'Usuario o contraseña incorrectos, o cuenta inactiva.';
    if (error.status === 503) return 'El servicio o la base de datos no están disponibles. Reintenta en unos momentos.';
    if (error.status === 429) return 'Demasiados intentos. Espera unos minutos antes de volver a entrar.';
  }
  return 'No fue posible conectar con el portal. Comprueba la conexión y que el backend esté iniciado.';
}
