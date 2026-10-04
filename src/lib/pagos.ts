// Métodos de pago de una venta directa. MIXTO = el cliente paga una parte en
// efectivo y otra por transferencia; en ese caso la venta guarda ambos montos.
export type MetodoPagoVenta = 'EFECTIVO' | 'TRANSFERENCIA' | 'MIXTO';

export type VentaConPago = {
  totalVenta: number;
  metodoPago: string;
  montoEfectivo?: number;
  montoTransferencia?: number;
};

/** Redondea a centavos para evitar residuos tipo 29.999999. */
export const redondearCentavos = (n: number) => Math.round(n * 100) / 100;

/**
 * Cuánto de una venta entró en efectivo y cuánto por transferencia.
 * Úsalo SIEMPRE que se sumen ventas por método de pago, para que las ventas
 * mixtas se repartan en su lugar y no se mezclen.
 */
export function repartirPagoVenta(venta: VentaConPago): { efectivo: number; transferencia: number } {
  const total = Number(venta.totalVenta) || 0;
  switch (venta.metodoPago) {
    case 'MIXTO':
      return {
        efectivo: Number(venta.montoEfectivo) || 0,
        transferencia: Number(venta.montoTransferencia) || 0,
      };
    case 'TRANSFERENCIA':
      return { efectivo: 0, transferencia: total };
    default:
      return { efectivo: total, transferencia: 0 };
  }
}

export type GastoConPago = {
  monto: number;
  metodoPago: string;
  montoEfectivo?: number;
  montoTransferencia?: number;
};

/**
 * Cuánto de un gasto salió del efectivo y cuánto de las transferencias.
 * Un gasto MIXTO (ej. comprar una paca con $2,000 de transferencias y $1,000 en
 * efectivo) descuenta cada parte de su propio dinero.
 */
export function repartirPagoGasto(gasto: GastoConPago): { efectivo: number; transferencia: number } {
  return repartirPagoVenta({
    totalVenta: gasto.monto,
    metodoPago: gasto.metodoPago,
    montoEfectivo: gasto.montoEfectivo,
    montoTransferencia: gasto.montoTransferencia,
  });
}

export function etiquetaMetodoPago(metodo: string): string {
  switch (metodo) {
    case 'EFECTIVO': return 'Efectivo';
    case 'TRANSFERENCIA': return 'Transferencia';
    case 'MIXTO': return 'Mixto';
    default: return metodo;
  }
}
