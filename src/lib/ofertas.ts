// Motor de precios con ofertas, compartido por Ventas y Apartados.
//
// Hay dos tipos de oferta:
//  1. "N por $X" (configurada en el inventario o en un Grupo de Oferta): cualquier
//     combinación de N prendas que compartan la oferta cuesta $X.
//  2. Promoción especial (combo), configurada en /dashboard/ofertas: un precio fijo
//     para un paquete formado por componentes, p. ej. "1 filipina + 1 pantalón = $110"
//     o "2 pantalones = $130". Cada componente dice cuántas prendas lleva y qué
//     prendas valen para él. Una prenda puede estar en varias promociones.
//
// El carrito busca la combinación de ofertas que deja el total MÁS BAJO para el
// cliente; lo que no entra en ninguna oferta se cobra a su precio suelto.

/** Llave de una prenda dentro de una promoción: `${pacaId}/${prendaId}`. */
export const prendaPromoKey = (pacaId: string, prendaId: string) => `${pacaId}/${prendaId}`;

export type ComponentePromo = {
  nombre: string;     // Ej: "Pantalón quirúrgico"
  cantidad: number;   // Cuántas prendas de este componente lleva el paquete
  prendas: string[];  // prendaPromoKey de las prendas que valen para este componente
};

export type PromoEspecial = {
  id: string;
  nombre: string;     // Ej: "Filipina + pantalón"
  precio: number;     // Precio del paquete completo
  componentes: ComponentePromo[];
};

/** Lo mínimo que el motor necesita de cada renglón del carrito. */
export type CartLineForPricing = {
  id: string;
  pacaId: string;
  precioVenta: number;
  precioIndividual?: number;
  ofertaCantidad?: number;
  ofertaPrecio?: number;
  grupoOfertaId?: string;
  /** Copia de las promociones especiales en las que participa la prenda (por id). */
  promosEspeciales?: Record<string, PromoEspecial>;
  precioAnulado?: number;
  cantidadEnCarrito: number | '';
};

export type PricedUnit<T> = {
  key: string;          // `${pacaId}-${id}` (misma llave que usan las pantallas)
  item: T;
  effectivePrice: number;
};

export type PromoAplicada = { nombre: string; veces: number; precio: number };

export type CartPricing<T> = {
  pricedUnits: PricedUnit<T>[];
  rawSubtotal: number;
  total: number;
  discount: number;
  subtotalPorItem: Map<string, number>;
  promosAplicadas: PromoAplicada[];
};

export const precioSuelto = (item: Pick<CartLineForPricing, 'precioIndividual' | 'precioVenta'>) =>
  item.precioIndividual || item.precioVenta;

// Misma regla de siempre para "N por $X": por defecto solo se combinan prendas de la
// MISMA paca con la misma oferta; si la prenda está en un Grupo de Oferta, se usa el grupo.
export function getOfferGroupKey(item: Pick<CartLineForPricing, 'pacaId' | 'ofertaCantidad' | 'ofertaPrecio' | 'grupoOfertaId'>): string {
  if (item.grupoOfertaId) {
    return `grupo:${item.grupoOfertaId}`;
  }
  return `paca:${item.pacaId}:${item.ofertaCantidad}-${item.ofertaPrecio}`;
}

const cents = (n: number) => Math.round(n * 100) / 100;

// --- Representación interna para el optimizador ---
type Oferta = {
  nombre: string;
  precio: number;
  slots: { cantidad: number; tipos: number[] }[]; // tipos = índices de renglones válidos
};
// Un "llenado" de una oferta: cuántas unidades toma de cada tipo.
type Llenado = { usa: number[] };

const MAX_ESTADOS = 20000;

export function computeCartPricing<T extends CartLineForPricing>(cart: T[]): CartPricing<T> {
  const pricedUnits: PricedUnit<T>[] = [];
  const lineKey = (item: T) => `${item.pacaId}-${item.id}`;

  // 1) Renglones con precio cambiado a mano: no entran en ofertas.
  // 2) El resto son "tipos" que el optimizador puede repartir entre ofertas.
  const tipos: T[] = [];
  const disponibles: number[] = [];
  cart.forEach(item => {
    const cantidad = Number(item.cantidadEnCarrito) || 0;
    if (cantidad <= 0) return;
    if (item.precioAnulado !== undefined && item.precioAnulado !== null) {
      for (let i = 0; i < cantidad; i++) {
        pricedUnits.push({ key: lineKey(item), item, effectivePrice: item.precioAnulado });
      }
      return;
    }
    tipos.push(item);
    disponibles.push(cantidad);
  });

  const precios = tipos.map(t => precioSuelto(t));

  // --- Armar la lista de ofertas que aplican a este carrito ---
  const ofertas: Oferta[] = [];

  // "N por $X"
  const gruposNx = new Map<string, number[]>();
  tipos.forEach((t, idx) => {
    if (t.ofertaCantidad && t.ofertaPrecio) {
      const k = getOfferGroupKey(t);
      if (!gruposNx.has(k)) gruposNx.set(k, []);
      gruposNx.get(k)!.push(idx);
    }
  });
  gruposNx.forEach(idxs => {
    const t = tipos[idxs[0]];
    ofertas.push({
      nombre: `${t.ofertaCantidad} x $${t.ofertaPrecio}`,
      precio: t.ofertaPrecio!,
      slots: [{ cantidad: t.ofertaCantidad!, tipos: idxs }],
    });
  });

  // Promociones especiales (se juntan desde las prendas del carrito, sin repetir)
  const promos = new Map<string, PromoEspecial>();
  tipos.forEach(t => Object.values(t.promosEspeciales || {}).forEach(p => promos.set(p.id, p)));
  promos.forEach(p => {
    const slots = (p.componentes || []).map(c => {
      const validas = new Set(c.prendas || []);
      return {
        cantidad: Number(c.cantidad) || 0,
        tipos: tipos.map((t, idx) => (validas.has(prendaPromoKey(t.pacaId, t.id)) ? idx : -1)).filter(i => i >= 0),
      };
    });
    if (slots.length > 0 && slots.every(s => s.cantidad > 0 && s.tipos.length > 0) && p.precio > 0) {
      ofertas.push({ nombre: p.nombre, precio: p.precio, slots });
    }
  });

  // --- Todas las formas de llenar una oferta con lo disponible ---
  const llenados = (oferta: Oferta, counts: number[]): Llenado[] => {
    const result: Llenado[] = [];
    const usa = new Array(counts.length).fill(0);
    const llenarSlot = (s: number) => {
      if (s === oferta.slots.length) {
        result.push({ usa: [...usa] });
        return;
      }
      const slot = oferta.slots[s];
      // Combinaciones con repetición (en orden de índice para no duplicar permutaciones)
      const elegir = (desde: number, faltan: number) => {
        if (faltan === 0) {
          llenarSlot(s + 1);
          return;
        }
        for (let k = desde; k < slot.tipos.length; k++) {
          const tipo = slot.tipos[k];
          if (counts[tipo] - usa[tipo] > 0) {
            usa[tipo]++;
            elegir(k, faltan - 1);
            usa[tipo]--;
          }
        }
      };
      elegir(0, slot.cantidad);
    };
    llenarSlot(0);
    return result;
  };

  const costoSuelto = (counts: number[]) => counts.reduce((sum, c, i) => sum + c * precios[i], 0);

  // --- Búsqueda del total más bajo (con memoria) ---
  type Plan = { costo: number; ofertaIdx: number; llenado: Llenado | null };
  const memo = new Map<string, Plan>();
  let excedido = false;

  const mejor = (counts: number[]): number => {
    const key = counts.join(',');
    const cached = memo.get(key);
    if (cached) return cached.costo;
    if (memo.size > MAX_ESTADOS) {
      excedido = true;
      return costoSuelto(counts);
    }

    // Opción base: todo suelto
    let plan: Plan = { costo: costoSuelto(counts), ofertaIdx: -1, llenado: null };
    ofertas.forEach((oferta, oi) => {
      for (const llenado of llenados(oferta, counts)) {
        const resto = counts.map((c, i) => c - llenado.usa[i]);
        const costo = oferta.precio + mejor(resto);
        if (costo < plan.costo - 0.0001) {
          plan = { costo, ofertaIdx: oi, llenado };
        }
      }
    });
    memo.set(key, plan);
    return plan.costo;
  };

  // --- Plan alternativo si el carrito es enorme: aplicar la oferta que más ahorra, una y otra vez ---
  const planVoraz = (counts: number[]): { ofertaIdx: number; llenado: Llenado }[] => {
    const pasos: { ofertaIdx: number; llenado: Llenado }[] = [];
    let current = [...counts];
    for (;;) {
      let elegido: { ofertaIdx: number; llenado: Llenado; ahorro: number } | null = null;
      ofertas.forEach((oferta, oi) => {
        for (const llenado of llenados(oferta, current)) {
          const ahorro = llenado.usa.reduce((s, u, i) => s + u * precios[i], 0) - oferta.precio;
          if (ahorro > 0.0001 && (!elegido || ahorro > elegido.ahorro)) {
            elegido = { ofertaIdx: oi, llenado, ahorro };
          }
        }
      });
      if (!elegido) break;
      const e = elegido as { ofertaIdx: number; llenado: Llenado; ahorro: number };
      pasos.push({ ofertaIdx: e.ofertaIdx, llenado: e.llenado });
      current = current.map((c, i) => c - e.llenado.usa[i]);
    }
    return pasos;
  };

  let pasos: { ofertaIdx: number; llenado: Llenado }[] = [];
  if (ofertas.length > 0) {
    mejor(disponibles);
    if (excedido) {
      pasos = planVoraz(disponibles);
    } else {
      let current = [...disponibles];
      for (;;) {
        const plan = memo.get(current.join(','));
        if (!plan || plan.ofertaIdx < 0 || !plan.llenado) break;
        pasos.push({ ofertaIdx: plan.ofertaIdx, llenado: plan.llenado });
        current = current.map((c, i) => c - plan.llenado!.usa[i]);
      }
    }
  }

  // --- Precios por unidad ---
  const restantes = [...disponibles];
  const aplicadas = new Map<string, PromoAplicada>();
  pasos.forEach(({ ofertaIdx, llenado }) => {
    const oferta = ofertas[ofertaIdx];
    const unidades: number[] = [];
    llenado.usa.forEach((u, i) => { for (let k = 0; k < u; k++) unidades.push(i); });
    const sumaSuelta = unidades.reduce((s, i) => s + precios[i], 0);
    // El precio del paquete se reparte en proporción al precio suelto de cada prenda
    // (así las ganancias por paca salen bien); los centavos sobrantes van a la última.
    let asignado = 0;
    unidades.forEach((i, n) => {
      const precio = n === unidades.length - 1
        ? cents(oferta.precio - asignado)
        : cents(sumaSuelta > 0 ? (oferta.precio * precios[i]) / sumaSuelta : oferta.precio / unidades.length);
      asignado = cents(asignado + precio);
      pricedUnits.push({ key: lineKey(tipos[i]), item: tipos[i], effectivePrice: precio });
      restantes[i]--;
    });
    const prev = aplicadas.get(oferta.nombre);
    aplicadas.set(oferta.nombre, { nombre: oferta.nombre, precio: oferta.precio, veces: (prev?.veces || 0) + 1 });
  });
  restantes.forEach((c, i) => {
    for (let k = 0; k < c; k++) {
      pricedUnits.push({ key: lineKey(tipos[i]), item: tipos[i], effectivePrice: precios[i] });
    }
  });

  const rawSubtotal = cents(pricedUnits.reduce((sum, u) => {
    const anulado = u.item.precioAnulado;
    return sum + (anulado !== undefined && anulado !== null ? anulado : precioSuelto(u.item));
  }, 0));
  const total = cents(pricedUnits.reduce((sum, u) => sum + u.effectivePrice, 0));

  const subtotalPorItem = new Map<string, number>();
  pricedUnits.forEach(u => {
    subtotalPorItem.set(u.key, cents((subtotalPorItem.get(u.key) || 0) + u.effectivePrice));
  });

  return {
    pricedUnits,
    rawSubtotal,
    total,
    discount: cents(rawSubtotal - total),
    subtotalPorItem,
    promosAplicadas: Array.from(aplicadas.values()),
  };
}
