
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
import { Search, X, Trash2, ShoppingCart, DollarSign, Receipt, Upload, Camera, Calendar as CalendarIcon, CircleUser, Pencil } from 'lucide-react';
import { useFirestore, useUser, useStorage } from '@/firebase';
import { collection, query, where, getDocs, runTransaction, doc, writeBatch, serverTimestamp, addDoc, getDoc, DocumentReference, collectionGroup } from 'firebase/firestore';
import { ref as storageRef, uploadString, getDownloadURL } from "firebase/storage";
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
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
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import Image from 'next/image';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { redondearCentavos } from '@/lib/pagos';
import { computeCartPricing, type PromoEspecial } from '@/lib/ofertas';

type Prenda = {
  id: string; // Document ID
  pacaId: string;
  idPersonalizado: string;
  tipoPrenda: string;
  talla: string;
  genero: string;
  precioVenta: number;
  cantidad: number; // Stock available
  // Offer fields
  precioIndividual?: number;
  ofertaCantidad?: number;
  ofertaPrecio?: number;
  // Si la prenda pertenece a un Grupo de Oferta (configurado en /dashboard/ofertas),
  // su oferta puede combinarse con la de OTRAS pacas que compartan el mismo grupo.
  grupoOfertaId?: string;
  // Promociones especiales (combos) en las que participa esta prenda, por id.
  promosEspeciales?: Record<string, PromoEspecial>;
};


// Minúsculas y sin acentos, para que "sueter" encuentre "Suéter".
function normalizeText(text: string): string {
  return (text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

type CartItem = Prenda & {
  cartId: string; // Unique identifier for each line item in the cart
  cantidadEnCarrito: number | '';
  precioAnulado?: number;
};

// `crypto.randomUUID()` solo existe en un "contexto seguro" (https, o http://localhost).
// Si la app se abre desde otro dispositivo por la IP de la red local (http:// sin ser
// localhost), el navegador no expone esa función y truena. El cartId es solo un
// identificador interno del carrito en memoria (no se guarda en Firestore), así que no
// necesita ser criptográficamente aleatorio: si crypto.randomUUID no está disponible,
// se genera un identificador igual de único con un método sin esa restricción.
function generateCartId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `cart-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}


const CameraDialog = ({ onCapture, setPaymentProof }: { onCapture: (dataUrl: string) => void, setPaymentProof: (proof: string | null) => void }) => {
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

const calculateItemSubtotal = (item: CartItem): number => {
    const cantidad = Number(item.cantidadEnCarrito) || 0;
    if (cantidad === 0) return 0;

    if (item.precioAnulado !== undefined && item.precioAnulado !== null) {
        return cantidad * item.precioAnulado;
    }

    // Always use the single-item price for line-item subtotal display.
    // The bundle discount is calculated globally.
    const singlePrice = item.precioIndividual || item.precioVenta;
    return cantidad * singlePrice;
};

const PriceDisplay = ({ item }: { item: CartItem }) => {
    if (item.precioAnulado !== undefined && item.precioAnulado !== null) {
        return (
            <div className="text-xs text-right">
                <p className="font-bold text-blue-600">${item.precioAnulado.toFixed(2)}</p>
                <p className="line-through text-muted-foreground">${(item.precioIndividual ?? item.precioVenta).toFixed(2)}</p>
            </div>
        );
    }
    
    const hasOffer = item.ofertaCantidad && item.ofertaPrecio && item.ofertaCantidad > 0;
    const singlePrice = item.precioIndividual || item.precioVenta;

    if (hasOffer) {
        return (
            <div className="text-xs text-right">
                <p className="font-bold">${singlePrice.toFixed(2)} c/u</p>
                <p className="text-red-600 font-semibold">{item.ofertaCantidad} x ${item.ofertaPrecio?.toFixed(2)}</p>
            </div>
        );
    }
    return <p className="font-bold">${item.precioVenta.toFixed(2)}</p>;
};


export default function SalesPage() {
  const firestore = useFirestore();
  const storage = useStorage();
  const { user } = useUser();
  const { toast } = useToast();
  const [searchId, setSearchId] = useState('');
  // Búsqueda por nombre: se cargan todas las prendas una sola vez (al primer
  // búsqueda que no coincide con un ID) y luego se filtran en el navegador,
  // porque Firestore no permite buscar "contiene el texto".
  const [allPrendas, setAllPrendas] = useState<(Prenda & { path: string })[] | null>(null);
  const [nameResults, setNameResults] = useState<(Prenda & { path: string })[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [metodoPago, setMetodoPago] = useState("EFECTIVO");
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentProof, setPaymentProof] = useState<string | null>(null); // To store image data URL
  const searchInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [saleDate, setSaleDate] = useState<Date | undefined>(undefined);
  const [montoPagado, setMontoPagado] = useState<number | ''>('');
  // Pago MIXTO: cuánto paga por transferencia; el resto es efectivo.
  const [montoTransferenciaMixto, setMontoTransferenciaMixto] = useState<number | ''>('');

  // State for price override dialog
  const [isPriceOverrideDialogOpen, setIsPriceOverrideDialogOpen] = useState(false);
  const [itemToEdit, setItemToEdit] = useState<CartItem | null>(null);
  const [newPrice, setNewPrice] = useState<number | ''>('');
  const [overrideQuantity, setOverrideQuantity] = useState<number | ''>(1);


  // Set the date on the client to avoid hydration errors
  useEffect(() => {
    if(!saleDate){
      setSaleDate(new Date());
    }
  }, [saleDate]);


  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firestore || !searchId) return;
    
    const trimmedId = searchId.trim().toUpperCase();
    if (!trimmedId) return;

    setIsSearching(true);
    try {
      const prendasRef = collectionGroup(firestore, 'prendas');
      const prendasQuery = query(prendasRef, where('idPersonalizado', '==', trimmedId));

      const querySnapshot = await getDocs(prendasQuery);


      if (!querySnapshot.empty) {
        const prendaDoc = querySnapshot.docs[0];
        const prendaData = prendaDoc.data() as Omit<Prenda, 'id'>;

        const prendaFound: Prenda = {
          id: prendaDoc.id,
          ...prendaData,
          pacaId: prendaDoc.ref.parent.parent!.id,
        };

        addToCart(prendaFound);
        setSearchId('');
        setNameResults(null);
        return;
      }

      // No hay un ID exacto: buscar por nombre (tipo de prenda, género, talla o parte del ID).
      let prendas = allPrendas;
      if (!prendas) {
        const allSnapshot = await getDocs(prendasRef);
        prendas = allSnapshot.docs.map(d => ({
          id: d.id,
          ...(d.data() as Omit<Prenda, 'id' | 'pacaId'>),
          pacaId: d.ref.parent.parent!.id,
          path: d.ref.path,
        }));
        setAllPrendas(prendas);
      }

      const words = normalizeText(searchId).split(/\s+/).filter(Boolean);
      const matches = prendas
        .filter(p => p.cantidad > 0)
        .filter(p => {
          const haystack = normalizeText(`${p.tipoPrenda} ${p.genero} talla ${p.talla} ${p.idPersonalizado}`);
          return words.every(w => haystack.includes(w));
        })
        .slice(0, 30);

      if (matches.length === 0) {
        setNameResults(null);
        toast({ variant: "destructive", title: "Prenda no encontrada", description: `No se encontró ninguna prenda con el ID o nombre "${searchId.trim()}".` });
      } else {
        setNameResults(matches);
      }
    } catch (error: any) {
        console.error("Error searching for prenda: ", error);
        if (error.code === 'permission-denied') {
             const permissionError = new FirestorePermissionError({
                path: 'prendas', // This is a collection group query, path is not specific
                operation: 'list',
             });
             errorEmitter.emit('permission-error', permissionError);
        } else {
            toast({ variant: "destructive", title: "Error de búsqueda", description: "No se pudo realizar la búsqueda en la base de datos." });
        }
    } finally {
        setIsSearching(false);
    }
  };

  // Al elegir un resultado de la búsqueda por nombre se vuelve a leer la prenda,
  // para agregarla al carrito con su stock actual (la lista puede estar desactualizada).
  const handlePickResult = async (result: Prenda & { path: string }) => {
    if (!firestore) return;
    try {
      const snap = await getDoc(doc(firestore, result.path));
      if (!snap.exists()) {
        toast({ variant: "destructive", title: "Prenda no encontrada", description: "Esta prenda ya no existe en el inventario." });
        return;
      }
      const fresh: Prenda = {
        id: snap.id,
        ...(snap.data() as Omit<Prenda, 'id' | 'pacaId'>),
        pacaId: snap.ref.parent.parent!.id,
      };
      if (fresh.cantidad <= 0) {
        toast({ variant: "destructive", title: "Sin stock", description: `La prenda ${fresh.idPersonalizado} ya no tiene stock.` });
        return;
      }
      addToCart(fresh);
      setNameResults(null);
      setSearchId('');
      searchInputRef.current?.focus();
    } catch (error) {
      console.error("Error loading prenda: ", error);
      toast({ variant: "destructive", title: "Error", description: "No se pudo agregar la prenda al carrito." });
    }
  };

  const addToCart = (prenda: Prenda) => {
    setCart(currentCart => {
      // Logic to check total stock for this prenda across all line items in the cart
      const totalInCartForThisPrenda = currentCart
        .filter(item => item.id === prenda.id && item.pacaId === prenda.pacaId)
        .reduce((sum, item) => sum + Number(item.cantidadEnCarrito), 0);

      if (totalInCartForThisPrenda >= prenda.cantidad) {
        toast({ variant: "destructive", title: "Stock insuficiente", description: `No hay más stock para la prenda ${prenda.idPersonalizado}.` });
        return currentCart;
      }
      
      // Try to find an existing line item for this prenda that is NOT discounted
      const existingItem = currentCart.find(item => 
        item.id === prenda.id && 
        item.pacaId === prenda.pacaId &&
        item.precioAnulado === undefined
      );

      if (existingItem) {
        // Increment quantity of the existing, non-discounted line item
        return currentCart.map(item =>
          item.cartId === existingItem.cartId 
            ? { ...item, cantidadEnCarrito: (Number(item.cantidadEnCarrito) || 0) + 1 } 
            : item
        );
      } else {
        // Add as a new line item
        return [...currentCart, { ...prenda, cartId: generateCartId(), cantidadEnCarrito: 1 }];
      }
    });
  };

  const updateCartQuantity = (cartId: string, newQuantityStr: string) => {
    const newQuantity = newQuantityStr === '' ? '' : parseInt(newQuantityStr, 10);

    setCart(currentCart => currentCart.flatMap(item => {
        if (item.cartId !== cartId) {
            return [item];
        }

        if (newQuantity === '') {
            return [{ ...item, cantidadEnCarrito: '' as const }];
        }

        if (newQuantity > 0 && newQuantity <= item.cantidad) {
            return [{ ...item, cantidadEnCarrito: newQuantity }];
        }

        if (newQuantity > item.cantidad) {
            toast({ variant: "destructive", title: "Stock insuficiente", description: `Solo hay ${item.cantidad} unidades disponibles.` });
            return [{ ...item, cantidadEnCarrito: item.cantidad }];
        }

        return [{ ...item, cantidadEnCarrito: 1 }];
    }).filter(item => item.cantidadEnCarrito !== 0));
  };


  const removeFromCart = (cartId: string) => {
    setCart(currentCart => currentCart.filter(item => item.cartId !== cartId));
  };

    // Precios con ofertas ("N por $X" y promociones especiales): ver src/lib/ofertas.ts
    const cartPricing = useMemo(() => computeCartPricing(cart), [cart]);
    const cartSummary = {
        rawSubtotal: cartPricing.rawSubtotal,
        discount: cartPricing.discount,
        total: cartPricing.total,
    };
  
  const requiereComprobante = metodoPago === 'TRANSFERENCIA' || metodoPago === 'MIXTO';
  const mixtoTransferencia = Number(montoTransferenciaMixto) || 0;
  const mixtoEfectivo = redondearCentavos(cartSummary.total - mixtoTransferencia);
  const mixtoValido = montoTransferenciaMixto !== '' && mixtoTransferencia > 0 && mixtoTransferencia < cartSummary.total;
  // Efectivo que hay que cobrar: todo en EFECTIVO, solo la parte de efectivo en MIXTO.
  const efectivoACobrar = metodoPago === 'MIXTO' ? mixtoEfectivo : cartSummary.total;
  const cambio = (Number(montoPagado) || 0) - efectivoACobrar;
  const faltaEfectivo = (metodoPago === 'EFECTIVO' || metodoPago === 'MIXTO') && (Number(montoPagado) || 0) < efectivoACobrar;
  
  const handleFinalizeSale = async () => {
    if (!firestore || !storage || cart.length === 0) {
         toast({ variant: "destructive", title: "Carrito vacío", description: "Agrega al menos una prenda para realizar la venta." });
        return;
    };
    
    const invalidItem = cart.find(item => item.cantidadEnCarrito === '' || Number(item.cantidadEnCarrito) <= 0);
    if (invalidItem) {
        toast({ variant: "destructive", title: "Cantidad inválida", description: `La prenda "${invalidItem.idPersonalizado}" tiene una cantidad inválida.` });
        return;
    }

    if (!saleDate) {
        toast({ variant: "destructive", title: "Fecha no seleccionada", description: "Por favor, elige una fecha para la venta." });
        return;
    }
    
    if (metodoPago === 'MIXTO' && !mixtoValido) {
        toast({ variant: "destructive", title: "Montos inválidos", description: "En pago mixto, el monto por transferencia debe ser mayor a 0 y menor que el total." });
        return;
    }

    if (faltaEfectivo) {
        toast({ variant: "destructive", title: "Monto insuficiente", description: "El efectivo recibido no puede ser menor que lo que se paga en efectivo." });
        return;
    }

    if (requiereComprobante && !paymentProof) {
        toast({ variant: "destructive", title: "Comprobante requerido", description: "Por favor, adjunta una imagen del comprobante de pago." });
        return;
    }
    
    setIsProcessing(true);

    // --- Precio final de cada prenda (con ofertas aplicadas) para guardar en la venta ---
    const { totalVenta, itemsWithEffectivePrice } = (() => {
        const finalItemsToSave = new Map<string, {prendaId: string, pacaId: string, idPersonalizado: string, tipoPrenda: string, genero: string, cantidad: number, precioVenta: number}>();

        for (const { item, effectivePrice } of cartPricing.pricedUnits) {
            const key = `${item.pacaId}-${item.id}-${effectivePrice}`;
            if(finalItemsToSave.has(key)) {
                finalItemsToSave.get(key)!.cantidad += 1;
            } else {
                finalItemsToSave.set(key, {
                    prendaId: item.id,
                    pacaId: item.pacaId,
                    idPersonalizado: item.idPersonalizado,
                    tipoPrenda: item.tipoPrenda,
                    genero: item.genero || '',
                    cantidad: 1,
                    precioVenta: effectivePrice
                });
            }
        }

        return { totalVenta: cartPricing.total, itemsWithEffectivePrice: Array.from(finalItemsToSave.values()) };
    })();

    const ventaRef = doc(collection(firestore, "ventas"));

    try {
        let paymentProofUrl = null;
        if (requiereComprobante && paymentProof) {
          const imageRef = storageRef(storage, `comprobantes/${ventaRef.id}.png`);
          const uploadResult = await uploadString(imageRef, paymentProof, 'data_url');
          paymentProofUrl = await getDownloadURL(uploadResult.ref);
        }
        
        await runTransaction(firestore, async (transaction) => {
            const prendaRefsAndData = cart.map(item => ({
              ref: doc(firestore, 'pacas', item.pacaId, 'prendas', item.id),
              item: item
            }));

            const prendaDocs = await Promise.all(
              prendaRefsAndData.map(pad => transaction.get(pad.ref))
            );

            for (let i = 0; i < prendaDocs.length; i++) {
              const prendaDoc = prendaDocs[i];
              const { item } = prendaRefsAndData[i];
              const cantidadEnCarrito = Number(item.cantidadEnCarrito) || 0;
              if (!prendaDoc.exists()) {
                throw new Error(`La prenda ${item.idPersonalizado} ya no existe.`);
              }
              const currentStock = prendaDoc.data().cantidad;
              if (currentStock < cantidadEnCarrito) {
                throw new Error(`Stock insuficiente para ${item.idPersonalizado}. Solo quedan ${currentStock}.`);
              }
            }
            
            const ventaData = {
                totalVenta: totalVenta,
                metodoPago: metodoPago,
                // En pago mixto se guarda cuánto entró por cada vía, para que los
                // reportes sumen cada parte en su método sin mezclarlas.
                ...(metodoPago === 'MIXTO' ? {
                    montoTransferencia: redondearCentavos(Math.min(mixtoTransferencia, totalVenta)),
                    montoEfectivo: redondearCentavos(totalVenta - Math.min(mixtoTransferencia, totalVenta)),
                } : {}),
                comprobanteUrl: paymentProofUrl,
                fecha: saleDate,
                vendedorId: user?.uid || null,
            };
            transaction.set(ventaRef, ventaData);

            for (let i = 0; i < prendaDocs.length; i++) {
                const { ref, item } = prendaRefsAndData[i];
                const prendaDoc = prendaDocs[i];
                const cantidadEnCarrito = Number(item.cantidadEnCarrito) || 0;
                
                const newStock = (Number(prendaDoc.data()?.cantidad ?? 0)) - cantidadEnCarrito;
                transaction.update(ref, { cantidad: newStock });
            }

            for (const ventaItemData of itemsWithEffectivePrice) {
                const ventaItemRef = doc(collection(ventaRef, "items"));
                transaction.set(ventaItemRef, ventaItemData);
            }
        });

        toast({ variant: "success", title: "Venta registrada", description: "La venta se ha completado y el stock ha sido actualizado." });
        setCart([]);
        setAllPrendas(null); // el stock cambió: la próxima búsqueda por nombre recarga la lista
        setNameResults(null);
        setMetodoPago("EFECTIVO");
        setPaymentProof(null);
        setSaleDate(new Date());
        setMontoPagado('');
        setMontoTransferenciaMixto('');

    } catch (error: any) {
        // Only emit FirestorePermissionError if it's actually a permission issue.
        // This prevents false positives during connectivity timeouts.
        if (error.code === 'permission-denied') {
            const permissionError = new FirestorePermissionError({
              path: `ventas/${ventaRef.id}`,
              operation: 'write',
              requestResourceData: { 
                totalVenta,
                metodoPago,
                items: cart.map(i => ({ id: i.id, cantidad: i.cantidadEnCarrito })) 
              },
            });
            errorEmitter.emit('permission-error', permissionError);
        }

        console.error("Error al finalizar venta:", error);
        const errorMessage = error instanceof Error ? error.message : "Ocurrió un error desconocido.";
        toast({ variant: "destructive", title: "Error en la transacción", description: errorMessage });
    } finally {
        setIsProcessing(false);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPaymentProof(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };


  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (metodoPago === 'EFECTIVO') {
        setPaymentProof(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
    } else if (metodoPago === 'TRANSFERENCIA') {
        setMontoPagado('');
    }
    if (metodoPago !== 'MIXTO') {
        setMontoTransferenciaMixto('');
    }
  }, [metodoPago])

  const handleOpenPriceOverrideDialog = (item: CartItem) => {
    setItemToEdit(item);
    const effectivePrice = item.precioAnulado ?? item.precioIndividual ?? item.precioVenta;
    setNewPrice(effectivePrice);
    setOverrideQuantity(1); // Default to applying to 1 item
    setIsPriceOverrideDialogOpen(true);
  };

  const handleConfirmPriceOverride = () => {
    if (!itemToEdit || newPrice === '' || Number(newPrice) < 0 || overrideQuantity === '' || Number(overrideQuantity) <= 0) {
      toast({ variant: 'destructive', title: 'Datos inválidos', description: 'El precio y la cantidad deben ser válidos.' });
      return;
    }

    const qtyToOverride = Number(overrideQuantity);

    if (qtyToOverride > Number(itemToEdit.cantidadEnCarrito)) {
      toast({ variant: 'destructive', title: 'Cantidad excede el carrito', description: `No puedes aplicar el descuento a más de ${itemToEdit.cantidadEnCarrito} prendas.` });
      return;
    }

    setCart(currentCart => {
      const originalItemIndex = currentCart.findIndex(item => item.cartId === itemToEdit.cartId);
      if (originalItemIndex === -1) return currentCart;
      
      const originalItem = currentCart[originalItemIndex];
      const remainingQty = Number(originalItem.cantidadEnCarrito) - qtyToOverride;

      if (remainingQty <= 0) {
          return currentCart.map(item => 
              item.cartId === itemToEdit.cartId 
                  ? { ...item, precioAnulado: Number(newPrice) } 
                  : item
          );
      }

      const updatedOriginalItem = {
          ...originalItem,
          cantidadEnCarrito: remainingQty
      };

      const discountedItem: CartItem = {
          ...originalItem,
          cartId: generateCartId(),
          cantidadEnCarrito: qtyToOverride,
          precioAnulado: Number(newPrice)
      };

      const newCart = [...currentCart];
      newCart[originalItemIndex] = updatedOriginalItem;
      newCart.splice(originalItemIndex + 1, 0, discountedItem);
      
      return newCart;
    });

    setIsPriceOverrideDialogOpen(false);
    setItemToEdit(null);
    setNewPrice('');
    setOverrideQuantity(1);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-4 justify-between items-start">
        <div>
          <h1 className="text-3xl font-title text-white [text-shadow:_-2px_-2px_0_rgba(0,0,0,0.8),_2px_-2px_0_rgba(0,0,0,0.8),_-2px_2px_0_rgba(0,0,0,0.8),_2px_2px_0_rgba(0,0,0,0.8)]">Punto de Venta</h1>
          <p className="text-xl text-white font-handwritten font-bold [text-shadow:_-1px_-1px_0_rgba(0,0,0,0.9),_1px_-1px_0_rgba(0,0,0,0.9),_-1px_1px_0_rgba(0,0,0,0.9),_1px_1px_0_rgba(0,0,0,0.9)]">Registra una nueva venta escaneando o buscando por ID de prenda.</p>
        </div>
        <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={"destructive"}
                   className={cn(
                    "w-[280px] justify-start text-left font-normal text-black font-sans text-sm",
                    !saleDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {saleDate ? format(saleDate, "PPP", { locale: es }) : <span>Elige una fecha</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 font-sans">
                <Calendar
                  mode="single"
                  selected={saleDate}
                  onSelect={setSaleDate}
                  initialFocus
                  locale={es}
                  disabled={(date) => date > new Date() || date < new Date("2000-01-01")}
                />
              </PopoverContent>
            </Popover>
            <Button asChild variant="destructive" className="font-sans text-sm text-black">
                <Link href="/dashboard/sales/history">
                  <Receipt className="mr-2 h-4 w-4" /> Historial de Ventas
                </Link>
            </Button>
        </div>
      </div>

       <Card style={{ backgroundColor: 'hsla(39, 44%, 84%, 0.8)', backdropFilter: 'blur(8px)' }}>
            <CardHeader>
              <CardTitle className="font-sans text-2xl text-black">Buscar Prenda</CardTitle>
               <CardDescription className="font-sans font-semibold text-md text-black">
                Escanea o escribe el ID o el nombre de la prenda para agregarla al carrito.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSearch} className="flex gap-2">
                <Input
                  ref={searchInputRef}
                  id="searchId"
                  placeholder="Ej: P1-25 o blusa"
                  value={searchId}
                  onChange={(e) => setSearchId(e.target.value)}
                  className="bg-white/80"
                />
                <Button type="submit" size="icon" variant="destructive" className="text-black" disabled={isSearching}>
                  <Search className="h-4 w-4" />
                </Button>
              </form>
              {nameResults && (
                <div className="mt-3 rounded-md border bg-white/80 font-sans">
                  <div className="flex items-center justify-between px-3 py-2 text-sm font-semibold text-black">
                    <span>
                      {nameResults.length === 30 ? 'Primeros 30 resultados' : `${nameResults.length} resultado(s)`} con stock. Toca uno para agregarlo:
                    </span>
                    <Button type="button" size="icon" variant="ghost" className="h-6 w-6" onClick={() => setNameResults(null)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <ul className="max-h-72 overflow-y-auto divide-y">
                    {nameResults.map(result => (
                      <li key={result.path}>
                        <button
                          type="button"
                          onClick={() => handlePickResult(result)}
                          className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-black/5"
                        >
                          <span>
                            <span className="font-semibold">{result.idPersonalizado}</span>{' '}
                            {result.tipoPrenda} {result.genero} Talla {result.talla}
                          </span>
                          <span className="shrink-0 text-xs text-right">
                            ${Number(result.precioVenta || 0).toFixed(2)}
                            <span className="block text-muted-foreground">Stock: {result.cantidad}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
            <CardHeader className="pt-4">
              <CardTitle className="font-sans text-2xl text-black flex items-center gap-2">
                <ShoppingCart className="h-6 w-6" /> Carrito de Compra
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="font-sans font-semibold text-sm text-black">ID</TableHead>
                    <TableHead className="font-sans font-semibold text-sm text-black">Prenda</TableHead>
                    <TableHead className="font-sans font-semibold text-sm text-black text-center">Cantidad</TableHead>
                    <TableHead className="font-sans font-semibold text-sm text-black text-right">Precio</TableHead>
                    <TableHead className="font-sans font-semibold text-sm text-black text-right">Subtotal</TableHead>
                    <TableHead className="w-[100px] text-right"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cart.length > 0 ? (
                    cart.map(item => (
                      <TableRow key={item.cartId} className="font-sans text-xs">
                        <TableCell className="font-semibold">{item.idPersonalizado}</TableCell>
                        <TableCell>{item.tipoPrenda} {item.genero} Talla {item.talla}</TableCell>
                        <TableCell className="text-center">
                            <Input 
                                type="number"
                                value={item.cantidadEnCarrito}
                                onChange={(e) => updateCartQuantity(item.cartId, e.target.value)}
                                className="w-16 h-8 text-center mx-auto bg-white/70"
                                min="1"
                                max={item.cantidad}
                            />
                        </TableCell>
                         <TableCell className="text-right">
                           <PriceDisplay item={item} />
                        </TableCell>
                        <TableCell className="text-right font-bold">${calculateItemSubtotal(item).toFixed(2)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end">
                            {user?.role === 'admin' && (
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleOpenPriceOverrideDialog(item)}>
                                <Pencil className="h-4 w-4 text-blue-600" />
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeFromCart(item.cartId)}>
                              <Trash2 className="h-4 w-4 text-red-600" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="h-24 text-center font-sans font-semibold text-lg text-black">
                        El carrito está vacío.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
             <CardFooter className="flex flex-col items-stretch sm:flex-row sm:items-end sm:justify-between gap-6 pt-6 border-t-2 border-black/10">
                <div className="flex flex-col gap-4">
                    <div className="w-full sm:w-48">
                        <Label htmlFor="metodo-pago" className="font-sans font-semibold text-md text-black mb-1">Método de Pago</Label>
                        <Select value={metodoPago} onValueChange={setMetodoPago} disabled={isProcessing}>
                            <SelectTrigger id="metodo-pago" className="font-sans bg-white/80">
                                <SelectValue placeholder="Selecciona método" />
                            </SelectTrigger>
                            <SelectContent className="font-sans">
                                <SelectItem value="EFECTIVO">Efectivo</SelectItem>
                                <SelectItem value="TRANSFERENCIA">Transferencia</SelectItem>
                                <SelectItem value="MIXTO">Mixto (efectivo + transferencia)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {metodoPago === 'MIXTO' && (
                        <div className="w-full sm:w-64 space-y-2 font-sans text-black">
                            <div>
                                <Label htmlFor="monto-transferencia-mixto" className="font-semibold text-md mb-1">Monto por transferencia</Label>
                                <Input
                                    id="monto-transferencia-mixto"
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={montoTransferenciaMixto}
                                    onChange={(e) => setMontoTransferenciaMixto(e.target.value === '' ? '' : Number(e.target.value))}
                                    placeholder="Ej: 20"
                                    className="bg-white/80"
                                    disabled={isProcessing}
                                />
                            </div>
                            <div className="rounded-md bg-white/60 p-2 text-sm">
                                <div className="flex justify-between"><span>Transferencia:</span><span className="font-bold">${mixtoTransferencia.toFixed(2)}</span></div>
                                <div className="flex justify-between"><span>Efectivo:</span><span className="font-bold">${(mixtoValido ? mixtoEfectivo : 0).toFixed(2)}</span></div>
                            </div>
                            {montoTransferenciaMixto !== '' && !mixtoValido && cart.length > 0 && (
                                <p className="text-xs font-semibold text-red-700">
                                    Debe ser mayor a $0 y menor que el total (${cartSummary.total.toFixed(2)}).
                                </p>
                            )}
                        </div>
                    )}

                    {requiereComprobante && (
                        <div className="flex flex-col gap-2 items-start">
                            <div className="flex gap-2">
                                <Button variant="outline" className="bg-white/80 text-black" onClick={() => fileInputRef.current?.click()}>
                                    <Upload className="mr-2 h-4 w-4" /> Subir Comprobante
                                </Button>
                                 <CameraDialog onCapture={setPaymentProof} setPaymentProof={setPaymentProof} />
                                <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
                            </div>
                            {paymentProof && (
                                <div className="relative w-24 h-24 mt-2 border-2 border-dashed border-green-500 rounded-md p-1">
                                    <Image src={paymentProof} alt="Comprobante de pago" layout="fill" objectFit="cover" className="rounded"/>
                                    <Button variant="ghost" size="icon" className="absolute -top-3 -right-3 h-6 w-6 bg-red-500 hover:bg-red-600 text-white rounded-full" onClick={() => setPaymentProof(null)}>
                                        <X className="h-4 w-4"/>
                                    </Button>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="flex flex-col items-end gap-2">
                    {cartSummary.discount > 0 && (
                        <>
                            <div className="font-sans text-lg text-black">
                                <span className="font-semibold mr-2">Subtotal:</span>
                                <span className="font-bold">
                                    ${cartSummary.rawSubtotal.toFixed(2)}
                                </span>
                            </div>
                            <div className="font-sans text-lg text-green-600">
                                <span className="font-semibold mr-2">Descuento por Oferta:</span>
                                <span className="font-bold">
                                    -${cartSummary.discount.toFixed(2)}
                                </span>
                            </div>
                            {cartPricing.promosAplicadas.length > 0 && (
                                <div className="font-sans text-sm text-green-700 text-right">
                                    {cartPricing.promosAplicadas.map(p => (
                                        <p key={p.nombre}>{p.veces > 1 ? `${p.veces} × ` : ''}{p.nombre} (${p.precio.toFixed(2)})</p>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                     <div className="flex justify-between items-center font-sans text-3xl text-black">
                        <span className="font-semibold mr-2">Total:</span>
                        <span className="font-bold flex items-center gap-1">
                            <DollarSign className="h-6 w-6"/>
                            {cartSummary.total.toFixed(2)}
                        </span>
                    </div>

                    <AlertDialog onOpenChange={(open) => !open && setMontoPagado('')}>
                        <AlertDialogTrigger asChild>
                            <Button className="w-full sm:w-auto font-sans text-lg text-black" variant="destructive" disabled={cart.length === 0 || isProcessing || (requiereComprobante && !paymentProof) || (metodoPago === 'MIXTO' && !mixtoValido)}>
                                {isProcessing ? 'Procesando...' : 'Finalizar Venta'}
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="font-sans bg-white text-black">
                            <AlertDialogHeader>
                                <AlertDialogTitle>Confirmar Venta</AlertDialogTitle>
                                <AlertDialogDescription>
                                    El total de la venta es <span className="font-bold">${cartSummary.total.toFixed(2)}</span>.
                                    {metodoPago === 'EFECTIVO' && ' Por favor, ingresa el monto recibido para calcular el cambio.'}
                                    {metodoPago === 'TRANSFERENCIA' && ' ¿Deseas registrar esta venta?'}
                                    {metodoPago === 'MIXTO' && (
                                        <> Se paga <span className="font-bold">${mixtoTransferencia.toFixed(2)}</span> por transferencia y <span className="font-bold">${mixtoEfectivo.toFixed(2)}</span> en efectivo. Ingresa el efectivo recibido para calcular el cambio.</>
                                    )}
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                             {(metodoPago === 'EFECTIVO' || metodoPago === 'MIXTO') && (
                                <div className="space-y-4 my-4">
                                     <div className="space-y-2">
                                        <Label htmlFor="montoPagado" className="font-semibold">{metodoPago === 'MIXTO' ? 'Efectivo Recibido' : 'Monto Recibido'}</Label>
                                        <Input 
                                            id="montoPagado"
                                            type="number"
                                            min="0"
                                            value={montoPagado}
                                            onChange={(e) => setMontoPagado(e.target.value === '' ? '' : Number(e.target.value))}
                                            placeholder="Ej: 500"
                                            autoFocus
                                        />
                                    </div>
                                    {cambio >= 0 && montoPagado !== '' && (
                                         <div className="text-center font-bold text-2xl p-4 rounded-md bg-green-100 text-green-800">
                                            Cambio: ${cambio.toFixed(2)}
                                        </div>
                                    )}
                                </div>
                            )}
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction 
                                    onClick={handleFinalizeSale} 
                                    className="font-sans text-sm bg-red-600 text-white hover:bg-red-700"
                                    disabled={faltaEfectivo}
                                >
                                    Sí, registrar venta
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>
            </CardFooter>
          </Card>
        
      <Dialog open={isPriceOverrideDialogOpen} onOpenChange={setIsPriceOverrideDialogOpen}>
          <DialogContent className="sm:max-w-md font-sans" style={{ backgroundColor: 'hsla(39, 44%, 84%, 0.9)', backdropFilter: 'blur(12px)' }}>
              <DialogHeader>
                  <DialogTitle>Anular Precio</DialogTitle>
                  <DialogDescription>
                    Aplica un precio especial a una o más unidades de "{itemToEdit?.idPersonalizado}".
                  </DialogDescription>
              </DialogHeader>
               <div className="py-4 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                          <Label htmlFor="override-quantity">Cantidad a afectar</Label>
                          <Input
                              id="override-quantity"
                              type="number"
                              value={overrideQuantity}
                              onChange={(e) => setOverrideQuantity(e.target.value === '' ? '' : Number(e.target.value))}
                              min="1"
                              max={Number(itemToEdit?.cantidadEnCarrito) || 1}
                          />
                      </div>
                      <div className="space-y-2">
                          <Label htmlFor="new-price">Nuevo Precio Unitario</Label>
                          <Input
                              id="new-price"
                              type="number"
                              value={newPrice}
                              onChange={(e) => setNewPrice(e.target.value === '' ? '' : Number(e.target.value))}
                              placeholder="Ej: 50.00"
                              autoFocus
                          />
                      </div>
                  </div>
                  {itemToEdit && (
                      <div className="text-sm text-muted-foreground">
                          Precio original: <span className="line-through">${(itemToEdit.precioIndividual ?? itemToEdit.precioVenta).toFixed(2)}</span>
                      </div>
                  )}
              </div>
              <DialogFooter>
                  <Button variant="outline" onClick={() => {
                    setIsPriceOverrideDialogOpen(false);
                    setItemToEdit(null);
                    setNewPrice('');
                  }}>Cancelar</Button>
                  <Button onClick={handleConfirmPriceOverride} variant="destructive" className="text-black">
                      Aplicar Precio
                  </Button>
              </DialogFooter>
          </DialogContent>
      </Dialog>
    </div>
  );
}
