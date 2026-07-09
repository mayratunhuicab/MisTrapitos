"use client";

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useFirestore, useCollection, useMemoFirebase, useUser, useStorage } from '@/firebase';
import { collection, query, orderBy, doc, getDocs, runTransaction, getDoc, where, Timestamp } from 'firebase/firestore';
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
import { format, startOfDay, endOfDay } from 'date-fns';
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
};

type Gasto = {
  id: string;
  descripcion: string;
  monto: number;
  fecha: Timestamp;
  metodoPago: "EFECTIVO" | "TRANSFERENCIA";
};

type Pago = {
    id: string;
    monto: number;
    fecha: Timestamp;
    metodoPago: "EFECTIVO" | "TRANSFERENCIA";
};


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

  const ventasQuery = useMemoFirebase(() => {
    if (!firestore || !user || !dateRange.start || !dateRange.end) return null;
    return query(
        collection(firestore, 'ventas'), 
        where('fecha', '>=', dateRange.start),
        where('fecha', '<=', dateRange.end),
        orderBy('fecha', 'desc')
    );
  }, [firestore, user, dateRange]);
  const { data: ventas, isLoading: isLoadingVentas } = useCollection<Venta>(ventasQuery);

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

  // Fetch all apartados to then query their subcollections
  const apartadosQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(collection(firestore, 'apartados'));
  }, [firestore, user]);
  const { data: apartados, isLoading: isLoadingApartados } = useCollection<Apartado>(apartadosQuery);

  const [pagos, setPagos] = useState<Pago[] | null>(null);
  const [isLoadingPagos, setIsLoadingPagos] = useState(true);

  // This effect fetches 'pagos' from the subcollection of each 'apartado'.
  // It runs whenever the list of apartados or the selected date range changes.
  useEffect(() => {
    if (!firestore || !apartados || !dateRange.start || !dateRange.end) {
      if(!isLoadingApartados) {
        setIsLoadingPagos(false);
        setPagos([]);
      }
      return;
    }

    const fetchPagos = async () => {
      setIsLoadingPagos(true);
      try {
        const allPagos: Pago[] = [];
        
        // Create an array of promises, one for each 'apartado', to fetch its 'pagos'.
        const promises = apartados.map(apartado => {
          const pagosRef = collection(firestore, 'apartados', apartado.id, 'pagos');
          const q = query(pagosRef, 
            where('fecha', '>=', dateRange.start!),
            where('fecha', '<=', dateRange.end!),
            orderBy('fecha', 'desc')
          );
          return getDocs(q);
        });

        const querySnapshots = await Promise.all(promises);

        // Process the results from all promises
        querySnapshots.forEach(snapshot => {
          snapshot.forEach(doc => {
            allPagos.push({ id: doc.id, ...(doc.data() as Omit<Pago, 'id'>) });
          });
        });

        // Sort the aggregated payments by date
        allPagos.sort((a, b) => b.fecha.seconds - a.fecha.seconds);
        setPagos(allPagos);

      } catch (error) {
        console.error("Error fetching pagos:", error);
        toast({
          variant: "destructive",
          title: "Error al cargar pagos",
          description: "No se pudieron cargar los pagos de los apartados.",
        });
        setPagos([]);
      } finally {
        setIsLoadingPagos(false);
      }
    };

    fetchPagos();

  }, [firestore, apartados, isLoadingApartados, dateRange, toast]);

  const salesSummary = useMemo(() => {
    const summary = {
        ingresosEfectivo: 0,
        ingresosTransferencia: 0,
        gastosEfectivo: 0,
        gastosTransferencia: 0,
        totalIngresosApartados: 0,
        balanceEfectivo: 0,
        balanceTransferencia: 0,
    };
    
    ventas?.forEach(venta => {
      if (venta.metodoPago === 'EFECTIVO') {
        summary.ingresosEfectivo += venta.totalVenta;
      } else if (venta.metodoPago === 'TRANSFERENCIA') {
        summary.ingresosTransferencia += venta.totalVenta;
      }
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
        if (gasto.metodoPago === 'EFECTIVO') {
            summary.gastosEfectivo += gasto.monto;
        } else if (gasto.metodoPago === 'TRANSFERENCIA') {
            summary.gastosTransferencia += gasto.monto;
        }
    });

    summary.balanceEfectivo = summary.ingresosEfectivo - summary.gastosEfectivo;
    summary.balanceTransferencia = summary.ingresosTransferencia - summary.gastosTransferencia;

    return summary;
  }, [ventas, gastos, pagos]);


  const getMetodoPagoLabel = (metodo: string) => {
    switch (metodo) {
      case 'EFECTIVO': return 'Efectivo';
      case 'TRANSFERENCIA': return 'Transferencia';
      default: return metodo;
    }
  }

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
          return { ...item, pacaName };
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
        if (ventaData.comprobanteUrl && ventaData.metodoPago === 'TRANSFERENCIA') {
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
    const itemPromises = ventas.map(async (venta) => {
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
    const totalVentasDirectas = (ventas || []).reduce((acc, v) => acc + v.totalVenta, 0);

    const summaryBody = [
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
          { content: 'Balance Final (Efectivo)', colSpan: 1, styles: { fontStyle: 'bold', halign: 'right' } },
          { content: `$${salesSummary.balanceEfectivo.toFixed(2)}`, styles: { fontStyle: 'bold' } },
        ],
        [
          { content: 'Balance Final (Transferencia)', colSpan: 1, styles: { fontStyle: 'bold', halign: 'right' } },
          { content: `$${salesSummary.balanceTransferencia.toFixed(2)}`, styles: { fontStyle: 'bold' } },
        ]
      ],
        theme: 'striped',
        headStyles: { fillColor: [41, 128, 185] },
        footStyles: { fillColor: [230, 126, 34] },
    });
    
    let finalY = (doc as any).lastAutoTable.finalY;
    
    const drawSalesTable = (title: string, sales: Venta[], color: [number, number, number]) => {
      if (sales.length === 0) return;

      doc.setFontSize(14);
      doc.text(title, 14, finalY + 15);

      const body: Array<Array<any>> = sales.flatMap(venta => {
          const ventaItems = allItemsMap.get(venta.id) || [];
          const mainRow: Array<any> = [
              { content: `ID: ${venta.id.substring(0, 6).toUpperCase()} | Hora: ${format(new Date(venta.fecha.seconds * 1000), "HH:mm")}`, colSpan: 3, styles: { fontStyle: 'bold' as const, fillColor: '#f0f0f0' as const } },
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
    
    const ventasEfectivo = (ventas || []).filter(v => v.metodoPago === 'EFECTIVO');
    const ventasTransferencia = (ventas || []).filter(v => v.metodoPago === 'TRANSFERENCIA');

    drawSalesTable(`Detalle de Ventas en Efectivo (${ventasEfectivo.length})`, ventasEfectivo, [39, 174, 96]);
    drawSalesTable(`Detalle de Ventas por Transferencia (${ventasTransferencia.length})`, ventasTransferencia, [88, 86, 214]);
     
    // Tabla de transacciones de gastos
    if (gastos && gastos.length > 0) {
        doc.setFontSize(14);
        doc.text(`Detalle de Gastos (${gastos.length})`, 14, finalY + 15);

        const gastosBody = gastos.map(gasto => [
            format((gasto.fecha as Timestamp).toDate(), "HH:mm 'hrs'", { locale: es }),
            gasto.descripcion,
            gasto.metodoPago,
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

  const isLoading = isLoadingVentas || isLoadingGastos || isLoadingPagos || isLoadingApartados;

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
                <CardTitle className="text-sm font-medium text-black">Balance Final (Efectivo)</CardTitle>
                <Banknote className="h-4 w-4 text-black/70" />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold text-black">${salesSummary.balanceEfectivo.toFixed(2)}</div>
                <p className="text-xs text-black/80">
                  Gastos en efectivo: ${salesSummary.gastosEfectivo.toFixed(2)}
                </p>
            </CardContent>
        </Card>
        <Card style={{ backgroundColor: 'hsla(300, 40%, 85%, 0.8)' }}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-black">Balance Final (Transferencia)</CardTitle>
                <DollarSign className="h-4 w-4 text-black/70" />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold text-black">${salesSummary.balanceTransferencia.toFixed(2)}</div>
                <p className="text-xs text-black/80">
                  Gastos por transf.: ${salesSummary.gastosTransferencia.toFixed(2)}
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
