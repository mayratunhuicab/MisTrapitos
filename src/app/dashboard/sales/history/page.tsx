"use client";

import { useState, useMemo, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { repartirPagoVenta, repartirPagoGasto, etiquetaMetodoPago } from '@/lib/pagos';
import { useFirestore, useCollection, useMemoFirebase, useUser, useStorage, usePaginatedCollection } from '@/firebase';
import { collection, collectionGroup, query, orderBy, doc, getDocs, runTransaction, getDoc, where, Timestamp, limit, startAfter, type QueryDocumentSnapshot, type DocumentData } from 'firebase/firestore';
import { ref as storageRef, deleteObject } from 'firebase/storage';
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ArrowLeft, MoreHorizontal, Eye, Trash2, DollarSign, Calendar as CalendarIcon, Download, Link as LinkIcon, TrendingDown, Banknote, Landmark, User } from 'lucide-react';
import { format, startOfDay, endOfDay, startOfWeek, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import type { UserOptions } from 'jspdf-autotable';


// Extend jsPDF with autoTable
interface jsPDFWithAutoTable extends jsPDF {
  autoTable: (options: UserOptions) => jsPDF;
}

type Apartado = {
  id: string;
};

type Venta = {
  id: string;
  totalVenta: number;
  metodoPago: string;
  montoEfectivo?: number;       // Solo en pago MIXTO
  montoTransferencia?: number;  // Solo en pago MIXTO
  fecha: { seconds: number; nanoseconds: number; };
  comprobanteUrl?: string;
  vendedorId?: string;
};

type VentaItem = {
    id: string;
    prendaId: string;
    pacaId: string;
    idPersonalizado: string;
    cantidad: number;
    precioVenta: number;
    tipoPrenda: string;
    genero?: string; // Solo existe en ventas registradas después de agregar este campo
};

type Gasto = {
  id: string;
  descripcion: string;
  monto: number;
  fecha: Timestamp;
  metodoPago: "EFECTIVO" | "TRANSFERENCIA" | "MIXTO";
  montoEfectivo?: number;       // Solo en gastos MIXTO
  montoTransferencia?: number;  // Solo en gastos MIXTO
};

type Pago = {
    id: string;
    monto: number;
    fecha: Timestamp;
    metodoPago: "EFECTIVO" | "TRANSFERENCIA";
};

const VENTAS_PAGE_SIZE = 50;

export default function SalesHistoryPage() {
  const firestore = useFirestore();
  const storage = useStorage();
  const { user } = useUser();
  const { toast } = useToast();

  const [selectedVenta, setSelectedVenta] = useState<Venta | null>(null);
  const [ventaItems, setVentaItems] = useState<VentaItem[]>([]);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  

  // Set initial date on client to avoid hydration errors
  useEffect(() => {
    if (!selectedDate) {
        setSelectedDate(new Date());
    }
  }, [selectedDate]);


  const dateRange = useMemo(() => {
    if (!selectedDate) return { start: null, end: null };
    const start = startOfDay(selectedDate);
    const end = endOfDay(selectedDate);
    return { start, end };
  }, [selectedDate]);

  // Lista en tiempo real, cargada por lotes: los cambios aparecen sin recargar.
  const ventasListQuery = useMemoFirebase(() => {
    if (!firestore || !user || !dateRange.start || !dateRange.end) return null;
    return query(
      collection(firestore, 'ventas'),
      where('fecha', '>=', dateRange.start),
      where('fecha', '<=', dateRange.end),
      orderBy('fecha', 'desc')
    );
  }, [firestore, user, dateRange.start, dateRange.end]);
  const {
    data: ventas,
    isLoading: isLoadingVentas,
    isLoadingMore: isLoadingMoreVentas,
    hasMore: hasMoreVentas,
    loadMore: loadMoreVentas,
    error: ventasError,
  } = usePaginatedCollection<Omit<Venta, 'id'>>(ventasListQuery, VENTAS_PAGE_SIZE);

  useEffect(() => {
    if (ventasError) {
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron cargar las ventas.' });
    }
  }, [ventasError, toast]);

  const gastosQuery = useMemoFirebase(() => {
    if (!firestore || !user || !dateRange.start || !dateRange.end) return null;
     return query(
        collection(firestore, 'gastos'), 
        where('fecha', '>=', dateRange.start),
        where('fecha', '<=', dateRange.end),
        orderBy('fecha', 'desc')
    );
  }, [firestore, user, dateRange]);
  const { data: gastos, isLoading: isLoadingGastos } = useCollection<Gasto>(gastosQuery);

  // Antes: se traían TODOS los apartados de la tienda y se lanzaba una consulta getDocs
  // por cada uno para revisar sus 'pagos' (con 300 apartados eran 300 consultas cada vez
  // que cambiaba el rango de fechas). Ahora: una sola consulta en tiempo real sobre el
  // grupo de colecciones 'pagos' de todos los apartados, filtrada por el rango visible.
  // Las reglas de Firestore ya permiten esta consulta (ver firestore.rules).
  const pagosQuery = useMemoFirebase(() => {
    if (!firestore || !user || !dateRange.start || !dateRange.end) return null;
    return query(
      collectionGroup(firestore, 'pagos'),
      where('fecha', '>=', dateRange.start),
      where('fecha', '<=', dateRange.end),
      orderBy('fecha', 'desc')
    );
  }, [firestore, user, dateRange]);
  const { data: pagos, isLoading: isLoadingPagos } = useCollection<Pago>(pagosQuery, { enabled: !!user });

  // Totales del día: TODAS las ventas del día (la tabla de abajo las carga por lotes de 50,
  // así que no sirve para sumar).
  const ventasDelDiaQuery = useMemoFirebase(() => {
    if (!firestore || !user || !dateRange.start || !dateRange.end) return null;
    return query(
      collection(firestore, 'ventas'),
      where('fecha', '>=', dateRange.start),
      where('fecha', '<=', dateRange.end),
      orderBy('fecha', 'desc')
    );
  }, [firestore, user, dateRange]);
  const { data: ventasDelDia, isLoading: isLoadingVentasDelDia } = useCollection<Venta>(ventasDelDiaQuery, { enabled: !!user });

  // --- Lo que viene de días anteriores ---
  // La caja arrastra lo que sobró desde el lunes de esa semana hasta el día anterior
  // (los gastos pueden usar el dinero acumulado de la semana, así que el balance del día
  // se calcula sobre ese acumulado y no queda en negativo). El lunes empieza en $0.
  const rangoAnterior = useMemo(() => {
    if (!selectedDate || !dateRange.start) return null;
    const inicioSemana = startOfWeek(selectedDate, { weekStartsOn: 1 });
    if (isSameDay(inicioSemana, selectedDate)) return null; // lunes: no hay días anteriores
    return { start: inicioSemana, end: dateRange.start };
  }, [selectedDate, dateRange.start]);

  const prevVentasQuery = useMemoFirebase(() => {
    if (!firestore || !user || !rangoAnterior) return null;
    return query(
      collection(firestore, 'ventas'),
      where('fecha', '>=', rangoAnterior.start),
      where('fecha', '<', rangoAnterior.end),
      orderBy('fecha', 'desc')
    );
  }, [firestore, user, rangoAnterior]);
  const prevPagosQuery = useMemoFirebase(() => {
    if (!firestore || !user || !rangoAnterior) return null;
    return query(
      collectionGroup(firestore, 'pagos'),
      where('fecha', '>=', rangoAnterior.start),
      where('fecha', '<', rangoAnterior.end),
      orderBy('fecha', 'desc')
    );
  }, [firestore, user, rangoAnterior]);
  const prevGastosQuery = useMemoFirebase(() => {
    if (!firestore || !user || !rangoAnterior) return null;
    return query(
      collection(firestore, 'gastos'),
      where('fecha', '>=', rangoAnterior.start),
      where('fecha', '<', rangoAnterior.end),
      orderBy('fecha', 'desc')
    );
  }, [firestore, user, rangoAnterior]);
  const { data: prevVentas, isLoading: isLoadingPrevVentas } = useCollection<Venta>(prevVentasQuery, { enabled: !!user });
  const { data: prevPagos, isLoading: isLoadingPrevPagos } = useCollection<Pago>(prevPagosQuery, { enabled: !!user });
  const { data: prevGastos, isLoading: isLoadingPrevGastos } = useCollection<Gasto>(prevGastosQuery, { enabled: !!user });

  const saldoAnterior = useMemo(() => {
    const saldo = { efectivo: 0, transferencia: 0 };
    prevVentas?.forEach(v => {
      const r = repartirPagoVenta(v);
      saldo.efectivo += r.efectivo;
      saldo.transferencia += r.transferencia;
    });
    prevPagos?.forEach(p => {
      if (p.metodoPago === 'EFECTIVO') saldo.efectivo += p.monto;
      else saldo.transferencia += p.monto;
    });
    prevGastos?.forEach(g => {
      const r = repartirPagoGasto(g);
      saldo.efectivo -= r.efectivo;
      saldo.transferencia -= r.transferencia;
    });
    return saldo;
  }, [prevVentas, prevPagos, prevGastos]);

  const salesSummary = useMemo(() => {
    const summary = {
        ingresosEfectivo: 0,
        ingresosTransferencia: 0,
        gastosEfectivo: 0,
        gastosTransferencia: 0,
        totalIngresosApartados: 0,
        saldoAnteriorEfectivo: saldoAnterior.efectivo,
        saldoAnteriorTransferencia: saldoAnterior.transferencia,
        balanceEfectivo: 0,
        balanceTransferencia: 0,
    };

    ventasDelDia?.forEach(venta => {
      // Una venta mixta suma su parte de efectivo y su parte de transferencia por separado.
      const { efectivo, transferencia } = repartirPagoVenta(venta);
      summary.ingresosEfectivo += efectivo;
      summary.ingresosTransferencia += transferencia;
    });

    pagos?.forEach(pago => {
        summary.totalIngresosApartados += pago.monto;
        if (pago.metodoPago === 'EFECTIVO') {
            summary.ingresosEfectivo += pago.monto;
        } else {
            summary.ingresosTransferencia += pago.monto;
        }
    });

    gastos?.forEach(gasto => {
        // Un gasto mixto descuenta su parte de efectivo y su parte de transferencias por separado.
        const { efectivo, transferencia } = repartirPagoGasto(gasto);
        summary.gastosEfectivo += efectivo;
        summary.gastosTransferencia += transferencia;
    });

    // Acumulado de la semana: lo que hay para volver a invertir.
    summary.balanceEfectivo = summary.saldoAnteriorEfectivo + summary.ingresosEfectivo - summary.gastosEfectivo;
    summary.balanceTransferencia = summary.saldoAnteriorTransferencia + summary.ingresosTransferencia - summary.gastosTransferencia;

    // Caja del día: lo que debe haber de las ventas de HOY ya descontados los gastos de hoy.
    // Si un gasto fue mayor que lo vendido hoy, la diferencia salió del acumulado: el día
    // queda en $0 y se indica cuánto se tomó del acumulado (en vez de un número negativo).
    const netoEfectivo = summary.ingresosEfectivo - summary.gastosEfectivo;
    const netoTransferencia = summary.ingresosTransferencia - summary.gastosTransferencia;

    return {
        ...summary,
        cajaDiaEfectivo: Math.max(0, netoEfectivo),
        cajaDiaTransferencia: Math.max(0, netoTransferencia),
        delAcumuladoEfectivo: Math.max(0, -netoEfectivo),
        delAcumuladoTransferencia: Math.max(0, -netoTransferencia),
    };
  }, [ventasDelDia, gastos, pagos, saldoAnterior]);


  const getMetodoPagoLabel = etiquetaMetodoPago;

  const handleViewDetails = async (venta: Venta) => {
    if (!firestore) return;
    setSelectedVenta(venta);
    setVentaItems([]); // Clear previous items while loading
    setIsDetailDialogOpen(true);
  
    try {
      const itemsRef = collection(firestore, 'ventas', venta.id, 'items');
      const itemsSnapshot = await getDocs(itemsRef);
      const items = itemsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as VentaItem));
      
      const itemsWithPacaNames = await Promise.all(items.map(async (item) => {
        try {
          if (!item.pacaId) {
             return { ...item, pacaName: 'Paca no especificada' };
          }
          const pacaDocRef = doc(firestore, 'pacas', item.pacaId);
          const pacaDoc = await getDoc(pacaDocRef);
          
          const pacaName = pacaDoc.exists() ? pacaDoc.data().nombrePaca : 'Paca no encontrada';

          // Las ventas antiguas no guardaban el género: se toma de la prenda en el inventario.
          let genero = item.genero;
          if (!genero && item.prendaId) {
            try {
              const prendaDoc = await getDoc(doc(firestore, 'pacas', item.pacaId, 'prendas', item.prendaId));
              genero = prendaDoc.exists() ? prendaDoc.data().genero : undefined;
            } catch (e) {
              console.error(`Could not fetch genero for prenda ${item.prendaId}`, e);
            }
          }
          return { ...item, pacaName, genero };
        } catch (e) {
          console.error(`Could not fetch paca name for pacaId ${item.pacaId}`, e);
          return { ...item, pacaName: 'Error al cargar' };
        }
      }));
  
      setVentaItems(itemsWithPacaNames as any);
    } catch (error) {
        console.error("Error fetching sale details:", error);
        toast({ variant: "destructive", title: "Error", description: "No se pudieron cargar los detalles de la venta." });
        setIsDetailDialogOpen(false);
    }
  };
  
const handleDeleteSale = async (ventaId: string) => {
    if (!firestore || !storage) {
        toast({ variant: "destructive", title: "Error", description: "Los servicios de base de datos o almacenamiento no están disponibles." });
        return;
    }

    setIsDeleting(true);
    const ventaRef = doc(firestore, 'ventas', ventaId);

    try {
        // --- Paso 1: Leer los datos de la venta para obtener la URL del comprobante ---
        const ventaDoc = await getDoc(ventaRef);
        if (!ventaDoc.exists()) {
            throw new Error("La venta no fue encontrada.");
        }
        const ventaData = ventaDoc.data() as Venta;

        // --- Paso 2: Intentar borrar la imagen de Storage si existe ---
        if (ventaData.comprobanteUrl && (ventaData.metodoPago === 'TRANSFERENCIA' || ventaData.metodoPago === 'MIXTO')) {
            try {
                const imageRef = storageRef(storage, ventaData.comprobanteUrl);
                await deleteObject(imageRef);
            } catch (storageError: any) {
                // Si el archivo no existe en Storage, no es un error crítico.
                // Si es otro error, lo notificamos pero continuamos.
                if (storageError.code !== 'storage/object-not-found') {
                    console.warn("No se pudo eliminar el comprobante de Storage, pero se continuará con la eliminación de la venta:", storageError);
                }
            }
        }

        // --- Paso 3: Borrar documentos de Firestore y restaurar stock en una transacción ---
        await runTransaction(firestore, async (transaction) => {
            const itemsRef = collection(ventaRef, 'items');
            const itemsSnapshot = await getDocs(query(itemsRef));

            if (itemsSnapshot.empty) {
                // Si no hay items, solo borramos la venta
                transaction.delete(ventaRef);
                return;
            }

            const prendaRefsAndData = itemsSnapshot.docs.map(itemDoc => ({
                itemData: itemDoc.data() as Omit<VentaItem, 'id'>,
                itemRef: itemDoc.ref,
                prendaDocRef: doc(firestore, 'pacas', itemDoc.data().pacaId, 'prendas', itemDoc.data().prendaId)
            }));

            // Leemos todos los documentos de prendas que necesitamos modificar
            const prendaDocs = await Promise.all(
                prendaRefsAndData.map(pad => transaction.get(pad.prendaDocRef))
            );

            // Ahora modificamos
            prendaDocs.forEach((prendaDoc, index) => {
                const { itemData, itemRef } = prendaRefsAndData[index];
                if (prendaDoc.exists()) {
                    const currentStock = prendaDoc.data().cantidad || 0;
                    const newStock = currentStock + itemData.cantidad;
                    transaction.update(prendaDoc.ref, { cantidad: newStock });
                } else {
                    // Si la prenda fue eliminada, no podemos restaurar stock, pero continuamos
                    console.warn(`La prenda ${itemData.idPersonalizado} (ID: ${itemData.prendaId}) no fue encontrada. No se pudo restaurar el stock.`);
                }
                // Borramos el item de la subcolección de la venta
                transaction.delete(itemRef);
            });

            // Finalmente, borramos el documento principal de la venta
            transaction.delete(ventaRef);
        });

        toast({ variant: "success", title: "Venta eliminada", description: "La venta y su comprobante se eliminaron. El stock ha sido restaurado." });

    } catch (error) {
        console.error("Error al eliminar la venta:", error);
        const errorMessage = error instanceof Error ? error.message : "No se pudo completar la operación.";
        toast({ variant: "destructive", title: "Error en la operación", description: errorMessage });
    } finally {
        setIsDeleting(false);
    }
};


  const handleGeneratePDF = async () => {
    if (!firestore || !selectedDate || !ventas) {
      toast({ variant: "destructive", title: "Sin datos", description: "No hay ventas en la fecha seleccionada para generar un reporte." });
      return;
    }

    const doc = new jsPDF() as jsPDFWithAutoTable;
    
    // --- START: Fetch all items for the day's sales ---
    const allItemsMap = new Map<string, VentaItem[]>();
    const itemPromises = (ventasDelDia || []).map(async (venta) => {
        const itemsRef = collection(firestore, 'ventas', venta.id, 'items');
        const itemsSnapshot = await getDocs(itemsRef);
        const items = itemsSnapshot.docs.map(doc => doc.data() as VentaItem);
        allItemsMap.set(venta.id, items);
    });
    await Promise.all(itemPromises);
    // --- END: Fetch all items ---
    
    // Título y subtítulo
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.text(`Cierre de Caja`, 14, 20);
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.text(`Fecha: ${format(selectedDate, "PPP", { locale: es })}`, 14, 26);
    doc.text(`Cierre gestionado por: ${user?.displayName || user?.email || 'N/A'}`, 14, 32);

    // Resumen de ventas
    const totalVentasDirectas = (ventasDelDia || []).reduce((acc, v) => acc + v.totalVenta, 0);

    const summaryBody = [
        ['Viene de días anteriores (Efectivo)', `$${salesSummary.saldoAnteriorEfectivo.toFixed(2)}`],
        ['Viene de días anteriores (Transferencia)', `$${salesSummary.saldoAnteriorTransferencia.toFixed(2)}`],
        ['Ventas Directas', `$${totalVentasDirectas.toFixed(2)}`],
        ['Ingresos por Apartados', `$${salesSummary.totalIngresosApartados.toFixed(2)}`],
        ['Total Ingresos (Efectivo)', `$${salesSummary.ingresosEfectivo.toFixed(2)}`],
        ['Total Ingresos (Transferencia)', `$${salesSummary.ingresosTransferencia.toFixed(2)}`],
        ['Total Gastos del Día', `-$${(salesSummary.gastosEfectivo + salesSummary.gastosTransferencia).toFixed(2)}`],
    ];

    doc.autoTable({
        startY: 40,
        head: [['Concepto', 'Monto']],
        body: summaryBody,
        foot: [[
          { content: 'Debe haber en caja hoy (Efectivo)', colSpan: 1, styles: { fontStyle: 'bold', halign: 'right' } },
          { content: `$${salesSummary.cajaDiaEfectivo.toFixed(2)}` + (salesSummary.delAcumuladoEfectivo > 0.009 ? ` (se usaron $${salesSummary.delAcumuladoEfectivo.toFixed(2)} del acumulado)` : ''), styles: { fontStyle: 'bold' } },
        ],
        [
          { content: 'Debe haber hoy (Transferencia)', colSpan: 1, styles: { fontStyle: 'bold', halign: 'right' } },
          { content: `$${salesSummary.cajaDiaTransferencia.toFixed(2)}` + (salesSummary.delAcumuladoTransferencia > 0.009 ? ` (se usaron $${salesSummary.delAcumuladoTransferencia.toFixed(2)} del acumulado)` : ''), styles: { fontStyle: 'bold' } },
        ],
        [
          { content: 'Acumulado de la semana (Efectivo)', colSpan: 1, styles: { fontStyle: 'bold', halign: 'right' } },
          { content: `$${salesSummary.balanceEfectivo.toFixed(2)}`, styles: { fontStyle: 'bold' } },
        ],
        [
          { content: 'Acumulado de la semana (Transferencia)', colSpan: 1, styles: { fontStyle: 'bold', halign: 'right' } },
          { content: `$${salesSummary.balanceTransferencia.toFixed(2)}`, styles: { fontStyle: 'bold' } },
        ]
      ],
        theme: 'striped',
        headStyles: { fillColor: [41, 128, 185] },
        footStyles: { fillColor: [230, 126, 34] },
    });
    
    let finalY = (doc as any).lastAutoTable.finalY;
    
    const drawSalesTable = (title: string, sales: Venta[], color: [number, number, number], showSplit = false) => {
      if (sales.length === 0) return;

      doc.setFontSize(14);
      doc.text(title, 14, finalY + 15);

      const body: Array<Array<any>> = sales.flatMap(venta => {
          const ventaItems = allItemsMap.get(venta.id) || [];
          const mainRow: Array<any> = [
              { content: `ID: ${venta.id.substring(0, 6).toUpperCase()} | Hora: ${format(new Date(venta.fecha.seconds * 1000), "HH:mm")}` + (showSplit ? ` | Efectivo $${repartirPagoVenta(venta).efectivo.toFixed(2)} + Transf. $${repartirPagoVenta(venta).transferencia.toFixed(2)}` : ''), colSpan: 3, styles: { fontStyle: 'bold' as const, fillColor: '#f0f0f0' as const } },
              { content: `$${venta.totalVenta.toFixed(2)}`, styles: { fontStyle: 'bold' as const, halign: 'right' as const, fillColor: '#f0f0f0' as const } },
          ];
          
          const itemRows: Array<Array<any>> = ventaItems.map(item => [
              { content: `  - ${item.idPersonalizado} ${item.tipoPrenda}`, styles: { cellPadding: { left: 4 } } },
              { content: `${item.cantidad} x $${item.precioVenta.toFixed(2)}`, halign: 'center' as const },
              '',
              { content: `$${(item.cantidad * item.precioVenta).toFixed(2)}`, halign: 'right' as const },
          ]);

          return [mainRow, ...itemRows];
      });

      doc.autoTable({
          startY: finalY + 20,
          head: [['Descripción de Venta', 'Cant x Precio U.', '', 'Subtotal']],
          body: body,
          theme: 'grid',
          headStyles: { fillColor: color },
      });

      finalY = (doc as any).lastAutoTable.finalY;
    };
    
    const ventasEfectivo = (ventasDelDia || []).filter(v => v.metodoPago === 'EFECTIVO');
    const ventasTransferencia = (ventasDelDia || []).filter(v => v.metodoPago === 'TRANSFERENCIA');

    drawSalesTable(`Detalle de Ventas en Efectivo (${ventasEfectivo.length})`, ventasEfectivo, [39, 174, 96]);
    drawSalesTable(`Detalle de Ventas por Transferencia (${ventasTransferencia.length})`, ventasTransferencia, [88, 86, 214]);
    const ventasMixtas = (ventasDelDia || []).filter(v => v.metodoPago === 'MIXTO');
    drawSalesTable(`Detalle de Ventas con Pago Mixto (${ventasMixtas.length})`, ventasMixtas, [211, 84, 0], true);
     
    // Tabla de transacciones de gastos
    if (gastos && gastos.length > 0) {
        doc.setFontSize(14);
        doc.text(`Detalle de Gastos (${gastos.length})`, 14, finalY + 15);

        const gastosBody = gastos.map(gasto => [
            format((gasto.fecha as Timestamp).toDate(), "HH:mm 'hrs'", { locale: es }),
            gasto.descripcion,
            gasto.metodoPago === 'MIXTO'
                ? `Mixto (Ef. $${repartirPagoGasto(gasto).efectivo.toFixed(2)} + Transf. $${repartirPagoGasto(gasto).transferencia.toFixed(2)})`
                : etiquetaMetodoPago(gasto.metodoPago),
            `$${gasto.monto.toFixed(2)}`
        ]);

        doc.autoTable({
            startY: finalY + 20,
            head: [['Hora', 'Descripción', 'Método Pago', 'Monto']],
            body: gastosBody,
            theme: 'grid',
            headStyles: { fillColor: [192, 57, 43] },
        });
    }


    doc.save(`cierre_caja_${selectedDate ? format(selectedDate, "yyyy-MM-dd") : 'reporte'}.pdf`);
    toast({ variant: "success", title: "Reporte Generado", description: "El cierre de caja se ha descargado." });
  };

  const isLoading = isLoadingVentas || isLoadingGastos || isLoadingPagos || isLoadingVentasDelDia
    || isLoadingPrevVentas || isLoadingPrevPagos || isLoadingPrevGastos;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
              <Button asChild variant="destructive" size="icon" className="h-8 w-8 text-black flex-shrink-0">
                  <Link href="/dashboard/sales">
                      <ArrowLeft className="h-4 w-4" />
                      <span className="sr-only">Volver a Punto de Venta</span>
                  </Link>
              </Button>
              <div>
                  <h1 className="text-3xl font-title text-white [text-shadow:_-2px_-2px_0_rgba(0,0,0,0.8),_2px_-2px_0_rgba(0,0,0,0.8),_-2px_2px_0_rgba(0,0,0,0.8),_2px_2px_0_rgba(0,0,0,0.8)]">Cierre de Caja</h1>
                  <p className="text-xl text-white font-handwritten font-bold [text-shadow:_-1px_-1px_0_rgba(0,0,0,0.9),_1px_-1px_0_rgba(0,0,0,0.9),_-1px_1px_0_rgba(0,0,0,0.9),_1px_1px_0_rgba(0,0,0,0.9)]">Consulta, gestiona y realiza cierres de caja por día.</p>
              </div>
          </div>
          <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="destructive"
                  className={cn(
                    "w-[280px] justify-start text-left font-normal text-black font-sans text-sm",
                    !selectedDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {selectedDate ? format(selectedDate, "PPP", { locale: es }) : <span>Elige una fecha</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 font-sans">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={setSelectedDate}
                  initialFocus
                  locale={es}
                  disabled={(date) => date > new Date() || date < new Date("1900-01-01")}
                />
              </PopoverContent>
            </Popover>
            <Button onClick={handleGeneratePDF} variant="destructive" className="font-sans text-sm text-black" disabled={!selectedDate || isLoading}>
                <Download className="mr-2 h-4 w-4" />
                Cerrar Caja del Día
            </Button>
          </div>
      </div>
      
       <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card style={{ backgroundColor: 'hsla(120, 30%, 85%, 0.8)' }}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-black">Ingresos (Efectivo)</CardTitle>
                <DollarSign className="h-4 w-4 text-black/70" />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold text-black">${salesSummary.ingresosEfectivo.toFixed(2)}</div>
                 <p className="text-xs text-black/80">Total de ventas directas y apartados.</p>
            </CardContent>
        </Card>
        <Card style={{ backgroundColor: 'hsla(200, 40%, 85%, 0.8)' }}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-black">Ingresos (Transferencia)</CardTitle>
                <Landmark className="h-4 w-4 text-black/70" />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold text-black">${salesSummary.ingresosTransferencia.toFixed(2)}</div>
                <p className="text-xs text-black/80">Total de ventas directas y apartados.</p>
            </CardContent>
        </Card>
        <Card style={{ backgroundColor: 'hsla(40, 50%, 85%, 0.8)' }}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-black">Balance del Día (Efectivo)</CardTitle>
                <Banknote className="h-4 w-4 text-black/70" />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold text-black">${salesSummary.cajaDiaEfectivo.toFixed(2)}</div>
                <p className="text-xs text-black/80">
                  Ventas ${salesSummary.ingresosEfectivo.toFixed(2)} − Gastos ${salesSummary.gastosEfectivo.toFixed(2)}
                </p>
                {salesSummary.delAcumuladoEfectivo > 0.009 && (
                  <p className="text-xs font-semibold text-black">
                    Se usaron ${salesSummary.delAcumuladoEfectivo.toFixed(2)} del acumulado
                  </p>
                )}
                <p className="mt-2 border-t border-black/20 pt-1 text-xs font-semibold text-black">
                  Acumulado de la semana: ${salesSummary.balanceEfectivo.toFixed(2)}
                </p>
            </CardContent>
        </Card>
        <Card style={{ backgroundColor: 'hsla(300, 40%, 85%, 0.8)' }}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-black">Balance del Día (Transferencia)</CardTitle>
                <DollarSign className="h-4 w-4 text-black/70" />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold text-black">${salesSummary.cajaDiaTransferencia.toFixed(2)}</div>
                <p className="text-xs text-black/80">
                  Ventas ${salesSummary.ingresosTransferencia.toFixed(2)} − Gastos ${salesSummary.gastosTransferencia.toFixed(2)}
                </p>
                {salesSummary.delAcumuladoTransferencia > 0.009 && (
                  <p className="text-xs font-semibold text-black">
                    Se usaron ${salesSummary.delAcumuladoTransferencia.toFixed(2)} del acumulado
                  </p>
                )}
                <p className="mt-2 border-t border-black/20 pt-1 text-xs font-semibold text-black">
                  Acumulado de la semana: ${salesSummary.balanceTransferencia.toFixed(2)}
                </p>
            </CardContent>
        </Card>
      </div>

      <Card className="h-full" style={{ backgroundColor: 'hsla(39, 44%, 84%, 0.8)', backdropFilter: 'blur(8px)' }}>
        <CardHeader>
          <CardTitle className="font-sans text-2xl text-black">Transacciones del Día</CardTitle>
          <CardDescription className="font-sans font-semibold text-md text-black">Una lista de las ventas realizadas en la fecha seleccionada.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="font-sans font-semibold text-sm text-black">ID Venta</TableHead>
                <TableHead className="font-sans font-semibold text-sm text-black">Hora</TableHead>
                <TableHead className="font-sans font-semibold text-sm text-black">Método de Pago</TableHead>
                <TableHead className="text-right font-sans font-semibold text-sm text-black">Total</TableHead>
                <TableHead className="text-right font-sans font-semibold text-sm text-black">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center font-sans font-semibold text-lg text-black">
                        Cargando ventas...
                    </TableCell>
                </TableRow>
              ) : ventas && ventas.length > 0 ? (
                ventas.map((venta) => (
                  <TableRow key={venta.id} className="font-sans text-xs">
                    <TableCell className="font-semibold">{venta.id.substring(0, 8).toUpperCase()}</TableCell>
                    <TableCell>
                        {venta.fecha ? format(new Date(venta.fecha.seconds * 1000), "HH:mm 'hrs'", { locale: es }) : 'N/A'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {getMetodoPagoLabel(venta.metodoPago)}
                      </Badge>
                      {venta.metodoPago === 'MIXTO' && (
                        <p className="mt-1 text-[11px] leading-tight text-black/70">
                          Efectivo ${repartirPagoVenta(venta).efectivo.toFixed(2)}<br />
                          Transf. ${repartirPagoVenta(venta).transferencia.toFixed(2)}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-bold">${venta.totalVenta.toFixed(2)}</TableCell>
                    <TableCell className="text-right">
                        <AlertDialog>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" className="h-8 w-8 p-0">
                                        <span className="sr-only">Abrir menú</span>
                                        <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="font-sans bg-white border-2 border-black" style={{ backgroundColor: 'hsla(39, 44%, 84%, 0.9)', backdropFilter: 'blur(8px)' }}>
                                    <DropdownMenuLabel>Acciones</DropdownMenuLabel>
                                    <DropdownMenuItem onClick={() => handleViewDetails(venta)}>
                                        <Eye className="mr-2 h-4 w-4" />
                                        Ver Detalle
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator className="bg-black/50" />
                                    <AlertDialogTrigger asChild>
                                        <DropdownMenuItem className="text-red-600 focus:text-red-600">
                                            <Trash2 className="mr-2 h-4 w-4" />
                                            Eliminar Venta
                                        </DropdownMenuItem>
                                    </AlertDialogTrigger>
                                </DropdownMenuContent>
                            </DropdownMenu>
                            <AlertDialogContent className="font-sans bg-white text-black">
                                <AlertDialogHeader>
                                <AlertDialogTitle>¿Estás seguro de eliminar esta venta?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    Esta acción no se puede deshacer. Se eliminará la venta con ID 
                                    <span className="font-bold"> {venta.id.substring(0, 8).toUpperCase()}</span> y se restaurará el stock de las prendas vendidas. Si hay un comprobante de pago, también será eliminado.
                                </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeleteSale(venta.id)} disabled={isDeleting} className="bg-red-600 text-white hover:bg-red-700">
                                    {isDeleting ? 'Eliminando...' : 'Sí, eliminar venta'}
                                </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                 <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center font-sans font-semibold text-lg text-black">
                        No se han registrado ventas en esta fecha.
                    </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          {hasMoreVentas && (
            <div className="mt-4 flex justify-center">
              <Button variant="outline" onClick={loadMoreVentas} disabled={isLoadingMoreVentas}>
                {isLoadingMoreVentas ? 'Cargando...' : 'Cargar más ventas'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      
      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent className="sm:max-w-md font-sans" style={{ backgroundColor: 'hsla(39, 44%, 84%, 0.9)', backdropFilter: 'blur(12px)' }}>
            <DialogHeader>
            <DialogTitle>Detalles de la Venta</DialogTitle>
             <DialogDescription>ID: {selectedVenta?.id.substring(0, 8).toUpperCase()}</DialogDescription>
            </DialogHeader>
            <ScrollArea className="max-h-[60vh] -mx-6 px-6">
                <div className="space-y-4 py-4">
                {ventaItems.length > 0 ? (
                    ventaItems.map((item: any) => (
                    <div key={item.id} className="flex justify-between items-center text-sm p-2 rounded-md hover:bg-black/5">
                        <div className="font-semibold">
                            <p>{item.tipoPrenda} ({item.idPersonalizado})</p>
                            <p className="text-xs text-black/60 font-normal">Género: {item.genero || 'No especificado'}</p>
                            <p className="text-xs text-black/60 font-normal">Paca: {item.pacaName}</p>
                        </div>
                        <div className="text-right">
                           <p>Cant: {item.cantidad}</p>
                           <p className="font-bold">${(item.precioVenta * item.cantidad).toFixed(2)}</p>
                        </div>
                    </div>
                    ))
                ) : (
                    <p className="text-center text-sm text-muted-foreground py-8">Cargando detalles de los artículos...</p>
                )}
                </div>
            </ScrollArea>
             <DialogFooter className="border-t pt-4 mt-2 flex-col items-stretch gap-2">
                {selectedVenta?.comprobanteUrl && (
                    <Button asChild variant="outline" className="bg-blue-100 hover:bg-blue-200 text-blue-800">
                        <a href={selectedVenta.comprobanteUrl} target="_blank" rel="noopener noreferrer">
                            <LinkIcon className="mr-2 h-4 w-4" />
                            Ver Comprobante de Pago
                        </a>
                    </Button>
                )}
                <div className="w-full flex justify-between items-center font-bold text-lg">
                    <span>Total:</span>
                    <span>${selectedVenta?.totalVenta.toFixed(2)}</span>
                </div>
            </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
