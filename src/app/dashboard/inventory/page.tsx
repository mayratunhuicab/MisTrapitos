
"use client";

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { es } from "date-fns/locale";
import { Calendar as CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
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
} from "@/components/ui/dialog"
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
} from "@/components/ui/alert-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge";
import { PlusCircle, MoreHorizontal, Pencil, Trash2, Shirt } from "lucide-react";
import { ScrollArea } from '@/components/ui/scroll-area';
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useFirestore, useCollection, useMemoFirebase, useUser } from '@/firebase';
import { collection, doc, addDoc, updateDoc, deleteDoc, serverTimestamp, getDocs, writeBatch, collectionGroup, query } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Textarea } from '@/components/ui/textarea';

// Data types
type Paca = {
  id: string;
  idPersonalizado: string;
  nombrePaca: string;
  etiqueta: string;
  proveedor: string;
  costoPaca: number;
  costoEnvio: number;
  cantidadPrendas: number;
  fecha: { seconds: number; nanoseconds: number; } | Date;
  ventaTotalPotencial?: number;
  colorEtiqueta?: string;
  createdAt: any;
  inventarioCompleto?: boolean;
  prendaNextId?: number;
  prendasRegistradas?: number;
  observaciones?: string;
};

type Item = {
  id: string;
  pacaId: string;
  cantidad: number;
  precioVenta: number;
  _parentPath?: string;
};

type Apartado = {
  id: string;
  totalApartado: number;
  totalPagado: number;
  estado: 'VIGENTE' | 'LIQUIDADO' | 'CANCELADO';
};

type Prenda = {
    id: string;
    pacaId: string;
    cantidad: number;
    precioVenta: number;
    ventaTotalPotencial: number;
};


// Helper function to calculate unit price
const calcularPrecioUnitario = (costoPaca: number, costoEnvio: number, cantidadPrendas: number) => {
  if (cantidadPrendas > 0) {
    return (costoPaca + costoEnvio) / cantidadPrendas;
  }
  return 0;
};

// Helper function to convert to Title Case
const toTitleCase = (str: string) => {
  if (!str) return str;
  return str.replace(
    /\w\S*/g,
    (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
  );
};

export default function InventoryPage() {
  const firestore = useFirestore();
  const router = useRouter();
  const { user, isUserLoading } = useUser();

  const pacasCollectionRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return collection(firestore, 'pacas');
  }, [firestore, user]);

  const { data: pacas, isLoading: isPacasLoading } = useCollection<Paca>(pacasCollectionRef);

  const itemsQuery = useMemoFirebase(() => {
      if (!firestore || !user) return null;
      return collectionGroup(firestore, 'items');
  }, [firestore, user]);
  const { data: todosLosItems, isLoading: isItemsLoading } = useCollection<Item>(itemsQuery, { enabled: !!user });

  const apartadosQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(collection(firestore, 'apartados'));
  }, [firestore, user]);
  const { data: todosApartados, isLoading: isApartadosLoading } = useCollection<Apartado>(apartadosQuery, { enabled: !!user });

  const prendasQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return collectionGroup(firestore, 'prendas');
}, [firestore, user]);
const { data: todasPrendas, isLoading: isPrendasLoading } = useCollection<Prenda>(prendasQuery, { enabled: !!user });


  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<'add' | 'edit'>('add');
  const [selectedPaca, setSelectedPaca] = useState<Paca | null>(null);
  const [isDeleteAlertOpen, setIsDeleteAlertOpen] = useState(false);
  
  // Form state
  const [nombrePaca, setNombrePaca] = useState('');
  const [etiqueta, setEtiqueta] = useState('');
  const [proveedor, setProveedor] = useState('');
  const [costoPaca, setCostoPaca] = useState<number | ''>('');
  const [costoEnvio, setCostoEnvio] = useState<number | ''>('');
  const [cantidadPrendas, setCantidadPrendas] = useState<number | ''>('');
  const [fecha, setFecha] = useState<Date | undefined>(new Date());
  const [colorEtiqueta, setColorEtiqueta] = useState('#e55572');
  const [observaciones, setObservaciones] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { toast } = useToast();

  const pacasConGanancia = useMemo(() => {
    if (!pacas || !todosLosItems || !todosApartados || !todasPrendas) return [];

    const ventaItems = todosLosItems.filter(item => item._parentPath?.startsWith('ventas/'));
    const apartadoItems = todosLosItems.filter(item => item._parentPath?.startsWith('apartados/'));

    const apartadosMap = new Map(todosApartados.map(a => [a.id, a]));
    const apartadoItemsMap = new Map<string, Item[]>();
    apartadoItems.forEach(item => {
        const apartadoId = item._parentPath?.split('/')[1];
        if (apartadoId) {
            if (!apartadoItemsMap.has(apartadoId)) {
                apartadoItemsMap.set(apartadoId, []);
            }
            apartadoItemsMap.get(apartadoId)!.push(item);
        }
    });
    
    return pacas.map(paca => {
        const ventasDirectasDePaca = ventaItems.filter(item => item.pacaId === paca.id);
        const montoRecuperadoVentas = ventasDirectasDePaca.reduce((sum, item) => sum + (item.precioVenta * item.cantidad), 0);
        
        let montoRecuperadoApartados = 0;
        const apartadosConPrendasDePaca = new Set<string>();
        apartadoItems.forEach(item => {
            if (item.pacaId === paca.id) {
                const apartadoId = item._parentPath?.split('/')[1];
                if (apartadoId) {
                    apartadosConPrendasDePaca.add(apartadoId);
                }
            }
        });
        
        apartadosConPrendasDePaca.forEach(apartadoId => {
            const apartado = apartadosMap.get(apartadoId);
            if (!apartado || apartado.totalApartado <= 0) return;

            const itemsDelApartado = apartadoItemsMap.get(apartadoId) || [];
            
            const valorPacaEnApartado = itemsDelApartado
                .filter(item => item.pacaId === paca.id)
                .reduce((sum, item) => sum + (item.precioVenta * item.cantidad), 0);
            
            const proporcion = valorPacaEnApartado / apartado.totalApartado;
            const montoPagadoEnApartado = apartado.totalPagado || 0;
            
            if (!isNaN(proporcion)) {
              montoRecuperadoApartados += montoPagadoEnApartado * proporcion;
            }
        });

        const montoRecuperado = montoRecuperadoVentas + montoRecuperadoApartados;
        const costoTotal = paca.costoPaca + paca.costoEnvio;

        const prendasDePaca = todasPrendas.filter(p => p.pacaId === paca.id);
        const ventaPotencialStock = prendasDePaca.reduce((sum, prenda) => sum + (prenda.precioVenta * prenda.cantidad), 0);
        
        const ventaPotencialTotal = montoRecuperado + ventaPotencialStock;
        const gananciaPotencialTotal = ventaPotencialTotal - costoTotal;
        

        return {
            ...paca,
            costoTotal,
            ventaPotencial: ventaPotencialTotal,
            gananciaPotencial: gananciaPotencialTotal,
        };
    }).sort((a, b) => b.createdAt?.seconds - a.createdAt?.seconds);
  }, [pacas, todosLosItems, todosApartados, todasPrendas]);


  const precioUnitario = useMemo(() => {
    const pacaCost = Number(costoPaca) || 0;
    const shippingCost = Number(costoEnvio) || 0;
    const numItems = Number(cantidadPrendas) || 0;
    return calcularPrecioUnitario(pacaCost, shippingCost, numItems);
  }, [costoPaca, costoEnvio, cantidadPrendas]);

  const resetForm = () => {
    setNombrePaca('');
    setEtiqueta('');
    setProveedor('');
    setCostoPaca('');
    setCostoEnvio('');
    setCantidadPrendas('');
    setFecha(new Date());
    setColorEtiqueta('#e55572');
    setObservaciones('');
    setSelectedPaca(null);
  };

  const handleAddNew = () => {
    resetForm();
    setDialogMode('add');
    setIsDialogOpen(true);
  };

  const handleEdit = (paca: Paca) => {
    setDialogMode('edit');
    setSelectedPaca(paca);
    setNombrePaca(paca.nombrePaca);
    setEtiqueta(paca.etiqueta);
    setProveedor(paca.proveedor);
    setCostoPaca(paca.costoPaca);
    setCostoEnvio(paca.costoEnvio);
    setCantidadPrendas(paca.cantidadPrendas);
    setColorEtiqueta(paca.colorEtiqueta || '#e55572');
    setObservaciones(paca.observaciones || '');
    const pacaDate = 'seconds' in paca.fecha ? new Date(paca.fecha.seconds * 1000) : paca.fecha;
    setFecha(pacaDate);
    setIsDialogOpen(true);
  };

  const handleDelete = async (pacaId: string) => {
    if (!firestore) return;
    setIsSubmitting(true);
    try {
      const prendasCollectionRef = collection(firestore, 'pacas', pacaId, 'prendas');
      const prendasSnapshot = await getDocs(prendasCollectionRef);
      
      const batch = writeBatch(firestore);
      prendasSnapshot.docs.forEach(doc => batch.delete(doc.ref));
      batch.delete(doc(firestore, "pacas", pacaId));
      
      await batch.commit();

      toast({ variant: "success", title: "Paca eliminada", description: "La paca y todas sus prendas se han eliminado." });
    } catch (error) {
      console.error("Error deleting document: ", error);
      toast({ variant: "destructive", title: "Error", description: "No se pudo eliminar la paca." });
    } finally {
      setIsSubmitting(false);
      setIsDeleteAlertOpen(false);
      setSelectedPaca(null);
    }
  };

  const handleSaveChanges = async () => {
    if (!firestore || !pacasCollectionRef) return;
    const pacaCost = Number(costoPaca) || 0;
    const numItems = Number(cantidadPrendas) || 0;
    
    if (!nombrePaca || !etiqueta || !proveedor || pacaCost <= 0 || numItems <= 0 || !fecha) {
        toast({ variant: "destructive", title: "Error", description: "Completa todos los campos. El costo y la cantidad deben ser mayores a cero."});
        return;
    }

    setIsSubmitting(true);

    const pacaData: any = {
      nombrePaca,
      etiqueta,
      proveedor,
      costoPaca: pacaCost,
      costoEnvio: Number(costoEnvio) || 0,
      cantidadPrendas: numItems,
      fecha,
      colorEtiqueta,
      observaciones: observaciones,
    };

    try {
      if (dialogMode === 'edit' && selectedPaca) {
        // Si la cantidad de prendas aumenta, reabrimos el inventario.
        if (numItems > selectedPaca.cantidadPrendas) {
            pacaData.inventarioCompleto = false;
        }

        const pacaDocRef = doc(firestore, "pacas", selectedPaca.id);
        await updateDoc(pacaDocRef, pacaData);
        toast({ variant: "success", title: "Paca actualizada", description: "Los cambios se guardaron correctamente." });
        setIsDialogOpen(false);
        resetForm();
      } else {
        const querySnapshot = await getDocs(pacasCollectionRef);
        const nextIdNumber = querySnapshot.size + 1;
        const newIdPersonalizado = `P${nextIdNumber}`;

        const docRef = await addDoc(pacasCollectionRef, { 
            ...pacaData, 
            idPersonalizado: newIdPersonalizado,
            ventaTotalPotencial: 0,
            inventarioCompleto: false, // Siempre empieza como incompleto
            prendaNextId: 1,
            createdAt: serverTimestamp(),
            prendasRegistradas: 0,
        });

        toast({ variant: "success", title: "Paca agregada", description: "La nueva paca se ha registrado." });
        
        // Optimistic redirect
        router.push(`/dashboard/inventory/${docRef.id}`);
        setIsDialogOpen(false);
        resetForm();
      }
    } catch (error) {
      console.error("Error saving document: ", error);
      toast({ variant: "destructive", title: "Error", description: "No se pudieron guardar los cambios." });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    if (e.target.value === '0') {
      e.target.value = '';
    }
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsDialogOpen(false);
        resetForm();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const getPacaDate = (paca: Paca) => {
    if (paca.fecha && 'seconds' in paca.fecha) {
        return new Date(paca.fecha.seconds * 1000);
    }
    return paca.fecha as Date;
  }

  const isLoading = isUserLoading || isPacasLoading || isItemsLoading || isApartadosLoading || isPrendasLoading;

  return (
    <div className="space-y-6">
       <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-title text-white [text-shadow:_-2px_-2px_0_rgba(0,0,0,0.8),_2px_-2px_0_rgba(0,0,0,0.8),_-2px_2px_0_rgba(0,0,0,0.8),_2px_2px_0_rgba(0,0,0,0.8)]">Inventario de Pacas</h1>
          <p className="text-xl text-white font-handwritten font-bold [text-shadow:_-1px_-1px_0_rgba(0,0,0,0.9),_1px_-1px_0_rgba(0,0,0,0.9),_-1px_1px_0_rgba(0,0,0,0.9),_1px_1px_0_rgba(0,0,0,0.9)]">Gestiona tus pacas de ropa y niveles de stock.</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={(isOpen) => {
            setIsDialogOpen(isOpen);
            if (!isOpen) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button onClick={handleAddNew} variant="destructive" className="font-sans text-sm text-black">
              <PlusCircle className="mr-2 h-4 w-4" /> Agregar Paca
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[525px] font-sans" style={{ backgroundColor: 'hsla(39, 44%, 84%, 0.8)', backdropFilter: 'blur(8px)' }}>
            <DialogHeader>
              <DialogTitle className="font-sans font-bold">{dialogMode === 'add' ? 'Agregar Nueva Paca' : 'Editar Paca'}</DialogTitle>
              <DialogDescription className="font-sans font-semibold">
                {dialogMode === 'add' ? 'Completa los detalles de la paca.' : 'Actualiza los detalles de la paca.'}
              </DialogDescription>
            </DialogHeader>
            <ScrollArea className="max-h-[60vh] pr-6">
                <div className="grid gap-4 py-4">
                <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                    <Label htmlFor="nombrePaca" className="sm:text-right font-sans font-semibold">
                    Nombre Paca
                    </Label>
                    <Input id="nombrePaca" value={nombrePaca} onChange={(e) => setNombrePaca(toTitleCase(e.target.value))} className="col-span-3" disabled={isSubmitting}/>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                  <Label htmlFor="fecha" className="sm:text-right font-sans font-semibold">
                    Fecha Ingreso
                  </Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant={"outline"}
                        className={cn(
                          "col-span-3 justify-start text-left font-normal",
                          !fecha && "text-muted-foreground"
                        )}
                        disabled={isSubmitting}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {fecha ? format(fecha, "PPP", { locale: es }) : <span>Elige una fecha</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 font-sans">
                      <Calendar
                        mode="single"
                        selected={fecha}
                        onSelect={setFecha}
                        initialFocus
                        locale={es}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                    <Label htmlFor="etiqueta" className="sm:text-right font-sans font-semibold">
                    Etiqueta
                    </Label>
                    <Input id="etiqueta" value={etiqueta} onChange={(e) => setEtiqueta(toTitleCase(e.target.value))} className="col-span-3" disabled={isSubmitting}/>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                    <Label htmlFor="proveedor" className="sm:text-right font-sans font-semibold">
                    Proveedor
                    </Label>
                    <Input id="proveedor" value={proveedor} onChange={(e) => setProveedor(toTitleCase(e.target.value))} className="col-span-3" disabled={isSubmitting}/>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                    <Label htmlFor="costoPaca" className="sm:text-right font-sans font-semibold">
                    Costo Paca
                    </Label>
                    <Input id="costoPaca" type="number" min="0" value={costoPaca} onChange={(e) => setCostoPaca(e.target.value === '' ? '' : Number(e.target.value))} onFocus={handleFocus} className="col-span-3" disabled={isSubmitting}/>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                    <Label htmlFor="costoEnvio" className="sm:text-right font-sans font-semibold">
                    Costo Envío
                    </Label>
                    <Input id="costoEnvio" type="number" min="0" value={costoEnvio} onChange={(e) => setCostoEnvio(e.target.value === '' ? '' : Number(e.target.value))} onFocus={handleFocus} className="col-span-3" disabled={isSubmitting}/>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                    <Label htmlFor="cantidadPrendas" className="sm:text-right font-sans font-semibold">
                    Cant. Prendas
                    </Label>
                    <Input id="cantidadPrendas" type="number" min="0" value={cantidadPrendas} onChange={(e) => setCantidadPrendas(e.target.value === '' ? '' : Number(e.target.value))} onFocus={handleFocus} className="col-span-3" disabled={isSubmitting}/>
                </div>
                 <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                    <Label htmlFor="colorEtiqueta" className="sm:text-right font-sans font-semibold">
                        Color Etiqueta
                    </Label>
                    <Input id="colorEtiqueta" type="color" value={colorEtiqueta} onChange={(e) => setColorEtiqueta(e.target.value)} className="col-span-3 p-1" disabled={isSubmitting}/>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                    <Label htmlFor="observaciones" className="font-sans font-semibold sm:text-right sm:items-center">
                        Notas
                    </Label>
                    <Textarea 
                        id="observaciones" 
                        value={observaciones} 
                        onChange={(e) => setObservaciones(e.target.value)} 
                        className="col-span-3" 
                        placeholder="" 
                        disabled={isSubmitting}
                    />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                    <Label htmlFor="precioUnitario" className="sm:text-right font-bold font-sans font-semibold">
                    Costo Unitario
                    </Label>
                    <div className="col-span-3 font-bold text-lg">
                    ${precioUnitario.toFixed(2)}
                    </div>
                </div>
                </div>
            </ScrollArea>
            <DialogFooter>
              <Button onClick={() => setIsDialogOpen(false)} variant="outline" className="font-sans text-sm bg-white text-black border border-black hover:bg-red-600 hover:text-white" disabled={isSubmitting}>Cancelar</Button>
              <Button onClick={handleSaveChanges} variant="destructive" className="font-sans text-sm text-black" disabled={isSubmitting}>
                {isSubmitting ? 'Guardando...' : (dialogMode === 'add' ? 'Agregar y Ver Paca' : 'Guardar Cambios')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card style={{ backgroundColor: 'hsla(39, 44%, 84%, 0.8)', backdropFilter: 'blur(8px)' }}>
        <CardHeader className="space-y-0">
          <CardTitle className="font-sans text-3xl text-black">Pacas</CardTitle>
          <CardDescription className="font-sans font-semibold text-lg text-black">Una lista de todas las pacas en tu inventario.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="font-sans font-semibold text-sm text-black whitespace-nowrap">ID</TableHead>
                <TableHead className="font-sans font-semibold text-sm text-black whitespace-nowrap">Nombre Paca</TableHead>
                <TableHead className="hidden md:table-cell font-sans font-semibold text-sm text-black whitespace-nowrap">Fecha Ingreso</TableHead>
                <TableHead className="hidden lg:table-cell font-sans font-semibold text-sm text-black whitespace-nowrap">Etiqueta</TableHead>
                <TableHead className="hidden lg:table-cell font-sans font-semibold text-sm text-black whitespace-nowrap">Proveedor</TableHead>
                <TableHead className="text-right font-sans font-semibold text-sm text-black whitespace-nowrap">Prendas</TableHead>
                <TableHead className="hidden xl:table-cell text-right font-sans font-semibold text-sm text-black whitespace-nowrap">Costo Total</TableHead>
                <TableHead className="hidden md:table-cell text-right font-bold font-sans text-sm text-black whitespace-nowrap">Costo Unitario</TableHead>
                <TableHead className="hidden xl:table-cell text-right font-sans font-semibold text-sm text-black whitespace-nowrap">Venta Potencial</TableHead>
                <TableHead className="hidden xl:table-cell text-right font-bold font-sans text-sm text-black whitespace-nowrap">Ganancia Potencial</TableHead>
                <TableHead className="text-right font-sans font-semibold text-sm text-black whitespace-nowrap">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={11} className="h-24 text-center font-sans font-semibold text-lg text-black">
                    Cargando pacas...
                  </TableCell>
                </TableRow>
              ) : pacasConGanancia && pacasConGanancia.length > 0 ? (
                pacasConGanancia.map((paca) => {
                  const costoUnitario = calcularPrecioUnitario(paca.costoPaca, paca.costoEnvio, paca.cantidadPrendas);
                  const pacaDate = getPacaDate(paca);
                  return (
                    <TableRow key={paca.id} className="transition-colors hover:bg-accent/30 data-[state=selected]:bg-accent/30 font-sans">
                      <TableCell className="font-semibold text-xs whitespace-nowrap">{paca.idPersonalizado || paca.id.substring(0,6)}</TableCell>
                      <TableCell className="font-medium text-xs">{paca.nombrePaca}</TableCell>
                      <TableCell className="hidden md:table-cell text-xs">{pacaDate ? formatInTimeZone(pacaDate, 'UTC', "dd/MM/yy", { locale: es }) : 'N/A'}</TableCell>
                      <TableCell className="hidden lg:table-cell text-xs">
                        <Badge variant="outline">{paca.etiqueta}</Badge>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-xs">{paca.proveedor}</TableCell>
                      <TableCell className="text-right text-xs">{paca.cantidadPrendas}</TableCell>
                      <TableCell className="hidden xl:table-cell text-right text-xs">${paca.costoTotal.toFixed(2)}</TableCell>
                      <TableCell className="hidden md:table-cell text-right font-bold text-xs">${costoUnitario.toFixed(2)}</TableCell>
                      <TableCell className="hidden xl:table-cell text-right text-xs">${(paca.ventaPotencial || 0).toFixed(2)}</TableCell>
                      <TableCell className="hidden xl:table-cell text-right font-bold text-xs">${(paca.gananciaPotencial || 0).toFixed(2)}</TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" className="h-8 w-8 p-0">
                                <span className="sr-only">Abrir menú</span>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="font-sans bg-white border-2 border-black" style={{ backgroundColor: 'hsla(39, 44%, 84%, 0.9)', backdropFilter: 'blur(8px)' }}>
                              <DropdownMenuLabel>Acciones</DropdownMenuLabel>
                              <DropdownMenuItem onClick={() => handleEdit(paca)}>
                                <Pencil className="mr-2 h-4 w-4" />
                                Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild>
                                <Link href={`/dashboard/inventory/${paca.id}`}>
                                  <Shirt className="mr-2 h-4 w-4" />
                                  Ver Prendas
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuSeparator className="bg-black/50" />
                               <DropdownMenuItem className="text-red-600 focus:text-accent-foreground" disabled={isSubmitting} onClick={() => { setSelectedPaca(paca); setIsDeleteAlertOpen(true); }}>
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Eliminar
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  )
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={11} className="h-24 text-center font-sans font-semibold text-lg text-black">
                    Aún no hay pacas registradas. ¡Agrega la primera!
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AlertDialog open={isDeleteAlertOpen} onOpenChange={setIsDeleteAlertOpen}>
        <AlertDialogContent className="font-sans bg-white text-black">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Esto eliminará permanentemente la paca
              <span className="font-semibold"> {selectedPaca?.nombrePaca}</span> y todas sus prendas y datos asociados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSelectedPaca(null)} disabled={isSubmitting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => handleDelete(selectedPaca!.id)} variant="destructive" className="font-sans text-sm" disabled={isSubmitting}>
              {isSubmitting ? 'Eliminando...' : 'Sí, eliminar paca'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
