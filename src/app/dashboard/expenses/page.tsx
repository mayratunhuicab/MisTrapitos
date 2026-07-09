
"use client";

import { useState, useMemo, useEffect } from 'react';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { useFirestore, useCollection, useUser, useMemoFirebase } from "@/firebase";
import { collection, query, addDoc, doc, updateDoc, deleteDoc, Timestamp, orderBy, where, getDocs } from "firebase/firestore";
import { format, startOfWeek, endOfWeek, addDays, subDays, startOfDay, endOfDay, isWithinInterval, isSameDay } from "date-fns";
import { es } from "date-fns/locale";
import { PlusCircle, Calendar as CalendarIcon, MoreHorizontal, Pencil, Trash2, ChevronLeft, ChevronRight, LocateFixed } from "lucide-react";
import { useToast } from '@/hooks/use-toast';
import { cn } from "@/lib/utils";

type Gasto = {
  id: string;
  descripcion: string;
  monto: number;
  fecha: Timestamp | Date;
  metodoPago: "EFECTIVO" | "TRANSFERENCIA";
};

type Venta = {
  id: string;
  totalVenta: number;
  metodoPago: "EFECTIVO" | "TRANSFERENCIA";
  fecha: Timestamp;
};

type Pago = {
    id: string;
    monto: number;
    fecha: Timestamp;
    metodoPago: "EFECTIVO" | "TRANSFERENCIA";
};

type Apartado = {
  id: string;
}


const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-MX', {
        style: 'currency',
        currency: 'MXN',
    }).format(value);
};

export default function ExpensesPage() {
    const firestore = useFirestore();
    const { user } = useUser();
    const { toast } = useToast();

    const [currentDate, setCurrentDate] = useState<Date | null>(null);
    const [selectedDateForEmployee, setSelectedDateForEmployee] = useState<Date | null>(null);

    useEffect(() => {
        // Set date on client to avoid hydration error
        if (currentDate === null) {
            setCurrentDate(new Date());
        }
        if (selectedDateForEmployee === null) {
            setSelectedDateForEmployee(new Date());
        }
    }, [currentDate, selectedDateForEmployee]);


    const { dateRange, viewType, weekBoundaries } = useMemo(() => {
        if (user?.role === 'admin') {
            const date = currentDate || new Date();
            const start = startOfWeek(date, { weekStartsOn: 1 });
            const end = endOfWeek(date, { weekStartsOn: 1 });
            return { dateRange: { start, end }, viewType: 'week' as const, weekBoundaries: null };
        } else {
            const today = selectedDateForEmployee || new Date();
            const start = startOfDay(today);
            const end = endOfDay(today);
            const currentWeekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
            const currentWeekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });
            return { dateRange: { start, end }, viewType: 'day' as const, weekBoundaries: { start: currentWeekStart, end: currentWeekEnd } };
        }
    }, [currentDate, user?.role, selectedDateForEmployee]);

    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [selectedGasto, setSelectedGasto] = useState<Gasto | null>(null);
    const [descripcionGasto, setDescripcionGasto] = useState("");
    const [montoGasto, setMontoGasto] = useState<number | "">("");
    const [fechaGasto, setFechaGasto] = useState<Date | undefined>(new Date());
    const [metodoPagoGasto, setMetodoPagoGasto] = useState<"EFECTIVO" | "TRANSFERENCIA">("EFECTIVO");
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Fetch Gastos
    const gastosQuery = useMemoFirebase(() => {
        if (!firestore || !user || !dateRange.start) return null;
        return query(
            collection(firestore, 'gastos'),
            where('fecha', '>=', Timestamp.fromDate(dateRange.start)),
            where('fecha', '<=', Timestamp.fromDate(dateRange.end)),
            orderBy('fecha', 'desc')
        );
    }, [firestore, user, dateRange]);
    const { data: gastos, isLoading: isLoadingGastos } = useCollection<Gasto>(gastosQuery, { enabled: !!user });
    
    // Fetch Ventas to validate against
    const ventasQuery = useMemoFirebase(() => {
        if (!firestore || !user || !dateRange.start) return null;
        return query(
            collection(firestore, 'ventas'),
            where('fecha', '>=', Timestamp.fromDate(dateRange.start)),
            where('fecha', '<=', Timestamp.fromDate(dateRange.end)),
            orderBy('fecha', 'desc')
        );
    }, [firestore, user, dateRange]);
    const { data: ventas, isLoading: isLoadingVentas } = useCollection<Venta>(ventasQuery, { enabled: !!user });

    // Fetch all apartados to then query their subcollections
    const apartadosQuery = useMemoFirebase(() => {
        if (!firestore || !user) return null;
        return query(collection(firestore, 'apartados'));
    }, [firestore, user]);
    const { data: apartados, isLoading: isLoadingApartados } = useCollection<Apartado>(apartadosQuery);

    const [pagos, setPagos] = useState<Pago[] | null>(null);
    const [isLoadingPagos, setIsLoadingPagos] = useState(true);

    // This effect fetches 'pagos' from the subcollection of each 'apartado'.
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

                querySnapshots.forEach(snapshot => {
                    snapshot.forEach(doc => {
                        allPagos.push({ id: doc.id, ...(doc.data() as Omit<Pago, 'id'>) });
                    });
                });

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


    
    const resetForm = () => {
        setSelectedGasto(null);
        setDescripcionGasto("");
        setMontoGasto("");
        setFechaGasto(new Date());
        setMetodoPagoGasto("EFECTIVO");
    }

    const handleOpenDialog = (gasto: Gasto | null = null) => {
        if (gasto) {
            setSelectedGasto(gasto);
            setDescripcionGasto(gasto.descripcion);
            setMontoGasto(gasto.monto);
            setFechaGasto((gasto.fecha as Timestamp).toDate());
            setMetodoPagoGasto(gasto.metodoPago || "EFECTIVO");
        } else {
            resetForm();
        }
        setIsDialogOpen(true);
    }

    const handleSaveChanges = async () => {
        if (!firestore) return;
        const monto = Number(montoGasto);
        if (!descripcionGasto || monto <= 0 || !fechaGasto || !metodoPagoGasto) {
            toast({ variant: "destructive", title: "Error", description: "Completa todos los campos del gasto." });
            return;
        }

        // --- VALIDATION LOGIC ---
        const dayOfNewExpense = fechaGasto;

        // Income from direct sales
        const totalSalesForDay = (ventas || [])
            .filter(v => isSameDay(v.fecha.toDate(), dayOfNewExpense) && v.metodoPago === metodoPagoGasto)
            .reduce((sum, v) => sum + v.totalVenta, 0);

        // Income from layaway payments
        const totalPagosForDay = (pagos || [])
            .filter(p => isSameDay(p.fecha.toDate(), dayOfNewExpense) && p.metodoPago === metodoPagoGasto)
            .reduce((sum, p) => sum + p.monto, 0);
        
        const totalIncomeForDay = totalSalesForDay + totalPagosForDay;

        const totalExpensesForDay = (gastos || [])
            .filter(g => 
                isSameDay((g.fecha as Timestamp).toDate(), dayOfNewExpense) && 
                g.metodoPago === metodoPagoGasto &&
                g.id !== selectedGasto?.id // Exclude the current expense if editing
            )
            .reduce((sum, g) => sum + g.monto, 0);
        
        const availableBalance = totalIncomeForDay - totalExpensesForDay;

        if (monto > availableBalance) {
            toast({
                variant: "destructive",
                title: "Límite de Gastos Excedido",
                description: `El monto del gasto (${formatCurrency(monto)}) supera el balance disponible en ${metodoPagoGasto} (${formatCurrency(availableBalance)}) para este día.`,
                duration: 5000,
            });
            return;
        }
        // --- END VALIDATION LOGIC ---


        setIsSubmitting(true);
        const gastoData = {
            descripcion: descripcionGasto,
            monto: monto,
            fecha: fechaGasto,
            metodoPago: metodoPagoGasto,
        };

        try {
            if (selectedGasto) {
                const gastoRef = doc(firestore, 'gastos', selectedGasto.id);
                await updateDoc(gastoRef, gastoData);
                toast({ variant: "success", title: "Gasto actualizado" });
            } else {
                await addDoc(collection(firestore, 'gastos'), gastoData);
                toast({ variant: "success", title: "Gasto agregado" });
            }
            setIsDialogOpen(false);
            resetForm();
        } catch (error) {
            console.error("Error saving expense:", error);
            toast({ variant: "destructive", title: "Error", description: "No se pudo guardar el gasto." });
        } finally {
            setIsSubmitting(false);
        }
    }

    const handleDeleteGasto = async (gastoId: string) => {
        if (!firestore) return;
        setIsSubmitting(true);
        try {
            await deleteDoc(doc(firestore, 'gastos', gastoId));
            toast({ variant: "success", title: "Gasto eliminado" });
        } catch (error) {
            console.error("Error deleting expense:", error);
            toast({ variant: "destructive", title: "Error", description: "No se pudo eliminar el gasto." });
        } finally {
            setIsSubmitting(false);
        }
    }

    const handlePreviousWeek = () => setCurrentDate(prev => prev ? subDays(prev, 7) : subDays(new Date(), 7));
    const handleNextWeek = () => setCurrentDate(prev => prev ? addDays(prev, 7) : addDays(new Date(), 7));
    const handleGoToToday = () => setCurrentDate(new Date());

    const isCurrentWeek = currentDate ? format(startOfWeek(currentDate, { weekStartsOn: 1 }), 'yyyy-MM-dd') === format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd') : false;

    if (!currentDate || !selectedDateForEmployee) {
        return <div className="flex justify-center items-center h-screen">
            <p className="text-white text-2xl">Cargando...</p>
        </div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row items-start justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-title text-white [text-shadow:_-2px_-2px_0_rgba(0,0,0,0.8),_2px_-2px_0_rgba(0,0,0,0.8),_-2px_2px_0_rgba(0,0,0,0.8),_2px_2px_0_rgba(0,0,0,0.8)]">
                        Gestión de Gastos
                    </h1>
                     {user?.role === 'admin' ? (
                        <div className="flex items-center gap-2 mt-2">
                             <Button onClick={handlePreviousWeek} size="icon" variant="destructive" className="h-8 w-8 text-black">
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <p className="text-md text-white font-handwritten font-bold [text-shadow:_-1px_-1px_0_rgba(0,0,0,0.9),_1px_-1px_0_rgba(0,0,0,0.9),_-1px_1px_0_rgba(0,0,0,0.9),_1px_1px_0_rgba(0,0,0,0.9)]">
                                {dateRange.start && format(dateRange.start, "dd 'de' LLL", { locale: es })} - {dateRange.end && format(dateRange.end, "dd 'de' LLL, yyyy", { locale: es })}
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
                     ) : (
                        <p className="text-xl text-white font-handwritten font-bold [text-shadow:_-1px_-1px_0_rgba(0,0,0,0.9),_1px_-1px_0_rgba(0,0,0,0.9),_-1px_1px_0_rgba(0,0,0,0.9),_1px_1px_0_rgba(0,0,0,0.9)]">
                            Registra y consulta los gastos del día: {format(selectedDateForEmployee, "EEEE dd 'de' LLLL", { locale: es })}.
                        </p>
                     )}
                </div>
                <div className="flex items-center gap-2">
                    {user?.role === 'empleado' && weekBoundaries && (
                         <Popover>
                            <PopoverTrigger asChild>
                                <Button variant={"destructive"} className={cn("w-full sm:w-auto px-4 justify-start text-left font-normal text-black")}>
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {selectedDateForEmployee ? format(selectedDateForEmployee, "dd 'de' LLL 'de' yyyy", { locale: es }) : <span>Elige una fecha</span>}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0 font-sans">
                                <Calendar
                                    mode="single"
                                    selected={selectedDateForEmployee}
                                    onSelect={(day) => day && setSelectedDateForEmployee(day)}
                                    disabled={(date) => !isWithinInterval(date, { start: weekBoundaries.start, end: weekBoundaries.end })}
                                    initialFocus
                                    locale={es}
                                />
                            </PopoverContent>
                        </Popover>
                    )}
                    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                        <DialogTrigger asChild>
                            <Button variant="destructive" className="font-sans text-sm text-black" onClick={() => handleOpenDialog()}>
                                <PlusCircle className="mr-2 h-4 w-4" /> Agregar Gasto
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-md font-sans" style={{ backgroundColor: 'hsla(39, 44%, 84%, 0.9)', backdropFilter: 'blur(12px)' }}>
                            <DialogHeader>
                                <DialogTitle>{selectedGasto ? "Editar" : "Agregar"} Gasto</DialogTitle>
                                <DialogDescription>
                                    Registra un nuevo gasto o edita uno existente.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="grid gap-4 py-4">
                                <div className="space-y-2">
                                    <Label htmlFor="descripcion" className="font-semibold">Descripción</Label>
                                    <Input id="descripcion" value={descripcionGasto} onChange={(e) => setDescripcionGasto(e.target.value)} disabled={isSubmitting} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="metodo-pago-gasto" className="font-sans font-semibold text-md text-black mb-1">Método de Pago</Label>
                                    <Select value={metodoPagoGasto} onValueChange={(value: "EFECTIVO" | "TRANSFERENCIA") => setMetodoPagoGasto(value)} disabled={isSubmitting}>
                                        <SelectTrigger id="metodo-pago-gasto" className="font-sans bg-white/80">
                                            <SelectValue placeholder="Selecciona método" />
                                        </SelectTrigger>
                                        <SelectContent className="font-sans">
                                            <SelectItem value="EFECTIVO">Efectivo</SelectItem>
                                            <SelectItem value="TRANSFERENCIA">Transferencia</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="monto" className="font-semibold">Monto ($)</Label>
                                    <Input id="monto" type="number" min="0" value={montoGasto} onChange={(e) => setMontoGasto(e.target.value === '' ? '' : Number(e.target.value))} disabled={isSubmitting} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="fecha" className="font-semibold">Fecha del Gasto</Label>
                                    <Popover>
                                        <PopoverTrigger asChild>
                                        <Button
                                            variant={"outline"}
                                            className={cn(
                                            "w-full justify-start text-left font-normal",
                                            !fechaGasto && "text-muted-foreground"
                                            )}
                                            disabled={isSubmitting}
                                        >
                                            <CalendarIcon className="mr-2 h-4 w-4" />
                                            {fechaGasto ? format(fechaGasto, "PPP", { locale: es }) : <span>Elige una fecha</span>}
                                        </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0 font-sans">
                                        <Calendar
                                            mode="single"
                                            selected={fechaGasto}
                                            onSelect={setFechaGasto}
                                            initialFocus
                                            locale={es}
                                            disabled={(date) => date > new Date() || date < new Date("2020-01-01")}
                                        />
                                        </PopoverContent>
                                    </Popover>
                                </div>
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isSubmitting}>Cancelar</Button>
                                <Button onClick={handleSaveChanges} disabled={isSubmitting || isLoadingVentas || isLoadingGastos || isLoadingPagos || isLoadingApartados} variant="destructive" className="text-black">
                                    {isSubmitting ? "Guardando..." : "Guardar Gasto"}
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            <Card style={{ backgroundColor: 'hsla(39, 44%, 84%, 0.8)', backdropFilter: 'blur(8px)' }}>
                <CardHeader>
                    <CardTitle className="font-sans text-2xl text-black">Historial de Gastos</CardTitle>
                    <CardDescription className="font-sans font-semibold text-md text-black">
                         {viewType === 'week' ? "Aquí puedes ver todos los gastos registrados para la semana seleccionada." : "Aquí puedes ver todos los gastos registrados para el día seleccionado."}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="font-sans font-semibold text-sm text-black">Fecha</TableHead>
                                <TableHead className="font-sans font-semibold text-sm text-black">Descripción</TableHead>
                                <TableHead className="font-sans font-semibold text-sm text-black">Método</TableHead>
                                <TableHead className="text-right font-sans font-semibold text-sm text-black">Monto</TableHead>
                                <TableHead className="text-right font-sans font-semibold text-sm text-black">Acciones</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                             {isLoadingGastos ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="h-24 text-center font-sans font-semibold text-lg text-black">
                                        Cargando gastos...
                                    </TableCell>
                                </TableRow>
                            ) : gastos && gastos.length > 0 ? (
                                gastos.map(gasto => (
                                    <TableRow key={gasto.id}>
                                        <TableCell className="hidden sm:table-cell">{format((gasto.fecha as Timestamp).toDate(), "dd/MM/yyyy")}</TableCell>
                                        <TableCell className="font-medium">{gasto.descripcion}</TableCell>
                                        <TableCell>
                                            <Badge variant={gasto.metodoPago === 'EFECTIVO' ? 'secondary' : 'outline'}>
                                                {gasto.metodoPago}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right font-bold">{formatCurrency(gasto.monto)}</TableCell>
                                        <TableCell className="text-right">
                                            <AlertDialog>
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" className="h-8 w-8 p-0">
                                                            <MoreHorizontal className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end" className="font-sans bg-white border-2 border-black">
                                                        <DropdownMenuItem onClick={() => handleOpenDialog(gasto)}>
                                                            <Pencil className="mr-2 h-4 w-4" /> Editar
                                                        </DropdownMenuItem>
                                                        <DropdownMenuSeparator />
                                                        <AlertDialogTrigger asChild>
                                                            <DropdownMenuItem className="text-red-500 focus:text-red-500">
                                                                <Trash2 className="mr-2 h-4 w-4" /> Eliminar
                                                            </DropdownMenuItem>
                                                        </AlertDialogTrigger>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                                  <AlertDialogContent className="font-sans bg-white text-black">
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle>¿Confirmar eliminación?</AlertDialogTitle>
                                                        <AlertDialogDescription>
                                                            Esta acción no se puede deshacer. Se eliminará el gasto: <span className="font-bold">{gasto.descripcion}</span>.
                                                        </AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel disabled={isSubmitting}>Cancelar</AlertDialogCancel>
                                                        <AlertDialogAction onClick={() => handleDeleteGasto(gasto.id)} disabled={isSubmitting} className="bg-red-600 text-white hover:bg-red-700">
                                                            {isSubmitting ? "Eliminando..." : "Sí, eliminar"}
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
                                        No hay gastos registrados para {viewType === 'week' ? 'esta semana' : 'el día de hoy'}.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}

    