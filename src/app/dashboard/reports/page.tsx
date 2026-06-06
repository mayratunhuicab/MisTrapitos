
"use client"

import { useState, useMemo, useEffect } from "react"
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend } from "recharts"
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import type { UserOptions } from 'jspdf-autotable';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { Button } from "@/components/ui/button"
import { useFirestore, useCollection, useUser, useMemoFirebase } from "@/firebase"
import { collection, query, where, Timestamp, orderBy, getDocs } from "firebase/firestore"
import { startOfWeek, endOfWeek, format, eachDayOfInterval, addDays, subDays } from "date-fns"
import { es } from "date-fns/locale"
import { DollarSign, TrendingUp, TrendingDown, ChevronLeft, ChevronRight, LocateFixed, FileDown, Landmark, Banknote } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

// Extend jsPDF with autoTable
interface jsPDFWithAutoTable extends jsPDF {
  autoTable: (options: UserOptions) => jsPDF;
}

type Venta = {
  id: string;
  totalVenta: number;
  metodoPago: "EFECTIVO" | "TRANSFERENCIA";
  fecha: Timestamp;
};

type Gasto = {
  id: string;
  descripcion: string;
  monto: number;
  fecha: Timestamp | Date;
  metodoPago: "EFECTIVO" | "TRANSFERENCIA";
};

type Pago = {
    id: string;
    monto: number;
    fecha: Timestamp;
    metodoPago: "EFECTIVO" | "TRANSFERENCIA";
};

type Apartado = {
  id: string;
};


const chartConfig = {
  ventas: {
    label: "Ingresos Totales",
    color: "hsl(var(--chart-2))",
  },
  gastos: {
    label: "Gastos Totales",
    color: "hsl(var(--chart-3))",
  },
} satisfies Record<string, any>

const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-MX', {
        style: 'currency',
        currency: 'MXN',
    }).format(value);
};

export default function ReportsPage() {
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();
  
  const [currentDate, setCurrentDate] = useState(new Date());

  const { weekStart, weekEnd } = useMemo(() => {
    const start = startOfWeek(currentDate, { weekStartsOn: 1 }); // 1 = Lunes
    const end = endOfWeek(currentDate, { weekStartsOn: 1 });
    return { weekStart: start, weekEnd: end };
  }, [currentDate]);

  // --- Fetch data ---
  const ventasQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(
      collection(firestore, 'ventas'),
      where('fecha', '>=', Timestamp.fromDate(weekStart)),
      where('fecha', '<=', Timestamp.fromDate(weekEnd)),
      orderBy('fecha', 'desc')
    );
  }, [firestore, user, weekStart, weekEnd]);
  const { data: ventas, isLoading: isLoadingVentas } = useCollection<Venta>(ventasQuery, { enabled: !!user });

  const gastosQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(
      collection(firestore, 'gastos'),
      where('fecha', '>=', Timestamp.fromDate(weekStart)),
      where('fecha', '<=', Timestamp.fromDate(weekEnd)),
      orderBy('fecha', 'desc')
    );
  }, [firestore, user, weekStart, weekEnd]);
  const { data: gastos, isLoading: isLoadingGastos } = useCollection<Gasto>(gastosQuery, { enabled: !!user });
  
  const apartadosQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(collection(firestore, 'apartados'));
  }, [firestore, user]);
  const { data: apartados, isLoading: isLoadingApartados } = useCollection<Apartado>(apartadosQuery);

  const [pagos, setPagos] = useState<Pago[] | null>(null);
  const [isLoadingPagos, setIsLoadingPagos] = useState(true);

  useEffect(() => {
    if (!firestore || !apartados || !weekStart || !weekEnd) {
      if (!isLoadingApartados) {
        setIsLoadingPagos(false);
        setPagos([]);
      }
      return;
    }

    const fetchPagos = async () => {
      setIsLoadingPagos(true);
      try {
        const allPagos: Pago[] = [];
        
        const promises = apartados.map(apartado => {
          const pagosRef = collection(firestore, 'apartados', apartado.id, 'pagos');
          const q = query(pagosRef, 
            where('fecha', '>=', weekStart),
            where('fecha', '<=', weekEnd),
            orderBy('fecha', 'desc')
          );
          return getDocs(q);
        });

        const querySnapshots = await Promise.all(promises);

        querySnapshots.forEach(snapshot => {
          snapshot.forEach(doc => {
            allPagos.push({ id: doc.id, ...(doc.data() as Omit<Pago, 'id'>) });
          });
        });

        allPagos.sort((a, b) => b.fecha.seconds - a.fecha.seconds);
        setPagos(allPagos);

      } catch (error) {
        console.error("Error fetching pagos for reports:", error);
        toast({
          variant: "destructive",
          title: "Error al cargar pagos",
          description: "No se pudieron cargar los datos de pagos para el reporte.",
        });
        setPagos([]);
      } finally {
        setIsLoadingPagos(false);
      }
    };

    fetchPagos();
  }, [firestore, apartados, isLoadingApartados, weekStart, weekEnd, toast]);


  // --- Process data for charts and summaries ---
  const { weeklySummary, chartData } = useMemo(() => {
    const summary = {
      totalIngresos: 0,
      totalGastos: 0,
      ingresosEfectivo: 0,
      ingresosTransferencia: 0,
      gastosEfectivo: 0,
      gastosTransferencia: 0,
      balanceCaja: 0,
      balanceTransferencia: 0,
    };
    const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

    const dailyData = new Map<string, { ventas: number; gastos: number }>();
    weekDays.forEach(day => {
        const dayName = format(day, 'EEEE', { locale: es });
        dailyData.set(dayName, { ventas: 0, gastos: 0 });
    });

    ventas?.forEach(venta => {
        const ventaDate = venta.fecha.toDate();
        const dayName = format(ventaDate, 'EEEE', { locale: es });
        if (dailyData.has(dayName)) {
            const current = dailyData.get(dayName)!;
            dailyData.set(dayName, { ...current, ventas: current.ventas + venta.totalVenta });
             if (venta.metodoPago === 'EFECTIVO') {
                summary.ingresosEfectivo += venta.totalVenta;
            } else {
                summary.ingresosTransferencia += venta.totalVenta;
            }
        }
    });

    pagos?.forEach(pago => {
        const pagoDate = pago.fecha.toDate();
        const dayName = format(pagoDate, 'EEEE', { locale: es });
        if (dailyData.has(dayName)) {
            const current = dailyData.get(dayName)!;
            dailyData.set(dayName, { ...current, ventas: current.ventas + pago.monto });
            
            if (pago.metodoPago === 'EFECTIVO') {
                summary.ingresosEfectivo += pago.monto;
            } else {
                summary.ingresosTransferencia += pago.monto;
            }
        }
    });


    gastos?.forEach(gasto => {
        const gastoDate = (gasto.fecha as Timestamp).toDate();
        const dayName = format(gastoDate, 'EEEE', { locale: es });
         if (dailyData.has(dayName)) {
            const current = dailyData.get(dayName)!;
            dailyData.set(dayName, { ...current, gastos: current.gastos + gasto.monto });
             if (gasto.metodoPago === 'EFECTIVO') {
                summary.gastosEfectivo += gasto.monto;
            } else {
                summary.gastosTransferencia += gasto.monto;
            }
        }
    });
    
    summary.totalIngresos = summary.ingresosEfectivo + summary.ingresosTransferencia;
    summary.totalGastos = summary.gastosEfectivo + summary.gastosTransferencia;
    summary.balanceCaja = summary.ingresosEfectivo - summary.gastosEfectivo;
    summary.balanceTransferencia = summary.ingresosTransferencia - summary.gastosTransferencia;


    const orderedDaysMap = new Map([
        ["lunes", { ventas: 0, gastos: 0 }], ["martes", { ventas: 0, gastos: 0 }], 
        ["miércoles", { ventas: 0, gastos: 0 }], ["jueves", { ventas: 0, gastos: 0 }], 
        ["viernes", { ventas: 0, gastos: 0 }], ["sábado", { ventas: 0, gastos: 0 }], ["domingo", { ventas: 0, gastos: 0 }]
    ]);

    dailyData.forEach((value, key) => {
        orderedDaysMap.set(key.toLowerCase(), value);
    });

    const finalChartData = Array.from(orderedDaysMap.entries()).map(([day, data]) => ({
      day: day.charAt(0).toUpperCase() + day.slice(1),
      ventas: data.ventas,
      gastos: data.gastos,
    }));

    return { weeklySummary: summary, chartData: finalChartData };
  }, [ventas, gastos, pagos, weekStart, weekEnd]);
  
  const handlePreviousWeek = () => {
    setCurrentDate(subDays(currentDate, 7));
  };

  const handleNextWeek = () => {
    setCurrentDate(addDays(currentDate, 7));
  };
  
  const handleGoToToday = () => {
    setCurrentDate(new Date());
  }
  
  const handleGenerateWeeklyPDF = () => {
    const doc = new jsPDF() as jsPDFWithAutoTable;
    const weekStartFormatted = format(weekStart, "dd 'de' LLLL", { locale: es });
    const weekEndFormatted = format(weekEnd, "dd 'de' LLLL 'de' yyyy", { locale: es });
    const totalVentasDirectas = (ventas || []).reduce((acc, v) => acc + v.totalVenta, 0);
    const totalIngresosApartados = (pagos || []).reduce((acc, p) => acc + p.monto, 0);

    // Título
    doc.setFontSize(20);
    doc.text("Reporte Financiero Semanal", 14, 20);
    doc.setFontSize(12);
    doc.text(`${weekStartFormatted} - ${weekEndFormatted}`, 14, 28);
    doc.setFontSize(10);
    doc.text(`Generado el: ${format(new Date(), "dd/MM/yyyy HH:mm")}`, 14, 34);

    // Tabla de Resumen
    doc.autoTable({
        startY: 40,
        head: [['Concepto', 'Monto']],
        body: [
            ['Balance Final en Caja', formatCurrency(weeklySummary.balanceCaja)],
            ['Balance Final en Transferencia', formatCurrency(weeklySummary.balanceTransferencia)],
            ['Ventas Directas', formatCurrency(totalVentasDirectas)],
            ['Ingresos por Apartados', formatCurrency(totalIngresosApartados)],
            ['Total Ingresos', { content: formatCurrency(weeklySummary.totalIngresos), styles: { fontStyle: 'bold' } }],
            ['Total Gastos', formatCurrency(weeklySummary.totalGastos)],
        ],
        theme: 'striped',
        headStyles: { fillColor: [41, 128, 185] },
    });
    
    let finalY = (doc as any).lastAutoTable.finalY;

    // Tabla de Desglose Diario
    doc.setFontSize(14);
    doc.text("Desglose Diario", 14, finalY + 15);
    const dailyBody = chartData.map(d => {
        const balanceDia = d.ventas - d.gastos;
        return [
            d.day,
            formatCurrency(d.ventas),
            formatCurrency(d.gastos),
            formatCurrency(balanceDia)
        ];
    });

     doc.autoTable({
        startY: finalY + 20,
        head: [['Día', 'Total Ingresos', 'Total Gastos', 'Balance del Día']],
        body: dailyBody,
        theme: 'grid',
        headStyles: { fillColor: [39, 174, 96] },
    });
    
    doc.save(`reporte_semanal_${format(weekStart, "yyyy-MM-dd")}.pdf`);
    toast({ variant: "success", title: "PDF Generado", description: "El reporte semanal ha sido descargado." });
  }

  const isCurrentWeek = format(startOfWeek(currentDate, { weekStartsOn: 1 }), 'yyyy-MM-dd') === format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');


  const isLoading = isLoadingVentas || isLoadingGastos || isLoadingPagos || isLoadingApartados;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
            <h1 className="text-3xl font-title text-white [text-shadow:_-2px_-2px_0_rgba(0,0,0,0.8),_2px_-2px_0_rgba(0,0,0,0.8),_-2px_2px_0_rgba(0,0,0,0.8),_2px_2px_0_rgba(0,0,0,0.8)]">Reporte Semanal</h1>
             {user?.role === 'admin' && (
                <div className="flex items-center gap-2 mt-2">
                    <Button onClick={handlePreviousWeek} size="icon" variant="destructive" className="h-8 w-8 text-black">
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <p className="text-md text-white font-handwritten font-bold [text-shadow:_-1px_-1px_0_rgba(0,0,0,0.9),_1px_-1px_0_rgba(0,0,0,0.9),_-1px_1px_0_rgba(0,0,0,0.9),_1px_1px_0_rgba(0,0,0,0.9)]">
                        {format(weekStart, "dd 'de' LLL", { locale: es })} - {format(weekEnd, "dd 'de' LLL, yyyy", { locale: es })}
                    </p>
                    <Button onClick={handleNextWeek} size="icon" variant="destructive" className="h-8 w-8 text-black" disabled={isCurrentWeek}>
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                    {!isCurrentWeek && (
                        <Button onClick={handleGoToToday} size="icon" variant="destructive" className="h-8 w-8 text-black">
                            <LocateFixed className="h-4 w-4" />
                        </Button>
                    )}
                </div>
            )}
        </div>
         {user?.role === 'admin' && (
            <div className="flex items-center gap-2">
                <Button variant="destructive" className="font-sans text-sm text-black" onClick={handleGenerateWeeklyPDF}>
                    <FileDown className="mr-2 h-4 w-4" /> Generar PDF
                </Button>
            </div>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card style={{ backgroundColor: 'hsla(40, 50%, 85%, 0.8)' }}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-black">Balance en Caja</CardTitle>
                    <Banknote className="h-4 w-4 text-black/70" />
                </CardHeader>
                <CardContent>
                    <div className={`text-2xl font-bold ${weeklySummary.balanceCaja >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                        {formatCurrency(weeklySummary.balanceCaja)}
                    </div>
                     <p className="text-xs text-black/80">Ingresos ({formatCurrency(weeklySummary.ingresosEfectivo)}) - Gastos ({formatCurrency(weeklySummary.gastosEfectivo)})</p>
                </CardContent>
            </Card>
            <Card style={{ backgroundColor: 'hsla(200, 40%, 85%, 0.8)' }}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-black">Balance en Transferencia</CardTitle>
                    <Landmark className="h-4 w-4 text-black/70" />
                </CardHeader>
                <CardContent>
                    <div className={`text-2xl font-bold ${weeklySummary.balanceTransferencia >= 0 ? 'text-blue-700' : 'text-red-700'}`}>
                        {formatCurrency(weeklySummary.balanceTransferencia)}
                    </div>
                    <p className="text-xs text-black/80">Ingresos ({formatCurrency(weeklySummary.ingresosTransferencia)}) - Gastos ({formatCurrency(weeklySummary.gastosTransferencia)})</p>
                </CardContent>
            </Card>
            <Card style={{ backgroundColor: 'hsla(120, 30%, 85%, 0.8)' }}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-black">Ingresos Totales</CardTitle>
                    <TrendingUp className="h-4 w-4 text-black/70" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold text-black">{formatCurrency(weeklySummary.totalIngresos)}</div>
                    <p className="text-xs text-black/80">Ventas directas + Ingresos de apartados.</p>
                </CardContent>
            </Card>
            <Card style={{ backgroundColor: 'hsla(0, 40%, 85%, 0.8)' }}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-black">Gastos Totales</CardTitle>
                    <TrendingDown className="h-4 w-4 text-black/70" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold text-black">{formatCurrency(weeklySummary.totalGastos)}</div>
                     <p className="text-xs text-black/80">Suma de gastos en efectivo y transferencia.</p>
                </CardContent>
            </Card>
      </div>


      <Card style={{ backgroundColor: 'hsla(39, 44%, 84%, 0.8)', backdropFilter: 'blur(8px)' }}>
        <CardHeader>
          <CardTitle className="text-black font-sans">Balance de la Semana</CardTitle>
          <CardDescription className="text-black/80 font-sans font-semibold">
            Comparativo de Ingresos vs. Gastos para la semana del {format(weekStart, "dd 'de' LLLL", { locale: es })} al {format(weekEnd, "dd 'de' LLLL 'de' yyyy", { locale: es })}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
             <div className="h-[350px] w-full flex items-center justify-center">
                 <p className="text-black font-semibold">Cargando datos del reporte...</p>
             </div>
          ) : (
            <ChartContainer config={chartConfig} className="h-[350px] w-full">
              <BarChart data={chartData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false}/>
                <XAxis 
                  dataKey="day" 
                  tickLine={false} 
                  axisLine={false} 
                  tickMargin={8}
                />
                <YAxis 
                  tickLine={false} 
                  axisLine={false} 
                  tickMargin={8} 
                  tickFormatter={(value) => `$${value}`} 
                />
                 <Tooltip
                    cursor={false}
                    content={<ChartTooltipContent 
                        indicator="dot" 
                        formatter={(value, name) => {
                            const config = chartConfig[name as keyof typeof chartConfig];
                            return (
                                <div className="flex items-center gap-2">
                                   <div className="w-2.5 h-2.5 rounded-full" style={{backgroundColor: config.color}}/>
                                   <span>{config.label}: {formatCurrency(Number(value))}</span>
                                </div>
                            )
                        }}
                    />} 
                  />
                  <Legend />
                <Bar dataKey="ventas" fill="var(--color-ventas)" radius={4} name="ventas" />
                <Bar dataKey="gastos" fill="var(--color-gastos)" radius={4} name="gastos" />
              </BarChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
