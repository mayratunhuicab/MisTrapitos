

"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Search, X, Trash2, ShoppingCart, DollarSign, Upload, Camera, Calendar as CalendarIcon, CircleUser, PlusCircle, MoreHorizontal, Eye, FilePlus2, Archive, ArchiveRestore } from 'lucide-react';
import { useFirestore, useUser, useStorage, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where, getDocs, runTransaction, doc, addDoc, collectionGroup, orderBy, Timestamp, updateDoc, writeBatch } from 'firebase/firestore';
import { ref as storageRef, uploadString, getDownloadURL } from "firebase/storage";
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Switch } from '@/components/ui/switch';

import Image from 'next/image';
import { format, addDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';

// --- Types ---
type Prenda = {
  id: string; // Document ID
  pacaId: string;
  idPersonalizado: string;
  tipoPrenda: string;
  talla: string;
  genero: string;
  precioVenta: number;
  cantidad: number; // Stock available
};

type CartItem = Prenda & {
  cantidadEnCarrito: number | '';
};

type Apartado = {
    id: string;
    clienteNombre: string;
    estado: 'VIGENTE' | 'LIQUIDADO' | 'CANCELADO';
    fechaVencimiento: Timestamp;
    totalApartado: number;
    totalPagado: number;
    archivado?: boolean;
};

type Pago = {
    id: string;
    monto: number;
    fecha: Timestamp;
    metodoPago: 'EFECTIVO' | 'TRANSFERENCIA';
    vendedorId: string;
    comprobanteUrl?: string;
};

type ApartadoItem = {
    id: string;
    prendaId: string;
    pacaId: string;
    idPersonalizado: string;
    cantidad: number;
    precioVenta: number;
    tipoPrenda: string;
};


// Helper function to convert to Title Case
const toTitleCase = (str: string) => {
    if (!str) return str;
    return str.replace(
      /\w\S*/g,
      (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
    );
};

// --- Helper Components ---
const CameraDialog = ({ onCapture }: { onCapture: (dataUrl: string) => void }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { toast } = useToast();
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
     if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const getCameraPermission = useCallback(async () => {
    stopCamera();
    setCapturedImage(null);
    setHasCameraPermission(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      setHasCameraPermission(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (error) {
      console.error('Error accessing camera:', error);
      setHasCameraPermission(false);
      toast({
        variant: 'destructive',
        title: 'Acceso a la cámara denegado',
        description: 'Por favor, habilita los permisos de la cámara en tu navegador.',
      });
    }
  }, [stopCamera, toast]);
  
  const handleCapture = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext('2d');
      if (context) {
        context.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
        const dataUrl = canvas.toDataURL('image/png');
        setCapturedImage(dataUrl);
        stopCamera();
      }
    }
  };

  const handleConfirm = () => {
    if (capturedImage) {
      onCapture(capturedImage);
    }
  };
  
  const handleRetake = () => {
     getCameraPermission();
  };

  return (
    <Dialog onOpenChange={(open) => {
      if (open) {
        getCameraPermission();
      } else {
        stopCamera();
        setCapturedImage(null);
      }
    }}>
      <DialogTrigger asChild>
        <Button variant="outline" className="bg-white/80 text-black">
          <Camera className="mr-2 h-4 w-4" /> Tomar Foto
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md font-sans" style={{ backgroundColor: 'hsla(39, 44%, 84%, 0.9)', backdropFilter: 'blur(12px)' }}>
        <DialogHeader>
          <DialogTitle>Capturar Comprobante</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {!capturedImage ? (
            <div className="relative aspect-[9/16] w-full overflow-hidden rounded-md bg-black">
              <video ref={videoRef} className="h-full w-full object-cover" autoPlay playsInline muted />
              {hasCameraPermission === false && (
                 <div className="absolute inset-0 flex items-center justify-center bg-black/80">
                    <Alert variant="destructive" className="w-auto">
                        <CircleUser className="h-4 w-4" />
                        <AlertTitle>Acceso denegado</AlertTitle>
                        <AlertDescription>
                          Revisa los permisos de la cámara.
                        </AlertDescription>
                    </Alert>
                </div>
              )}
               {hasCameraPermission === true && (
                <Button onClick={handleCapture} className="absolute bottom-4 left-1/2 -translate-x-1/2" variant="destructive">Capturar</Button>
               )}
            </div>
          ) : (
             <div className="space-y-2">
                <Image src={capturedImage} alt="Comprobante capturado" width={400} height={300} className="w-full rounded-md" />
                <div className="flex justify-center gap-2">
                    <Button onClick={handleRetake} variant="outline">Tomar de Nuevo</Button>
                    <DialogTrigger asChild>
                      <Button onClick={handleConfirm} variant="destructive">Confirmar Foto</Button>
                    </DialogTrigger>
                </div>
            </div>
          )}
           <canvas ref={canvasRef} className="hidden" />
        </div>
      </DialogContent>
    </Dialog>
  )
}


export default function ApartadosPage() {
    const firestore = useFirestore();
    const storage = useStorage();
    const { user } = useUser();
    const { toast } = useToast();

    // Dialog and Form State
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [searchId, setSearchId] = useState('');
    const [cart, setCart] = useState<CartItem[]>([]);
    const [clienteNombre, setClienteNombre] = useState('');
    const [clienteTelefono, setClienteTelefono] = useState('');
    const [fechaVencimiento, setFechaVencimiento] = useState<Date | undefined>(addDays(new Date(), 15));
    const [primerPagoMethod, setPrimerPagoMethod] = useState("EFECTIVO");
    const [primerPagoProof, setPrimerPagoProof] = useState<string | null>(null);
    const [primerPagoAmount, setPrimerPagoAmount] = useState<number | ''>('');
    const searchInputRef = useRef<HTMLInputElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Action Dialogs State
    const [selectedApartado, setSelectedApartado] = useState<Apartado | null>(null);
    const [apartadoItems, setApartadoItems] = useState<ApartadoItem[]>([]);
    const [pagos, setPagos] = useState<Pago[]>([]);
    const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
    const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
    const [isFinalPayment, setIsFinalPayment] = useState(false);
    const [paymentAmount, setPaymentAmount] = useState<number | ''>('');
    const [paymentMethod, setPaymentMethod] = useState("EFECTIVO");
    const [paymentProof, setPaymentProof] = useState<string | null>(null);
    const [isCancelAlertOpen, setIsCancelAlertOpen] = useState(false);
    const [isDeleteAlertOpen, setIsDeleteAlertOpen] = useState(false);
    const [isActionLoading, setIsActionLoading] = useState(false);
    
    // Data Fetching
    const apartadosQuery = useMemoFirebase(() => firestore ? query(collection(firestore, 'apartados'), orderBy('fechaCreacion', 'desc')) : null, [firestore]);
    const { data: apartados, isLoading: isLoadingApartados } = useCollection<Apartado>(apartadosQuery);

    // State for Archive View
    const [showArchived, setShowArchived] = useState(false);

    const visibleApartados = useMemo(() => {
        if (!apartados) return [];
        return apartados.filter(a => showArchived ? a.archivado === true : !a.archivado);
    }, [apartados, showArchived]);

    const totalApartado = cart.reduce((total, item) => total + (item.precioVenta * (Number(item.cantidadEnCarrito) || 0)), 0);
    const saldoPendienteCreacion = totalApartado - (Number(primerPagoAmount) || 0);

    // --- Functions ---
    const resetCreateForm = () => {
        setCart([]);
        setSearchId('');
        setClienteNombre('');
        setClienteTelefono('');
        setFechaVencimiento(addDays(new Date(), 15));
        setPrimerPagoMethod('EFECTIVO');
        setPrimerPagoProof(null);
        setIsProcessing(false);
        setPrimerPagoAmount('');
    };

     const resetPaymentForm = () => {
        setPaymentAmount('');
        setPaymentMethod('EFECTIVO');
        setPaymentProof(null);
        setIsPaymentDialogOpen(false);
        setIsFinalPayment(false);
        setIsActionLoading(false);
        setSelectedApartado(null);
    };

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!firestore || !searchId) return;
        const trimmedId = searchId.trim().toUpperCase();
        if (!trimmedId) return;
    
        try {
            const prendasRef = collectionGroup(firestore, 'prendas');
            const prendasQuery = query(prendasRef, where('idPersonalizado', '==', trimmedId));
            const querySnapshot = await getDocs(prendasQuery);
    
            if (!querySnapshot.empty) {
                const prendaDoc = querySnapshot.docs[0];
                const prendaData = prendaDoc.data() as Omit<Prenda, 'id'>;
                
                const prendaFound: Prenda = {
                    id: prendaDoc.id,
                    pacaId: prendaDoc.ref.parent.parent!.id,
                    ...prendaData,
                };
                
                addToCart(prendaFound);
                setSearchId('');
            } else {
                toast({ variant: "destructive", title: "Prenda no encontrada" });
            }
        } catch (error) {
            console.error("Error searching for prenda: ", error);
            toast({ variant: "destructive", title: "Error de búsqueda" });
        }
    };

    const addToCart = (prenda: Prenda) => {
        setCart(currentCart => {
            const existingItem = currentCart.find(item => item.id === prenda.id && item.pacaId === prenda.pacaId);
            if (existingItem) {
                if ((existingItem.cantidadEnCarrito || 0) < existingItem.cantidad) {
                    return currentCart.map(item =>
                        (item.id === prenda.id && item.pacaId === prenda.pacaId) ? { ...item, cantidadEnCarrito: (Number(item.cantidadEnCarrito) || 0) + 1 } : item
                    );
                } else {
                    toast({ variant: "destructive", title: "Stock insuficiente" });
                    return currentCart;
                }
            } else {
                if (prenda.cantidad > 0) {
                    return [...currentCart, { ...prenda, cantidadEnCarrito: 1 }];
                } else {
                    toast({ variant: "destructive", title: "Stock agotado" });
                    return currentCart;
                }
            }
        });
    };

    const updateCartQuantity = (prendaId: string, pacaId: string, newQuantityStr: string) => {
        const newQuantity = newQuantityStr === '' ? '' : parseInt(newQuantityStr, 10);
        setCart(currentCart => currentCart.map(item => {
            if (item.id === prendaId && item.pacaId === pacaId) {
                if (newQuantity === '' || (newQuantity > 0 && newQuantity <= item.cantidad)) {
                    return { ...item, cantidadEnCarrito: newQuantity };
                }
                if (newQuantity > item.cantidad) {
                    toast({ variant: "destructive", title: "Stock insuficiente", description: `Solo hay ${item.cantidad} unidades.` });
                    return { ...item, cantidadEnCarrito: item.cantidad };
                }
                return { ...item, cantidadEnCarrito: 1 };
            }
            return item;
        }));
    };

    const removeFromCart = (prendaId: string, pacaId: string) => {
        setCart(currentCart => currentCart.filter(item => !(item.id === prendaId && item.pacaId === pacaId)));
    };

    const handleFinalizeApartado = async () => {
        const primerPagoReal = Number(primerPagoAmount) || 0;
        const anticipoSugerido = totalApartado * 0.5;

        if (!firestore || !storage || !user || !clienteNombre || cart.length === 0 || !fechaVencimiento) {
            toast({ variant: "destructive", title: "Faltan datos", description: "Revisa el nombre del cliente, los artículos y la fecha." });
            return;
        }
        if (primerPagoAmount === '') {
            toast({ variant: "destructive", title: "Monto de anticipo requerido" });
            return;
        }
        if (primerPagoReal > totalApartado) {
            toast({ variant: "destructive", title: "Anticipo excede el total", description: `El anticipo no puede ser mayor al total de $${totalApartado.toFixed(2)}.` });
            return;
        }
        if (primerPagoMethod === 'TRANSFERENCIA' && !primerPagoProof) {
            toast({ variant: "destructive", title: "Comprobante requerido" });
            return;
        }

        setIsProcessing(true);
        const apartadoRef = doc(collection(firestore, "apartados"));

        try {
            let comprobanteUrl = null;
            if (primerPagoMethod === 'TRANSFERENCIA' && primerPagoProof) {
                const imageRef = storageRef(storage, `comprobantes_apartado/${apartadoRef.id}_${new Date().getTime()}.png`);
                const uploadResult = await uploadString(imageRef, primerPagoProof, 'data_url');
                comprobanteUrl = await getDownloadURL(uploadResult.ref);
            }
            
            await runTransaction(firestore, async (transaction) => {
                const prendaRefsAndData = cart.map(item => ({
                    ref: doc(firestore, 'pacas', item.pacaId, 'prendas', item.id),
                    item: item
                }));

                const prendaDocs = await Promise.all(prendaRefsAndData.map(pad => transaction.get(pad.ref)));

                for (let i = 0; i < prendaDocs.length; i++) {
                    const prendaDoc = prendaDocs[i];
                    const { item } = prendaRefsAndData[i];
                    if (!prendaDoc.exists() || prendaDoc.data().cantidad < (Number(item.cantidadEnCarrito) || 0)) {
                        throw new Error(`Stock insuficiente para ${item.idPersonalizado}.`);
                    }
                }
                
                // 1. Create Apartado Document
                transaction.set(apartadoRef, {
                    clienteNombre: toTitleCase(clienteNombre),
                    clienteTelefono: clienteTelefono,
                    vendedorId: user.uid,
                    fechaCreacion: new Date(),
                    fechaVencimiento: fechaVencimiento,
                    totalApartado: totalApartado,
                    totalPagado: primerPagoReal,
                    estado: primerPagoReal === totalApartado ? 'LIQUIDADO' : 'VIGENTE',
                    fechaLiquidacion: primerPagoReal === totalApartado ? new Date() : null,
                    archivado: false,
                });

                // 2. Create First Payment Document
                const pagoRef = doc(collection(apartadoRef, "pagos"));
                transaction.set(pagoRef, {
                    monto: primerPagoReal,
                    fecha: new Date(),
                    metodoPago: primerPagoMethod,
                    vendedorId: user.uid,
                    comprobanteUrl: comprobanteUrl
                });

                // 3. Update stock and create item subcollection
                for (let i = 0; i < prendaDocs.length; i++) {
                    const { ref, item } = prendaRefsAndData[i];
                    const prendaDoc = prendaDocs[i];
                    const newStock = prendaDoc.data().cantidad - (Number(item.cantidadEnCarrito) || 0);
                    transaction.update(ref, { cantidad: newStock });

                    const apartadoItemRef = doc(collection(apartadoRef, "items"));
                    transaction.set(apartadoItemRef, {
                        prendaId: item.id,
                        pacaId: item.pacaId,
                        idPersonalizado: item.idPersonalizado,
                        cantidad: Number(item.cantidadEnCarrito) || 0,
                        precioVenta: item.precioVenta,
                        tipoPrenda: item.tipoPrenda,
                    });
                }
            });

            toast({ variant: "success", title: "Apartado Creado", description: "El stock ha sido actualizado." });
            setIsCreateDialogOpen(false);
            resetCreateForm();
        } catch (error) {
            console.error("Error creating apartado:", error);
            const errorMessage = error instanceof Error ? error.message : "No se pudo completar la operación.";
            toast({ variant: "destructive", title: "Error en la transacción", description: errorMessage });
        } finally {
            setIsProcessing(false);
        }
    };

    const handleOpenPaymentDialog = (apartado: Apartado, isFinal: boolean) => {
        setSelectedApartado(apartado);
        setIsFinalPayment(isFinal);
        if (isFinal) {
            const saldo = (apartado.totalApartado || 0) - (apartado.totalPagado || 0);
            setPaymentAmount(saldo > 0 ? saldo : 0);
        } else {
            setPaymentAmount('');
        }
        setIsPaymentDialogOpen(true);
    };

    const handleConfirmPayment = async () => {
        if (!firestore || !storage || !user || !selectedApartado) return;

        const monto = Number(paymentAmount);
        if (monto <= 0) {
            toast({ variant: 'destructive', title: 'Monto inválido' });
            return;
        }

        const saldoPendiente = (selectedApartado.totalApartado || 0) - (selectedApartado.totalPagado || 0);
        if (monto > saldoPendiente) {
            toast({ variant: 'destructive', title: 'Monto excede el saldo', description: `El pago no puede ser mayor al saldo de $${saldoPendiente.toFixed(2)}` });
            return;
        }
    
        if (paymentMethod === 'TRANSFERENCIA' && !paymentProof) {
            toast({ variant: "destructive", title: "Comprobante requerido" });
            return;
        }
        
        setIsActionLoading(true);
        const apartadoRef = doc(firestore, 'apartados', selectedApartado.id);
    
        try {
             let comprobanteUrl = null;
            if (paymentMethod === 'TRANSFERENCIA' && paymentProof) {
                const imageRef = storageRef(storage, `comprobantes_apartado/${apartadoRef.id}_${new Date().getTime()}.png`);
                const uploadResult = await uploadString(imageRef, paymentProof, 'data_url');
                comprobanteUrl = await getDownloadURL(uploadResult.ref);
            }
            
            await runTransaction(firestore, async (transaction) => {
                const apartadoDoc = await transaction.get(apartadoRef);
                if (!apartadoDoc.exists()) throw new Error("Apartado no encontrado");
                
                const currentTotalPagado = apartadoDoc.data().totalPagado || 0;
                const newTotalPagado = currentTotalPagado + monto;
                const isLiquidado = newTotalPagado >= apartadoDoc.data().totalApartado;

                // 1. Create new payment document
                const pagoRef = doc(collection(apartadoRef, "pagos"));
                transaction.set(pagoRef, {
                    monto: monto,
                    fecha: new Date(),
                    metodoPago: paymentMethod,
                    vendedorId: user.uid,
                    comprobanteUrl: comprobanteUrl
                });

                // 2. Update apartado document
                const updateData: any = {
                    totalPagado: newTotalPagado,
                };
                if (isLiquidado) {
                    updateData.estado = 'LIQUIDADO';
                    updateData.fechaLiquidacion = new Date();
                }
                transaction.update(apartadoRef, updateData);
            });
    
            toast({ variant: "success", title: "Pago Registrado" });
            resetPaymentForm();

        } catch (error) {
            console.error("Error adding payment:", error);
            const errorMessage = error instanceof Error ? error.message : "No se pudo registrar el pago.";
            toast({ variant: "destructive", title: "Error", description: errorMessage });
        } finally {
            setIsActionLoading(false);
        }
    };
    
    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>, setter: (value: string | null) => void) => {
        const file = event.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => { setter(reader.result as string); };
            reader.readAsDataURL(file);
        }
    };

    const getStatusVariant = (status: string): "secondary" | "destructive" | "default" => {
        switch (status) {
            case 'VIGENTE': return 'secondary';
            case 'LIQUIDADO': return 'default';
            case 'CANCELADO': return 'destructive';
            default: return 'outline';
        }
    };

    const handleViewDetails = async (apartado: Apartado) => {
        if (!firestore) return;
        setSelectedApartado(apartado);
        setApartadoItems([]); // Clear previous items
        setPagos([]);
        setIsDetailDialogOpen(true);
    
        try {
          const itemsRef = collection(firestore, 'apartados', apartado.id, 'items');
          const itemsSnapshot = await getDocs(itemsRef);
          const items = itemsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ApartadoItem));
          setApartadoItems(items);

          const pagosRef = collection(firestore, 'apartados', apartado.id, 'pagos');
          const pagosQuery = query(pagosRef, orderBy('fecha', 'asc'));
          const pagosSnapshot = await getDocs(pagosQuery);
          const pagosData = pagosSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Pago));
          setPagos(pagosData);

        } catch (error) {
            console.error("Error fetching apartado details:", error);
            toast({ variant: "destructive", title: "Error", description: "No se pudieron cargar los detalles." });
            setIsDetailDialogOpen(false);
        }
    };

    const handleCancelApartado = async () => {
        if (!firestore || !selectedApartado) return;
        setIsActionLoading(true);
    
        const apartadoRef = doc(firestore, 'apartados', selectedApartado.id);
        const itemsRef = collection(apartadoRef, 'items');
    
        // --- READ PHASE (outside transaction) ---
        const itemsSnapshot = await getDocs(query(itemsRef));
        const prendasToRestore = itemsSnapshot.docs.map(itemDoc => ({
            itemData: itemDoc.data() as ApartadoItem,
            prendaRef: doc(firestore, 'pacas', itemDoc.data().pacaId, 'prendas', itemDoc.data().prendaId)
        }));

        try {
            // --- ATOMIC WRITE PHASE (inside transaction) ---
            await runTransaction(firestore, async (transaction) => {
                if (prendasToRestore.length === 0) {
                    transaction.update(apartadoRef, { estado: 'CANCELADO' });
                    return;
                }
    
                const prendaDocs = await Promise.all(prendasToRestore.map(p => transaction.get(p.prendaRef)));
    
                prendaDocs.forEach((prendaDoc, index) => {
                    const { itemData } = prendasToRestore[index];
                    if (prendaDoc.exists()) {
                        const currentStock = prendaDoc.data().cantidad || 0;
                        const newStock = currentStock + itemData.cantidad;
                        transaction.update(prendaDoc.ref, { cantidad: newStock });
                    } else {
                        console.warn(`La prenda ${itemData.idPersonalizado} no fue encontrada para restaurar stock.`);
                    }
                });
    
                transaction.update(apartadoRef, { estado: 'CANCELADO' });
            });
            toast({ variant: 'success', title: 'Apartado Cancelado', description: 'El stock ha sido restaurado.' });
            setIsCancelAlertOpen(false);
            setSelectedApartado(null);
        } catch (error) {
            console.error("Error cancelling apartado:", error);
            const errorMessage = error instanceof Error ? error.message : "No se pudo completar la cancelación.";
            toast({ variant: "destructive", title: "Error en la transacción", description: errorMessage });
        } finally {
            setIsActionLoading(false);
        }
    };

    const handleDeleteApartado = async () => {
        if (!firestore || !selectedApartado) return;
        
        // Final safety check in case the UI condition fails
        if (selectedApartado.totalPagado > 0) {
            toast({ variant: "destructive", title: "Acción no permitida", description: "No se puede eliminar un apartado con pagos." });
            return;
        }

        setIsActionLoading(true);
        const apartadoRef = doc(firestore, 'apartados', selectedApartado.id);
        const itemsRef = collection(apartadoRef, 'items');

        try {
            // This transaction restores the stock of the items.
            await runTransaction(firestore, async (transaction) => {
                const itemsSnapshot = await getDocs(query(itemsRef));
                if (itemsSnapshot.empty) {
                    return; // No stock to restore, can proceed to delete.
                }
    
                const prendasToRestore = itemsSnapshot.docs.map(itemDoc => ({
                    itemData: itemDoc.data() as ApartadoItem,
                    prendaRef: doc(firestore, 'pacas', itemDoc.data().pacaId, 'prendas', itemDoc.data().prendaId)
                }));
    
                const prendaDocs = await Promise.all(prendasToRestore.map(p => transaction.get(p.prendaRef)));
    
                prendaDocs.forEach((prendaDoc, index) => {
                    const { itemData } = prendasToRestore[index];
                    if (prendaDoc.exists()) {
                        const currentStock = prendaDoc.data().cantidad || 0;
                        const newStock = currentStock + itemData.cantidad;
                        transaction.update(prendaDoc.ref, { cantidad: newStock });
                    }
                });
            });

            // After stock is restored, delete the subcollections and the main document.
            // A batched write is safe for this.
            const batch = writeBatch(firestore);

            const itemsSnapshot = await getDocs(itemsRef);
            itemsSnapshot.docs.forEach(doc => batch.delete(doc.ref));

            const pagosRef = collection(apartadoRef, 'pagos');
            const pagosSnapshot = await getDocs(pagosRef);
            pagosSnapshot.docs.forEach(doc => batch.delete(doc.ref));

            batch.delete(apartadoRef);

            await batch.commit();
            
            toast({ variant: 'success', title: 'Apartado Eliminado', description: 'El apartado se ha borrado y el stock fue restaurado.' });
            
        } catch (error) {
            console.error("Error deleting apartado:", error);
            const errorMessage = error instanceof Error ? error.message : "No se pudo completar la eliminación.";
            toast({ variant: "destructive", title: "Error en la transacción", description: errorMessage });
        } finally {
            setIsActionLoading(false);
            setIsDeleteAlertOpen(false);
            setSelectedApartado(null);
        }
    };
    
    const handleArchive = async (apartado: Apartado, archive: boolean) => {
        if (!firestore) return;
        setIsActionLoading(true);
        const apartadoRef = doc(firestore, 'apartados', apartado.id);
        try {
            await updateDoc(apartadoRef, { archivado: archive });
            toast({ variant: 'success', title: `Apartado ${archive ? 'Archivado' : 'Restaurado'}` });
        } catch (error) {
            console.error("Error updating apartado:", error);
            toast({ variant: 'destructive', title: 'Error', description: `No se pudo ${archive ? 'archivar' : 'restaurar'} el apartado.` });
        } finally {
            setIsActionLoading(false);
            setSelectedApartado(null); // Deselect after action
        }
    };


    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row items-start justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-title text-white [text-shadow:_-2px_-2px_0_rgba(0,0,0,0.8),_2px_-2px_0_rgba(0,0,0,0.8),_-2px_2px_0_rgba(0,0,0,0.8),_2px_2px_0_rgba(0,0,0,0.8)]">
                        Sistema de Apartados
                    </h1>
                    <p className="text-xl text-white font-handwritten font-bold [text-shadow:_-1px_-1px_0_rgba(0,0,0,0.9),_1px_-1px_0_rgba(0,0,0,0.9),_-1px_1px_0_rgba(0,0,0,0.9),_1px_1px_0_rgba(0,0,0,0.9)]">
                        Crea y gestiona los apartados de tus clientes.
                    </p>
                </div>
                <Dialog open={isCreateDialogOpen} onOpenChange={(open) => { setIsCreateDialogOpen(open); if (!open) resetCreateForm(); }}>
                    <DialogTrigger asChild>
                        <Button variant="destructive" className="font-sans text-sm text-black">
                            <PlusCircle className="mr-2 h-4 w-4" /> Crear Apartado
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-3xl font-sans" style={{ backgroundColor: 'hsla(39, 44%, 84%, 0.9)', backdropFilter: 'blur(12px)' }}>
                        <DialogHeader>
                            <DialogTitle>Nuevo Apartado</DialogTitle>
                            <DialogDescription>Completa la información para crear un nuevo apartado.</DialogDescription>
                        </DialogHeader>
                        <ScrollArea className="max-h-[65vh] -mx-6 px-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
                                {/* Columna Izquierda: Búsqueda y Carrito */}
                                <div className="space-y-4">
                                    <form onSubmit={handleSearch} className="flex gap-2">
                                        <Input ref={searchInputRef} placeholder="" value={searchId} onChange={(e) => setSearchId(e.target.value)} className="bg-white/80" />
                                        <Button type="submit" size="icon" variant="destructive" className="text-black"><Search className="h-4 w-4" /></Button>
                                    </form>
                                    <Card>
                                        <CardHeader><CardTitle className="text-lg">Canasta de Apartado</CardTitle></CardHeader>
                                        <CardContent>
                                            <ScrollArea className="h-48">
                                                <Table>
                                                    <TableHeader><TableRow><TableHead>Prenda</TableHead><TableHead>Cant</TableHead><TableHead>Subtotal</TableHead><TableHead></TableHead></TableRow></TableHeader>
                                                    <TableBody>
                                                        {cart.length > 0 ? cart.map(item => (
                                                            <TableRow key={`${item.pacaId}-${item.id}`}>
                                                                <TableCell className="text-xs">{item.idPersonalizado}<br/>{item.tipoPrenda}</TableCell>
                                                                <TableCell><Input type="number" value={item.cantidadEnCarrito} onChange={(e) => updateCartQuantity(item.id, item.pacaId, e.target.value)} className="w-14 h-8 text-center" min="1" max={item.cantidad}/></TableCell>
                                                                <TableCell className="font-bold text-right">${(item.precioVenta * (Number(item.cantidadEnCarrito) || 0)).toFixed(2)}</TableCell>
                                                                <TableCell><Button variant="ghost" size="icon" onClick={() => removeFromCart(item.id, item.pacaId)}><Trash2 className="h-4 w-4 text-red-600" /></Button></TableCell>
                                                            </TableRow>
                                                        )) : <TableRow><TableCell colSpan={4} className="h-24 text-center">La canasta está vacía</TableCell></TableRow>}
                                                    </TableBody>
                                                </Table>
                                            </ScrollArea>
                                        </CardContent>
                                    </Card>
                                </div>
                                {/* Columna Derecha: Cliente y Detalles del Apartado */}
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="cliente-nombre">Nombre del Cliente</Label>
                                        <Input
                                            id="cliente-nombre"
                                            placeholder=""
                                            value={clienteNombre}
                                            onChange={(e) => setClienteNombre(e.target.value)}
                                            disabled={isProcessing}
                                            className="bg-white/80"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="cliente-telefono">Teléfono del Cliente</Label>
                                        <Input
                                            id="cliente-telefono"
                                            type="tel"
                                            placeholder=""
                                            value={clienteTelefono}
                                            onChange={(e) => setClienteTelefono(e.target.value)}
                                            disabled={isProcessing}
                                            className="bg-white/80"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="fecha-vencimiento">Fecha de Vencimiento</Label>
                                        <Popover>
                                            <PopoverTrigger asChild>
                                                <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !fechaVencimiento && "text-muted-foreground")}><CalendarIcon className="mr-2 h-4 w-4" />{fechaVencimiento ? format(fechaVencimiento, "PPP", { locale: es }) : <span>Elige una fecha</span>}</Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-auto p-0 font-sans"><Calendar mode="single" selected={fechaVencimiento} onSelect={setFechaVencimiento} initialFocus locale={es} disabled={(date) => date < new Date()} /></PopoverContent>
                                        </Popover>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="primer-pago-amount">Monto del Primer Pago</Label>
                                        <div className='text-xs text-muted-foreground'>Anticipo sugerido (50%): ${(totalApartado * 0.5).toFixed(2)}</div>
                                        <Input
                                            id="anticipo-pagado"
                                            type="number"
                                            min="0"
                                            placeholder=""
                                            value={primerPagoAmount}
                                            onChange={(e) => setPrimerPagoAmount(e.target.value === '' ? '' : Number(e.target.value))}
                                            disabled={isProcessing}
                                            className="bg-white/80"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="primer-pago-method">Método de Pago del Anticipo</Label>
                                        <Select value={primerPagoMethod} onValueChange={setPrimerPagoMethod} disabled={isProcessing}>
                                            <SelectTrigger id="primer-pago-method" className="font-sans bg-white/80"><SelectValue placeholder="Selecciona método" /></SelectTrigger>
                                            <SelectContent className="font-sans"><SelectItem value="EFECTIVO">Efectivo</SelectItem><SelectItem value="TRANSFERENCIA">Transferencia</SelectItem></SelectContent>
                                        </Select>
                                    </div>
                                    {primerPagoMethod === 'TRANSFERENCIA' && (
                                        <div className="flex flex-col gap-2 items-start">
                                            <div className="flex gap-2">
                                                <Button variant="outline" className="bg-white/80 text-black" onClick={() => fileInputRef.current?.click()}><Upload className="mr-2 h-4 w-4" /> Subir Comprobante</Button>
                                                <CameraDialog onCapture={setPrimerPagoProof} />
                                                <input type="file" ref={fileInputRef} onChange={(e) => handleFileChange(e, setPrimerPagoProof)} accept="image/*" className="hidden" />
                                            </div>
                                            {primerPagoProof && (
                                                <div className="relative w-24 h-24 mt-2 border-2 border-dashed border-green-500 rounded-md p-1">
                                                    <Image src={primerPagoProof} alt="Comprobante de pago" layout="fill" objectFit="cover" className="rounded"/>
                                                    <Button variant="ghost" size="icon" className="absolute -top-3 -right-3 h-6 w-6 bg-red-500 hover:bg-red-600 text-white rounded-full" onClick={() => setPrimerPagoProof(null)}><X className="h-4 w-4"/></Button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </ScrollArea>
                        <DialogFooter className="border-t pt-4 flex-col sm:flex-row sm:justify-between items-center">
                             <div className="text-right">
                                <p className="text-sm">Total del Apartado: <span className="font-bold text-lg">${totalApartado.toFixed(2)}</span></p>
                                <p className="text-sm">Saldo Pendiente: <span className="font-bold text-lg">${saldoPendienteCreacion.toFixed(2)}</span></p>
                            </div>
                            <Button 
                                onClick={handleFinalizeApartado} 
                                variant="destructive" 
                                className="text-black" 
                                disabled={isProcessing || !clienteNombre || cart.length === 0 || primerPagoAmount === '' || (Number(primerPagoAmount)) > totalApartado}
                            >
                                {isProcessing ? "Procesando..." : "Finalizar Apartado"}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            <Card style={{ backgroundColor: 'hsla(39, 44%, 84%, 0.8)', backdropFilter: 'blur(8px)' }}>
                <CardHeader>
                    <div className="flex justify-between items-center">
                        <div>
                            <CardTitle className="font-sans text-2xl text-black">Lista de Apartados</CardTitle>
                            <CardDescription className="font-sans font-semibold text-md text-black">
                                {showArchived ? 'Aquí puedes ver los apartados archivados.' : 'Aquí puedes ver todos los apartados activos.'}
                            </CardDescription>
                        </div>
                        <div className="flex items-center space-x-2">
                            <Label htmlFor="show-archived" className="text-black font-sans">Mostrar Archivados</Label>
                            <Switch
                                id="show-archived"
                                checked={showArchived}
                                onCheckedChange={setShowArchived}
                                aria-label="Mostrar apartados archivados"
                            />
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Cliente</TableHead>
                                <TableHead>Estado</TableHead>
                                <TableHead>Total</TableHead>
                                <TableHead>Saldo Pendiente</TableHead>
                                <TableHead>Fecha de Vencimiento</TableHead>
                                <TableHead className="text-right">Acciones</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoadingApartados ? (
                                <TableRow><TableCell colSpan={6} className="h-24 text-center">Cargando apartados...</TableCell></TableRow>
                            ) : visibleApartados && visibleApartados.length > 0 ? (
                                visibleApartados.map(apartado => {
                                    const saldoPendiente = (apartado.totalApartado || 0) - (apartado.totalPagado || 0);
                                    return (
                                        <TableRow key={apartado.id}>
                                            <TableCell className="font-medium">{apartado.clienteNombre}</TableCell>
                                            <TableCell><Badge variant={getStatusVariant(apartado.estado)}>{apartado.estado}</Badge></TableCell>
                                            <TableCell>${(apartado.totalApartado || 0).toFixed(2)}</TableCell>
                                            <TableCell className="font-bold">${saldoPendiente > 0.009 ? saldoPendiente.toFixed(2) : '0.00'}</TableCell>
                                            <TableCell>{format(apartado.fechaVencimiento.toDate(), "dd/MM/yyyy")}</TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex justify-end items-center gap-2">
                                                    {apartado.estado === 'VIGENTE' && !showArchived && (
                                                        <Button 
                                                            size="sm" 
                                                            variant="destructive"
                                                            className="font-sans text-xs text-black"
                                                            onClick={() => handleOpenPaymentDialog(apartado, false)}
                                                        >
                                                            Abonar
                                                        </Button>
                                                    )}
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button variant="ghost" className="h-8 w-8 p-0"><MoreHorizontal className="h-4 w-4" /></Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end" className="font-sans bg-white border-2 border-black" style={{ backgroundColor: 'hsla(39, 44%, 84%, 0.9)', backdropFilter: 'blur(8px)' }}>
                                                            <DropdownMenuLabel>Acciones</DropdownMenuLabel>

                                                            <DropdownMenuItem onClick={() => handleViewDetails(apartado)}>
                                                                <Eye className="mr-2 h-4 w-4" /> Ver Detalles
                                                            </DropdownMenuItem>
                                                            
                                                            {apartado.estado === 'VIGENTE' && (
                                                                <DropdownMenuItem onClick={() => handleOpenPaymentDialog(apartado, true)}>
                                                                    <DollarSign className="mr-2 h-4 w-4" /> Liquidar Saldo
                                                                </DropdownMenuItem>
                                                            )}

                                                            {apartado.archivado && (
                                                                <DropdownMenuItem onClick={() => handleArchive(apartado, false)}>
                                                                    <ArchiveRestore className="mr-2 h-4 w-4" /> Restaurar
                                                                </DropdownMenuItem>
                                                            )}
                                                            
                                                            <DropdownMenuSeparator className="bg-black/50" />

                                                            {(apartado.estado === 'LIQUIDADO' || apartado.estado === 'CANCELADO') && !apartado.archivado && (
                                                                <DropdownMenuItem onClick={() => handleArchive(apartado, true)}>
                                                                    <Archive className="mr-2 h-4 w-4" /> Archivar
                                                                </DropdownMenuItem>
                                                            )}

                                                            {apartado.estado === 'VIGENTE' && (
                                                                <DropdownMenuItem 
                                                                    onClick={() => { setSelectedApartado(apartado); setIsCancelAlertOpen(true); }} 
                                                                    className="text-red-600 focus:text-red-600"
                                                                >
                                                                    <Trash2 className="mr-2 h-4 w-4" /> Cancelar Apartado
                                                                </DropdownMenuItem>
                                                            )}

                                                             {apartado.totalPagado === 0 && (
                                                                <DropdownMenuItem 
                                                                    onClick={() => { setSelectedApartado(apartado); setIsDeleteAlertOpen(true); }}
                                                                    className="text-red-600 focus:text-red-600"
                                                                >
                                                                    <Trash2 className="mr-2 h-4 w-4" /> Eliminar
                                                                </DropdownMenuItem>
                                                            )}
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    )
                                })
                            ) : (
                                <TableRow><TableCell colSpan={6} className="h-24 text-center">No hay apartados {showArchived ? 'archivados' : 'registrados'}.</TableCell></TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* --- Action Dialogs --- */}
            <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
                <DialogContent className="sm:max-w-lg font-sans" style={{ backgroundColor: 'hsla(39, 44%, 84%, 0.9)', backdropFilter: 'blur(12px)' }}>
                    <DialogHeader>
                        <DialogTitle>Detalles del Apartado</DialogTitle>
                        <DialogDescription>ID: {selectedApartado?.id.substring(0, 8).toUpperCase()}</DialogDescription>
                    </DialogHeader>
                    <ScrollArea className="max-h-[60vh] -mx-6 px-6">
                        <div className="py-4 space-y-4">
                           <div>
                                <h4 className="font-semibold mb-2">Artículos del Apartado</h4>
                                {apartadoItems.length > 0 ? (
                                    apartadoItems.map(item => (
                                        <div key={item.id} className="flex justify-between items-center text-sm p-2 rounded-md hover:bg-black/5">
                                            <div className="font-semibold">
                                                <p>{item.tipoPrenda} ({item.idPersonalizado})</p>
                                            </div>
                                            <div className="text-right">
                                                <p>Cant: {item.cantidad}</p>
                                                <p className="font-bold">${(item.precioVenta * item.cantidad).toFixed(2)}</p>
                                            </div>
                                        </div>
                                    ))
                                ) : <p className="text-center text-sm">Cargando artículos...</p>}
                           </div>
                           <div className="border-t pt-4">
                               <h4 className="font-semibold mb-2">Historial de Pagos</h4>
                                {pagos.length > 0 ? (
                                    pagos.map(pago => (
                                        <div key={pago.id} className="flex justify-between items-center text-sm p-2 rounded-md hover:bg-black/5">
                                            <div>
                                                <p className="font-semibold">{format(pago.fecha.toDate(), "dd/MM/yyyy HH:mm")}</p>
                                                <p className="text-xs text-black/60">{pago.metodoPago}</p>
                                            </div>
                                            <div className="font-bold">
                                                ${pago.monto.toFixed(2)}
                                            </div>
                                        </div>
                                    ))
                                ) : <p className="text-center text-sm">No hay pagos registrados.</p>}
                           </div>
                        </div>
                    </ScrollArea>
                    <DialogFooter className="border-t pt-4 grid grid-cols-2 gap-2">
                        <div className="font-bold text-lg text-left">
                            <p>Total Pagado:</p>
                            <p>${(selectedApartado?.totalPagado || 0).toFixed(2)}</p>
                        </div>
                        <div className="font-bold text-lg text-right">
                            <p>Saldo Pendiente:</p>
                            <p>${((selectedApartado?.totalApartado || 0) - (selectedApartado?.totalPagado || 0)).toFixed(2)}</p>
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isPaymentDialogOpen} onOpenChange={(open) => { if (!open) resetPaymentForm() }}>
                 <DialogContent className="sm:max-w-md font-sans" style={{ backgroundColor: 'hsla(39, 44%, 84%, 0.9)', backdropFilter: 'blur(12px)' }}>
                    <DialogHeader>
                        <DialogTitle>{isFinalPayment ? 'Liquidar Apartado' : 'Realizar Abono'}</DialogTitle>
                        <DialogDescription>Registra un nuevo pago para este apartado.</DialogDescription>
                    </DialogHeader>
                    <div className="py-4 space-y-4">
                         <div className="text-center text-lg">
                            <p>Saldo Pendiente Actual:</p>
                            <p className="font-bold text-3xl">${selectedApartado ? ((selectedApartado.totalApartado || 0) - (selectedApartado.totalPagado || 0)).toFixed(2) : '0.00'}</p>
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="payment-amount">Monto del Pago</Label>
                            <Input
                                id="payment-amount"
                                type="number"
                                min="0"
                                placeholder="Monto a abonar"
                                value={paymentAmount}
                                onChange={e => setPaymentAmount(e.target.value === '' ? '' : Number(e.target.value))}
                                disabled={isActionLoading || isFinalPayment}
                                className="bg-white/80"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="payment-method">Método de Pago</Label>
                            <Select value={paymentMethod} onValueChange={(val: 'EFECTIVO' | 'TRANSFERENCIA') => setPaymentMethod(val)}>
                                <SelectTrigger id="payment-method"><SelectValue /></SelectTrigger>
                                <SelectContent><SelectItem value="EFECTIVO">Efectivo</SelectItem><SelectItem value="TRANSFERENCIA">Transferencia</SelectItem></SelectContent>
                            </Select>
                        </div>
                        {paymentMethod === 'TRANSFERENCIA' && (
                             <div className="flex flex-col gap-2 items-start">
                                <Label>Comprobante de Pago</Label>
                                <div className="flex gap-2">
                                    <Button variant="outline" className="bg-white/80 text-black" onClick={() => fileInputRef.current?.click()}><Upload className="mr-2 h-4 w-4" /> Subir</Button>
                                    <CameraDialog onCapture={setPaymentProof} />
                                    <input type="file" ref={fileInputRef} onChange={(e) => handleFileChange(e, setPaymentProof)} accept="image/*" className="hidden" />
                                </div>
                                {paymentProof && (
                                    <div className="relative w-24 h-24 mt-2 border-2 border-dashed border-green-500 rounded-md p-1">
                                        <Image src={paymentProof} alt="Comprobante de pago final" layout="fill" objectFit="cover" className="rounded"/>
                                        <Button variant="ghost" size="icon" className="absolute -top-3 -right-3 h-6 w-6 bg-red-500 hover:bg-red-600 text-white rounded-full" onClick={() => setPaymentProof(null)}><X className="h-4 w-4"/></Button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                     <DialogFooter>
                        <Button variant="outline" onClick={() => setIsPaymentDialogOpen(false)} disabled={isActionLoading}>Cancelar</Button>
                        <Button onClick={handleConfirmPayment} variant="destructive" className="text-black" disabled={isActionLoading}>
                            {isActionLoading ? 'Procesando...' : 'Confirmar Pago'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

             <AlertDialog open={isCancelAlertOpen} onOpenChange={setIsCancelAlertOpen}>
                <AlertDialogContent className="font-sans" style={{ backgroundColor: 'hsla(39, 44%, 84%, 0.9)', backdropFilter: 'blur(12px)' }}>
                    <AlertDialogHeader>
                        <AlertDialogTitle>¿Confirmar cancelación?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Esta acción cambiará el estado del apartado a "CANCELADO" y devolverá las prendas al inventario. Los pagos realizados no se reembolsarán. Esta acción no se puede deshacer.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isActionLoading}>No, volver</AlertDialogCancel>
                        <AlertDialogAction onClick={handleCancelApartado} disabled={isActionLoading} variant="destructive">
                            {isActionLoading ? "Cancelando..." : "Sí, cancelar apartado"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            <AlertDialog open={isDeleteAlertOpen} onOpenChange={setIsDeleteAlertOpen}>
                <AlertDialogContent className="font-sans" style={{ backgroundColor: 'hsla(39, 44%, 84%, 0.9)', backdropFilter: 'blur(12px)' }}>
                    <AlertDialogHeader>
                        <AlertDialogTitle>¿Confirmar eliminación?</AlertDialogTitle>
                        <AlertDialogDescription>
                           Esta acción no se puede deshacer. Se eliminará permanentemente el apartado y se restaurará el stock de las prendas al inventario. ¿Estás seguro?
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isActionLoading}>No, volver</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteApartado} disabled={isActionLoading} variant="destructive">
                            {isActionLoading ? "Eliminando..." : "Sí, eliminar"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
